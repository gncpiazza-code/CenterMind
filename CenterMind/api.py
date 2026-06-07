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

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from telegram import Update

from core.config import CORS_ORIGINS, CORS_ALLOW_ORIGIN_REGEX, JWT_SECRET, JWT_ALGORITHM, JWT_AVAILABLE, JWTError, _jwt
from core.lifespan import bots, manager, lifespan, SUPERADMIN_WS_DIST_ID
from routers import auth, erp, supervision, admin, reportes, informes_excel, fuerza_ventas, difusion, supervisores, reporteria, portal_feedback, compania_revision, estadisticas, bundle, recap, compania_objetivos, bot_settings

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

# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health_check():
    from core.config import WEBHOOK_URL
    from core.bot_registry import fetch_active_distribuidores, is_transient_supabase_error

    bots_expected: int | None = None
    supabase_ok = True
    try:
        rows = await asyncio.to_thread(fetch_active_distribuidores, max_retries=2)
        bots_expected = len(rows)
    except Exception as e:
        supabase_ok = not is_transient_supabase_error(e)
        bots_expected = None

    bots_active = list(bots.keys())
    bots_healthy = (
        bots_expected is not None
        and bots_expected > 0
        and len(bots_active) >= bots_expected
    )
    return {
        "status": "online" if (supabase_ok and (bots_expected == 0 or bots_healthy)) else "degraded",
        "version": "2.1.4-bot-recovery",
        # Railway / CI inyectan SHA para verificar deploy sin CLI (fixit / ops).
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
    }


# ── Telegram Webhook ───────────────────────────────────────────────────────────
@app.post("/api/telegram/webhook/{id_distribuidor}", tags=["Telegram Webhook"])
async def telegram_webhook(id_distribuidor: int, request: Request):
    if id_distribuidor not in bots:
        logger.warning(f"⚠️ Webhook recibido para bot inactivo: {id_distribuidor}")
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Bot inactivo o no encontrado")
    ptb_app = bots[id_distribuidor]
    try:
        data   = await request.json()
        update = Update.de_json(data, ptb_app.bot)
        await ptb_app.process_update(update)
        return {"ok": True}
    except Exception as e:
        logger.error(f"❌ Error procesando webhook para bot {id_distribuidor}: {e}")
        return {"ok": False, "error": str(e)}


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
