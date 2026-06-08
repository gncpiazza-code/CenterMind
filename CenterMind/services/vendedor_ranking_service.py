"""
Servicio de ranking completo del mes para la app móvil (SHELFYAPP / Flutter).
Usa aggregate_ranking_by_vendor de core/exhibicion_aggregate.py — nunca COUNT(*).
"""
from __future__ import annotations

import logging

from supabase import Client

from core.exhibicion_aggregate import aggregate_ranking_by_vendor, EXHIBICION_ROW_COLS
from core.helpers import tenant_table_name
from services.vendedor_stats_service import (
    _mes_bounds_ar,
    _build_iid_to_erp_map,
    _fetch_all_exhibiciones_for_dist,
    AR_TZ,
)
from datetime import datetime

logger = logging.getLogger("ShelfyAPI")

# Cap de resultados para no saturar la app con distribuidores grandes
_RANKING_CAP = 50


def get_ranking_vendedor_app(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    year: int,
    month: int,
) -> dict:
    """
    Tabla de ranking completa para el mes indicado.

    Retorna:
    {
        "periodo": "2026-06",
        "ranking": [
            {"posicion": 1, "nombre": "...", "puntos": 42, "es_yo": false},
            ...
        ],
        "mi_posicion": 3,
        "total_vendedores": 12
    }
    """
    now_ar = datetime.now(AR_TZ)
    is_current_month = (year == now_ar.year and month == now_ar.month)

    inicio, fin = _mes_bounds_ar(year, month)
    if is_current_month:
        fin = now_ar.isoformat()

    # Obtener nombre del vendedor para marcar es_yo
    integrantes_res = (
        sb.table("integrantes_grupo")
        .select("nombre_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
        .limit(1)
        .execute()
    )
    vendor_nombre: str | None = None
    if integrantes_res.data:
        vendor_nombre = str(integrantes_res.data[0].get("nombre_integrante") or "").strip() or None

    all_rows = _fetch_all_exhibiciones_for_dist(sb, dist_id, inicio, fin)
    iid_to_erp = _build_iid_to_erp_map(sb, dist_id)
    ranking = aggregate_ranking_by_vendor(all_rows, iid_to_erp)

    ranking_sorted = sorted(ranking.items(), key=lambda x: x[1].get("puntos", 0), reverse=True)
    total_vendedores = len(ranking_sorted)

    mi_posicion: int | None = None
    rows_out = []
    for pos, (vname, vstats) in enumerate(ranking_sorted[:_RANKING_CAP], start=1):
        es_yo = vname == vendor_nombre if vendor_nombre else False
        if es_yo:
            mi_posicion = pos
        rows_out.append({
            "posicion": pos,
            "nombre": vname,
            "puntos": vstats.get("puntos", 0),
            "es_yo": es_yo,
        })

    # Si el vendedor está fuera del top 50, buscar su posición real
    if mi_posicion is None and vendor_nombre:
        for pos, (vname, _) in enumerate(ranking_sorted, start=1):
            if vname == vendor_nombre:
                mi_posicion = pos
                break

    return {
        "periodo": f"{year:04d}-{month:02d}",
        "ranking": rows_out,
        "mi_posicion": mi_posicion,
        "total_vendedores": total_vendedores,
    }
