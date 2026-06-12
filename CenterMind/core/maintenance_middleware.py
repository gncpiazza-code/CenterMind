# -*- coding: utf-8 -*-
"""
Modo mantenimiento API (opcional, desactivado por defecto).

El mantenimiento del portal vive en shelfy-frontend/proxy.ts (solo la página web).
El bot Telegram, RPA y servicios con X-Api-Key siguen usando la API con normalidad.
Activar bloqueo API solo si hace falta: SHELFY_MAINTENANCE_MODE=1 en Railway.
"""
from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse

# Siempre permitidos (bot, health, integraciones internas).
_ALWAYS_ALLOWED_PREFIXES = (
    "/health",
    "/api/telegram/webhook/",
    "/api/v1/sync/",
    "/api/erp/",
)

_MAINTENANCE_PATHS_ALLOWED = (
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def is_maintenance_mode() -> bool:
    # OFF por defecto: solo el portal web entra en mantenimiento.
    raw = os.getenv("SHELFY_MAINTENANCE_MODE", "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


async def maintenance_middleware(request: Request, call_next):
    if not is_maintenance_mode():
        return await call_next(request)

    path = request.url.path

    if any(path.startswith(prefix) for prefix in _ALWAYS_ALLOWED_PREFIXES):
        return await call_next(request)
    if path in _MAINTENANCE_PATHS_ALLOWED:
        return await call_next(request)

    api_key = request.headers.get("x-api-key")
    if api_key:
        return await call_next(request)

    bypass = (os.getenv("SHELFY_MAINTENANCE_BYPASS_KEY") or "").strip()
    if bypass and api_key and api_key == bypass:
        return await call_next(request)

    return JSONResponse(
        status_code=503,
        content={
            "detail": "Shelfy en mantenimiento. Reintentá en unos minutos.",
            "maintenance": True,
        },
        headers={"Retry-After": "300"},
    )
