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

import logging

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from telegram import Update

from core.config import CORS_ORIGINS
from core.lifespan import bots, manager, lifespan
from routers import auth, erp, supervision, admin, reportes

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

# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health_check():
    from core.config import WEBHOOK_URL
    return {
        "status": "online",
        "version": "2.1.2-dashboard-fix",
        "bots_active": list(bots.keys()),
        "webhook_url": WEBHOOK_URL,
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


# ── Entry point (desarrollo local) ────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
