# -*- coding: utf-8 -*-
"""
API REST para App Settings de la app movil de vendedores.
Prefix: /api/app-settings
Tags: ["App Settings"]

Solo superadmin puede acceder.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import verify_auth
from db import sb

logger = logging.getLogger("ShelfyAPI")
router = APIRouter(prefix="/api/app-settings", tags=["App Settings"])


# --- Guard superadmin --------------------------------------------------------

def _require_superadmin(user: dict = Depends(verify_auth)):
    if user.get("rol") != "superadmin":
        raise HTTPException(status_code=403, detail="Requiere rol superadmin")
    return user


# --- Modelos Pydantic ---------------------------------------------------------

class AppSettingsUpdate(BaseModel):
    push_objetivos_enabled: bool | None = None
    push_objetivos_time_ar: str | None = None   # "HH:MM"
    push_objetivos_dow: list[int] | None = None  # [1,2,3,4,5,6]
    push_template: str | None = None


# --- Helpers ------------------------------------------------------------------

_DEFAULTS = {
    "push_objetivos_enabled": True,
    "push_objetivos_time_ar": "08:00:00",
    "push_objetivos_dow": [1, 2, 3, 4, 5, 6],
    "push_template": None,
}


def _get_or_create_settings(dist_id: int) -> dict:
    """Obtiene settings del distribuidor; crea con defaults si no existen."""
    res = (
        sb.table("vendedor_app_settings")
        .select("*")
        .eq("id_distribuidor", dist_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]

    # Crear con defaults
    insert_data = {"id_distribuidor": dist_id, **_DEFAULTS}
    created = (
        sb.table("vendedor_app_settings")
        .insert(insert_data)
        .execute()
    )
    if created.data:
        return created.data[0]
    return insert_data


# --- Endpoints ----------------------------------------------------------------

@router.get("/{dist_id}", summary="Obtener settings de la app movil por distribuidor")
def get_app_settings(
    dist_id: int,
    user: dict = Depends(_require_superadmin),
):
    """Retorna la configuracion de la app movil para el distribuidor.
    Crea un registro con defaults si aun no existe."""
    try:
        settings = _get_or_create_settings(dist_id)
    except Exception as e:
        logger.error(f"[app-settings] get dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return settings


@router.put("/{dist_id}", summary="Actualizar settings de la app movil por distribuidor")
def update_app_settings(
    dist_id: int,
    body: AppSettingsUpdate,
    user: dict = Depends(_require_superadmin),
):
    """Actualiza los settings de la app movil para el distribuidor."""
    updates: dict = {}
    if body.push_objetivos_enabled is not None:
        updates["push_objetivos_enabled"] = body.push_objetivos_enabled
    if body.push_objetivos_time_ar is not None:
        updates["push_objetivos_time_ar"] = body.push_objetivos_time_ar
    if body.push_objetivos_dow is not None:
        updates["push_objetivos_dow"] = body.push_objetivos_dow
    if body.push_template is not None:
        updates["push_template"] = body.push_template

    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    # Asegurar que el registro existe antes de actualizar
    try:
        _get_or_create_settings(dist_id)
        res = (
            sb.table("vendedor_app_settings")
            .update(updates)
            .eq("id_distribuidor", dist_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"[app-settings] update dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"ok": True, "dist_id": dist_id, "updated": updates}


@router.post("/{dist_id}/test-push", summary="Enviar push de prueba (simulado)")
def test_push(
    dist_id: int,
    user: dict = Depends(_require_superadmin),
):
    """Envia un push de prueba simulado al distribuidor.
    El push real via FCM se implementara cuando FCM este configurado.
    """
    # TODO: implementar push real via FCM cuando FCM_SERVER_KEY este configurado
    logger.info(f"[app-settings] test-push simulado para dist={dist_id}")
    return {"ok": True, "message": "Push de prueba enviado (simulado)"}
