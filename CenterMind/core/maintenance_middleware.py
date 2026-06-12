# -*- coding: utf-8 -*-
"""Modo mantenimiento API — bloquea tráfico del portal mientras se opera la DB."""
from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse

_MAINTENANCE_PATHS_ALLOWED = (
    "/health",
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def is_maintenance_mode() -> bool:
    return os.getenv("SHELFY_MAINTENANCE_MODE", "0").strip() in ("1", "true", "yes")


async def maintenance_middleware(request: Request, call_next):
    if not is_maintenance_mode():
        return await call_next(request)

    path = request.url.path
    if path.startswith("/api/telegram/webhook/"):
        return await call_next(request)
    if any(path == p or path.startswith(p + "/") for p in _MAINTENANCE_PATHS_ALLOWED if p != "/"):
        if path in _MAINTENANCE_PATHS_ALLOWED:
            return await call_next(request)
    if path == "/":
        return await call_next(request)

    api_key = request.headers.get("x-api-key")
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
