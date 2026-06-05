# -*- coding: utf-8 -*-
"""
routers/compania_objetivos.py
==============================
Endpoints de Liquidación de objetivos de Compañía.
Auth: compania/superadmin + check_dist_permission.

Rutas:
  GET  /api/compania/objetivos/liquidacion/config
  PUT  /api/compania/objetivos/liquidacion/config
  GET  /api/compania/objetivos/liquidacion/preview
  GET  /api/compania/objetivos/liquidacion/export.xlsx
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from core.security import verify_auth, require_compania_role, check_dist_permission
from core.roles import normalize_rol, ROLES_COMPANIA_SCOPE
from models.schemas import (
    LiquidacionConfigIn,
    LiquidacionConfigOut,
    LiquidacionPreviewOut,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ─── Auth helper ──────────────────────────────────────────────────────────────

def _require_compania(user_payload: dict) -> None:
    """Lanza 403 si el usuario no es compañía ni superadmin."""
    require_compania_role(user_payload)


# ─── Config endpoints ─────────────────────────────────────────────────────────

@router.get(
    "/api/compania/objetivos/liquidacion/config",
    response_model=LiquidacionConfigOut,
    tags=["Liquidación Compañía"],
)
def get_liquidacion_config(payload=Depends(verify_auth)):
    """Obtiene la configuración de tarifas y bono de mando medio."""
    _require_compania(payload)
    from services.objetivos_liquidacion_service import get_config
    try:
        return get_config()
    except Exception as e:
        logger.error("[liquidacion_config] GET error: %s", e)
        raise HTTPException(status_code=500, detail=f"Error obteniendo configuración: {e}")


@router.put(
    "/api/compania/objetivos/liquidacion/config",
    response_model=LiquidacionConfigOut,
    tags=["Liquidación Compañía"],
)
def put_liquidacion_config(
    body: LiquidacionConfigIn,
    payload=Depends(verify_auth),
):
    """Actualiza la configuración de tarifas y bono de mando medio."""
    _require_compania(payload)
    updated_by = (
        payload.get("id_usuario")
        or payload.get("sub")
        or None
    )
    # Convertir a str si es int para compatibilidad UUID
    if updated_by is not None:
        updated_by = str(updated_by)

    from services.objetivos_liquidacion_service import put_config
    try:
        return put_config(body, updated_by=updated_by)
    except Exception as e:
        logger.error("[liquidacion_config] PUT error: %s", e)
        raise HTTPException(status_code=500, detail=f"Error guardando configuración: {e}")


# ─── Preview endpoint ─────────────────────────────────────────────────────────

@router.get(
    "/api/compania/objetivos/liquidacion/preview",
    response_model=LiquidacionPreviewOut,
    tags=["Liquidación Compañía"],
)
def get_liquidacion_preview(
    dist_id: int = Query(..., description="ID de la distribuidora"),
    mes: str = Query(..., description="Mes en formato YYYY-MM"),
    payload=Depends(verify_auth),
):
    """
    Calcula la preview de liquidación para un mes y distribuidora.
    Incluye detalle por vendedor×objetivo, mando medio y totales.
    """
    _require_compania(payload)
    check_dist_permission(payload, dist_id)

    # Validar formato mes
    _validate_mes(mes)

    from services.objetivos_liquidacion_service import compute_liquidacion
    try:
        result = compute_liquidacion(dist_id, mes)
        return result
    except Exception as e:
        logger.error("[liquidacion_preview] dist=%s mes=%s error: %s", dist_id, mes, e)
        raise HTTPException(status_code=500, detail=f"Error calculando liquidación: {e}")


# ─── Export XLSX endpoint ─────────────────────────────────────────────────────

@router.get(
    "/api/compania/objetivos/liquidacion/export.xlsx",
    tags=["Liquidación Compañía"],
)
def export_liquidacion_xlsx(
    dist_id: int = Query(..., description="ID de la distribuidora"),
    mes: str = Query(..., description="Mes en formato YYYY-MM"),
    payload=Depends(verify_auth),
):
    """
    Genera y descarga el XLSX de liquidación de objetivos de compañía.
    """
    _require_compania(payload)
    check_dist_permission(payload, dist_id)

    _validate_mes(mes)

    from services.objetivos_liquidacion_service import export_xlsx
    try:
        xlsx_bytes = export_xlsx(dist_id, mes)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("[liquidacion_export] dist=%s mes=%s error: %s", dist_id, mes, e)
        raise HTTPException(status_code=500, detail=f"Error generando XLSX: {e}")

    filename = f"liquidacion_{dist_id}_{mes}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(xlsx_bytes)),
        },
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_mes(mes: str) -> None:
    """Valida que el mes tenga formato YYYY-MM."""
    import re
    if not re.match(r"^\d{4}-\d{2}$", mes):
        raise HTTPException(
            status_code=422,
            detail="El parámetro 'mes' debe tener formato YYYY-MM (ej: 2026-06)",
        )
    try:
        year, month = int(mes[:4]), int(mes[5:7])
        if not (1 <= month <= 12):
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Mes inválido. Usar formato YYYY-MM con mes entre 01 y 12.",
        )
