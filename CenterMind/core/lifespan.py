# -*- coding: utf-8 -*-
"""
Estado global compartido del servidor:
  - bots: dict de aplicaciones PTB activas por id_distribuidor
  - manager: ConnectionManager para WebSockets
  - scheduler: APScheduler
  - lifespan: contexto de arranque/apagado de FastAPI
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, WebSocket

from core.config import WEBHOOK_URL
from db import sb
from bot_worker import BotWorker
from services.erp_ingestion_service import erp_service

logger = logging.getLogger("ShelfyAPI")

# ── Estado global ──────────────────────────────────────────────────────────────
bots: dict = {}
scheduler = BackgroundScheduler()


# ── WebSocket Connection Manager ───────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, dist_id: int):
        await websocket.accept()
        if dist_id not in self.active_connections:
            self.active_connections[dist_id] = []
        self.active_connections[dist_id].append(websocket)
        logger.info(
            f"🔌 WS: Monitor conectado al distribuidor {dist_id}. "
            f"Total: {len(self.active_connections[dist_id])}"
        )

    def disconnect(self, websocket: WebSocket, dist_id: int):
        if dist_id in self.active_connections:
            if websocket in self.active_connections[dist_id]:
                self.active_connections[dist_id].remove(websocket)
                logger.info(f"🔌 WS: Monitor desconectado del distribuidor {dist_id}")

    async def broadcast(self, dist_id: int, message: dict):
        if dist_id not in self.active_connections:
            return
        disconnected = []
        for connection in self.active_connections[dist_id]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn, dist_id)


manager = ConnectionManager()


def broadcast_sync(dist_id: int, message: dict) -> None:
    """
    Fire-and-forget WS broadcast callable from a sync FastAPI endpoint.
    Uses asyncio.run_coroutine_threadsafe to schedule the async broadcast
    on the running event loop without blocking the calling thread.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(manager.broadcast(dist_id, message), loop)
    except Exception as e:
        logger.debug(f"[WS] broadcast_sync skipped: {e}")


# ── Tarea programada ERP ───────────────────────────────────────────────────────
def erp_automatic_sync():
    """Busca y procesa archivos ERP en Downloads (04:00 AM todos los días)."""
    import os
    logger.info("⏰ Ejecutando sincronización automática ERP...")
    downloads_path = str(Path.home() / "Downloads")
    clientes_file = os.path.join(downloads_path, "resultados_Reporte.PadronDeClientes (3).xlsx")
    ventas_file   = os.path.join(downloads_path, "resultados_Reporte.InformeDeVentas (3).xlsx")
    try:
        if os.path.exists(clientes_file):
            logger.info(f"Procesando clientes desde {clientes_file}")
            erp_service.ingest_clientes(clientes_file)
        if os.path.exists(ventas_file):
            logger.info(f"Procesando ventas desde {ventas_file}")
            erp_service.ingest_ventas(ventas_file)
    except Exception as e:
        logger.error(f"❌ Error en sincronización automática: {e}")


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Iniciando gestor de bots Webhook...")
    try:
        res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa").eq("estado", "activo").execute()
        distribuidores = res.data if res.data else []
    except Exception as e:
        logger.error(f"❌ Error consultando distribuidores: {e}")
        distribuidores = []

    for dist in distribuidores:
        d_id = dist["id_distribuidor"]
        try:
            worker = BotWorker(distribuidor_id=d_id, ws_manager=manager)
            ptb_app = worker.build_app()
            await ptb_app.initialize()
            if WEBHOOK_URL:
                webhook_path = f"{WEBHOOK_URL.rstrip('/')}/api/telegram/webhook/{d_id}"
                await ptb_app.bot.set_webhook(url=webhook_path)
                logger.info(f"✅ Bot {d_id} ({dist['nombre_empresa']}) - Webhook OK: {webhook_path}")
            else:
                logger.warning(f"⚠️ Bot {d_id} ({dist['nombre_empresa']}) - WEBHOOK_URL no definida")
            await ptb_app.start()
            bots[d_id] = ptb_app
        except Exception as e:
            logger.error(f"❌ Error iniciando bot {d_id}: {e}")

    scheduler.add_job(erp_automatic_sync, "cron", hour=4, minute=0)
    scheduler.start()
    logger.info("📅 Scheduler iniciado (ERP Sync programado 04:00 AM)")

    yield

    # Shutdown
    logger.info("🛑 Deteniendo bots...")
    for d_id, ptb_app in bots.items():
        try:
            await ptb_app.stop()
            await ptb_app.shutdown()
        except Exception as e:
            logger.error(f"Error deteniendo bot {d_id}: {e}")
    bots.clear()
    scheduler.shutdown()
    logger.info("📅 Scheduler detenido")
