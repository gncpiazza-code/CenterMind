# -*- coding: utf-8 -*-
"""
Router de Difusión — comunicaciones masivas o por vendedor.

Endpoints:
  POST /api/difusion/cc-telegram                         — envía PDF de CC al grupo Telegram.
  GET  /api/difusion/vendedores/{dist_id}                — lista vendedores con binding Telegram.
  GET  /api/difusion/vendedor/{dist_id}/{id_vendedor}/resumen — CC + objetivos + exhibiciones del mes.
"""
import logging
from datetime import datetime, timezone
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


@router.get("/api/difusion/vendedor/{dist_id}/{id_vendedor}/resumen", tags=["Difusión"])
def difusion_vendedor_resumen(dist_id: int, id_vendedor: int, user_payload=Depends(verify_auth)):
    """Resumen CC + objetivos abiertos + exhibiciones del mes para el selector de vendedor."""
    if user_payload.get("rol") not in ROLES_DIFUSION and not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Permiso insuficiente para Difusión")
    check_dist_permission(user_payload, dist_id)

    try:
        now = datetime.now(timezone.utc)
        mes_actual = now.strftime("%Y-%m")
        primer_dia_mes = f"{mes_actual}-01"

        # ── CC snapshot más reciente para este vendedor ────────────────────────
        snap = (
            sb.table("cc_detalle")
            .select("fecha_snapshot")
            .eq("id_distribuidor", dist_id)
            .order("fecha_snapshot", desc=True)
            .limit(1)
            .execute()
        )
        cc_data: dict = {
            "fecha_snapshot": None,
            "deuda_total": 0,
            "cantidad_clientes": 0,
            "antiguedad_max": None,
            "antiguedad_min": None,
        }
        if snap.data:
            fecha_snapshot = snap.data[0]["fecha_snapshot"]
            cc_rows = (
                sb.table("cc_detalle")
                .select("deuda_total, antiguedad_dias")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .eq("fecha_snapshot", fecha_snapshot)
                .execute()
                .data or []
            )
            if cc_rows:
                deudas = [float(r.get("deuda_total") or 0) for r in cc_rows]
                dias = [r["antiguedad_dias"] for r in cc_rows if r.get("antiguedad_dias") is not None]
                cc_data = {
                    "fecha_snapshot": fecha_snapshot,
                    "deuda_total": round(sum(deudas), 2),
                    "cantidad_clientes": len(cc_rows),
                    "antiguedad_max": max(dias) if dias else None,
                    "antiguedad_min": min(dias) if dias else None,
                }

        # ── Objetivos abiertos ─────────────────────────────────────────────────
        obj_rows = (
            sb.table("objetivos")
            .select("tipo")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor", id_vendedor)
            .eq("cumplido", False)
            .execute()
            .data or []
        )
        por_tipo: dict[str, int] = {}
        for o in obj_rows:
            t = o.get("tipo") or "otro"
            por_tipo[t] = por_tipo.get(t, 0) + 1

        # ── Exhibiciones del mes ───────────────────────────────────────────────
        int_rows = (
            sb.table("integrantes_grupo")
            .select("id_integrante")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor)
            .execute()
            .data or []
        )
        int_ids = [r["id_integrante"] for r in int_rows if r.get("id_integrante")]
        exh_data: dict = {"mes_actual": mes_actual, "aprobadas": 0, "pendientes": 0, "total": 0}
        if int_ids:
            exh_rows = (
                sb.table("exhibiciones")
                .select("estado")
                .in_("id_integrante", int_ids)
                .gte("created_at", primer_dia_mes)
                .execute()
                .data or []
            )
            exh_data["aprobadas"] = sum(1 for e in exh_rows if (e.get("estado") or "").lower() == "aprobado")
            exh_data["pendientes"] = sum(1 for e in exh_rows if (e.get("estado") or "").lower() == "pendiente")
            exh_data["total"] = len(exh_rows)

        return {"cc": cc_data, "objetivos": {"total_abiertos": len(obj_rows), "por_tipo": por_tipo}, "exhibiciones": exh_data}

    except Exception as e:
        logger.error(f"[difusion] resumen vend={id_vendedor} dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
