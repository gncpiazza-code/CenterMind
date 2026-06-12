# -*- coding: utf-8 -*-
"""
Shelfy -- Backend API (FastAPI + Supabase)
==========================================
Arrancar:  uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Punto de entrada limpio. Toda la lógica de negocio vive en:
  core/       → config, security, lifespan, helpers
  models/     → schemas Pydantic
  routers/    → auth, erp, supervision, admin, reportes
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from telegram import Update

from core.config import CORS_ORIGINS, CORS_ALLOW_ORIGIN_REGEX, JWT_SECRET, JWT_ALGORITHM, JWT_AVAILABLE, JWTError, _jwt
from core.espectador_guard import espectador_read_only_middleware
from core.maintenance_middleware import maintenance_middleware
from core.supabase_shield_middleware import supabase_shield_middleware
from core.lifespan import bots, manager, lifespan, SUPERADMIN_WS_DIST_ID
from routers import auth, erp, supervision, admin, reportes, informes_excel, fuerza_ventas, difusion, supervisores, reporteria, portal_feedback, compania_revision, estadisticas, bundle, recap, compania_objetivos, bot_settings, vendedor_app, app_settings

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("ShelfyAPI")

# ── Aplicación ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Shelfy API", version="2.0.0", lifespan=lifespan)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mantenimiento: bloquea portal/API mientras se opera la DB (SHELFY_MAINTENANCE_MODE=1).
app.middleware("http")(maintenance_middleware)
# Espectador: bloquea POST/PUT/PATCH/DELETE antes de routers (demos sin mutar DB).
app.middleware("http")(espectador_read_only_middleware)
# Escudo Supabase: shedding de carga pesada cuando Postgres/PostgREST se degrada.
app.middleware("http")(supabase_shield_middleware)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(erp.router)
app.include_router(supervision.router)
app.include_router(admin.router)
app.include_router(reportes.router)
app.include_router(informes_excel.router)
app.include_router(fuerza_ventas.router)
app.include_router(difusion.router)
app.include_router(supervisores.router)
app.include_router(reporteria.router)
app.include_router(portal_feedback.router)
app.include_router(compania_revision.router)
app.include_router(estadisticas.router)
app.include_router(bundle.router)
app.include_router(recap.router)
app.include_router(compania_objetivos.router)
app.include_router(bot_settings.router)
app.include_router(vendedor_app.router)
app.include_router(app_settings.router)

# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health_check():
    from core.config import WEBHOOK_URL
    from core.supabase_shield import ShieldState, shield
    from core.maintenance_middleware import is_maintenance_mode

    shield_status = shield.status()
    shield_state = shield_status.get("state", ShieldState.HEALTHY.value)

    # Health liviano: no consulta Supabase (evita colgar Railway durante limpieza DB).
    bots_active = list(bots.keys())
    bots_expected = len(bots_active) if bots_active else None
    bots_healthy = len(bots_active) >= 12 if bots_active else False
    supabase_ok = shield_state != ShieldState.OPEN.value

    api_maintenance = is_maintenance_mode()
    portal_ok = supabase_ok and shield_state != ShieldState.OPEN.value and not api_maintenance
    return {
        "status": "maintenance" if api_maintenance else ("online" if (portal_ok and (bots_expected == 0 or bots_healthy)) else "degraded"),
        "maintenance": api_maintenance,
        "portal_maintenance_note": "Portal web puede estar en mantenimiento vía Vercel MAINTENANCE_MODE; bot/API activos salvo SHELFY_MAINTENANCE_MODE=1",
        "version": "2.1.5-supabase-shield",
        # Railway / CI inyectan SHA para verificar deploy sin CLI (fixit / ops).
        "build_tag": "supabase-shield-2026-06-12",
        "deploy_git_sha": (
            os.getenv("RAILWAY_GIT_COMMIT_SHA")
            or os.getenv("RAILWAY_GIT_COMMIT")
            or os.getenv("GIT_COMMIT")
            or os.getenv("COMMIT_SHA")
        ),
        "bots_active": bots_active,
        "bots_expected": bots_expected,
        "bots_healthy": bots_healthy,
        "webhook_url": WEBHOOK_URL,
        "supabase_ok": supabase_ok,
        "shield": shield_status,
    }


# ── Telegram Webhook ───────────────────────────────────────────────────────────
_webhook_sem: asyncio.Semaphore | None = None


def _webhook_concurrency_sem() -> asyncio.Semaphore:
    global _webhook_sem
    if _webhook_sem is None:
        _webhook_sem = asyncio.Semaphore(int(os.getenv("SHELFY_WEBHOOK_CONCURRENCY", "30")))
    return _webhook_sem


def _telegram_update_age_sec(data: dict) -> float | None:
    """Edad del update en segundos (None si no hay timestamp de mensaje)."""
    ts: int | None = None
    for branch in (
        ("message",),
        ("edited_message",),
        ("channel_post",),
        ("callback_query", "message"),
    ):
        obj: object = data
        for key in branch:
            if not isinstance(obj, dict):
                obj = {}
                break
            obj = obj.get(key) or {}
        if isinstance(obj, dict) and obj.get("date"):
            ts = int(obj["date"])
            break
    if ts is None:
        return None
    return max(0.0, time.time() - ts)


def _should_shed_telegram_update(data: dict) -> bool:
    """Ignora backlog viejo o saturación post-arranque."""
    from core.lifespan import API_STARTED_AT

    age = _telegram_update_age_sec(data)
    if age is None:
        return False
    boot_grace = int(os.getenv("SHELFY_BOOT_GRACE_SEC", "120"))
    boot_max_age = int(os.getenv("SHELFY_BOOT_MAX_UPDATE_AGE", "20"))
    normal_max_age = int(os.getenv("SHELFY_WEBHOOK_MAX_AGE_SEC", "600"))
    since_boot = time.time() - (API_STARTED_AT or 0.0)
    max_age = boot_max_age if since_boot < boot_grace else normal_max_age
    return age > max_age


async def _process_telegram_update(dist_id: int, data: dict) -> None:
    """Procesa update en background para responder 200 a Telegram de inmediato."""
    if _should_shed_telegram_update(data):
        logger.debug("[webhook] update viejo descartado dist=%s", dist_id)
        return

    sem = _webhook_concurrency_sem()
    shed_wait = float(os.getenv("SHELFY_WEBHOOK_ACQUIRE_SEC", "0.15"))
    try:
        await asyncio.wait_for(sem.acquire(), timeout=shed_wait)
    except asyncio.TimeoutError:
        logger.warning("[webhook] carga alta — update descartado dist=%s", dist_id)
        return
    try:
        ptb_app = bots.get(dist_id)
        if not ptb_app:
            return
        try:
            update = Update.de_json(data, ptb_app.bot)
            await ptb_app.process_update(update)
        except Exception as e:
            logger.error(f"❌ Error procesando update bot {dist_id}: {e}")
    finally:
        sem.release()


@app.post("/api/telegram/webhook/{id_distribuidor}", tags=["Telegram Webhook"])
async def telegram_webhook(id_distribuidor: int, request: Request):
    if id_distribuidor not in bots:
        logger.warning(f"⚠️ Webhook recibido para bot inactivo: {id_distribuidor}")
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Bot inactivo o no encontrado")
    try:
        data = await request.json()
    except Exception as e:
        logger.error(f"❌ Webhook JSON inválido bot {id_distribuidor}: {e}")
        return {"ok": False, "error": "invalid json"}
    asyncio.create_task(_process_telegram_update(id_distribuidor, data))
    return {"ok": True}


# ── WebSocket ──────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/exhibiciones/{dist_id}")
async def websocket_endpoint(websocket: WebSocket, dist_id: int):
    await manager.connect(websocket, dist_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, dist_id)
    except Exception as e:
        logger.error(f"❌ Error en WebSocket {dist_id}: {e}")
        manager.disconnect(websocket, dist_id)


@app.websocket("/api/ws/superadmin")
async def websocket_superadmin(websocket: WebSocket, token: str | None = Query(None)):
    """Notificaciones en tiempo real solo para JWT superadmin (`?token=`)."""
    if not JWT_AVAILABLE or not token:
        await websocket.close(code=4401)
        return
    try:
        payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        is_sa = payload.get("is_superadmin", False) or payload.get("rol") == "superadmin"
        if not is_sa:
            await websocket.close(code=4403)
            return
    except JWTError:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, SUPERADMIN_WS_DIST_ID)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, SUPERADMIN_WS_DIST_ID)
    except Exception as e:
        logger.error(f"❌ Error en WebSocket superadmin: {e}")
        manager.disconnect(websocket, SUPERADMIN_WS_DIST_ID)


# ── Entry point (desarrollo local) ────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
