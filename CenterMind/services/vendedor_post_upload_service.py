"""Confirmación rica post-subida de exhibición para la app móvil."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from supabase import Client

from core.helpers import tenant_table_name
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    EXHIBICION_ROW_COLS,
)

logger = logging.getLogger("ShelfyAPI")
AR_TZ = timezone(timedelta(hours=-3))


def build_post_upload_summary(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    nro_cliente: str,
) -> dict:
    """
    Resumen rico para la pantalla de confirmación post-subida.
    Combina: historial reciente del PDV + stats MTD del vendedor + badge de objetivo activo.
    """
    # Integrantes del vendedor
    integrantes_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
        .execute()
    )
    integrante_ids = [r["id_integrante"] for r in (integrantes_res.data or [])]

    exh_table = tenant_table_name("exhibiciones", dist_id)

    # ── Historial reciente del PDV (últimas 10 del vendedor) ────────────────
    historial_pdv: list[dict] = []
    if integrante_ids:
        hist_rows = (
            sb.table(exh_table)
            .select("estado,timestamp_subida,id_exhibicion")
            .eq("id_distribuidor", dist_id)
            .in_("id_integrante", integrante_ids)
            .eq("id_cliente_pdv", nro_cliente)
            .order("timestamp_subida", desc=True)
            .limit(10)
            .execute().data or []
        )
        historial_pdv = [
            {
                "fecha": (r.get("timestamp_subida") or "")[:10],
                "estado": r.get("estado") or "Pendiente",
            }
            for r in hist_rows
        ]

    # ── Stats MTD del vendedor ───────────────────────────────────────────────
    stats_mes: dict = {"exhibiciones_logicas": 0, "puntos": 0}
    if integrante_ids:
        now_ar = datetime.now(AR_TZ)
        inicio = f"{now_ar.year:04d}-{now_ar.month:02d}-01T00:00:00-03:00"
        fin = now_ar.isoformat()
        PAGE = 1000
        offset = 0
        rows: list[dict] = []
        while True:
            batch = (
                sb.table(exh_table)
                .select(EXHIBICION_ROW_COLS)
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", integrante_ids)
                .gte("timestamp_subida", inicio)
                .lte("timestamp_subida", fin)
                .range(offset, offset + PAGE - 1)
                .execute().data or []
            )
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
        counts = aggregate_exhibicion_counts_vendor_scope(rows)
        stats_mes = {
            "exhibiciones_logicas": counts.get("total_logicas", 0),
            "puntos": counts.get("puntos", 0),
        }

    # ── Badge de objetivo activo tipo exhibicion ─────────────────────────────
    objetivo_badge: dict | None = None
    try:
        from core.objetivos_filters import hoy_ar
        hoy = hoy_ar()
        obj_res = (
            sb.table("objetivos")
            .select("id,tipo,valor_objetivo,valor_actual,cumplido")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor", id_vendedor_v2)
            .eq("tipo", "exhibicion")
            .eq("cumplido", False)
            .not_.is_("lanzado_at", "null")
            .gte("fecha_objetivo", hoy.isoformat())
            .limit(1)
            .execute()
        )
        if obj_res.data:
            o = obj_res.data[0]
            val_obj = float(o.get("valor_objetivo") or 1)
            val_act = float(o.get("valor_actual") or 0)
            objetivo_badge = {
                "tipo": "exhibicion",
                "progreso_pct": round(min((val_act / val_obj) * 100, 999), 1),
            }
    except Exception as e:
        logger.debug(f"build_post_upload_summary objetivo_badge: {e}")

    return {
        "historial_pdv": historial_pdv,
        "stats_mes": stats_mes,
        "objetivo_badge": objetivo_badge,
    }
