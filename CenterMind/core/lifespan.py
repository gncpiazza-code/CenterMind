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

# Canal WebSocket dedicado superadmin (`/api/ws/superadmin`), no debe colisionar con id_distribuidor real.
SUPERADMIN_WS_DIST_ID = 0


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

    def _digest_padron():
        try:
            from services.motor_ops_notification_service import send_motor_digest
            send_motor_digest("PADRÓN", since_hours=10)
        except Exception as e:
            logger.warning("Digest padrón programado omitido: %s", e)

    def _digest_cc():
        try:
            from services.motor_ops_notification_service import send_motor_digest
            send_motor_digest("CUENTAS CORRIENTES", since_hours=12)
        except Exception as e:
            logger.warning("Digest CC programado omitido: %s", e)

    # Respaldo si el RPA no llamó a /api/v1/ops/motor-digest (horarios AR aprox. post-corrida)
    for h, m in ((9, 0), (12, 0), (16, 0), (19, 0)):
        scheduler.add_job(_digest_padron, "cron", hour=h, minute=m, id=f"digest_padron_{h:02d}{m:02d}")
    for h, m in ((8, 0), (15, 30)):
        scheduler.add_job(_digest_cc, "cron", hour=h, minute=m, id=f"digest_cc_{h:02d}{m:02d}")

    def _lanzar_objetivos_programados():
        """08:00 AR: lanzar objetivos planificados con fecha_inicio = hoy."""
        try:
            from services.objetivos_launch_service import lanzar_programados_fecha
            result = lanzar_programados_fecha()
            if result["lanzados"] or result["errores"]:
                logger.info(
                    f"[Objetivos] Lanzamiento 08:00: lanzados={result['lanzados']} "
                    f"errores={result['errores']} total={result['total']}"
                )
        except Exception as e:
            logger.warning(f"[Objetivos] Lanzamiento programado omitido: {e}")

    from zoneinfo import ZoneInfo as _ZoneInfoL
    scheduler.add_job(
        _lanzar_objetivos_programados,
        "cron",
        hour=8,
        minute=0,
        timezone=_ZoneInfoL("America/Argentina/Buenos_Aires"),
        id="lanzar_objetivos_0800",
    )

    def _binding_watcher_scan():
        """07:30 AR: scan diario de grupos para detectar drift y sugerencias."""
        try:
            from services.telegram_binding_watcher_service import scan_all_distributors
            results = scan_all_distributors()
            total_drifts = sum(r.get("drifts", 0) for r in results)
            total_auto = sum(r.get("auto_applied", 0) for r in results)
            logger.info(f"[binding-watcher] Scan completo: drifts={total_drifts} auto_applied={total_auto}")
        except Exception as e:
            logger.warning(f"[binding-watcher] Error en scan: {e}")

    scheduler.add_job(
        _binding_watcher_scan, "cron",
        hour=10, minute=30,  # 07:30 AR = 10:30 UTC (UTC-3)
        id="binding_watcher_daily"
    )

    def _snapshot_prewarm_morning():
        """06:45 AR: pre-calienta bundles dashboard + estadísticas + supervisión."""
        try:
            from services.snapshot_refresh_service import prewarm_all_active_distributors
            prewarm_all_active_distributors(["dashboard", "estadisticas", "supervision"])
        except Exception as e:
            logger.warning("[snap_refresh] cron prewarm omitido: %s", e)

    scheduler.add_job(
        _snapshot_prewarm_morning,
        "cron",
        hour=6,
        minute=45,
        timezone=_ZoneInfoL("America/Argentina/Buenos_Aires"),
        id="snapshot_prewarm_0645_ar",
    )

    scheduler.start()
    logger.info("📅 Scheduler iniciado (ERP Sync 04:00 + digest motores + Lanzar Objetivos 08:00 AR + Binding Watcher 07:30 AR + Snapshot Prewarm 06:45 AR)")

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
