"""
Helpers para /stats del bot: fetch vendor-scope alineado a ranking (ERP, no integrante).
"""
from __future__ import annotations

from supabase import Client

from core.helpers import (
    _norm_name,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
    is_vendedor_excluido_objetivos,
    load_active_vendedor_ids,
)
from core.tenant_tables import tenant_table_name


def month_key_from_timestamp(ts: str | None) -> str:
    """YYYY-MM desde timestamp_subida (calendar_day_AR)."""
    raw = (ts or "").strip()
    return raw[:7] if len(raw) >= 7 else ""


def get_vendor_erp_norm(dist_id: int, vendor_v2_id: int) -> str:
    """Nombre ERP normalizado del vendedor v2."""
    try:
        vid = int(vendor_v2_id)
    except (TypeError, ValueError):
        return ""
    try:
        from db import sb

        t_vend = tenant_table_name("vendedores_v2", dist_id)
        res = (
            sb.table(t_vend)
            .select("nombre_erp")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor", vid)
            .limit(1)
            .execute()
        )
        if res.data:
            return _norm_name(res.data[0].get("nombre_erp"))
    except Exception:
        pass
    return ""


def filter_exhibiciones_for_vendor_erp(
    rows: list[dict],
    iid_to_erp: dict[int, str],
    vendor_erp_norm: str,
    qa_ids: set[int],
    dist_id: int,
) -> list[dict]:
    """Filtra exhibiciones del distribuidor a un vendedor ERP (match normalizado)."""
    if not vendor_erp_norm:
        return []
    out: list[dict] = []
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
        vendedor = iid_to_erp.get(iid, "")
        if _norm_name(vendedor) != vendor_erp_norm:
            continue
        if is_exhibicion_qa_display_for_dist(dist_id, vendedor):
            continue
        out.append(e)
    return out


def partition_exhibiciones_by_month(
    rows: list[dict],
    curr_month_key: str,
    prev_month_key: str,
) -> tuple[list[dict], list[dict]]:
    """Parte filas en mes actual / anterior por YYYY-MM de timestamp_subida."""
    actual: list[dict] = []
    prev: list[dict] = []
    for e in rows:
        mk = month_key_from_timestamp(e.get("timestamp_subida"))
        if mk == curr_month_key:
            actual.append(e)
        elif mk == prev_month_key:
            prev.append(e)
    return actual, prev


def complete_ranking_with_active_vendors(
    sb: Client,
    dist_id: int,
    ranking: list[dict],
) -> list[dict]:
    """
    Agrega vendedores activos sin exhibiciones MTD al final del ranking
    para que /stats pueda mostrar posición aunque tengan 0 puntos.
    """
    active_ids = load_active_vendedor_ids(dist_id)
    if not active_ids:
        return ranking

    t_vend = tenant_table_name("vendedores_v2", dist_id)
    try:
        vend_res = (
            sb.table(t_vend)
            .select("id_vendedor, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
    except Exception:
        return ranking

    ranked_norms = {_norm_name(r.get("vendedor")) for r in ranking}
    extras: list[dict] = []
    for v in vend_res.data or []:
        vid = v.get("id_vendedor")
        if vid not in active_ids:
            continue
        name = (v.get("nombre_erp") or "").strip()
        if not name or is_vendedor_excluido_objetivos(name):
            continue
        if is_exhibicion_qa_display_for_dist(dist_id, name):
            continue
        norm = _norm_name(name)
        if not norm or norm in ranked_norms:
            continue
        ranked_norms.add(norm)
        extras.append({
            "vendedor": name,
            "puntos": 0,
            "aprobadas": 0,
            "destacadas": 0,
            "rechazadas": 0,
            "delta": 0,
        })

    if not extras:
        return ranking

    combined = ranking + extras
    for i, row in enumerate(combined):
        row["pos_now"] = i + 1
    return combined
