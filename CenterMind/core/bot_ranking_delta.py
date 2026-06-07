"""
Ranking con flechas de posición en tiempo real.
Compara ranking "hasta ahora" vs ranking "hasta 00:00 AR de hoy" para calcular delta.
Usa aggregate_ranking_by_vendor de exhibicion_aggregate (OBLIGATORIO).

NOTA: aggregate_ranking_by_vendor(rows, iid_to_erp) trabaja sobre filas pre-cargadas.
Este módulo se encarga de obtener las filas de exhibiciones directamente desde Supabase.
"""
from __future__ import annotations
from datetime import datetime
from zoneinfo import ZoneInfo
from supabase import Client

from core.exhibicion_aggregate import (
    EXHIBICION_ROW_COLS,
    aggregate_ranking_by_vendor,
)
from core.helpers import build_integrante_to_erp_name, build_qa_exhibicion_integrante_ids

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

_PAGE = 1000


def _mes_inicio_iso(mes_ref: str | None = None) -> str:
    """Retorna 'YYYY-MM-01T00:00:00' para el mes dado o el mes actual AR."""
    if mes_ref:  # formato 'YYYY-MM'
        y, m = mes_ref.split("-")
        return f"{y}-{m}-01T00:00:00"
    hoy = datetime.now(AR_TZ).date()
    return f"{hoy.year}-{hoy.month:02d}-01T00:00:00"


def _hoy_inicio_iso() -> str:
    """Retorna inicio del día AR actual como ISO."""
    hoy = datetime.now(AR_TZ).date()
    return f"{hoy.isoformat()}T00:00:00"


def _fetch_exhibiciones_rango(
    sb: Client,
    dist_id: int,
    since_iso: str,
    end_iso: str | None = None,
) -> list[dict]:
    """Fetch paginado de exhibiciones entre since_iso y end_iso (exclusivo)."""
    rows: list[dict] = []
    offset = 0
    while True:
        q = (
            sb.table("exhibiciones")
            .select(EXHIBICION_ROW_COLS)
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", since_iso)
            .order("timestamp_subida")
            .range(offset, offset + _PAGE - 1)
        )
        if end_iso:
            q = q.lt("timestamp_subida", end_iso)
        batch = q.execute().data or []
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        offset += _PAGE
    return rows


def ranking_with_deltas(
    sb: Client,
    dist_id: int,
    periodo: str | None = None,
) -> list[dict]:
    """
    Retorna lista de vendedores con ranking actual + flecha de posición.
    periodo: 'YYYY-MM' (default: mes actual AR)

    Cada item: {
      vendedor, puntos, aprobadas, destacadas, rechazadas,
      pos_now, delta: 1=subió, -1=bajó, 0=igual/nuevo
    }
    """
    mes_inicio = _mes_inicio_iso(periodo)
    hoy_inicio = _hoy_inicio_iso()

    # IDs de integrantes de QA a excluir
    qa_ids = build_qa_exhibicion_integrante_ids(dist_id)
    iid_to_erp = build_integrante_to_erp_name(dist_id)

    def _filter_and_rank(rows: list[dict]) -> list[dict]:
        filtered = []
        for e in rows:
            iid_raw = e.get("id_integrante")
            if iid_raw is None:
                continue
            try:
                iid = int(iid_raw)
            except (TypeError, ValueError):
                continue
            if iid in qa_ids:
                continue
            filtered.append(e)
        stats = aggregate_ranking_by_vendor(filtered, iid_to_erp)
        ranking = []
        for vendedor, s in stats.items():
            ranking.append({
                "vendedor": vendedor,
                "puntos": s["puntos"],
                "aprobadas": s.get("aprobadas", 0),
                "destacadas": s.get("destacadas", 0),
                "rechazadas": s.get("rechazadas", 0),
            })
        ranking.sort(key=lambda x: (x["puntos"], x.get("aprobadas", 0)), reverse=True)
        return ranking

    # Ranking "hasta ahora" (incluye exhibiciones de hoy)
    rows_now = _fetch_exhibiciones_rango(sb, dist_id, mes_inicio, end_iso=None)
    ranking_now = _filter_and_rank(rows_now)

    # Ranking "hasta ayer EOD" (corte 00:00 AR de hoy)
    rows_prev = _fetch_exhibiciones_rango(sb, dist_id, mes_inicio, end_iso=hoy_inicio)
    ranking_prev = _filter_and_rank(rows_prev)

    # Mapa posición anterior por vendedor
    pos_prev: dict[str, int] = {r["vendedor"]: i + 1 for i, r in enumerate(ranking_prev)}

    result = []
    for i, r in enumerate(ranking_now):
        pos_now = i + 1
        vendedor = r["vendedor"]
        prev = pos_prev.get(vendedor)
        if prev is None:
            delta = 0  # no estaba en el ranking de ayer
        else:
            diff = prev - pos_now  # positivo = subió
            delta = 1 if diff > 0 else (-1 if diff < 0 else 0)
        result.append({
            **r,
            "pos_now": pos_now,
            "delta": delta,
        })
    return result
