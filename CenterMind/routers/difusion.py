# -*- coding: utf-8 -*-
"""
Router de Difusión — comunicaciones masivas o por vendedor.

Endpoints:
  POST /api/difusion/cc-telegram   — envía PDF de CC al grupo Telegram del vendedor.
  GET  /api/difusion/vendedores/{dist_id} — lista vendedores con binding Telegram para selector UI.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import verify_auth, check_dist_permission
from core.tenant_tables import tenant_table_name
from db import sb
from services.cc_difusion_service import difundir_cc_telegram

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

ROLES_DIFUSION = {"superadmin", "admin", "directorio"}


class DifusionCCTelegramRequest(BaseModel):
    dist_id: int
    modo: str               # "uno" | "todos"
    id_vendedor: Optional[int] = None
    sucursal: Optional[str] = None
    mensaje_template: str = ""
    fecha: Optional[str] = None


@router.post("/api/difusion/cc-telegram", tags=["Difusión"])
def difusion_cc_telegram(
    body: DifusionCCTelegramRequest,
    user_payload=Depends(verify_auth),
):
    """Envía CC como PDF al grupo Telegram del vendedor (o de todos en la sucursal)."""
    if user_payload.get("rol") not in ROLES_DIFUSION and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente para Difusión")
    check_dist_permission(user_payload, body.dist_id)

    if body.modo not in ("uno", "todos"):
        raise HTTPException(status_code=400, detail="modo debe ser 'uno' o 'todos'")
    if body.modo == "uno" and body.id_vendedor is None:
        raise HTTPException(status_code=400, detail="id_vendedor requerido para modo='uno'")

    try:
        result = difundir_cc_telegram(
            dist_id=body.dist_id,
            modo=body.modo,
            id_vendedor=body.id_vendedor,
            sucursal=body.sucursal,
            mensaje_template=body.mensaje_template,
            fecha=body.fecha,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[difusion] cc-telegram dist={body.dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/difusion/vendedores/{dist_id}", tags=["Difusión"])
def difusion_list_vendedores(dist_id: int, sucursal: Optional[str] = None, user_payload=Depends(verify_auth)):
    """Lista vendedores del distribuidor con binding Telegram para el selector UI."""
    if user_payload.get("rol") not in ROLES_DIFUSION and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente para Difusión")
    check_dist_permission(user_payload, dist_id)

    try:
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        t_suc  = tenant_table_name("sucursales_v2", dist_id)

        vend_q = sb.table(t_vend).select("id_vendedor, nombre_erp, id_sucursal").eq("id_distribuidor", dist_id).order("nombre_erp")
        vend_rows = vend_q.execute().data or []

        suc_rows = sb.table(t_suc).select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).execute().data or []
        suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in suc_rows}

        # Filtrar por sucursal si se pide
        if sucursal:
            suc_ids = {s["id_sucursal"] for s in suc_rows if (s.get("nombre_erp") or "").strip().upper() == sucursal.strip().upper()}
            vend_rows = [v for v in vend_rows if v.get("id_sucursal") in suc_ids]

        from services.objetivos_notification_service import resolve_integrante_for_objetivos
        result = []
        for v in vend_rows:
            vid = v["id_vendedor"]
            row = resolve_integrante_for_objetivos(dist_id, vid)
            gid = row.get("telegram_group_id") if row else None
            tiene_telegram = gid is not None and str(gid).strip() not in ("", "0", "None")
            result.append({
                "id_vendedor": vid,
                "nombre_erp": v["nombre_erp"],
                "sucursal_nombre": suc_map.get(v.get("id_sucursal")),
                "tiene_telegram": tiene_telegram,
            })
        return result
    except Exception as e:
        logger.error(f"[difusion] list_vendedores dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
