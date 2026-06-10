# -*- coding: utf-8 -*-
"""Guardas de solo lectura para el rol espectador (demos en vivo sin mutar DB)."""
from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from core.config import JWT_AVAILABLE, JWT_SECRET, JWT_ALGORITHM, JWTError, _jwt
from core.roles import ROL_ESPECTADOR, is_espectador_rol

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# POST permitidos aunque no persistan datos de negocio (login, previews, cache warm).
ESPECTADOR_WRITE_ALLOWLIST_EXACT = frozenset({
    "/auth/login",
    "/login",
})

ESPECTADOR_WRITE_ALLOWLIST_PREFIXES = (
    "/api/bundle/warm/",
)


def espectador_write_allowed(path: str) -> bool:
    if path in ESPECTADOR_WRITE_ALLOWLIST_EXACT:
        return True
    if "/preview" in path:
        return True
    return any(path.startswith(prefix) for prefix in ESPECTADOR_WRITE_ALLOWLIST_PREFIXES)


def payload_from_request(request: Request) -> dict | None:
    """Decodifica JWT Bearer del request (sin lanzar)."""
    if not JWT_AVAILABLE:
        return None
    auth = request.headers.get("authorization") or ""
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        return _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def is_espectador_payload(payload: dict | None) -> bool:
    if not payload:
        return False
    if payload.get("read_only"):
        return True
    return is_espectador_rol(payload.get("rol"))


def assert_write_access(payload: dict) -> None:
    """Lanza 403 si el usuario es espectador (solo lectura)."""
    if is_espectador_payload(payload):
        raise HTTPException(
            status_code=403,
            detail="Modo demostración: los espectadores pueden navegar pero no guardar cambios.",
        )


async def espectador_read_only_middleware(request: Request, call_next):
    """Bloquea mutaciones HTTP para JWT de rol espectador (API Key / bots sin Bearer pasan)."""
    if request.method.upper() not in MUTATING_METHODS:
        return await call_next(request)

    if request.headers.get("x-api-key"):
        return await call_next(request)

    path = request.url.path
    if espectador_write_allowed(path):
        return await call_next(request)

    payload = payload_from_request(request)
    if not is_espectador_payload(payload):
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={
            "detail": "Modo demostración: los espectadores pueden navegar pero no guardar cambios.",
        },
    )
