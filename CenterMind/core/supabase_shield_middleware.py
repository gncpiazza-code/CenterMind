# -*- coding: utf-8 -*-
"""Middleware HTTP del escudo Supabase — load shedding + headers de estado."""
from __future__ import annotations

import time

from fastapi import Request
from fastapi.responses import JSONResponse

from core.supabase_shield import shield


async def supabase_shield_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()

    if path in ("/health", "/") and method == "GET":
        return await call_next(request)

    if shield.shed_http_path(path, method):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Servicio temporalmente limitado: base de datos bajo carga. Reintentá en unos minutos.",
                "shield": shield.status(),
            },
            headers={
                "Retry-After": "60",
                "X-Shelfy-Shield": shield.status()["state"],
            },
        )

    started = time.monotonic()
    response = await call_next(request)
    elapsed_ms = (time.monotonic() - started) * 1000

    st = shield.status()["state"]
    response.headers["X-Shelfy-Shield"] = st
    if elapsed_ms > 8_000 and path.startswith("/api/"):
        shield.record_outcome(ok=False, latency_ms=elapsed_ms, error=f"slow {method} {path}")

    return response
