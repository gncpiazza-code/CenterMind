# -*- coding: utf-8 -*-
"""
core/objetivos_compradores.py
==============================
Módulo compartido para medición del tipo de objetivo COMPRADORES.

Fuente autoritativa de la definición "PDV comprador en un período":
    1) ventas_enriched_v2 del tenant (importe_final >= 0).
    2) Fallback padrón: fecha_ultima_compra dentro del rango.

Regla de dedup: un PDV distinto (id_cliente) cuenta exactamente 1,
sin importar cuántas facturas emitió en el período.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name

PAGE = 1000
_VENTAS_SELECT_COMPRADORES = (
    "id_cliente_erp,fecha_factura,importe_final,anulado,codigo_vendedor,nombre_vendedor"
)


def _norm_erp(erp_id: Any) -> str | None:
    """Normaliza id_cliente_erp: quita .0 de float y ceros a la izquierda."""
    if erp_id is None:
        return None
    s = str(erp_id).strip()
    if not s:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return (s.lstrip("0") or "0").upper()


def _periodo_bounds(desde: str, hasta: str) -> tuple[str, str]:
    """Normaliza y valida [desde, hasta] (YYYY-MM-DD). Evita rangos vacíos que cuentan todo el padrón."""
    desde_d = str(desde or "")[:10]
    hasta_d = str(hasta or "")[:10]
    if len(desde_d) < 10 or len(hasta_d) < 10:
        raise ValueError(f"periodo compradores inválido: desde={desde!r} hasta={hasta!r}")
    if desde_d > hasta_d:
        raise ValueError(f"periodo compradores invertido: {desde_d} > {hasta_d}")
    return desde_d, hasta_d


def _cid_from_venta_en_cartera(
    row: dict,
    client_by_id: dict[int, dict],
    vctx: dict,
) -> int | None:
    """
    Asigna una fila de venta al id_cliente de la cartera.
    Si varios PDVs comparten variante ERP, prioriza match exacto del ERP padrón.
    """
    from core.ultima_compra import erp_query_variants
    from services.estadisticas_service import _venta_matches_vendor

    if not _venta_matches_vendor(row, vctx):
        return None
    re = str(row.get("id_cliente_erp") or "").strip()
    if not re:
        return None
    best: tuple[int, int] | None = None
    for cid, crow in client_by_id.items():
        raw = str(crow.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        if re not in set(erp_query_variants(raw)):
            continue
        priority = 0 if raw == re else 1
        cand = (priority, int(cid))
        if best is None or cand < best:
            best = cand
    return best[1] if best else None


def _comprador_ids_desde_ventas_vendedor(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde_d: str,
    hasta_d: str,
    id_vendedor: int,
) -> set[int]:
    """
    PDVs de la cartera con al menos una venta del vendedor en [desde, hasta].
    Misma asignación Consolido que estadísticas (_venta_matches_vendor).
    """
    from core.ultima_compra import erp_query_variants, _venta_cuenta_como_compra
    from core.ventas_enriched_tenant import (
        filter_ventas_rows_for_tenant,
        ventas_enriched_base_query,
    )
    from services.estadisticas_service import _venta_matches_vendor, _vendor_context

    vctx = _vendor_context(dist_id, str(id_vendedor))
    erp_list: list[str] = []
    for cid, row in client_by_id.items():
        raw = str(row.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        for v in erp_query_variants(raw):
            if v not in erp_list:
                erp_list.append(v)

    if not erp_list:
        return set()

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
    comprador_ids: set[int] = set()

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                cid = _cid_from_venta_en_cartera(row, client_by_id, vctx)
                if cid is not None:
                    comprador_ids.add(int(cid))
            if len(batch) < PAGE:
                break
            offset += PAGE

    return comprador_ids


def _primera_compra_fecha_vendedor(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde_d: str,
    hasta_d: str,
    id_vendedor: int,
) -> dict[int, str]:
    """Por id_cliente: fecha (YYYY-MM-DD) de la primera venta del vendedor en el período."""
    from core.ultima_compra import _venta_cuenta_como_compra, erp_query_variants
    from core.ventas_enriched_tenant import (
        filter_ventas_rows_for_tenant,
        ventas_enriched_base_query,
    )
    from services.estadisticas_service import _vendor_context

    vctx = _vendor_context(dist_id, str(id_vendedor))
    erp_list: list[str] = []
    for _cid, row in client_by_id.items():
        raw = str(row.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        for v in erp_query_variants(raw):
            if v not in erp_list:
                erp_list.append(v)

    if not erp_list:
        return {}

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
    primera: dict[int, str] = {}

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                cid = _cid_from_venta_en_cartera(row, client_by_id, vctx)
                if cid is None:
                    continue
                f = str(row.get("fecha_factura") or "")[:10]
                if len(f) < 10:
                    continue
                prev = primera.get(int(cid))
                if prev is None or f < prev:
                    primera[int(cid)] = f
            if len(batch) < PAGE:
                break
            offset += PAGE

    return primera


def _primera_compra_fecha_sin_vendedor(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde_d: str,
    hasta_d: str,
) -> dict[int, str]:
    """Primera venta en período por cliente (sin filtro de vendedor en fila)."""
    from core.ultima_compra import _norm_erp, _venta_cuenta_como_compra
    from core.ventas_enriched_tenant import (
        filter_ventas_rows_for_tenant,
        ventas_enriched_base_query,
    )

    erp_to_cid: dict[str, int] = {}
    erp_list: list[str] = []
    for cid, row in client_by_id.items():
        raw = str(row.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        erp_list.append(raw)
        n = _norm_erp(raw)
        if n:
            erp_to_cid[n] = int(cid)

    if not erp_to_cid:
        return {}

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
    primera: dict[int, str] = {}

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_COMPRADORES)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                n = _norm_erp(row.get("id_cliente_erp"))
                cid = erp_to_cid.get(n) if n else None
                if cid is None:
                    continue
                f = str(row.get("fecha_factura") or "")[:10]
                if len(f) < 10:
                    continue
                prev = primera.get(int(cid))
                if prev is None or f < prev:
                    primera[int(cid)] = f
            if len(batch) < PAGE:
                break
            offset += PAGE

    return primera


def compradores_progreso_diario_for_clients(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde: str,
    hasta: str,
    *,
    id_vendedor: int | None = None,
) -> dict[str, int]:
    """
    Conteo de compradores por día calendario AR según la primera compra válida en el período.
    """
    desde_d, hasta_d = _periodo_bounds(desde, hasta)
    comprador_ids = compradores_en_periodo_for_clients(
        dist_id, client_by_id, desde, hasta, id_vendedor=id_vendedor
    )
    if not comprador_ids:
        return {}

    if id_vendedor is not None:
        primera = _primera_compra_fecha_vendedor(
            dist_id, client_by_id, desde_d, hasta_d, int(id_vendedor)
        )
    else:
        primera = _primera_compra_fecha_sin_vendedor(
            dist_id, client_by_id, desde_d, hasta_d
        )

    progreso: dict[str, int] = {}
    for cid in comprador_ids:
        icid = int(cid)
        f = primera.get(icid)
        if not f:
            row = client_by_id.get(icid)
            if row:
                fuc = str(row.get("fecha_ultima_compra") or "")[:10]
                if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
                    f = fuc
        if f and desde_d <= f[:10] <= hasta_d:
            dkey = f[:10]
            progreso[dkey] = progreso.get(dkey, 0) + 1
    return progreso


def _client_by_id_for_vendedor(dist_id: int, id_vendedor: int) -> dict[int, dict]:
    """Cartera del vendedor (rutas_v2 → clientes_pdv_v2)."""
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_res = (
        sb.table(t_rutas)
        .select("id_ruta")
        .eq("id_vendedor", id_vendedor)
        .execute()
    )
    ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
    if not ruta_ids:
        return {}

    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    offset = 0
    client_by_id: dict[int, dict] = {}
    while True:
        batch = (
            sb.table(t_clientes)
            .select("id_cliente,id_cliente_erp,fecha_ultima_compra")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", ruta_ids)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )
        for row in batch:
            cid = row.get("id_cliente")
            if cid is not None:
                client_by_id[int(cid)] = row
        if len(batch) < PAGE:
            break
        offset += PAGE
    return client_by_id


def compradores_progreso_diario_en_periodo(
    dist_id: int,
    id_vendedor: int,
    desde: str,
    hasta: str,
) -> dict[str, int]:
    """Progreso diario de compradores para un vendedor en [desde, hasta]."""
    client_by_id = _client_by_id_for_vendedor(dist_id, id_vendedor)
    if not client_by_id:
        return {}
    return compradores_progreso_diario_for_clients(
        dist_id,
        client_by_id,
        desde,
        hasta,
        id_vendedor=int(id_vendedor),
    )


def _erps_con_ventas_en_periodo(
    dist_id: int,
    erp_rows: list[dict],
    desde_d: str,
    hasta_d: str,
) -> set[str]:
    """
    Retorna el set de ERPs normalizados que tienen al menos 1 fila en ventas_enriched
    para el período [desde_d, hasta_d], sin filtrar por vendedor y sin filtrar anulados.

    Usado para gating FUC: si un PDV tiene ERP en ventas_enriched del período → no usar FUC
    aunque el vendedor específico no matcheara.
    """
    from core.ultima_compra import _norm_erp as _uc_norm_erp
    from core.ventas_enriched_tenant import (
        filter_ventas_rows_for_tenant,
        ventas_enriched_base_query,
    )

    erp_list: list[str] = []
    erp_norm_set: set[str] = set()
    for row in erp_rows:
        raw = str(row.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        if raw not in erp_list:
            erp_list.append(raw)
        n = _uc_norm_erp(raw)
        if n:
            erp_norm_set.add(n)

    if not erp_list:
        return set()

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, "id_cliente_erp,fecha_factura,anulado")
    erps_en_ventas: set[str] = set()

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, "id_cliente_erp,fecha_factura,anulado")
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                n = _uc_norm_erp(row.get("id_cliente_erp"))
                if n and n in erp_norm_set:
                    erps_en_ventas.add(n)
            if len(batch) < PAGE:
                break
            offset += PAGE

    return erps_en_ventas


def compradores_en_periodo_for_clients(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde: str,
    hasta: str,
    *,
    id_vendedor: int | None = None,
) -> set[int]:
    """
    Dado un dict id_cliente → row (clientes_pdv_v2), retorna el conjunto de
    id_cliente que compraron al menos una vez en [desde, hasta].

    Fuentes (en orden):
    1. ventas_enriched_v2 vía ultima_compra_en_periodo_por_cliente (tenant + franquicia).
    2. Fallback padrón por PDV sin match en ventas: fecha_ultima_compra en el rango.

    No retorna ultima_compra_mes para mantener la interfaz simple; la supervisión
    usa su propia función _supervision_compradores_mes que mantiene ese campo extra.
    """
    comprador_ids: set[int] = set()
    if not client_by_id:
        return comprador_ids

    desde_d, hasta_d = _periodo_bounds(desde, hasta)

    if id_vendedor is not None:
        comprador_ids.update(
            _comprador_ids_desde_ventas_vendedor(
                dist_id, client_by_id, desde_d, hasta_d, int(id_vendedor)
            )
        )
    else:
        from core.ultima_compra import ultima_compra_en_periodo_por_cliente

        ventas_en_periodo = ultima_compra_en_periodo_por_cliente(
            dist_id, client_by_id, desde_d, hasta_d
        )
        comprador_ids.update(int(cid) for cid in ventas_en_periodo.keys())

    # Fallback padrón: solo para PDVs cuyo ERP no tiene ninguna fila en ventas_enriched
    # en el período (distribuidoras sin ingesta). Si el ERP aparece en ventas_enriched
    # del período (aunque no matcheara el vendedor), no usar FUC para evitar falsos positivos.
    erps_en_ventas = _erps_con_ventas_en_periodo(
        dist_id, list(client_by_id.values()), desde_d, hasta_d
    )
    for cid, row in client_by_id.items():
        if int(cid) in comprador_ids:
            continue
        raw = str(row.get("id_cliente_erp") or "").strip()
        n = _norm_erp(raw)
        if n and n in erps_en_ventas:
            continue  # tiene ventas en consolido pero no matcheó → no usar FUC
        fuc = str(row.get("fecha_ultima_compra") or "")[:10]
        if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
            comprador_ids.add(int(cid))

    return comprador_ids


def compradores_cids_by_vend_from_snapshot(
    dist_id: int,
    client_by_id_by_vend: dict[int, dict[int, dict]],
    ventas_rows: list[dict],
    desde: str,
    hasta: str,
    *,
    vend_row_by_id: dict[int, dict],
    match_indexes: dict[str, object],
    ventas_ctx: dict[str, object] | None = None,
    meses_yyyy_mm: set[str] | None = None,
) -> dict[int, set[int]]:
    """
    Compradores por vendedor desde cartera + ventas ya en memoria (batch estadísticas).

    Misma regla que compradores_en_periodo_for_clients(id_vendedor=…):
    ventas con importe >= 0, asignación por vendedor (_venta_matches_vendor),
    match ERP normalizado → id_cliente, fallback padrón FUC.
    """
    from collections import defaultdict

    from core.ultima_compra import _venta_cuenta_como_compra, erp_query_variants
    from core.ventas_enriched_tenant import filter_ventas_rows_for_tenant
    from services.estadisticas_service import (
        _in_meses,
        _resolve_vid_from_venta_row,
        _venta_matches_vendor,
        _vendor_context_light,
    )

    desde_d, hasta_d = _periodo_bounds(desde, hasta)
    rows = list(ventas_rows or [])
    if ventas_ctx:
        rows = filter_ventas_rows_for_tenant(rows, ventas_ctx)

    vids_por_variant: dict[str, set[int]] = defaultdict(set)
    vctx_by_vid: dict[int, dict] = {}
    for vid, client_by_id in client_by_id_by_vend.items():
        vend_row = vend_row_by_id.get(vid)
        if vend_row:
            vctx_by_vid[vid] = _vendor_context_light(vend_row, match_indexes)
        for _cid, crow in client_by_id.items():
            raw = str(crow.get("id_cliente_erp") or "").strip()
            if not raw:
                continue
            for variant in erp_query_variants(raw):
                vids_por_variant[variant].add(vid)

    compradores: dict[int, set[int]] = {vid: set() for vid in client_by_id_by_vend}

    for row in rows:
        f = str(row.get("fecha_factura") or "")[:10]
        if meses_yyyy_mm is not None:
            if not _in_meses(f, meses_yyyy_mm):
                continue
        elif len(f) < 10 or f < desde_d or f > hasta_d:
            continue
        if not _venta_cuenta_como_compra(row):
            continue

        re = str(row.get("id_cliente_erp") or "").strip()
        if not re:
            continue
        matches: list[tuple[int, int]] = []
        for vid in vids_por_variant.get(re, ()):
            vctx = vctx_by_vid.get(vid)
            if vctx is None:
                continue
            cid = _cid_from_venta_en_cartera(
                row, client_by_id_by_vend[vid], vctx
            )
            if cid is not None:
                matches.append((vid, cid))
        if not matches:
            continue
        if len(matches) == 1:
            vid, cid = matches[0]
        else:
            vids = {m[0] for m in matches}
            if len(vids) == 1:
                vid, cid = matches[0]
            else:
                resolved = _resolve_vid_from_venta_row(row, match_indexes)
                picked = next((m for m in matches if m[0] == resolved), None)
                if picked is None:
                    continue
                vid, cid = picked
        compradores[vid].add(int(cid))

    # FUC fallback gated: para cada vendedor, solo usar FUC si el ERP no tiene ventas
    # en ventas_enriched del período (misma regla que compradores_en_periodo_for_clients).
    # Construir set global de ERPs con ventas (union de todas las carteras del batch).
    all_client_rows: list[dict] = []
    for client_by_id in client_by_id_by_vend.values():
        all_client_rows.extend(client_by_id.values())
    erps_en_ventas = _erps_con_ventas_en_periodo(dist_id, all_client_rows, desde_d, hasta_d)

    for vid, client_by_id in client_by_id_by_vend.items():
        seen = compradores[vid]
        for cid, row in client_by_id.items():
            icid = int(cid)
            if icid in seen:
                continue
            raw = str(row.get("id_cliente_erp") or "").strip()
            n = _norm_erp(raw)
            if n and n in erps_en_ventas:
                continue  # tiene ventas en consolido pero no matcheó → no usar FUC
            fuc = str(row.get("fecha_ultima_compra") or "")[:10]
            if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
                seen.add(icid)

    return compradores


def compradores_en_periodo(
    dist_id: int,
    id_vendedor: int,
    desde: str,
    hasta: str,
) -> set[int]:
    """
    Retorna id_cliente del vendedor que compraron en [desde, hasta].

    Resuelve la cartera del vendedor via rutas_v2 → clientes_pdv_v2,
    luego delega a compradores_en_periodo_for_clients.
    """
    client_by_id = _client_by_id_for_vendedor(dist_id, id_vendedor)
    if not client_by_id:
        return set()

    return compradores_en_periodo_for_clients(
        dist_id, client_by_id, desde, hasta, id_vendedor=int(id_vendedor)
    )


def periodo_desde_hasta_objetivo(obj: dict) -> tuple[str, str]:
    """
    Retorna (desde, hasta) para medir compradores de un objetivo.

    Compañía:   desde = día 1 del mes_referencia (o created_at mes si falta)
                hasta = último día del mes
    Distribuidora: desde = fecha_inicio (campo futuro) o created_at[:10]
                   hasta = fecha_objetivo o hoy
    """
    import unicodedata as _ud

    def _norm_origen(val: Any) -> str:
        raw = str(val or "").strip().lower()
        txt = "".join(c for c in _ud.normalize("NFD", raw) if _ud.category(c) != "Mn")
        txt = " ".join(txt.split())
        if txt in {"compania", "company"}:
            return "compania"
        return txt

    origen = _norm_origen(obj.get("origen"))
    hoy = date.today()

    if origen == "compania":
        mes_ref_raw = obj.get("mes_referencia") or ""
        base_raw = str(mes_ref_raw)[:10] if mes_ref_raw else str(obj.get("created_at") or "")[:10]
        try:
            base_dt = date.fromisoformat(base_raw)
        except (ValueError, TypeError):
            base_dt = hoy
        first_day = base_dt.replace(day=1)
        last_day_num = monthrange(first_day.year, first_day.month)[1]
        last_day = first_day.replace(day=last_day_num)
        return first_day.isoformat(), last_day.isoformat()
    else:
        # fecha_inicio no existe en DB todavía: usar created_at[:10]
        fecha_inicio = (
            str(obj.get("fecha_inicio") or "")[:10]
            or str(obj.get("created_at") or "")[:10]
            or hoy.isoformat()
        )
        fecha_hasta = str(obj.get("fecha_objetivo") or "")[:10] or hoy.isoformat()
        return fecha_inicio, fecha_hasta
