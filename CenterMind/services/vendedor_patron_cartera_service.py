# -*- coding: utf-8 -*-
"""
Cartera y rutas inferidas por integrante (patrón multi-cuenta).

Asigna PDVs a Monchi / Jorge / etc. según dónde exhiben y venden (ventana móvil).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from supabase import Client

from core.exhibicion_aggregate import EXHIBICION_ROW_COLS
from core.helpers import tenant_table_name

logger = logging.getLogger("ShelfyAPI")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
PAGE = 1000
LOOKBACK_DAYS_DEFAULT = 120


def _default_fecha_bounds(lookback_days: int = LOOKBACK_DAYS_DEFAULT) -> tuple[str, str]:
    hoy = datetime.now(AR_TZ).date()
    desde = hoy - timedelta(days=max(1, lookback_days))
    return desde.isoformat(), hoy.isoformat()


def _paginate_exhibiciones(
    sb: Client,
    dist_id: int,
    integrante_ids: list[int],
    fecha_desde: str,
    fecha_hasta: str,
) -> list[dict]:
    if not integrante_ids:
        return []
    t_ex = tenant_table_name("exhibiciones", dist_id)
    fin_iso = f"{fecha_hasta}T23:59:59-03:00"
    inicio_iso = f"{fecha_desde}T00:00:00-03:00"
    rows: list[dict] = []
    for i in range(0, len(integrante_ids), 50):
        batch = integrante_ids[i : i + 50]
        offset = 0
        while True:
            chunk = (
                sb.table(t_ex)
                .select(EXHIBICION_ROW_COLS)
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", batch)
                .gte("timestamp_subida", inicio_iso)
                .lte("timestamp_subida", fin_iso)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            rows.extend(chunk)
            if len(chunk) < PAGE:
                break
            offset += PAGE
    return rows


def _pdv_keys_from_exhibiciones(ex_rows: list[dict]) -> tuple[set[int], set[str]]:
    pdv_ids: set[int] = set()
    erp_shadow: set[str] = set()
    for r in ex_rows:
        cid = r.get("id_cliente_pdv")
        if cid is not None:
            try:
                pdv_ids.add(int(cid))
            except (TypeError, ValueError):
                pass
        sombra = str(r.get("cliente_sombra_codigo") or "").strip()
        if sombra:
            erp_shadow.add(sombra)
    return pdv_ids, erp_shadow


def _load_pdv_maps(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    pdv_ids: set[int],
    erp_extra: set[str],
) -> tuple[dict[int, str], dict[str, int], set[int]]:
    """id_pdv→erp, erp→id_ruta, ruta_ids detectadas."""
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_leader = (
        sb.table(t_rutas)
        .select("id_ruta")
        .eq("id_vendedor", leader_vid)
        .execute()
        .data
        or []
    )
    ruta_ids_leader = {int(r["id_ruta"]) for r in rutas_leader if r.get("id_ruta") is not None}

    pdv_to_erp: dict[int, str] = {}
    erp_to_ruta: dict[str, int] = {}
    rutas_detectadas: set[int] = set()

    ids_list = list(pdv_ids)
    for i in range(0, max(len(ids_list), 1), 200):
        batch_ids = ids_list[i : i + 200] if ids_list else []
        if not batch_ids and not erp_extra:
            break
        q = sb.table(t_pdv).select("id_cliente_pdv,id_cliente_erp,id_ruta").eq(
            "id_distribuidor", dist_id
        )
        if batch_ids:
            q = q.in_("id_cliente_pdv", batch_ids)
        elif erp_extra:
            q = q.in_("id_cliente_erp", list(erp_extra)[:200])
        if ruta_ids_leader:
            q = q.in_("id_ruta", list(ruta_ids_leader))
        for row in q.execute().data or []:
            try:
                pid = int(row["id_cliente_pdv"])
            except (TypeError, ValueError, KeyError):
                continue
            erp = str(row.get("id_cliente_erp") or "").strip()
            rid = row.get("id_ruta")
            if erp:
                pdv_to_erp[pid] = erp
            if rid is not None and erp:
                try:
                    r_int = int(rid)
                    erp_to_ruta[erp] = r_int
                    if r_int in ruta_ids_leader:
                        rutas_detectadas.add(r_int)
                except (TypeError, ValueError):
                    pass

    if erp_extra:
        erp_pending = erp_extra - set(erp_to_ruta.keys())
        for i in range(0, len(erp_pending), 200):
            chunk = list(erp_pending)[i : i + 200]
            if not chunk:
                break
            q = (
                sb.table(t_pdv)
                .select("id_cliente_erp,id_ruta")
                .eq("id_distribuidor", dist_id)
                .in_("id_cliente_erp", chunk)
            )
            if ruta_ids_leader:
                q = q.in_("id_ruta", list(ruta_ids_leader))
            for row in q.execute().data or []:
                erp = str(row.get("id_cliente_erp") or "").strip()
                rid = row.get("id_ruta")
                if erp and rid is not None:
                    try:
                        r_int = int(rid)
                        erp_to_ruta[erp] = r_int
                        if r_int in ruta_ids_leader:
                            rutas_detectadas.add(r_int)
                    except (TypeError, ValueError):
                        pass

    return pdv_to_erp, erp_to_ruta, rutas_detectadas


def _assign_ventas_pdvs_to_integrante(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    target_integrante_ids: list[int],
    all_team_integrante_ids: list[int],
    fecha_desde: str,
    fecha_hasta: str,
    erp_from_exhibiciones: set[str],
) -> set[str]:
    """PDVs con venta asignados al integrante con más exhibiciones en ese PDV."""
    from services.estadisticas_service import _fetch_ventas_rows_vendedor, _vendor_context

    if not target_integrante_ids:
        return set()

    vctx = _vendor_context(dist_id, str(leader_vid))
    try:
        ventas = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)
    except Exception as e:
        logger.warning(f"assign_ventas_pdvs dist={dist_id} leader={leader_vid}: {e}")
        return set()

    venta_erps = {
        str(r.get("id_cliente_erp") or r.get("cod_cliente") or "").strip()
        for r in ventas
        if str(r.get("id_cliente_erp") or r.get("cod_cliente") or "").strip()
    }
    venta_erps -= erp_from_exhibiciones
    if not venta_erps:
        return set()

    team_ex = _paginate_exhibiciones(
        sb, dist_id, all_team_integrante_ids, fecha_desde, fecha_hasta
    )
    ex_count: dict[tuple[int, str], int] = defaultdict(int)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    pdv_to_erp_cache: dict[int, str] = {}

    for ex in team_ex:
        try:
            iid = int(ex.get("id_integrante"))
        except (TypeError, ValueError):
            continue
        erp = str(ex.get("cliente_sombra_codigo") or "").strip()
        cid = ex.get("id_cliente_pdv")
        if cid is not None:
            try:
                pid = int(cid)
                erp = pdv_to_erp_cache.get(pid) or erp
                if not erp:
                    res = (
                        sb.table(t_pdv)
                        .select("id_cliente_erp")
                        .eq("id_distribuidor", dist_id)
                        .eq("id_cliente_pdv", pid)
                        .limit(1)
                        .execute()
                    )
                    if res.data:
                        erp = str(res.data[0].get("id_cliente_erp") or "").strip()
                        pdv_to_erp_cache[pid] = erp
            except (TypeError, ValueError):
                pass
        if erp:
            ex_count[(iid, erp)] += 1

    target_set = {int(x) for x in target_integrante_ids}
    won: set[str] = set()
    for erp in venta_erps:
        scores = [(iid, ex_count.get((iid, erp), 0)) for iid in all_team_integrante_ids]
        scores = [(i, c) for i, c in scores if c > 0]
        if not scores:
            continue
        best_iid = max(scores, key=lambda x: x[1])[0]
        if best_iid in target_set:
            won.add(erp)
    return won


def infer_patron_cartera_scope(
    sb: Client,
    dist_id: int,
    leader_vid: int,
    integrante_ids: list[int],
    *,
    all_team_integrante_ids: list[int] | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    lookback_days: int = LOOKBACK_DAYS_DEFAULT,
) -> dict:
    """Inferencia de cartera operativa de un integrante bajo patrón ERP."""
    if not integrante_ids:
        return {
            "erp_ids": set(),
            "ruta_ids": set(),
            "asignacion_cartera": {
                "pdv_count": 0,
                "ruta_count": 0,
                "desde_exhibiciones": 0,
                "desde_ventas": 0,
                "lookback_dias": lookback_days,
                "actualizado_at": datetime.now(AR_TZ).isoformat(),
            },
        }

    if not fecha_desde or not fecha_hasta:
        fecha_desde, fecha_hasta = _default_fecha_bounds(lookback_days)

    team_ids = all_team_integrante_ids or integrante_ids
    ex_rows = _paginate_exhibiciones(sb, dist_id, integrante_ids, fecha_desde, fecha_hasta)
    pdv_ids, erp_shadow = _pdv_keys_from_exhibiciones(ex_rows)
    pdv_to_erp, erp_to_ruta, rutas_detectadas = _load_pdv_maps(
        sb, dist_id, leader_vid, pdv_ids, erp_shadow
    )

    erp_from_ex = set(pdv_to_erp.values()) | erp_shadow
    erp_from_ventas = _assign_ventas_pdvs_to_integrante(
        sb,
        dist_id,
        leader_vid,
        integrante_ids,
        team_ids,
        fecha_desde,
        fecha_hasta,
        erp_from_ex,
    )

    erp_ids = erp_from_ex | erp_from_ventas
    for erp in erp_from_ventas:
        rid = erp_to_ruta.get(erp)
        if rid is not None:
            rutas_detectadas.add(rid)

    return {
        "erp_ids": erp_ids,
        "ruta_ids": rutas_detectadas,
        "asignacion_cartera": {
            "pdv_count": len(erp_ids),
            "ruta_count": len(rutas_detectadas),
            "desde_exhibiciones": len(erp_from_ex),
            "desde_ventas": len(erp_from_ventas - erp_from_ex),
            "lookback_dias": lookback_days,
            "periodo_desde": fecha_desde,
            "periodo_hasta": fecha_hasta,
            "actualizado_at": datetime.now(AR_TZ).isoformat(),
        },
    }


def list_team_integrante_ids(sb: Client, dist_id: int, leader_vid: int) -> list[int]:
    res = (
        sb.table("integrantes_grupo")
        .select("id_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", leader_vid)
        .execute()
    )
    out: list[int] = []
    for r in res.data or []:
        try:
            out.append(int(r["id_integrante"]))
        except (TypeError, ValueError):
            continue
    return out
