# -*- coding: utf-8 -*-
"""
Dependencias de seguridad FastAPI: API Key, JWT y combinada.
"""
import logging

from fastapi import HTTPException, Header

from core.config import API_KEY, JWT_SECRET, JWT_ALGORITHM, JWT_AVAILABLE, JWTError, _jwt
from db import sb

logger = logging.getLogger("ShelfyAPI")


def verify_key(x_api_key: str = Header(..., description="API Key secreta")):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API Key inválida")


def verify_jwt(authorization: str = Header(..., description="Bearer <token>")):
    """Dependencia para proteger endpoints exclusivamente con JWT."""
    if not JWT_AVAILABLE:
        raise HTTPException(status_code=503, detail="JWT no disponible")
    try:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Formato inválido. Usa: Bearer <token>")
        payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token JWT inválido o expirado")


def verify_auth(
    x_api_key: str = Header(None),
    authorization: str = Header(None),
):
    """Acepta API Key (bot/RPA) O JWT (frontend React)."""
    if x_api_key:
        if x_api_key != API_KEY:
            raise HTTPException(status_code=401, detail="API Key inválida")
        return {"method": "api_key", "is_superadmin": True, "rol": "admin"}

    if authorization:
        if not JWT_AVAILABLE:
            raise HTTPException(status_code=503, detail="JWT no disponible")
        try:
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token:
                raise HTTPException(status_code=401, detail="Formato inválido. Usa: Bearer <token>")
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            payload["is_superadmin"] = payload.get("is_superadmin", False) or payload.get("rol") == "superadmin"
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Token JWT inválido o expirado")

    raise HTTPException(status_code=401, detail="Se requiere autenticación (X-Api-Key o Bearer token)")


def check_distributor_status(dist_id: int, user_payload: dict):
    """Lanza 403 si la distribuidora está bloqueada. SuperAdmins hacen bypass."""
    if user_payload.get("is_superadmin"):
        return
    res = sb.table("distribuidores").select("estado_operativo, motivo_bloqueo").eq("id_distribuidor", dist_id).execute()
    if res.data:
        status = res.data[0].get("estado_operativo", "Activo")
        if status != "Activo":
            motivo = res.data[0].get("motivo_bloqueo") or "Bloqueo por administración"
            raise HTTPException(status_code=403, detail=f"Distribuidora bloqueada: {motivo}")


def check_dist_permission(payload: dict, required_dist_id: int):
    """Lanza 403 si el usuario no tiene acceso a la distribuidora solicitada."""
    if payload.get("is_superadmin"):
        return True
    user_dist_id = payload.get("id_distribuidor")
    if user_dist_id != required_dist_id:
        logger.warning(
            f"🚫 Intento de acceso no autorizado: Usuario dist {user_dist_id} -> Recurso dist {required_dist_id}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"No tienes permisos para acceder a esta distribuidora ({required_dist_id})",
        )
    check_distributor_status(required_dist_id, payload)
    return True
