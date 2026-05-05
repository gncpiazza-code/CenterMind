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
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.helpers import load_active_vendedor_ids
from core.security import verify_auth, check_dist_permission
from core.tenant_tables import tenant_table_name
from db import sb
from services.cc_difusion_service import (
    difundir_cc_telegram,
    difundir_sigo_resumen_telegram,
    planificar_envios_cc_telegram,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


def _norm_text(value: str | None) -> str:
    if not value:
        return ""
    txt = str(value).strip().lower()
    txt = "".join(
        c for c in unicodedata.normalize("NFD", txt)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(txt.split())


def _fetch_all_rows(table_name: str, select_cols: str, dist_id: int, order_col: str | None = None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page = 1000
    while True:
        q = sb.table(table_name).select(select_cols).eq("id_distribuidor", dist_id)
        if order_col:
            q = q.order(order_col)
        batch = q.range(offset, offset + page - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


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


@router.post("/api/difusion/cc-telegram/preview", tags=["Difusión"])
def difusion_cc_telegram_preview(
    body: DifusionCCTelegramRequest,
    user_payload=Depends(verify_auth),
):
    """
    Devuelve los envíos planificados sin disparar nada.
    Permite al supervisor ver el cruce vendedor ERP ↔ grupo Telegram antes
    de confirmar el envío masivo, y detectar grupos duplicados.
    """
    check_dist_permission(user_payload, body.dist_id)
    if body.modo not in ("uno", "todos"):
        raise HTTPException(status_code=400, detail="modo debe ser 'uno' o 'todos'")
    try:
        result = planificar_envios_cc_telegram(
            dist_id=body.dist_id,
            modo=body.modo,
            id_vendedor=body.id_vendedor,
            sucursal=body.sucursal,
            fecha=body.fecha,
        )
        return result
    except Exception as e:
        logger.error(f"[difusion] cc-preview dist={body.dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DifusionSIGOTelegramRequest(BaseModel):
    dist_id: int
    modo: str                       # "uno" | "todos"
    id_vendedor: Optional[int] = None
    mensaje_template: str = ""
    sigo_data: Optional[dict] = None  # resultado de parse_sigo(); si se omite, se descarga del Storage


@router.post("/api/difusion/sigo-telegram", tags=["Difusión"])
def difusion_sigo_telegram(
    body: DifusionSIGOTelegramRequest,
    user_payload=Depends(verify_auth),
):
    """
    Envía un resumen de KPIs SIGO como mensaje de texto al grupo Telegram del vendedor (o de todos).
    Si `sigo_data` se omite, descarga el último snapshot SIGO disponible en Storage para el distribuidor.
    """
    check_dist_permission(user_payload, body.dist_id)

    if body.modo not in ("uno", "todos"):
        raise HTTPException(status_code=400, detail="modo debe ser 'uno' o 'todos'")
    if body.modo == "uno" and body.id_vendedor is None:
        raise HTTPException(status_code=400, detail="id_vendedor requerido para modo='uno'")

    sigo_data = body.sigo_data
    if not sigo_data:
        # Intentar cargar el snapshot más reciente de Storage
        from db import sb
        from services.reporting.parsers._normalization import read_excel_robust
        from services.reporting.parsers.sigo_parser import parse_sigo

        BUCKET = "Exhibiciones-PDV"
        prefix = f"sigo-rpa/{body.dist_id}/"

        def _collect_paths(folder: str, depth: int = 0) -> list[str]:
            if depth > 5:
                return []
            try:
                items = sb.storage.from_(BUCKET).list(folder)
            except Exception:
                return []
            paths: list[str] = []
            for item in (items or []):
                name = item.get("name", "")
                if not name:
                    continue
                full = f"{folder}{name}" if folder.endswith("/") else f"{folder}/{name}"
                if "." not in name.split("/")[-1]:
                    paths.extend(_collect_paths(full + "/", depth + 1))
                else:
                    paths.append(full)
            return paths

        xlsx_paths = [p for p in _collect_paths(prefix) if p.lower().endswith((".xlsx", ".xls"))]
        if not xlsx_paths:
            raise HTTPException(status_code=404, detail="Sin datos SIGO disponibles para este distribuidor")

        path = sorted(xlsx_paths, reverse=True)[0]
        try:
            file_bytes: bytes = sb.storage.from_(BUCKET).download(path)
        except Exception as dl_err:
            logger.error(f"[difusion/sigo] download dist={body.dist_id}: {dl_err}")
            raise HTTPException(status_code=500, detail=f"Error al descargar snapshot SIGO: {dl_err}")

        fname = path.split("/")[-1]
        df = read_excel_robust(file_bytes, fname)
        sigo_data = parse_sigo(df, "", "")

    try:
        result = difundir_sigo_resumen_telegram(
            dist_id=body.dist_id,
            modo=body.modo,
            id_vendedor=body.id_vendedor,
            mensaje_template=body.mensaje_template,
            sigo_data=sigo_data,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[difusion] sigo-telegram dist={body.dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/difusion/vendedores/{dist_id}", tags=["Difusión"])
def difusion_list_vendedores(dist_id: int, sucursal: Optional[str] = None, user_payload=Depends(verify_auth)):
    """Lista vendedores del distribuidor con binding Telegram para el selector UI."""
    check_dist_permission(user_payload, dist_id)

    try:
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        t_suc  = tenant_table_name("sucursales_v2", dist_id)

        vend_rows = _fetch_all_rows(t_vend, "id_vendedor, nombre_erp, id_sucursal", dist_id, order_col="nombre_erp")
        suc_rows = _fetch_all_rows(t_suc, "id_sucursal, nombre_erp", dist_id)
        suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in suc_rows}

        # Filtrar vendedores inactivos
        active_ids = load_active_vendedor_ids(dist_id)
        n_all = len(vend_rows)
        vend_rows = [v for v in vend_rows if v.get("id_vendedor") in active_ids]
        logger.info(f"[difusion] list_vendedores dist={dist_id}: {len(vend_rows)} active vendors (excluded {n_all - len(vend_rows)} inactive)")

        # Filtrar por sucursal si se pide
        if sucursal:
            target = _norm_text(sucursal)
            suc_ids = {
                s["id_sucursal"]
                for s in suc_rows
                if _norm_text(s.get("nombre_erp")) == target
            }
            vend_rows = [v for v in vend_rows if v.get("id_sucursal") in suc_ids]

        binding_rows = (
            sb.table("vendedores_telegram_binding")
            .select("id_vendedor_v2, telegram_group_id, telegram_user_id")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data or []
        )
        binding_map = {b.get("id_vendedor_v2"): b for b in binding_rows if b.get("id_vendedor_v2") is not None}

        from services.objetivos_notification_service import resolve_integrante_for_objetivos
        result = []
        for v in vend_rows:
            vid = v["id_vendedor"]
            b = binding_map.get(vid) or {}
            has_binding = (
                (b.get("telegram_group_id") is not None and str(b.get("telegram_group_id")).strip() not in ("", "0", "None"))
                or (b.get("telegram_user_id") is not None and str(b.get("telegram_user_id")).strip() not in ("", "0", "None"))
            )
            tiene_telegram = has_binding
            if not tiene_telegram:
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
