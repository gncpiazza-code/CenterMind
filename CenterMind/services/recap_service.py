# -*- coding: utf-8 -*-
"""
Servicio principal del Repaso Comercial.

Construye el payload completo de snapshot por vendedor para un período.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from collections import defaultdict

from db import sb
from core.tenant_tables import tenant_table_name
from core.exhibicion_aggregate import (
    EXHIBICION_ROW_COLS,
    aggregate_exhibicion_counts_vendor_scope,
    vendor_logic_key,
    exhibicion_score,
    resolve_client_key,
    resolve_day_key,
)
from core.helpers import (
    is_exhibicion_qa_display_for_dist,
    is_vendedor_excluido_objetivos,
)
from core.recap_period import resolve_period_bounds, resolve_recap_comparisons
from core.recap_insights import build_insights_formal
from services.estadisticas_service import (
    build_carta_for_vendor_period,
    _fetch_rutas_vendedor,
    bultos_display_2dec,
    build_radar_normalized,
    score_vendedor,
    resolve_scoring_ideal,
    _get_ideal,
    _build_meta_kpis,
    KPI_KEYS,
)
from services.recap_snapshot_service import read_recap

logger = logging.getLogger("recap_service")

PAGE = 1000
_PADRON_VISIBLE_OR = "motivo_inactivo.is.null,motivo_inactivo.not.in.(padron_absent,padron_anulado)"


# ── Helpers internos ──────────────────────────────────────────────────────────

def _paginate_q(query_fn):
    """Pagina una query Supabase con rango de 1000 filas."""
    rows = []
    offset = 0
    while True:
        batch = query_fn(offset).range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def _payload_bounds_match(payload: dict, periodo_key: str) -> bool:
    try:
        fd, fh = resolve_period_bounds(periodo_key)
    except ValueError:
        return False
    return payload.get("fecha_desde") == fd and payload.get("fecha_hasta") == fh


def _get_carta_for_period(
    dist_id: int,
    periodo_key: str,
    id_vendedor: str,
    *,
    allow_snapshot: bool = False,
) -> dict | None:
    """Carta del vendedor acotada al período del repaso (Q1/Q2/C), no al mes entero."""
    if allow_snapshot:
        row = read_recap(dist_id, id_vendedor, periodo_key)
        if row:
            payload = row.get("payload") or {}
            if isinstance(payload, dict) and _payload_bounds_match(payload, periodo_key):
                carta = payload.get("carta")
                if carta:
                    return carta
    try:
        fecha_desde, fecha_hasta = resolve_period_bounds(periodo_key)
        return build_carta_for_vendor_period(dist_id, id_vendedor, fecha_desde, fecha_hasta)
    except Exception as e:
        logger.warning(
            "[recap] carta periodo dist=%s vendedor=%s key=%s: %s",
            dist_id,
            id_vendedor,
            periodo_key,
            e,
        )
    return None


def _fetch_integrante_ids_for_vendor(dist_id: int, id_vendedor: str) -> list[int]:
    """Retorna los id_integrante Telegram del vendedor ERP."""
    try:
        vid = int(id_vendedor)
    except (TypeError, ValueError):
        return []
    int_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", vid)
        .execute()
    )
    ids: list[int] = []
    for r in int_res.data or []:
        try:
            ids.append(int(r["id_integrante"]))
        except (TypeError, ValueError):
            continue
    return ids


def _fetch_exhibiciones(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
) -> list[dict]:
    """Fetches exhibicion rows for the vendor in the period (vendor-scope)."""
    int_ids = _fetch_integrante_ids_for_vendor(dist_id, id_vendedor)
    if not int_ids:
        return []

    t_ex = tenant_table_name("exhibiciones", dist_id)
    rows: list[dict] = []
    for i in range(0, len(int_ids), 50):
        batch = int_ids[i : i + 50]

        def q_fn(offset, b=batch):
            return (
                sb.table(t_ex)
                .select(EXHIBICION_ROW_COLS)
                .eq("id_distribuidor", dist_id)
                .in_("id_integrante", b)
                .gte("timestamp_subida", fecha_desde)
                .lte("timestamp_subida", fecha_hasta + "T23:59:59")
            )

        rows.extend(_paginate_q(q_fn))
    return rows


def _resolve_pdv_names(dist_id: int, pdv_ids: set[int], erp_codes: set[str]) -> dict[str, str]:
    """Map id_cliente_erp → nombre visible."""
    names: dict[str, str] = {}
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)

    codes = [c for c in erp_codes if c]
    for i in range(0, len(codes), 50):
        batch = codes[i : i + 50]
        res = (
            sb.table(t_pdv)
            .select("id_cliente_erp,nombre_razon_social,nombre_fantasia")
            .eq("id_distribuidor", dist_id)
            .in_("id_cliente_erp", batch)
            .execute()
        )
        for r in res.data or []:
            erp = str(r.get("id_cliente_erp") or "").strip()
            nombre = (r.get("nombre_razon_social") or r.get("nombre_fantasia") or "").strip()
            if erp and nombre:
                names[erp] = nombre
    return names


def build_exhibiciones_detalle(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
    ex_rows: list[dict] | None = None,
) -> dict:
    """
    Detalle de exhibiciones enviadas (dedup vendor-scope) y clientes de ruta sin exhibición.
    """
    if ex_rows is None:
        ex_rows = _fetch_exhibiciones(dist_id, id_vendedor, fecha_desde, fecha_hasta)

    best: dict[str, dict] = {}
    for row in ex_rows:
        key = vendor_logic_key(row)
        estado = (row.get("estado") or "")
        sc = exhibicion_score(estado)
        if key not in best or sc > best[key]["_sc"]:
            best[key] = {**row, "_sc": sc}

    exhibited_keys: set[str] = set()
    pdv_ids: set[int] = set()
    erp_codes: set[str] = set()
    enviadas_raw: list[dict] = []

    for row in best.values():
        ck = resolve_client_key(row)
        if ck:
            exhibited_keys.add(ck)
            erp_codes.add(ck)
        pdv_raw = row.get("id_cliente_pdv")
        if pdv_raw is not None:
            try:
                pdv_ids.add(int(pdv_raw))
                exhibited_keys.add(str(pdv_raw))
            except (TypeError, ValueError):
                pass
        enviadas_raw.append(
            {
                "id_cliente_erp": ck or str(pdv_raw or ""),
                "id_cliente_pdv": pdv_raw,
                "fecha": resolve_day_key(row),
                "estado": (row.get("estado") or "").strip(),
            }
        )

    names = _resolve_pdv_names(dist_id, pdv_ids, erp_codes)
    enviadas: list[dict] = []
    for item in enviadas_raw:
        erp = item["id_cliente_erp"]
        pdv = item.get("id_cliente_pdv")
        nombre = names.get(erp) or (names.get(str(pdv)) if pdv is not None else "") or erp
        enviadas.append({**item, "nombre": nombre})
    enviadas.sort(key=lambda x: (x.get("fecha") or "", x.get("nombre") or ""), reverse=True)

    sin_items, sin_total = _fetch_clientes_sin_exhibicion(dist_id, id_vendedor, exhibited_keys)

    return {
        "enviadas": enviadas,
        "sin_exhibicion": sin_items,
        "sin_exhibicion_total": sin_total,
    }


def _fetch_clientes_sin_exhibicion(
    dist_id: int,
    id_vendedor: str,
    exhibited_keys: set[str],
    max_items: int = 40,
) -> tuple[list[dict], int]:
    """PDVs activos en ruta del vendedor sin exhibición lógica en el período."""
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    rutas_rows = _fetch_rutas_vendedor(dist_id, id_vendedor, "id_ruta")
    ruta_ids = [int(r["id_ruta"]) for r in rutas_rows if r.get("id_ruta") is not None]
    if not ruta_ids:
        return [], 0

    pdvs: list[dict] = []
    for i in range(0, len(ruta_ids), 50):
        batch = ruta_ids[i : i + 50]
        q = (
            sb.table(t_pdv)
            .select("id_cliente_erp,nombre_razon_social,nombre_fantasia,localidad")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", batch)
            .or_(_PADRON_VISIBLE_OR)
        )
        pdvs.extend(q.execute().data or [])

    sin: list[dict] = []
    seen_erp: set[str] = set()
    for p in pdvs:
        erp = str(p.get("id_cliente_erp") or "").strip()
        if not erp or erp in seen_erp:
            continue
        seen_erp.add(erp)
        if erp in exhibited_keys:
            continue
        nombre = (p.get("nombre_razon_social") or p.get("nombre_fantasia") or erp).strip()
        sin.append(
            {
                "id_cliente_erp": erp,
                "nombre": nombre,
                "localidad": (p.get("localidad") or "").strip(),
            }
        )

    sin.sort(key=lambda x: x.get("nombre") or "")
    return sin[:max_items], len(sin)


def enrich_exhibiciones_detalle(payload: dict, dist_id: int, id_vendedor: str) -> dict:
    """Completa exhibiciones_detalle en snapshots legacy."""
    if payload.get("exhibiciones_detalle"):
        return payload
    periodo_key = payload.get("periodo_key") or ""
    if not periodo_key:
        return payload
    try:
        fd, fh = resolve_period_bounds(periodo_key)
        payload["exhibiciones_detalle"] = build_exhibiciones_detalle(dist_id, id_vendedor, fd, fh)
    except Exception as e:
        logger.warning("[recap] enrich exhibiciones_detalle dist=%s v=%s: %s", dist_id, id_vendedor, e)
        payload["exhibiciones_detalle"] = {"enviadas": [], "sin_exhibicion": [], "sin_exhibicion_total": 0}
    return payload


def _snapshot_is_frozen(payload: dict, periodo_key: str) -> bool:
    """Snapshots v2+ con bounds del período: servir DB sin recalcular KPIs."""
    if int(payload.get("schema_version") or 0) < 2:
        return False
    try:
        fd, fh = resolve_period_bounds(periodo_key)
    except ValueError:
        return False
    return payload.get("fecha_desde") == fd and payload.get("fecha_hasta") == fh


def _fetch_vendor_meta(dist_id: int, id_vendedor: str) -> dict | None:
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    t_suc = tenant_table_name("sucursales_v2", dist_id)
    try:
        vid = int(id_vendedor)
    except (TypeError, ValueError):
        return None
    vend_res = (
        sb.table(t_vend)
        .select("id_vendedor,nombre_erp,id_sucursal")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", vid)
        .limit(1)
        .execute()
    )
    rows = vend_res.data or []
    if not rows:
        return None
    v = rows[0]
    nombre = (v.get("nombre_erp") or "").strip()
    sid = str(v.get("id_sucursal") or "").strip()
    suc_nombre = ""
    if sid:
        suc_res = (
            sb.table(t_suc)
            .select("nombre_erp")
            .eq("id_distribuidor", dist_id)
            .eq("id_sucursal", sid)
            .limit(1)
            .execute()
        )
        suc_nombre = ((suc_res.data or [{}])[0].get("nombre_erp") or "").strip()
    return {"nombre": nombre or "?", "sucursal": suc_nombre}


def _carta_from_snapshot_payload(
    payload: dict,
    dist_id: int,
    id_vendedor: str,
) -> dict | None:
    """Reconstruye carta mínima desde bloques del snapshot (sin queries pesadas)."""
    carta = payload.get("carta")
    if isinstance(carta, dict) and carta.get("nombre") and carta.get("raw_kpis"):
        return carta

    meta = _fetch_vendor_meta(dist_id, id_vendedor)
    if not meta:
        return carta if isinstance(carta, dict) else None

    ex = payload.get("exhibiciones") or {}
    prev_raw = (carta or {}).get("raw_kpis") if isinstance(carta, dict) else {}
    raw = dict(prev_raw or {})
    raw.setdefault("pdvs", int(raw.get("pdvs") or 0))
    raw["exhibiciones"] = int(ex.get("total_logicas") or raw.get("exhibiciones") or 0)
    raw["altas"] = len(payload.get("altas") or [])
    bultos_total = float(payload.get("bultos_total") or raw.get("bultos_raw") or 0)
    raw["bultos"] = bultos_display_2dec(bultos_total)
    raw["bultos_raw"] = bultos_total
    raw.setdefault("compradores", int(payload.get("compradores") or raw.get("compradores") or 0))
    raw.setdefault("cobertura_pct", float(raw.get("cobertura_pct") or 0))
    raw.setdefault("objetivos_pct", float(raw.get("objetivos_pct") or 0))

    shell = {
        "id_vendedor": str(id_vendedor),
        "nombre": meta["nombre"],
        "sucursal": meta["sucursal"],
        "raw_kpis": raw,
        "has_ideal_compania": bool((carta or {}).get("has_ideal_compania")),
        "has_ideal_distribuidora": bool((carta or {}).get("has_ideal_distribuidora")),
    }
    return _rescore_carta(shell, dist_id)


def _hydrate_story_from_snapshot(payload: dict, dist_id: int, id_vendedor: str) -> dict:
    """Alinea carta.raw_kpis con bloques del snapshot sin recalcular en DB."""
    payload = dict(payload)
    if not payload.get("carta"):
        payload["carta"] = _carta_from_snapshot_payload(payload, dist_id, id_vendedor)
    carta = payload.get("carta")
    ex = payload.get("exhibiciones") or {}
    if not carta or ex.get("total_logicas") is None:
        return payload
    rk = dict(carta.get("raw_kpis") or {})
    ex_n = int(ex.get("total_logicas") or 0)
    rk["exhibiciones"] = ex_n
    rk["altas"] = len(payload.get("altas") or [])
    bultos_total = float(payload.get("bultos_total") or 0)
    rk["bultos"] = bultos_display_2dec(bultos_total)
    rk["bultos_raw"] = bultos_total
    payload["carta"] = _rescore_carta({**carta, "raw_kpis": rk}, dist_id)
    return payload


def enrich_story_payload_for_read(
    payload: dict,
    dist_id: int,
    id_vendedor: str,
    periodo_key: str,
) -> dict:
    """Prepara payload de story al leer snapshot (rápido, sin recalcular carta completa)."""
    payload = dict(payload)
    payload.setdefault("periodo_key", periodo_key)

    if not payload.get("carta"):
        payload["carta"] = _carta_from_snapshot_payload(payload, dist_id, id_vendedor)

    if _snapshot_is_frozen(payload, periodo_key):
        if not payload.get("exhibiciones_detalle"):
            payload = enrich_exhibiciones_detalle(payload, dist_id, id_vendedor)
        return payload

    payload = _hydrate_story_from_snapshot(payload, dist_id, id_vendedor)
    if not payload.get("exhibiciones_detalle"):
        payload = enrich_exhibiciones_detalle(payload, dist_id, id_vendedor)
    return payload


def recap_carrusel_entry_from_payload(
    dist_id: int,
    id_vendedor: str,
    payload: dict,
) -> tuple[int, str, str]:
    """Score/nombre/sucursal para strip del carrusel (tolera carta null en snapshot)."""
    carta = payload.get("carta")
    if isinstance(carta, dict) and carta.get("nombre"):
        return (
            round(float(carta.get("score") or 0)),
            str(carta.get("nombre") or "?").strip(),
            str(carta.get("sucursal") or "").strip(),
        )
    rebuilt = _carta_from_snapshot_payload(payload, dist_id, id_vendedor)
    if rebuilt:
        return (
            round(float(rebuilt.get("score") or 0)),
            str(rebuilt.get("nombre") or "?").strip(),
            str(rebuilt.get("sucursal") or "").strip(),
        )
    meta = _fetch_vendor_meta(dist_id, id_vendedor)
    if meta:
        return (0, meta["nombre"], meta["sucursal"])
    return (0, "?", "")


def enrich_recap_story_cartas(payload: dict, dist_id: int, id_vendedor: str) -> dict:
    """
    Recalcula cartas e insights con bounds del período (corrige snapshots MTD legacy).
    """
    periodo_key = payload.get("periodo_key") or ""
    if not periodo_key:
        return payload

    carta = _get_carta_for_period(dist_id, periodo_key, id_vendedor)
    if carta:
        payload["carta"] = carta

    comparisons = resolve_recap_comparisons(periodo_key)
    ant_key = comparisons.get("quincena_anterior")
    if ant_key:
        ant = _get_carta_for_period(dist_id, ant_key, id_vendedor)
        payload["carta_anterior"] = ant

    cierre_key = comparisons.get("cierre_anterior")
    if cierre_key:
        payload["carta_cierre_anterior"] = _get_carta_for_period(dist_id, cierre_key, id_vendedor)
    elif periodo_key.rsplit("-", 1)[-1].upper() != "C":
        payload["carta_cierre_anterior"] = None

    payload["insights"] = build_insights_formal(
        payload.get("carta") or {},
        payload.get("carta_anterior"),
        payload.get("carta_cierre_anterior"),
    )
    return payload


def enrich_carrusel_period_scores(dist_id: int, periodo_key: str, carrusel: dict) -> dict:
    """Recalcula score/delta del carrusel con bounds del período (no MTD)."""
    comparisons = resolve_recap_comparisons(periodo_key)
    ant_key = comparisons.get("quincena_anterior")
    vendedores: list[dict] = []
    for v in carrusel.get("vendedores") or []:
        vid = str(v.get("id_vendedor") or "")
        if not vid:
            continue
        carta = _get_carta_for_period(dist_id, periodo_key, vid)
        if not carta:
            vendedores.append(v)
            continue
        score = round(float(carta.get("score") or 0))
        delta = None
        if ant_key:
            ant = _get_carta_for_period(dist_id, ant_key, vid)
            if ant:
                delta = score - round(float(ant.get("score") or 0))
        vendedores.append({**v, "score": score, "delta": delta})
    vendedores.sort(key=lambda x: (-x.get("score", 0), (x.get("nombre") or "").lower()))
    carrusel["vendedores"] = vendedores
    scores = [v["score"] for v in vendedores if v.get("score") is not None]
    if scores:
        resumen = dict(carrusel.get("resumen") or {})
        resumen["score_promedio"] = round(sum(scores) / len(scores), 1)
        resumen["score_max"] = max(scores)
        resumen["score_min"] = min(scores)
        deltas = [v["delta"] for v in vendedores if v.get("delta") is not None]
        resumen["mejoras"] = sum(1 for d in deltas if d > 0)
        resumen["bajadas"] = sum(1 for d in deltas if d < 0)
        resumen["sin_cambio"] = sum(1 for d in deltas if d == 0)
        carrusel["resumen"] = resumen
    return carrusel


def _fetch_altas(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
    max_altas: int = 20,
) -> list[dict]:
    """Clientes dados de alta en el período para el vendedor (vía rutas_v2)."""
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    rutas_rows = _fetch_rutas_vendedor(dist_id, id_vendedor, "id_ruta")
    ruta_ids = [int(r["id_ruta"]) for r in rutas_rows if r.get("id_ruta") is not None]
    if not ruta_ids:
        return []

    rows: list[dict] = []
    for i in range(0, len(ruta_ids), 50):
        batch = ruta_ids[i : i + 50]
        q = (
            sb.table(t_pdv)
            .select(
                "id_cliente_erp,nombre_razon_social,nombre_fantasia,fecha_alta,localidad"
            )
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", batch)
            .gte("fecha_alta", fecha_desde)
            .lte("fecha_alta", fecha_hasta)
        )
        rows.extend(q.execute().data or [])

    rows.sort(key=lambda r: (r.get("fecha_alta") or ""), reverse=True)
    result = []
    for r in rows[:max_altas]:
        nombre = (r.get("nombre_razon_social") or r.get("nombre_fantasia") or "").strip()
        result.append(
            {
                "id_cliente_erp": str(r.get("id_cliente_erp") or ""),
                "nombre": nombre,
                "fecha_alta": (r.get("fecha_alta") or "")[:10],
                "localidad": r.get("localidad") or "",
            }
        )
    return result


def _fetch_bultos_top(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
    max_items: int | None = None,
) -> tuple[list[dict], float]:
    """
    Retorna (bultos_top, bultos_total) de ventas_enriched_v2 para el vendedor en el período.
    Usa la misma asignación de filas que el KPI batch de cartas.
    """
    from services.estadisticas_service import (
        _vendor_context,
        _fetch_ventas_rows_vendedor,
        _build_bultos_desglose,
        bultos_display_2dec,
    )

    try:
        meses_set: set[str] = set()
        y, m = int(fecha_desde[:4]), int(fecha_desde[5:7])
        ey, em = int(fecha_hasta[:4]), int(fecha_hasta[5:7])
        while (y, m) <= (ey, em):
            meses_set.add(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m, y = 1, y + 1
        vctx = _vendor_context(dist_id, id_vendedor)
        ventas_vend = _fetch_ventas_rows_vendedor(
            dist_id, vctx, fecha_desde, fecha_hasta
        )
        top, bultos_raw = _build_bultos_desglose(ventas_vend, meses_set)
        if max_items is not None:
            top = top[:max_items]
        return top, bultos_display_2dec(bultos_raw)

    except Exception as e:
        logger.warning(
            "[recap] bultos_top dist=%s vendedor=%s: %s", dist_id, id_vendedor, e
        )
        return [], 0.0


def _build_data_quality(carta: dict | None) -> dict:
    erp_sync_ok = not (carta or {}).get("erp_sync_alert", False)
    return {
        "erp_sync_ok": erp_sync_ok,
        "telegram_binding_ok": True,  # futuro: detectar drift
        "warnings": (
            ["erp_sync_alert: ventas sin match"] if not erp_sync_ok else []
        ),
    }


# ── API pública ───────────────────────────────────────────────────────────────

def _rescore_carta(carta: dict, dist_id: int) -> dict:
    """Recalcula radar/score tras parchear raw_kpis del período."""
    raw = carta.get("raw_kpis") or {}
    ideal_dist = _get_ideal(dist_id, "distribuidora")
    ideal_comp = _get_ideal(None, "compania")
    scoring_ideal, active_pesos = resolve_scoring_ideal(ideal_dist, ideal_comp)
    meta_score = _build_meta_kpis(scoring_ideal, 1) if scoring_ideal else {k: 0 for k in KPI_KEYS}
    radar = build_radar_normalized(raw, meta_score, ideal=scoring_ideal, batch_caps=None)
    score = score_vendedor(radar, active_pesos) if scoring_ideal else int(carta.get("score") or 0)
    out = {**carta, "radar": radar, "score": score}
    out.pop("_dist_id", None)
    return out


def _apply_period_kpis_to_carta(
    carta: dict | None,
    dist_id: int,
    ex_counts: dict,
    altas: list,
    bultos_total: float,
) -> dict | None:
    if not carta:
        return carta
    raw = dict(carta.get("raw_kpis") or {})
    raw["exhibiciones"] = int(ex_counts.get("total_logicas") or 0)
    raw["altas"] = len(altas)
    raw["bultos"] = bultos_display_2dec(bultos_total)
    raw["bultos_raw"] = float(bultos_total or 0)
    return _rescore_carta({**carta, "raw_kpis": raw}, dist_id)


def _fetch_eligible_vendors(
    dist_id: int,
    fecha_desde: str,
    fecha_hasta: str,
) -> list[dict]:
    """
    Vendors elegibles para el Repaso Comercial:
      - pdvs_ruta > 0 (padrón clientes_pdv_v2)
      - exhibiciones_logicas > 0 en el período
      - No QA / excluidos

    Retorna: [{"id_vendedor": str, "nombre": str, "sucursal": str}]
    """
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    t_ex = tenant_table_name("exhibiciones", dist_id)
    t_suc = tenant_table_name("sucursales_v2", dist_id)

    # Cargar vendedores
    vend_rows = (
        sb.table(t_vend)
        .select("id_vendedor,nombre_erp,id_sucursal")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )

    # Mapa id_sucursal → nombre
    suc_rows = (
        sb.table(t_suc)
        .select("id_sucursal,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )
    suc_map = {str(r["id_sucursal"]): r.get("nombre_erp", "") for r in suc_rows}

    # PDVs por vendedor (via rutas_v2)
    t_rutas = tenant_table_name("rutas_v2", dist_id)

    def rutas_q(offset):
        return sb.table(t_rutas).select("id_ruta,id_vendedor")

    rutas = _paginate_q(rutas_q)
    ruta_ids_by_vend: dict[int, list[int]] = defaultdict(list)
    for r in rutas:
        rid = r.get("id_ruta")
        vid = r.get("id_vendedor")
        if rid is not None and vid is not None:
            ruta_ids_by_vend[int(vid)].append(int(rid))

    vends_with_pdvs: set[int] = set()
    for vid, rids in ruta_ids_by_vend.items():
        for i in range(0, len(rids), 50):
            batch = rids[i : i + 50]
            q = (
                sb.table(t_pdv)
                .select("id_cliente_erp")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch)
                .or_(_PADRON_VISIBLE_OR)
                .limit(1)
            )
            rows = q.execute().data or []
            if rows:
                vends_with_pdvs.add(vid)
                break

    # Integrantes → vendedor
    int_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante,id_vendedor_v2")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )
    int_to_vend: dict[int, int] = {}
    vend_int_ids: dict[int, list[int]] = defaultdict(list)
    for r in int_res:
        iid = r.get("id_integrante")
        vid = r.get("id_vendedor_v2")
        if iid is not None and vid is not None:
            int_to_vend[int(iid)] = int(vid)
            vend_int_ids[int(vid)].append(int(iid))

    # Exhibiciones en el período
    def ex_q(offset):
        return (
            sb.table(t_ex)
            .select("id_integrante")
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", fecha_desde)
            .lte("timestamp_subida", fecha_hasta + "T23:59:59")
        )

    ex_rows = _paginate_q(ex_q)
    vends_with_ex: set[int] = set()
    for r in ex_rows:
        iid_raw = r.get("id_integrante")
        if iid_raw is None:
            continue
        vid = int_to_vend.get(int(iid_raw))
        if vid is not None:
            vends_with_ex.add(vid)

    # Construir lista elegible
    eligible: list[dict] = []
    for v in vend_rows:
        vid_raw = v.get("id_vendedor")
        if vid_raw is None:
            continue
        vid = int(vid_raw)
        nombre = (v.get("nombre_erp") or "").strip()

        if is_exhibicion_qa_display_for_dist(dist_id, nombre):
            continue
        if is_vendedor_excluido_objetivos(nombre):
            continue
        if vid not in vends_with_pdvs:
            continue
        if vid not in vends_with_ex:
            continue

        suc_nombre = suc_map.get(str(v.get("id_sucursal") or ""), "")
        eligible.append(
            {
                "id_vendedor": str(vid),
                "nombre": nombre,
                "sucursal": suc_nombre,
            }
        )

    return eligible


def build_recap_payload(
    dist_id: int,
    id_vendedor: str,
    periodo_key: str,
) -> dict:
    """
    Construye el payload completo del snapshot de Repaso Comercial para un vendedor.
    """
    fecha_desde, fecha_hasta = resolve_period_bounds(periodo_key)
    comparisons = resolve_recap_comparisons(periodo_key)

    carta = _get_carta_for_period(dist_id, periodo_key, id_vendedor)
    if not carta:
        prev = read_recap(dist_id, id_vendedor, periodo_key)
        if prev:
            prev_payload = prev.get("payload") or {}
            if isinstance(prev_payload, dict):
                carta = prev_payload.get("carta")

    carta_anterior: dict | None = None
    carta_cierre_anterior: dict | None = None

    ant_key = comparisons.get("quincena_anterior")
    if ant_key:
        try:
            carta_anterior = _get_carta_for_period(
                dist_id, ant_key, id_vendedor, allow_snapshot=True
            )
        except Exception as e:
            logger.warning("[recap] carta_anterior dist=%s vendedor=%s: %s", dist_id, id_vendedor, e)

    cierre_key = comparisons.get("cierre_anterior")
    if cierre_key:
        try:
            carta_cierre_anterior = _get_carta_for_period(
                dist_id, cierre_key, id_vendedor, allow_snapshot=True
            )
        except Exception as e:
            logger.warning("[recap] carta_cierre_anterior dist=%s vendedor=%s: %s", dist_id, id_vendedor, e)

    # Exhibiciones del período
    ex_rows = _fetch_exhibiciones(dist_id, id_vendedor, fecha_desde, fecha_hasta)
    ex_counts = aggregate_exhibicion_counts_vendor_scope(ex_rows)
    ex_detalle = build_exhibiciones_detalle(
        dist_id, id_vendedor, fecha_desde, fecha_hasta, ex_rows=ex_rows
    )

    # Altas del período
    altas = _fetch_altas(dist_id, id_vendedor, fecha_desde, fecha_hasta, max_altas=20)

    # Bultos top
    bultos_top, bultos_total = _fetch_bultos_top(
        dist_id, id_vendedor, fecha_desde, fecha_hasta, max_items=10
    )

    carta = _apply_period_kpis_to_carta(carta, dist_id, ex_counts, altas, bultos_total)

    # Compradores (desde carta o ex_counts)
    compradores_count = 0
    if carta:
        compradores_count = int((carta.get("raw_kpis") or {}).get("compradores") or 0)

    # Insights
    insights = build_insights_formal(carta or {}, carta_anterior, carta_cierre_anterior)

    # Data quality
    data_quality = _build_data_quality(carta)

    # Timeline cierre (solo para tipo C)
    tipo = periodo_key.rsplit("-", 1)[-1].upper()
    timeline_cierre: list = []
    if tipo == "C":
        # Placeholder: en el futuro puede incluir datos day-by-day
        timeline_cierre = []

    return {
        "schema_version": 2,
        "periodo_key": periodo_key,
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "carta": carta,
        "carta_anterior": carta_anterior,
        "carta_cierre_anterior": carta_cierre_anterior if tipo == "C" else None,
        "timeline_cierre": timeline_cierre if tipo == "C" else [],
        "exhibiciones": {
            "total_logicas": ex_counts.get("total_logicas", 0),
            "aprobadas": ex_counts.get("aprobadas", 0),
            "destacadas": ex_counts.get("destacadas", 0),
            "rechazadas": ex_counts.get("rechazadas", 0),
            "pendientes": ex_counts.get("pendientes", 0),
            "puntos": ex_counts.get("puntos", 0),
        },
        "exhibiciones_detalle": ex_detalle,
        "altas": altas,
        "bultos_top": bultos_top,
        "bultos_total": bultos_total,
        "compradores": compradores_count,
        "insights": insights,
        "data_quality": data_quality,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


_EVOLUCION_SUFFIXES = ("Q1", "Q2", "C")
_EVOLUCION_LABELS = {
    "Q1": "1ra quincena",
    "Q2": "2da quincena",
    "C": "Cierre de mes",
}
_EVOLUCION_CACHE: dict[str, tuple[float, dict]] = {}
_EVOLUCION_CACHE_TTL_SEC = 900  # 15 min, alineado a snapshot estadísticas


def _evolucion_step(dist_id: int, id_vendedor: str, mes: str, suffix: str) -> dict:
    pk = f"{mes}-{suffix}"
    row = read_recap(dist_id, id_vendedor, pk)
    carta = None
    status = None
    generated_at = ""
    if row:
        payload = row.get("payload") or {}
        if isinstance(payload, dict):
            payload = enrich_story_payload_for_read(payload, dist_id, id_vendedor, pk)
            carta = payload.get("carta")
            status = row.get("status") or payload.get("status")
            generated_at = str(row.get("generated_at") or payload.get("generated_at") or "")
    if not carta:
        carta = _get_carta_for_period(dist_id, pk, id_vendedor, allow_snapshot=False)
    return {
        "periodo_key": pk,
        "tipo": suffix,
        "label": _EVOLUCION_LABELS[suffix],
        "carta": carta,
        "available": bool(carta),
        "status": status,
        "generated_at": generated_at,
    }


def build_recap_evolucion_mes(dist_id: int, id_vendedor: str, mes: str) -> dict:
    """Cartas Q1 → Q2 → C del mismo mes (snapshot de repaso o cálculo en vivo)."""
    mes = (mes or "").strip()
    cache_key = f"{dist_id}|{id_vendedor}|{mes}"
    now = time.time()
    hit = _EVOLUCION_CACHE.get(cache_key)
    if hit and now - hit[0] < _EVOLUCION_CACHE_TTL_SEC:
        return hit[1]

    steps: list[dict] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            pool.submit(_evolucion_step, dist_id, id_vendedor, mes, suffix): suffix
            for suffix in _EVOLUCION_SUFFIXES
        }
        by_suffix: dict[str, dict] = {}
        for fut in as_completed(futures):
            suffix = futures[fut]
            by_suffix[suffix] = fut.result()
    steps = [by_suffix[s] for s in _EVOLUCION_SUFFIXES if s in by_suffix]

    nombre = ""
    sucursal = ""
    for step in reversed(steps):
        c = step.get("carta")
        if isinstance(c, dict) and c.get("nombre"):
            nombre = str(c.get("nombre") or "").strip()
            sucursal = str(c.get("sucursal") or "").strip()
            break
    if not nombre:
        meta = _fetch_vendor_meta(dist_id, id_vendedor)
        if meta:
            nombre = meta["nombre"]
            sucursal = meta["sucursal"]

    out = {
        "mes": mes,
        "id_vendedor": id_vendedor,
        "nombre": nombre,
        "sucursal": sucursal,
        "steps": steps,
    }
    _EVOLUCION_CACHE[cache_key] = (now, out)
    return out
