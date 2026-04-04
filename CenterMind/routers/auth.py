# -*- coding: utf-8 -*-
"""Endpoints de autenticación: /login, /auth/login, /auth/switch-context."""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.config import JWT_AVAILABLE, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS, _jwt
from core.security import verify_auth
from db import sb
from models.schemas import LoginRequest, TokenResponse

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


@router.post("/login", summary="Autenticacion de usuario")
def login(req: LoginRequest, _=Depends(verify_auth)):
    result = sb.rpc("fn_login", {"p_usuario": req.usuario.strip(), "p_password": req.password.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    return result.data[0]


@router.post("/auth/login", summary="Login para frontend React - devuelve JWT", response_model=TokenResponse)
def auth_login(req: LoginRequest):
    if not JWT_AVAILABLE:
        raise HTTPException(status_code=503, detail="JWT no disponible")
    try:
        result = sb.rpc("fn_login", {"p_usuario": req.usuario.strip(), "p_password": req.password.strip()}).execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="Credenciales invalidas")
        user = result.data[0]

        if not user.get("activo", True):
            raise HTTPException(status_code=403, detail="Tu usuario ha sido desactivado. Contacta al administrador.")

        tutorial_views = user.get("tutorial_views", 0)
        show_tutorial = tutorial_views < 3
        if show_tutorial:
            sb.table("usuarios_portal").update({"tutorial_views": tutorial_views + 1}).eq("id_usuario", user["id_usuario"]).execute()

        dist_id = user.get("id_distribuidor")
        flags = {"usa_quarentena": False, "usa_contexto_erp": False, "usa_mapeo_vendedores": False}
        if dist_id:
            dist_res = sb.table("distribuidores").select("feature_flags, estado_operativo").eq("id_distribuidor", dist_id).execute()
            if dist_res.data:
                d_data = dist_res.data[0]
                flags = d_data.get("feature_flags") or flags
                if d_data.get("estado_operativo") != "Activo":
                    logger.warning(f"⚠️ Tenant {dist_id} logueando en modo lectura (Bloqueado)")

        # Fetch role permissions from roles_permisos table
        permisos: dict = {}
        try:
            permisos_res = sb.table("roles_permisos").select("permiso_key, valor").eq("rol", user["rol"]).execute()
            permisos = {row["permiso_key"]: row["valor"] for row in (permisos_res.data or [])}
        except Exception as e:
            logger.warning(f"⚠️ No se pudieron cargar permisos para rol '{user['rol']}': {e}")

        # directorio role gets superadmin scope so check_dist_permission passes
        is_superadmin = bool(user.get("is_superadmin") or user["rol"] in ("superadmin", "directorio"))

        payload = {
            "sub":                  user["usuario_login"],
            "id_usuario":           user["id_usuario"],
            "rol":                  user["rol"],
            "id_distribuidor":      dist_id,
            "nombre_empresa":       user.get("nombre_empresa"),
            "is_superadmin":        is_superadmin,
            "usa_quarentena":       flags.get("usa_quarentena", False),
            "usa_contexto_erp":     flags.get("usa_contexto_erp", False),
            "usa_mapeo_vendedores": flags.get("usa_mapeo_vendedores", False),
            "show_tutorial":        show_tutorial,
            "permisos":             permisos,
            "exp":                  datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        }
        token = _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return TokenResponse(
            access_token=token, token_type="bearer",
            usuario=user["usuario_login"], rol=user["rol"],
            id_usuario=user["id_usuario"], id_distribuidor=dist_id,
            nombre_empresa=user.get("nombre_empresa"),
            is_superadmin=payload["is_superadmin"],
            usa_quarentena=payload["usa_quarentena"],
            usa_contexto_erp=payload["usa_contexto_erp"],
            usa_mapeo_vendedores=payload["usa_mapeo_vendedores"],
            show_tutorial=show_tutorial,
            permisos=permisos,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en auth_login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")


@router.post(
    "/auth/switch-context/{dist_id}",
    summary="Superadmin cambia de distribuidora activa",
    response_model=TokenResponse,
)
def switch_context(dist_id: int, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo el superadmin puede cambiar de contexto")

    res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, feature_flags").eq("id_distribuidor", dist_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Distribuidora no encontrada")
    dist = res.data[0]
    flags = dist.get("feature_flags") or {}

    # Re-fetch permissions for this user's role
    rol = payload.get("rol", "superadmin")
    permisos: dict = {}
    try:
        permisos_res = sb.table("roles_permisos").select("permiso_key, valor").eq("rol", rol).execute()
        permisos = {row["permiso_key"]: row["valor"] for row in (permisos_res.data or [])}
    except Exception as e:
        logger.warning(f"⚠️ No se pudieron cargar permisos para rol '{rol}' en switch-context: {e}")

    new_payload = dict(payload)
    new_payload["id_distribuidor"]      = int(dist["id_distribuidor"])
    new_payload["nombre_empresa"]       = dist["nombre_empresa"]
    new_payload["usa_quarentena"]       = bool(flags.get("usa_quarentena", False))
    new_payload["usa_contexto_erp"]     = bool(flags.get("usa_contexto_erp", False))
    new_payload["usa_mapeo_vendedores"] = bool(flags.get("usa_mapeo_vendedores", False))
    new_payload["is_superadmin"]        = True
    new_payload["permisos"]             = permisos

    token = _jwt.encode(new_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return TokenResponse(
        access_token=token, token_type="bearer",
        usuario=new_payload.get("sub", ""), rol=new_payload.get("rol", ""),
        id_usuario=new_payload.get("id_usuario", 0), id_distribuidor=dist["id_distribuidor"],
        nombre_empresa=dist["nombre_empresa"],
        is_superadmin=True,
        usa_quarentena=new_payload["usa_quarentena"],
        usa_contexto_erp=new_payload["usa_contexto_erp"],
        usa_mapeo_vendedores=new_payload["usa_mapeo_vendedores"],
        permisos=permisos,
    )
