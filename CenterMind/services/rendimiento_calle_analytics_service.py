# -*- coding: utf-8 -*-
"""
Persistencia del JSON `analizar_rendimiento_calle` en Supabase.

UPSERT por (id_distribuidor, fecha_operativa, sucursal_nombre): varias corridas el mismo día
sobrescriben la misma fila — ver migración *_rendimiento_calle_upsert_daily.sql.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from db import sb
from services.ventas_ingestion_service import TENANT_DIST_MAP

logger = logging.getLogger("RendCalleAnalytics")


def _flt(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def persistir_analisis_rendimiento_calle(tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Upsert una fila canónica por día + sucursal; corrida siguiente el mismo día reemplaza KPIs/json.
    `id_distribuidor` en `payload["meta"]["id_distribuidor"]` cuando el tenant tiene split (real/franquiciados).
    """
    meta = payload.get("meta") or {}
    dist_raw = meta.get("id_distribuidor")
    dist_id: Optional[int]
    try:
        dist_id = int(dist_raw) if dist_raw is not None else TENANT_DIST_MAP.get(tenant_id)
    except (TypeError, ValueError):
        dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise ValueError(
            "id_distribuidor no resuelto: definir tenant_id válido "
            'o incluir payload["meta"]["id_distribuidor"]'
        )

    fecha_str = meta.get("fecha_operativa")
    fecha_op: Optional[datetime.date] = None
    if isinstance(fecha_str, str):
        try:
            fecha_op = datetime.strptime(fecha_str[:10], "%Y-%m-%d").date()
        except ValueError:
            fecha_op = None
    if fecha_op is None:
        raise ValueError('payload.meta["fecha_operativa"] obligatoria (YYYY-MM-DD)')

    glo = payload.get("global") or {}
    tg = glo.get("timing_metricas_aprox") or {}
    fue = payload.get("fuera_de_ruta") or {}

    row = {
        "id_distribuidor": dist_id,
        "tenant_id": tenant_id,
        "fecha_operativa": fecha_op.isoformat(),
        "sucursal_nombre": (meta.get("sucursal_nombre") or "").strip(),
        "pdvs_en_grilla": _int(glo.get("pdvs_en_grilla")),
        "visitados_si": _int(glo.get("visitados_si")),
        "pct_visitados_sobre_grilla": _flt(glo.get("pct_visitados_sobre_pdvs_grilla")),
        "con_venta": _int(glo.get("con_venta")),
        "sin_venta_con_motivo": _int(glo.get("sin_venta_con_motivo_registrado")),
        "clientes_fuera_ruta_distintos": _int((fue.get("clientes_distintos") or {}).get("con_registro_fuera")),
        "time_to_sell_mediana_min": _flt(tg.get("time_to_sell_min_mediana")),
        "tiempo_en_pdv_estim_mediana_min": _flt(tg.get("tiempo_en_pdv_hasta_desenlace_mediana_min")),
        "share_contacto_matutino_sobre_visitados": _flt(
            (glo.get("recorte_matutino_hasta_13") or {}).get("share_visita_contacto_hasta_13_sobre_visitados")
        ),
        "archivo_clientes": meta.get("archivos", {}).get("clientes"),
        "archivo_dispositivos": meta.get("archivos", {}).get("dispositivos"),
        "archivo_rutas": meta.get("archivos", {}).get("rutas"),
        "archivo_fuera_ruta": meta.get("archivos", {}).get("ventas_fuera_ruta"),
        "payload": payload,
    }

    res = (
        sb.table("rendimiento_calle_analytics_runs")
        .upsert(row, on_conflict="id_distribuidor,fecha_operativa,sucursal_nombre")
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        raise RuntimeError(
            "No se pudo upsert rendimiento_calle_analytics_runs (respuesta vacía)."
            " ¿Migración uniq_rcar_dist_fecha_suc aplicada?"
        )
    rid = rows[0].get("id")
    logger.info("[RendCalleAnalytics] id=%s dist=%s fecha=%s sucursal=\"%s\" (upsert)", rid, dist_id, fecha_op, row["sucursal_nombre"])
    return {"run_id": rid, "id_distribuidor": dist_id, "fecha_operativa": fecha_str}
