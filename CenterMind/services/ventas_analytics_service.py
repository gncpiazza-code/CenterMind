# -*- coding: utf-8 -*-
"""
Persistencia del análisis JSON de comprobantes CHESS (salida de
`ShelfMind-RPA/scripts/analizar_ventas_comprobantes.py`) en Supabase.

Tablas: ventas_comprobantes_analytics_runs + ventas_comprobantes_agg_* ver
supabase/migrations/20260430120000_ventas_comprobantes_analytics.sql

Uso típico: tras tener el dict `out` del análisis (o cargado desde archivo JSON),

    from services.ventas_analytics_service import persistir_analisis_comprobantes
    persistir_analisis_comprobantes("aloma", payload, fecha_desde="2026-04-28", fecha_hasta="2026-04-28")
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from db import sb
from services.ventas_ingestion_service import TENANT_DIST_MAP

logger = logging.getLogger("VentasAnalytics")


def _code_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def _flt(v: Any) -> float:
    try:
        if v is None:
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def persistir_analisis_comprobantes(
    tenant_id: str,
    payload: dict[str, Any],
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> dict[str, Any]:
    """
    Inserta un run + filas hijas desde el payload del script de análisis.

    `payload` debe incluir como mínimo:
      financiero_resumen, lineas_detallado (con por_*), validacion_fcvtas (opcional)
    y opcionalmente archivos: {"archivos": {"resumen": "...", "detallado": "..."}}
    """
    dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise ValueError(f"tenant_id desconocido: {tenant_id}")

    fin = payload.get("financiero_resumen") or {}
    des = fin.get("desglose_recaudacion") or {}
    arch = payload.get("archivos") or {}
    lr = payload.get("lineas_detallado") or {}
    val = payload.get("validacion_fcvtas") or {}

    run_row = {
        "id_distribuidor": dist_id,
        "tenant_id": tenant_id,
        "fecha_rango_desde": fecha_desde,
        "fecha_rango_hasta": fecha_hasta,
        "archivo_resumen": arch.get("resumen"),
        "archivo_detallado": arch.get("detallado"),
        "kpi_recaudacion": _flt(fin.get("recaudacion_dia_contado_mas_recibos")),
        "kpi_facturado_ctacte": _flt(fin.get("facturado_cta_cte_FCVTA")),
        "kpi_suma_recibos": _flt(des.get("suma_recibos")),
        "kpi_suma_fc_contado": _flt(des.get("suma_facturas_contado_FCVTA")),
        "filas_resumen_activas": fin.get("filas_resumen_activas"),
        "por_comprobante_tipo": fin.get("por_comprobante_tipo") or [],
        "raw_financiero": fin,
        "validacion_fcvtas": val,
    }

    res = sb.table("ventas_comprobantes_analytics_runs").insert(run_row).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        raise RuntimeError("No se pudo insertar ventas_comprobantes_analytics_runs (respuesta vacía)")
    run_id = rows[0]["id"]

    BATCH = 300

    def bulk(table: str, items: list[dict]) -> int:
        n = 0
        for i in range(0, len(items), BATCH):
            lot = items[i : i + BATCH]
            sb.table(table).insert(lot).execute()
            n += len(lot)
        return n

    vd = lr.get("por_vendedor") or []
    va = lr.get("por_articulo") or []
    vc = lr.get("por_cliente") or []
    vk = lr.get("por_canal_mkt") or []
    vz = lr.get("por_subcanal_mkt") or []

    n_v = bulk(
        "ventas_comprobantes_agg_vendedor",
        [
            {
                "run_id": run_id,
                "id_distribuidor": dist_id,
                "vendedor_codigo": _code_str(r.get("Vendedor")),
                "vendedor_desc": r.get("Descripcion Vendedor"),
                "total_dolares": _flt(r.get("total_dolares")),
                "total_bultos": _flt(r.get("total_bultos")),
            }
            for r in vd
        ],
    )
    n_a = bulk(
        "ventas_comprobantes_agg_articulo",
        [
            {
                "run_id": run_id,
                "id_distribuidor": dist_id,
                "articulo_codigo": _code_str(r.get("Codigo de Articulo")),
                "articulo_desc": r.get("Descripcion de Articulo"),
                "total_dolares": _flt(r.get("total_dolares")),
                "total_bultos": _flt(r.get("total_bultos")),
            }
            for r in va
        ],
    )
    n_c = bulk(
        "ventas_comprobantes_agg_cliente",
        [
            {
                "run_id": run_id,
                "id_distribuidor": dist_id,
                "cliente_codigo": _code_str(r.get("Cliente")),
                "cliente_razon": r.get("Razon Social"),
                "total_dolares": _flt(r.get("total_dolares")),
                "total_bultos": _flt(r.get("total_bultos")),
            }
            for r in vc
        ],
    )
    n_k = bulk(
        "ventas_comprobantes_agg_canal",
        [
            {
                "run_id": run_id,
                "id_distribuidor": dist_id,
                "canal_codigo": _code_str(r.get("Canal MKT")),
                "canal_desc": r.get("Descripcion Canal MKT"),
                "total_dolares": _flt(r.get("total_dolares")),
                "total_bultos": _flt(r.get("total_bultos")),
            }
            for r in vk
        ],
    )
    n_z = bulk(
        "ventas_comprobantes_agg_subcanal",
        [
            {
                "run_id": run_id,
                "id_distribuidor": dist_id,
                "subcanal_codigo": _code_str(r.get("Subcanal")),
                "subcanal_desc": r.get("Descripcion Subcanal MKT"),
                "total_dolares": _flt(r.get("total_dolares")),
                "total_bultos": _flt(r.get("total_bultos")),
            }
            for r in vz
        ],
    )

    logger.info(
        "[VentasAnalytics] run_id=%s dist=%s vendedor=%s art=%s cli=%s canal=%s sub=%s",
        run_id,
        dist_id,
        n_v,
        n_a,
        n_c,
        n_k,
        n_z,
    )

    return {
        "run_id": run_id,
        "id_distribuidor": dist_id,
        "filas": {"vendedor": n_v, "articulo": n_a, "cliente": n_c, "canal": n_k, "subcanal": n_z},
    }
