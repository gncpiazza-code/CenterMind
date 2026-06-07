"""
Servicio de estadísticas de exhibiciones para la app móvil (SHELFYAPP / Flutter).

Usa ÚNICAMENTE aggregate_exhibicion_counts_vendor_scope y aggregate_ranking_by_vendor
de core/exhibicion_aggregate.py — nunca COUNT(*) de filas crudas.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from calendar import monthrange

from supabase import Client

from core.helpers import tenant_table_name
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    aggregate_ranking_by_vendor,
    EXHIBICION_ROW_COLS,
)

logger = logging.getLogger("ShelfyAPI")

AR_TZ = timezone(timedelta(hours=-3))


def _mes_bounds_ar(year: int, month: int) -> tuple[str, str]:
    """
    Retorna (inicio_iso, fin_iso) para el mes dado en zona AR.
    inicio = primer día 00:00:00-03:00
    fin    = último día 23:59:59-03:00
    """
    last_day = monthrange(year, month)[1]
    ar_offset = "-03:00"
    inicio = f"{year:04d}-{month:02d}-01T00:00:00{ar_offset}"
    fin = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59{ar_offset}"
    return inicio, fin


def _fetch_exhibiciones_for_vendor(
    sb: Client,
    dist_id: int,
    integrante_ids: list[int],
    periodo_inicio: str,
    periodo_fin: str,
) -> list[dict]:
    """
    Obtiene exhibiciones del período para los integrantes dados, con paginación.
    Retorna lista de filas crudas (para procesar con aggregate_*).
    """
    if not integrante_ids:
        return []

    exhibiciones_table = tenant_table_name("exhibiciones", dist_id)
    rows: list[dict] = []
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table(exhibiciones_table)
            .select(EXHIBICION_ROW_COLS)
            .eq("id_distribuidor", dist_id)
            .in_("id_integrante", integrante_ids)
            .gte("timestamp_subida", periodo_inicio)
            .lte("timestamp_subida", periodo_fin)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def _build_iid_to_erp_map(sb: Client, dist_id: int) -> dict[int, str]:
    """
    Construye mapa {id_integrante -> nombre_vendedor_erp} para el distribuidor.
    Paginado a 1000 filas.
    """
    PAGE = 1000
    offset = 0
    result: dict[int, str] = {}
    while True:
        batch = (
            sb.table("integrantes_grupo")
            .select("id,id_vendedor_v2,nombre_integrante")
            .eq("id_distribuidor", dist_id)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        for row in batch:
            iid = row.get("id")
            if iid is not None:
                # Usar nombre_integrante como clave ERP
                result[int(iid)] = str(row.get("nombre_integrante") or f"vendor_{row.get('id_vendedor_v2')}").strip()
        if len(batch) < PAGE:
            break
        offset += PAGE
    return result


def _fetch_all_exhibiciones_for_dist(
    sb: Client,
    dist_id: int,
    periodo_inicio: str,
    periodo_fin: str,
) -> list[dict]:
    """
    Obtiene todas las exhibiciones del distribuidor para el período (para ranking).
    Paginado a 1000 filas.
    """
    exhibiciones_table = tenant_table_name("exhibiciones", dist_id)
    rows: list[dict] = []
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table(exhibiciones_table)
            .select(EXHIBICION_ROW_COLS)
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", periodo_inicio)
            .lte("timestamp_subida", periodo_fin)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def get_stats_vendedor_app(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
) -> dict:
    """
    Estadísticas del vendedor para la app móvil.

    Retorna:
    {
        "mes_actual": {"exhibiciones_logicas": N, "periodo": "2026-06", ...stats},
        "mes_anterior": {"exhibiciones_logicas": N, "periodo": "2026-05", ...stats},
        "ranking": {"posicion": 3, "total_vendedores": 12, "puntos": N}
    }
    """
    now_ar = datetime.now(AR_TZ)
    year_actual = now_ar.year
    mes_actual = now_ar.month

    # Calcular mes anterior
    if mes_actual == 1:
        year_anterior = year_actual - 1
        mes_anterior = 12
    else:
        year_anterior = year_actual
        mes_anterior = mes_actual - 1

    # Bounds de cada período
    inicio_actual, fin_actual = _mes_bounds_ar(year_actual, mes_actual)
    # Para mes actual: fin = ahora (no fin de mes)
    fin_actual = now_ar.isoformat()

    inicio_anterior, fin_anterior = _mes_bounds_ar(year_anterior, mes_anterior)

    # Obtener integrantes del vendedor
    integrantes_res = (
        sb.table("integrantes_grupo")
        .select("id,nombre_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
        .execute()
    )
    integrante_ids = [r["id"] for r in (integrantes_res.data or [])]
    # Nombre del vendedor para el ranking (primer integrante)
    vendor_nombre: str | None = None
    if integrantes_res.data:
        vendor_nombre = str(integrantes_res.data[0].get("nombre_integrante") or f"vendor_{id_vendedor_v2}").strip()

    # ── Stats mes actual ───────────────────────────────────────────────────────
    rows_actual = _fetch_exhibiciones_for_vendor(
        sb, dist_id, integrante_ids, inicio_actual, fin_actual
    )
    counts_actual = aggregate_exhibicion_counts_vendor_scope(rows_actual)

    # ── Stats mes anterior ─────────────────────────────────────────────────────
    rows_anterior = _fetch_exhibiciones_for_vendor(
        sb, dist_id, integrante_ids, inicio_anterior, fin_anterior
    )
    counts_anterior = aggregate_exhibicion_counts_vendor_scope(rows_anterior)

    # ── Ranking del mes actual ─────────────────────────────────────────────────
    ranking_out = {"posicion": None, "total_vendedores": 0, "puntos": counts_actual.get("puntos", 0)}
    try:
        all_rows = _fetch_all_exhibiciones_for_dist(sb, dist_id, inicio_actual, fin_actual)
        iid_to_erp = _build_iid_to_erp_map(sb, dist_id)
        ranking = aggregate_ranking_by_vendor(all_rows, iid_to_erp)

        # Ordenar por puntos desc
        ranking_sorted = sorted(ranking.items(), key=lambda x: x[1].get("puntos", 0), reverse=True)
        total_vendedores = len(ranking_sorted)
        ranking_out["total_vendedores"] = total_vendedores

        # Encontrar posición del vendedor actual
        if vendor_nombre and vendor_nombre in ranking:
            for pos, (vname, vstats) in enumerate(ranking_sorted, start=1):
                if vname == vendor_nombre:
                    ranking_out["posicion"] = pos
                    ranking_out["puntos"] = vstats.get("puntos", 0)
                    break
        elif vendor_nombre is None and integrante_ids:
            # Buscar por id_integrante si no hay nombre
            iid_names = {iid_to_erp.get(iid) for iid in integrante_ids if iid_to_erp.get(iid)}
            for pos, (vname, vstats) in enumerate(ranking_sorted, start=1):
                if vname in iid_names:
                    ranking_out["posicion"] = pos
                    ranking_out["puntos"] = vstats.get("puntos", 0)
                    break
    except Exception as e:
        logger.warning(f"get_stats_vendedor_app ranking dist={dist_id} vendor={id_vendedor_v2}: {e}")

    return {
        "mes_actual": {
            "periodo": f"{year_actual:04d}-{mes_actual:02d}",
            "exhibiciones_logicas": counts_actual.get("total_logicas", 0),
            "aprobadas": counts_actual.get("aprobadas", 0),
            "destacadas": counts_actual.get("destacadas", 0),
            "rechazadas": counts_actual.get("rechazadas", 0),
            "pendientes": counts_actual.get("pendientes", 0),
            "puntos": counts_actual.get("puntos", 0),
        },
        "mes_anterior": {
            "periodo": f"{year_anterior:04d}-{mes_anterior:02d}",
            "exhibiciones_logicas": counts_anterior.get("total_logicas", 0),
            "aprobadas": counts_anterior.get("aprobadas", 0),
            "destacadas": counts_anterior.get("destacadas", 0),
            "rechazadas": counts_anterior.get("rechazadas", 0),
            "pendientes": counts_anterior.get("pendientes", 0),
            "puntos": counts_anterior.get("puntos", 0),
        },
        "ranking": ranking_out,
    }
