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
import os
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, WebSocket

from core.bot_registry import ensure_missing_bots, start_all_bots
from services.erp_ingestion_service import erp_service

logger = logging.getLogger("ShelfyAPI")

# ── Estado global ──────────────────────────────────────────────────────────────
bots: dict = {}
scheduler = BackgroundScheduler()
_main_loop: asyncio.AbstractEventLoop | None = None


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
def _push_objetivos_job():
    from core.supabase_shield import shield

    if not shield.allow_background_job("push_objetivos_daily"):
        return
    try:
        from services.vendedor_push_service import dispatch_scheduled_pushes
        result = dispatch_scheduled_pushes()
        logger.info("[push_objetivos] %s", result)
    except Exception as e:
        logger.warning("[push_objetivos] error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    import os

    skip_bots = os.getenv("SHELFY_SKIP_BOTS", "0") == "1"

    if skip_bots:
        logger.info("⏭️ SHELFY_SKIP_BOTS=1 — arranque rápido (sin bots Telegram)")
    else:
        # Startup — bots con reintento si Supabase schema cache (PGRST002) tarda
        logger.info("🚀 Iniciando gestor de bots Webhook...")
        bot_boot = await start_all_bots(manager, bots)
        if bot_boot.get("error"):
            logger.error("❌ Arranque de bots incompleto: %s", bot_boot["error"])
        elif bot_boot.get("active", 0) < bot_boot.get("expected", 0):
            logger.warning(
                "⚠️ Bots parciales: %s/%s — el job ensure_bots reintentará",
                bot_boot.get("active"),
                bot_boot.get("expected"),
            )

    def _shield_probe_job():
        # OFF por defecto: el probe puede colgar workers si Postgres está saturado.
        if os.getenv("SHELFY_SHIELD_PROBE", "0").strip() in ("0", "false", "no"):
            return
        if os.getenv("SHELFY_DB_CLEANUP", "0").strip() in ("1", "true", "yes"):
            return
        try:
            from core.supabase_shield import shield
            from db import refresh_supabase_client_timeouts

            result = shield.probe()
            refresh_supabase_client_timeouts()
            st = shield.status()
            if st["state"] != "healthy":
                logger.warning(
                    "[shield] estado=%s probe_ms=%s fallos=%s",
                    st["state"],
                    st.get("last_probe_ms"),
                    st.get("failures_in_window"),
                )
            elif result.get("latency_ms", 0) > 3000:
                logger.info("[shield] probe lento: %.0fms", result["latency_ms"])
        except Exception as e:
            logger.warning("[shield] probe job error: %s", e)

    scheduler.add_job(_shield_probe_job, "interval", seconds=30, id="supabase_shield_probe")

    if not skip_bots:
        def _ensure_bots_job():
            from core.supabase_shield import shield

            if not shield.allow_background_job("ensure_telegram_bots"):
                return
            loop = _main_loop
            if loop is None or not loop.is_running():
                return
            try:
                fut = asyncio.run_coroutine_threadsafe(
                    ensure_missing_bots(manager, bots),
                    loop,
                )
                fut.result(timeout=120)
            except Exception as e:
                logger.warning("[bot_registry] ensure_bots job: %s", e)

        scheduler.add_job(_ensure_bots_job, "interval", minutes=2, id="ensure_telegram_bots")

        def _erp_automatic_sync_guarded():
            from core.supabase_shield import shield

            if not shield.allow_background_job("erp_automatic_sync"):
                return
            erp_automatic_sync()

        scheduler.add_job(_erp_automatic_sync_guarded, "cron", hour=4, minute=0)

        def _digest_padron():
            from core.supabase_shield import shield

            if not shield.allow_background_job("digest_padron"):
                return
            try:
                from services.motor_ops_notification_service import send_motor_digest
                send_motor_digest("PADRÓN", since_hours=10)
            except Exception as e:
                logger.warning("Digest padrón programado omitido: %s", e)

        def _digest_cc():
            from core.supabase_shield import shield

            if not shield.allow_background_job("digest_cc"):
                return
            try:
                from services.motor_ops_notification_service import send_motor_digest
                send_motor_digest("CUENTAS CORRIENTES", since_hours=12)
            except Exception as e:
                logger.warning("Digest CC programado omitido: %s", e)

        for h, m in ((9, 0), (12, 0), (16, 0), (19, 0)):
            scheduler.add_job(_digest_padron, "cron", hour=h, minute=m, id=f"digest_padron_{h:02d}{m:02d}")
        for h, m in ((8, 0), (15, 30), (21, 0)):
            scheduler.add_job(_digest_cc, "cron", hour=h, minute=m, id=f"digest_cc_{h:02d}{m:02d}")

        def _lanzar_objetivos_programados():
            from core.supabase_shield import shield

            if not shield.allow_background_job("lanzar_objetivos_0800"):
                return
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
            from core.supabase_shield import shield

            if not shield.allow_background_job("binding_watcher_daily"):
                return
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
            hour=10, minute=30,
            id="binding_watcher_daily"
        )

        def _archivar_terminados_compania():
            from core.supabase_shield import shield

            if not shield.allow_background_job("archivar_terminados_compania_7d"):
                return
            try:
                from services.objetivos_liquidacion_service import archivar_terminados_compania_7d
                result = archivar_terminados_compania_7d()
                if result["archivados"] or result["errores"]:
                    logger.info(
                        "[liquidacion] Archivado terminados: archivados=%s errores=%s",
                        result["archivados"],
                        result["errores"],
                    )
            except Exception as e:
                logger.warning("[liquidacion] Archivado terminados omitido: %s", e)

        scheduler.add_job(
            _archivar_terminados_compania,
            "cron",
            hour=1,
            id="archivar_terminados_compania_7d",
            replace_existing=True,
            misfire_grace_time=300,
        )

        def _snapshot_prewarm_morning():
            from core.supabase_shield import shield

            if not shield.allow_background_job("snapshot_prewarm_0645_ar"):
                return
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

        if os.getenv("RECAP_CRON_ENABLED", "0") == "1":
            from core.recap_period import is_last_day_of_month, _today_ar
            from services.recap_cron_service import run_recap_job_q1, run_recap_job_q2_and_cierre

            def _recap_job_q1():
                try:
                    result = run_recap_job_q1()
                    logger.info(
                        "[recap_cron] Q1 ok periodo=%s processed=%s errors=%s",
                        result.get("periodo_key"),
                        result.get("processed"),
                        result.get("errors"),
                    )
                except Exception as e:
                    logger.warning("[recap_cron] Q1 omitido: %s", e)

            def _recap_job_q2_cierre():
                if not is_last_day_of_month(_today_ar()):
                    return
                try:
                    result = run_recap_job_q2_and_cierre()
                    logger.info(
                        "[recap_cron] Q2+C ok q2=%s c=%s processed=%s errors=%s",
                        result.get("periodo_key_q2"),
                        result.get("periodo_key_cierre"),
                        result.get("processed"),
                        result.get("errors"),
                    )
                except Exception as e:
                    logger.warning("[recap_cron] Q2+C omitido: %s", e)

            _tz_recap = _ZoneInfoL("America/Argentina/Buenos_Aires")
            scheduler.add_job(
                _recap_job_q1,
                "cron",
                day=15,
                hour=23,
                minute=59,
                timezone=_tz_recap,
                id="recap_q1_15_2359_ar",
            )
            scheduler.add_job(
                _recap_job_q2_cierre,
                "cron",
                hour=23,
                minute=59,
                timezone=_tz_recap,
                id="recap_q2_cierre_2359_ar",
            )
            logger.info("📅 Repaso Comercial cron activo (15 y fin de mes 23:59 AR)")
        else:
            logger.info("📅 Repaso Comercial cron desactivado (RECAP_CRON_ENABLED!=1)")

    scheduler.add_job(
        _push_objetivos_job,
        "cron",
        hour=11, minute=0,
        id="push_objetivos_daily",
        timezone="UTC",
    )

    scheduler.start()
    if skip_bots:
        logger.info("📅 Scheduler iniciado (modo dev mobile, sin bots)")
    else:
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
