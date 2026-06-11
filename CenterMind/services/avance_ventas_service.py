# -*- coding: utf-8 -*-
"""
Avance de Ventas — supervisión operativa en volumen (bultos + unidades).

Fuente: ventas_enriched_v2 (Informe de Ventas Consolido, 4 ingestas/día).
Reglas de volumen: core.ventas_bultos_rules + bultos neto de estadisticas_service
(ventas + devoluciones netas, recaudaciones excluidas). Sin importes en la salida.

Periodos: día / semana lun–sáb AR / mes calendario, con comparativas WoW
(mismo weekday −7d) y MoM (mismo día calendario −1 mes, clamp a fin de mes).
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, time, timedelta
from typing import Optional, Set
from zoneinfo import ZoneInfo

from time import monotonic

from core.helpers import _get_erp_name_map
from core.tenant_tables import tenant_table_name
from core.sku_unify import (
    SkuKeyResolver,
    build_cod_articulo_hints,
    enrich_sku_identity,
    merge_sku_bucket,
    normalize_sku_description,
    resolve_unify_key_from_ref,
    row_matches_unify_key,
    seed_sku_resolver,
    sku_unify_key,
    unify_catalog_entries,
)
from core.ventas_bultos_rules import (
    classify_volumen,
    enrich_bultos_desglose_row,
    volumen_es_convertido,
)
from db import sb

logger = logging.getLogger("ShelfyAPI")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Ingestas Informe de Ventas Consolido (hora AR) — alineado con ShelfMind-RPA/scheduler.py.
VENTAS_RUN_SLOTS_AR = ((9, 45), (13, 0), (17, 0), (21, 0))

SIN_VENDEDOR_LABEL = "Sin vendedor"

PAGE = 1000
# Cap defensivo SOLO para series de gráficos (scatter/top-bottom); la tabla
# ranking va completa (decisión R1 plan 2026-06-11).
RANKING_MAX_SKUS = 150
HEATMAP_TOP_SKUS = 15
DRILL_TOP_SKUS = 20
DRILL_CLIENTES_N = 10
DRILL_CLIENTES_PAGE = 50

# Catálogo SKU 12 meses (R1) — descubrimiento keyset (cod_articulo > último,
# limit N) porque PostgREST no soporta DISTINCT y el scan completo de 12 meses
# son 30k–100k filas por tenant. El catálogo real es chico (~25-30 SKUs).
CATALOGO_MESES = 12
CATALOGO_CACHE_TTL_S = 6 * 3600
_CATALOGO_DISCOVERY_BATCH = 50
_CATALOGO_MAX_ITER = 400
_catalogo_cache: dict[tuple[int, str, str], tuple[float, list[dict]]] = {}

# Auditoría cliente×SKU (R8)
AUDITORIA_TOP_N = 20
MIX_BAJO_MAX_SKUS = 3
AUDITORIA_RESUMEN_MAX = 1000

_VENTAS_SELECT_COLS = (
    "fecha_factura,nombre_vendedor,nombre_cliente,id_cliente_erp,"
    "tipo_documento,numero_documento,cod_articulo,descripcion_articulo,"
    "agrupacion_art_1,agrupacion_art_2,bultos_total,unidades_total,importe_final"
)

# Mismo criterio de visibilidad de padrón que supervisión (cartera para penetración).
_PADRON_VISIBLE_OR = (
    "motivo_inactivo.is.null,motivo_inactivo.not.in.(padron_absent,padron_anulado)"
)


def _today_ar() -> date:
    return datetime.now(AR_TZ).date()


def _parse_fecha(fecha: str) -> date:
    return datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()


_MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
_MESES_LARGOS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _fmt_dia_label(d: date) -> str:
    return f"{d.day} {_MESES_CORTOS[d.month - 1]} {d.year}"


# ─── Resolución de periodos ───────────────────────────────────────────────────

def resolve_periodo(modo: str, fecha: str) -> dict:
    """Rango [desde, hasta] + label + flag parcial para el modo solicitado."""
    anchor = _parse_fecha(fecha)
    hoy = _today_ar()

    if modo == "dia":
        desde = hasta = anchor
        label = "Hoy (parcial)" if anchor == hoy else _fmt_dia_label(anchor)
    elif modo == "semana":
        lunes = anchor - timedelta(days=anchor.weekday())
        sabado = lunes + timedelta(days=5)
        desde, hasta = lunes, sabado
        if lunes.month == sabado.month:
            label = f"Semana {lunes.day}–{sabado.day} {_MESES_CORTOS[sabado.month - 1]} {sabado.year}"
        else:
            label = (
                f"Semana {lunes.day} {_MESES_CORTOS[lunes.month - 1]}"
                f"–{sabado.day} {_MESES_CORTOS[sabado.month - 1]} {sabado.year}"
            )
    elif modo == "mes":
        desde = anchor.replace(day=1)
        hasta = anchor.replace(day=calendar.monthrange(anchor.year, anchor.month)[1])
        label = f"{_MESES_LARGOS[anchor.month - 1]} {anchor.year}"
    else:
        raise ValueError(f"modo inválido: {modo}")

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "label": label,
        "parcial": hasta >= hoy and desde <= hoy,
    }


def _shift_month_clamped(d: date, months: int = -1) -> date:
    """Mismo día calendario N meses atrás; si no existe, último día de ese mes."""
    y, m = d.year, d.month + months
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def resolve_referencias(modo: str, fecha: str) -> dict[str, dict]:
    """Periodos de referencia por modo: dia→wow+mom, semana→semana_anterior, mes→mes_anterior."""
    anchor = _parse_fecha(fecha)
    refs: dict[str, dict] = {}

    if modo == "dia":
        wow = anchor - timedelta(days=7)
        mom = _shift_month_clamped(anchor, -1)
        refs["wow"] = {"desde": wow.isoformat(), "hasta": wow.isoformat()}
        refs["mom"] = {"desde": mom.isoformat(), "hasta": mom.isoformat()}
    elif modo == "semana":
        lunes = anchor - timedelta(days=anchor.weekday())
        prev_lunes = lunes - timedelta(days=7)
        prev_sabado = prev_lunes + timedelta(days=5)
        refs["semana_anterior"] = {
            "desde": prev_lunes.isoformat(),
            "hasta": prev_sabado.isoformat(),
        }
    elif modo == "mes":
        primero = anchor.replace(day=1)
        prev_last = primero - timedelta(days=1)
        refs["mes_anterior"] = {
            "desde": prev_last.replace(day=1).isoformat(),
            "hasta": prev_last.isoformat(),
        }
    return refs


def next_ventas_run_ar(now: datetime | None = None) -> datetime:
    """Próxima ingesta programada del Informe de Ventas (hora AR)."""
    now = now or datetime.now(AR_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=AR_TZ)
    else:
        now = now.astimezone(AR_TZ)
    for hour, minute in VENTAS_RUN_SLOTS_AR:
        slot = datetime.combine(now.date(), time(hour, minute), AR_TZ)
        if slot > now:
            return slot
    return datetime.combine(now.date() + timedelta(days=1), time(*VENTAS_RUN_SLOTS_AR[0]), AR_TZ)


# ─── Agregación ───────────────────────────────────────────────────────────────

def _normalize_vendedor_display(nombre_raw: str, erp_name_map: dict[str, str]) -> str:
    v = (nombre_raw or "").strip()
    if not v or v.lower() in ("sin vendedor", "sin vendedor."):
        return SIN_VENDEDOR_LABEL
    return erp_name_map.get(v.lower(), v)


def _unidades_linea(row: dict, bultos: float) -> float:
    """
    Unidades por línea según reglas de volumen:
    encendedor → 1 bulto = 1 unidad (signed, devoluciones restan);
    líneas convertidas (cig/papelillo/mix) → unidades_total del Excel; resto 0.
    """
    kind = classify_volumen(
        row.get("agrupacion_art_2") or "",
        row.get("descripcion_articulo") or "",
        "",
        unidades_total=float(row.get("unidades_total") or 0),
        bultos_excel=bultos,
    )
    if kind == "encendedor_raw":
        return bultos
    if volumen_es_convertido(kind):
        return float(row.get("unidades_total") or 0)
    return 0.0


def aggregate_avance_lines(
    lines: list[dict],
    *,
    erp_name_map: dict[str, str] | None = None,
    sucursal_norm: str = "",
    vend_branch: Optional[Set[str]] = None,
    vendedor_norm: str = "",
    cod_articulo_hints: dict[str, str] | None = None,
) -> dict:
    """
    Agrega líneas ventas_enriched (ya deduplicadas) a estructura de avance.
    Filtra recaudaciones (_es_operacion_bultos_neto); devoluciones netas restan.
    `vendedor_norm == "__sin_vendedor__"` filtra solo el bucket sin vendedor.
    """
    from services.estadisticas_service import _es_operacion_bultos_neto

    erp_name_map = erp_name_map or {}
    hints = cod_articulo_hints or build_cod_articulo_hints(lines)
    resolver = SkuKeyResolver()

    total_bultos = 0.0
    total_unidades = 0.0
    clientes: set[str] = set()
    comprobantes: set[tuple] = set()
    por_vendedor: dict[str, dict] = {}
    por_sku: dict[str, dict] = {}
    por_agrupacion: dict[str, dict] = {}
    clientes_por_sku: dict[str, dict[str, dict]] = {}
    por_cliente: dict[str, dict] = {}

    for row in lines:
        tipo = (row.get("tipo_documento") or "").strip()
        imp = float(row.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp):
            continue

        v_raw = (row.get("nombre_vendedor") or "").strip()
        v_disp = _normalize_vendedor_display(v_raw, erp_name_map)

        if vendedor_norm:
            if vendedor_norm == "__sin_vendedor__":
                if v_disp != SIN_VENDEDOR_LABEL:
                    continue
            elif v_raw.lower() != vendedor_norm and v_disp.lower() != vendedor_norm:
                continue

        if sucursal_norm and vend_branch is not None and v_disp not in vend_branch:
            # Mismo fallback que supervision_ventas: ruta / agrupación con nombre sucursal.
            ruta = (row.get("ruta") or "").strip().lower()
            agr1 = (row.get("agrupacion_art_1") or "").strip().lower()
            if sucursal_norm not in ruta and sucursal_norm not in agr1:
                continue

        bultos = float(row.get("bultos_total") or 0)
        unidades = _unidades_linea(row, bultos)

        fecha = str(row.get("fecha_factura") or "")[:10]
        num = (row.get("numero_documento") or "").strip()
        erp_cli = (row.get("id_cliente_erp") or "").strip()
        nombre_cli = (row.get("nombre_cliente") or "").strip()
        cliente_key = erp_cli or nombre_cli
        cod_raw = (row.get("cod_articulo") or "").strip()
        desc_raw = (row.get("descripcion_articulo") or "").strip()
        agr2 = (row.get("agrupacion_art_2") or "").strip() or "Sin agrupación"
        cod, desc = enrich_sku_identity(cod_raw, desc_raw, hints=hints)

        total_bultos += bultos
        total_unidades += unidades
        if cliente_key:
            clientes.add(cliente_key)
        comprobantes.add((fecha, tipo, num, erp_cli))

        vb = por_vendedor.setdefault(v_disp, {"bultos": 0.0, "unidades": 0.0})
        vb["bultos"] += bultos
        vb["unidades"] += unidades

        sku_key = resolver.resolve(cod, desc, agr2)
        sk = por_sku.setdefault(
            sku_key,
            {
                "cod_articulo": "",
                "articulo": "Artículo sin descripción",
                "agrupacion": agr2,
                "bultos": 0.0,
                "unidades": 0.0,
                "clientes": set(),
            },
        )
        merge_sku_bucket(sk, cod=cod, desc=desc, agrupacion=agr2)
        sk["bultos"] += bultos
        sk["unidades"] += unidades
        if cliente_key:
            sk["clientes"].add(cliente_key)

        ag = por_agrupacion.setdefault(agr2, {"bultos": 0.0, "unidades": 0.0})
        ag["bultos"] += bultos
        ag["unidades"] += unidades

        if cliente_key:
            cli_bucket = clientes_por_sku.setdefault(sku_key, {})
            cb = cli_bucket.setdefault(
                cliente_key,
                {"cliente": nombre_cli or cliente_key, "id_cliente_erp": erp_cli or None, "bultos": 0.0, "unidades": 0.0},
            )
            cb["bultos"] += bultos
            cb["unidades"] += unidades

            # Mix por cliente (R8 auditoría): volumen total + bultos por SKU.
            pc = por_cliente.setdefault(
                cliente_key,
                {
                    "cliente": nombre_cli or cliente_key,
                    "id_cliente_erp": erp_cli or None,
                    "bultos": 0.0,
                    "unidades": 0.0,
                    "skus": {},
                },
            )
            pc["bultos"] += bultos
            pc["unidades"] += unidades
            pc["skus"][sku_key] = pc["skus"].get(sku_key, 0.0) + bultos

    return {
        "total_bultos": total_bultos,
        "total_unidades": total_unidades,
        "clientes": clientes,
        "comprobantes": len(comprobantes),
        "por_vendedor": por_vendedor,
        "por_sku": por_sku,
        "por_agrupacion": por_agrupacion,
        "clientes_por_sku": clientes_por_sku,
        "por_cliente": por_cliente,
        "_sku_resolver": resolver,
        "_cod_articulo_hints": hints,
    }


def build_delta_kpi(actual: float, anterior: float | None, *, disponible: bool = True) -> dict:
    """DeltaKpi: diff / pct / anterior / disponible. pct None si referencia 0 o sin dato."""
    if not disponible or anterior is None:
        return {"diff": 0, "pct": None, "anterior": None, "disponible": False}
    diff = round(actual - anterior, 2)
    pct = round((actual - anterior) / anterior * 100, 1) if anterior else None
    return {"diff": diff, "pct": pct, "anterior": round(anterior, 2), "disponible": True}


# ─── Fetch ────────────────────────────────────────────────────────────────────

def _fetch_avance_lines(dist_id: int, desde: str, hasta: str) -> list[dict]:
    """Líneas enriched del rango con aislamiento tenant + dedupe (paginado 1000)."""
    from core.ventas_enriched_tenant import (
        apply_ventas_tenant_filters,
        build_ventas_read_context,
        filter_ventas_rows_for_tenant,
    )
    from services.estadisticas_service import (
        _dedupe_ventas_enriched_lines,
        _ventas_enriched_query_order,
    )

    ventas_ctx = build_ventas_read_context(dist_id)
    t_ventas = ventas_ctx["table_name"]
    select_cols = _VENTAS_SELECT_COLS + ",ruta"

    rows: list[dict] = []
    offset = 0
    while True:
        q = (
            sb.table(t_ventas)
            .select(select_cols)
            .eq("anulado", False)
            .gte("fecha_factura", desde)
            .lte("fecha_factura", hasta)
        )
        q = apply_ventas_tenant_filters(q, ventas_ctx)
        batch = (
            _ventas_enriched_query_order(q)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    rows = filter_ventas_rows_for_tenant(rows, ventas_ctx)
    return _dedupe_ventas_enriched_lines(rows)


def _pick_best_catalog_ventas_row(rows: list[dict]) -> dict | None:
    """Mejor descripción por cod_articulo (evita articulo=cod si hay nombre comercial en 12m)."""
    if not rows:
        return None
    best = rows[0]
    best_score = -1
    for row in rows:
        desc = (row.get("descripcion_articulo") or "").strip()
        score = len(normalize_sku_description(desc))
        if score > best_score:
            best_score = score
            best = row
    return best


def _catalogo_window(hasta: str) -> tuple[str, str]:
    """Ventana catálogo: 12 meses calendario hasta el mes del período (estable para cache)."""
    h = _parse_fecha(hasta)
    desde = _shift_month_clamped(h.replace(day=1), -(CATALOGO_MESES - 1))
    return desde.isoformat(), h.isoformat()


def _fetch_catalogo_skus(dist_id: int, hasta: str) -> list[dict]:
    """
    SKUs distintos (cod_articulo, articulo, agrupacion) en la ventana de 12 meses.

    PostgREST no soporta DISTINCT y el scan completo es inviable (30k–100k filas),
    así que se descubre por keyset: pedir el menor cod_articulo > último visto.
    Catálogos reales ~25-30 SKUs → ~30 requests livianos, cacheados con TTL.
    Solo incluye SKUs con cod_articulo no vacío (los sin código entran igual al
    ranking vía las líneas del período).
    """
    from core.ventas_enriched_tenant import (
        apply_ventas_tenant_filters,
        build_ventas_read_context,
        filter_ventas_rows_for_tenant,
    )

    desde_cat, hasta_cat = _catalogo_window(hasta)
    cache_key = (dist_id, desde_cat, hasta_cat)
    cached = _catalogo_cache.get(cache_key)
    if cached and monotonic() - cached[0] < CATALOGO_CACHE_TTL_S:
        return cached[1]

    ventas_ctx = build_ventas_read_context(dist_id)
    t_ventas = ventas_ctx["table_name"]

    catalogo: list[dict] = []
    prev_cod = ""
    for _ in range(_CATALOGO_MAX_ITER):
        q = (
            sb.table(t_ventas)
            .select("cod_articulo,descripcion_articulo,agrupacion_art_2")
            .eq("anulado", False)
            .gte("fecha_factura", desde_cat)
            .lte("fecha_factura", hasta_cat)
            .gt("cod_articulo", prev_cod)
        )
        q = apply_ventas_tenant_filters(q, ventas_ctx)
        batch = (
            q.order("cod_articulo").limit(_CATALOGO_DISCOVERY_BATCH).execute().data or []
        )
        if not batch:
            break
        first_cod = (batch[0].get("cod_articulo") or "").strip()
        same_cod = [r for r in batch if (r.get("cod_articulo") or "").strip() == first_cod]
        visible = filter_ventas_rows_for_tenant(same_cod, ventas_ctx)
        row = _pick_best_catalog_ventas_row(visible) if visible else None
        if row and first_cod:
            catalogo.append(
                {
                    "cod_articulo": first_cod,
                    "articulo": (row.get("descripcion_articulo") or "").strip() or first_cod,
                    "agrupacion": (row.get("agrupacion_art_2") or "").strip() or "Sin agrupación",
                }
            )
        prev_cod = first_cod or (batch[-1].get("cod_articulo") or "").strip()
        if not prev_cod:
            break

    _catalogo_cache[cache_key] = (monotonic(), catalogo)
    return catalogo


def _sku_volumen_fields(
    bultos: float,
    agrupacion: str,
    articulo: str,
    *,
    unidades: float = 0.0,
) -> dict:
    """
    Desglose de volumen por SKU (R2): kind + bultos enteros / unidades resto.
    Cig/papelillo/mix: parte desde unidades agregadas (fuente ERP). Encendedor: entero 1:1.
    """
    kind = classify_volumen(
        agrupacion or "",
        articulo or "",
        "",
        unidades_total=unidades,
        bultos_excel=bultos,
    )
    out: dict = {"volumen_kind": kind}

    if kind == "encendedor_raw" and abs(bultos) > 0.005:
        qty = float(unidades) if abs(unidades) > 0.005 else float(bultos)
        sign = -1 if qty < 0 else 1
        n = int(round(abs(qty)))
        out["bultos_enteros"] = sign * n
        out["unidades_resto"] = 0
        return out

    enriched = enrich_bultos_desglose_row(bultos, kind, unidades_total=unidades)
    if "bultos_enteros" in enriched:
        out["bultos_enteros"] = enriched["bultos_enteros"]
        out["unidades_resto"] = enriched["unidades_resto"]
    return out


_CIG_KPI_KINDS = frozenset({"cig_default", "cig_mix_exhib"})


def _totales_volumen_cigarrillos(agg: dict) -> dict:
    """
    KPI card «Volumen Cigarrillos»: solo líneas convertidas de cigarrillos
    (agrupación CIGARRILLOS / mix exhibidores). Excluye papelillos y encendedores.
    """
    from core.ventas_bultos_rules import bultos_desglose_from_unidades

    bultos = 0.0
    unidades_by_kind: dict[str, float] = {"cig_default": 0.0, "cig_mix_exhib": 0.0}
    for s in (agg.get("por_sku") or {}).values():
        kind = classify_volumen(
            s.get("agrupacion") or "",
            s.get("articulo") or "",
            "",
            unidades_total=float(s.get("unidades") or 0),
            bultos_excel=float(s.get("bultos") or 0),
        )
        if kind not in _CIG_KPI_KINDS:
            continue
        bultos += float(s.get("bultos") or 0)
        unidades_by_kind[kind] += float(s.get("unidades") or 0)

    enteros = 0
    resto = 0
    for kind, u in unidades_by_kind.items():
        if abs(u) < 0.005:
            continue
        desg = bultos_desglose_from_unidades(u, kind)  # type: ignore[arg-type]
        if desg:
            e, r = desg
            enteros += int(e)
            resto += int(r)

    return {
        "bultos": round(bultos, 2),
        "bultos_enteros": enteros,
        "unidades_resto": resto,
    }


def _cartera_scope_count(
    dist_id: int,
    sucursal: str | None,
    vendedor: str | None,
) -> int | None:
    """
    PDVs visibles del padrón en el scope (denominador de penetración).
    None si no se puede resolver (penetracion_pct null en respuesta).
    """
    try:
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)

        ruta_ids: list[int] | None = None
        if vendedor and vendedor != "__sin_vendedor__":
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            erp_name_map = _get_erp_name_map(dist_id)
            vend_rows = (
                sb.table(t_vend)
                .select("id_vendedor,nombre_erp")
                .eq("id_distribuidor", dist_id)
                .execute()
                .data
                or []
            )
            needle = vendedor.strip().lower()
            vid = None
            for v in vend_rows:
                nombre = (v.get("nombre_erp") or "").strip()
                disp = erp_name_map.get(nombre.lower(), nombre)
                if nombre.lower() == needle or disp.lower() == needle:
                    vid = v.get("id_vendedor")
                    break
            if vid is None:
                return None
            t_rutas = tenant_table_name("rutas_v2", dist_id)
            rutas = (
                sb.table(t_rutas).select("id_ruta").eq("id_vendedor", int(vid)).execute().data or []
            )
            ruta_ids = [int(r["id_ruta"]) for r in rutas if r.get("id_ruta") is not None]
            if not ruta_ids:
                return 0
        elif sucursal:
            t_suc = tenant_table_name("sucursales_v2", dist_id)
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            suc_rows = (
                sb.table(t_suc)
                .select("id_sucursal,nombre_erp")
                .eq("id_distribuidor", dist_id)
                .execute()
                .data
                or []
            )
            needle = sucursal.strip().lower()
            suc_ids = {
                int(r["id_sucursal"])
                for r in suc_rows
                if (r.get("nombre_erp") or "").strip().lower() == needle
            }
            if not suc_ids:
                return None
            vend_rows = (
                sb.table(t_vend)
                .select("id_vendedor,id_sucursal")
                .eq("id_distribuidor", dist_id)
                .in_("id_sucursal", list(suc_ids))
                .execute()
                .data
                or []
            )
            vids = [int(v["id_vendedor"]) for v in vend_rows if v.get("id_vendedor") is not None]
            if not vids:
                return 0
            t_rutas = tenant_table_name("rutas_v2", dist_id)
            ruta_ids = []
            for i in range(0, len(vids), 200):
                rutas = (
                    sb.table(t_rutas)
                    .select("id_ruta")
                    .in_("id_vendedor", vids[i : i + 200])
                    .execute()
                    .data
                    or []
                )
                ruta_ids.extend(int(r["id_ruta"]) for r in rutas if r.get("id_ruta") is not None)
            if not ruta_ids:
                return 0

        total = 0
        if ruta_ids is None:
            res = (
                sb.table(t_clientes)
                .select("id_cliente", count="exact")
                .eq("id_distribuidor", dist_id)
                .or_(_PADRON_VISIBLE_OR)
                .execute()
            )
            return res.count or 0
        for i in range(0, len(ruta_ids), 200):
            res = (
                sb.table(t_clientes)
                .select("id_cliente", count="exact")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids[i : i + 200])
                .or_(_PADRON_VISIBLE_OR)
                .execute()
            )
            total += res.count or 0
        return total
    except Exception as e:
        logger.warning("[avance-ventas] cartera scope dist=%s: %s", dist_id, e)
        return None


def _ventas_sync_info(dist_id: int) -> dict:
    """
    Frescura del motor ventas_enriched (R3): última sync OK + último intento
    (cualquier estado) + zombies en_curso >2h. El badge FE muestra ambos para
    no mentir frescura cuando una corrida quedó colgada o falló.
    """
    info: dict = {
        "last_updated": None,
        "last_run_ok_at": None,
        "last_attempt_at": None,
        "last_run_estado": None,
        "has_zombie": False,
        "next_run_hint": next_ventas_run_ar().isoformat(),
    }
    try:
        run_ok = (
            sb.table("motor_runs")
            .select("finalizado_en,iniciado_en")
            .eq("motor", "ventas_enriched")
            .eq("dist_id", dist_id)
            .eq("estado", "ok")
            .order("finalizado_en", desc=True)
            .limit(1)
            .execute()
        )
        if run_ok.data:
            row = run_ok.data[0]
            info["last_run_ok_at"] = row.get("finalizado_en") or row.get("iniciado_en")
            info["last_updated"] = info["last_run_ok_at"]

        run_any = (
            sb.table("motor_runs")
            .select("iniciado_en,finalizado_en,estado,registros")
            .eq("motor", "ventas_enriched")
            .eq("dist_id", dist_id)
            .order("iniciado_en", desc=True)
            .limit(1)
            .execute()
        )
        if run_any.data:
            row = run_any.data[0]
            info["last_attempt_at"] = row.get("iniciado_en") or row.get("finalizado_en")
            estado = row.get("estado")
            regs = row.get("registros")
            if isinstance(regs, str):
                try:
                    import json

                    regs = json.loads(regs)
                except Exception:
                    regs = None
            if estado == "ok" and isinstance(regs, dict) and regs.get("sin_cambios"):
                estado = "sin_cambios"
            info["last_run_estado"] = estado
            attempt_ts = row.get("finalizado_en") or row.get("iniciado_en")
            if row.get("estado") == "ok" and attempt_ts:
                if not info["last_run_ok_at"] or str(attempt_ts) > str(info["last_run_ok_at"]):
                    info["last_run_ok_at"] = attempt_ts
                    info["last_updated"] = attempt_ts

        from datetime import timezone

        two_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        zombie = (
            sb.table("motor_runs")
            .select("id_run", count="exact")
            .eq("motor", "ventas_enriched")
            .eq("dist_id", dist_id)
            .eq("estado", "en_curso")
            .lt("iniciado_en", two_hours_ago)
            .execute()
        )
        info["has_zombie"] = (zombie.count or 0) > 0
    except Exception as e:
        logger.debug("[avance-ventas] sync motor_runs dist=%s: %s", dist_id, e)
    return info


# ─── Builders de respuesta ────────────────────────────────────────────────────

def _build_delta_sku_resolver(
    agg: dict,
    catalogo: list[dict] | None,
    agg_refs: dict[str, dict | None],
    *,
    hints: dict[str, str],
) -> SkuKeyResolver:
    """Resolver compartido actual + referencias + catálogo (deltas WoW/MoM)."""
    resolver = SkuKeyResolver()
    seed_sku_resolver(resolver, list((agg.get("por_sku") or {}).values()), hints=hints)
    if catalogo:
        seed_sku_resolver(resolver, catalogo, hints=hints)
    for ref_agg in agg_refs.values():
        if ref_agg:
            seed_sku_resolver(
                resolver, list((ref_agg.get("por_sku") or {}).values()), hints=hints
            )
    return resolver


def _bultos_por_canon_en_agg(
    agg: dict,
    *,
    hints: dict[str, str] | None = None,
    resolver: SkuKeyResolver | None = None,
) -> dict[str, float]:
    """Bultos del período indexados por clave canónica (deltas entre semanas/meses)."""
    hints = hints or agg.get("_cod_articulo_hints") or {}
    if resolver is None:
        resolver = agg.get("_sku_resolver")
    if resolver is None:
        resolver = SkuKeyResolver()
        seed_sku_resolver(resolver, list(agg.get("por_sku") or {}).values(), hints=hints)
    out: dict[str, float] = {}
    for _sku_key, s in (agg.get("por_sku") or {}).items():
        cod, art = enrich_sku_identity(
            s.get("cod_articulo") or "",
            s.get("articulo") or "",
            hints=hints,
        )
        canon = resolver.canonical(
            resolver.resolve(cod, art, s.get("agrupacion") or "")
        )
        out[canon] = round(out.get(canon, 0.0) + float(s.get("bultos") or 0), 4)
    return out


def _row_canon_key(
    row: dict,
    resolver: SkuKeyResolver,
    hints: dict[str, str],
) -> str:
    raw = row.get("sku_key")
    if raw:
        return resolver.canonical(str(raw))
    cod, art = enrich_sku_identity(
        row.get("cod_articulo") or "",
        row.get("articulo") or "",
        hints=hints,
    )
    return resolver.canonical(
        resolver.resolve(cod, art, row.get("agrupacion") or "")
    )


def _catalog_tiene_venta_en_periodo(
    resolver: SkuKeyResolver,
    por_sku: dict,
    *,
    cod_e: str,
    art_e: str,
    agr_c: str,
    hints: dict[str, str],
) -> bool:
    """True si el SKU de catálogo ya tiene volumen en el período (misma unificación)."""
    cat_canon = resolver.canonical(resolver.resolve(cod_e, art_e, agr_c))
    bultos = 0.0
    for sku_key, s in por_sku.items():
        if resolver.canonical(str(sku_key)) == cat_canon:
            bultos += abs(float(s.get("bultos") or 0))
            continue
        cod_s, art_s = enrich_sku_identity(
            s.get("cod_articulo") or "",
            s.get("articulo") or "",
            hints=hints,
        )
        if resolver.is_same_product(
            cod_e, art_e, agr_c, cod_s, art_s, s.get("agrupacion") or ""
        ):
            bultos += abs(float(s.get("bultos") or 0))
            continue
        raw_counts = s.get("_cod_counts")
        if not raw_counts:
            continue
        for counted_cod in raw_counts:
            cod_c, art_c = enrich_sku_identity(str(counted_cod), "", hints=hints)
            if resolver.is_same_product(
                cod_e, art_e, agr_c, cod_c, art_c, s.get("agrupacion") or ""
            ):
                bultos += abs(float(s.get("bultos") or 0))
                break
    return bultos > 0.005


def _sku_rows_from_agg(
    agg: dict,
    cartera_count: int | None,
    catalogo: list[dict] | None = None,
) -> list[dict]:
    """
    Filas SKU del período + left-join con catálogo 12m (R1): los SKUs del
    catálogo sin líneas en el período entran con ceros y `sin_venta=True`.
    Orden: con venta por bultos desc (empate por nombre), sin venta al final
    alfabético.
    """
    resolver: SkuKeyResolver | None = agg.get("_sku_resolver")
    hints: dict[str, str] = agg.get("_cod_articulo_hints") or {}
    por_sku = agg.get("por_sku") or {}

    rows = []
    for sku_key, s in por_sku.items():
        n_cli = len(s["clientes"])
        bultos = round(s["bultos"], 2)
        unidades = round(s["unidades"], 2)
        has_venta = abs(bultos) > 0.005 or abs(unidades) > 0.005
        row = {
            "sku_key": sku_key,
            "cod_articulo": s["cod_articulo"] or sku_key,
            "articulo": s["articulo"],
            "agrupacion": s["agrupacion"],
            "bultos": bultos,
            "unidades": unidades,
            "clientes": n_cli,
            "intensidad": round(s["bultos"] / n_cli, 2) if n_cli else 0.0,
            "penetracion_pct": (
                round(n_cli / cartera_count * 100, 1) if cartera_count else None
            ),
            "sin_venta": not has_venta,
            **_sku_volumen_fields(
                s["bultos"], s["agrupacion"], s["articulo"], unidades=s["unidades"]
            ),
        }
        rows.append(row)

    if catalogo:
        if not resolver:
            resolver = SkuKeyResolver()
        seed_sku_resolver(resolver, list(por_sku.values()), hints=hints)
        seed_sku_resolver(resolver, catalogo, hints=hints)
        for c in catalogo:
            cod_c = (c.get("cod_articulo") or "").strip()
            art_c = c.get("articulo") or ""
            agr_c = c.get("agrupacion") or ""
            cod_e, art_e = enrich_sku_identity(cod_c, art_c, hints=hints)
            cat_canon = resolver.canonical(resolver.resolve(cod_e, art_e, agr_c))
            if _catalog_tiene_venta_en_periodo(
                resolver,
                por_sku,
                cod_e=cod_e,
                art_e=art_e,
                agr_c=agr_c,
                hints=hints,
            ):
                continue
            rows.append(
                {
                    "sku_key": c.get("sku_key") or cat_canon,
                    "cod_articulo": c["cod_articulo"],
                    "articulo": c["articulo"],
                    "agrupacion": c["agrupacion"],
                    "bultos": 0.0,
                    "unidades": 0.0,
                    "clientes": 0,
                    "intensidad": 0.0,
                    "penetracion_pct": 0.0 if cartera_count else None,
                    "sin_venta": True,
                    **_sku_volumen_fields(
                        0.0, c["agrupacion"], c["articulo"], unidades=0.0
                    ),
                }
            )

    rows.sort(key=lambda r: (1 if r["sin_venta"] else 0, -r["bultos"], r["articulo"].lower()))
    return rows


def _fetch_padron_cliente_nombres(dist_id: int, erp_ids: list[str]) -> dict[str, dict[str, str]]:
    """Padrón PDV: nombre fantasía + razón social por id_cliente_erp (auditoría R8)."""
    if dist_id <= 0:
        return {}
    unique = sorted({(e or "").strip() for e in erp_ids if (e or "").strip()})
    if not unique:
        return {}

    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    out: dict[str, dict[str, str]] = {}
    for i in range(0, len(unique), 200):
        chunk = unique[i : i + 200]
        rows = (
            sb.table(t_clientes)
            .select("id_cliente_erp,nombre_fantasia,nombre_razon_social")
            .eq("id_distribuidor", dist_id)
            .in_("id_cliente_erp", chunk)
            .or_(_PADRON_VISIBLE_OR)
            .execute()
            .data
            or []
        )
        for row in rows:
            erp = (row.get("id_cliente_erp") or "").strip()
            if not erp:
                continue
            out[erp] = {
                "nombre_fantasia": (row.get("nombre_fantasia") or "").strip(),
                "razon_social": (row.get("nombre_razon_social") or "").strip(),
            }
    return out


def _build_auditoria_clientes(
    agg: dict,
    cartera_count: int | None,
    dist_id: int | None = None,
) -> dict:
    """
    Bloque auditoría cliente×SKU (R8): monoproducto fuerte, mix bajo y resumen
    por cliente, calculado desde las mismas líneas deduplicadas del período.
    """
    sku_meta = agg["por_sku"]
    erp_ids = [
        str(pc.get("id_cliente_erp")).strip()
        for pc in (agg.get("por_cliente") or {}).values()
        if pc.get("id_cliente_erp")
    ]
    padron = _fetch_padron_cliente_nombres(dist_id, erp_ids) if dist_id else {}

    def _mix_row(cliente_key: str, pc: dict) -> dict:
        skus = pc.get("skus") or {}
        principal_key, principal_bultos = "", 0.0
        for k, b in skus.items():
            if not principal_key or b > principal_bultos:
                principal_key, principal_bultos = k, b
        meta = sku_meta.get(principal_key) or {}
        bultos = round(pc["bultos"], 2)
        erp = (pc.get("id_cliente_erp") or "").strip() or None
        ventas_nombre = (pc.get("cliente") or cliente_key or "").strip()
        pdv = padron.get(erp or "", {})
        nombre_fantasia = pdv.get("nombre_fantasia") or ""
        razon_social = pdv.get("razon_social") or ""
        cliente_display = nombre_fantasia or ventas_nombre or razon_social or cliente_key
        return {
            "id_cliente_erp": erp,
            "cliente": cliente_display,
            "nombre_fantasia": nombre_fantasia or None,
            "razon_social": razon_social or None,
            "bultos": bultos,
            "unidades": round(pc["unidades"], 2),
            "skus_distintos": len(skus),
            "sku_principal": meta.get("articulo") or principal_key,
            "cod_sku_principal": meta.get("cod_articulo") or principal_key,
            "bultos_sku_principal": round(principal_bultos, 2),
            "pct_concentracion": (
                round(principal_bultos / pc["bultos"] * 100, 1) if pc["bultos"] > 0 else None
            ),
        }

    todos = sorted(
        (_mix_row(k, pc) for k, pc in (agg.get("por_cliente") or {}).items()),
        key=lambda r: r["bultos"],
        reverse=True,
    )
    positivos = [r for r in todos if r["bultos"] > 0]
    monoproducto = [r for r in positivos if r["skus_distintos"] == 1][:AUDITORIA_TOP_N]
    mix_bajo = [
        r for r in positivos if 2 <= r["skus_distintos"] <= MIX_BAJO_MAX_SKUS
    ][:AUDITORIA_TOP_N]

    return {
        "cartera_scope": cartera_count,
        "clientes_con_compra": len(positivos),
        "monoproducto_fuerte": monoproducto,
        "mix_bajo": mix_bajo,
        "por_cliente_resumen": todos[:AUDITORIA_RESUMEN_MAX],
        "resumen_total": len(todos),
        "resumen_truncado": len(todos) > AUDITORIA_RESUMEN_MAX,
    }


def _build_insights(sku_rows: list[dict]) -> dict:
    """Insights operativos del ranking (solo SKUs con volumen positivo)."""

    def _pick(rows: list[dict], key, reverse: bool = True) -> dict | None:
        if not rows:
            return None
        best = sorted(rows, key=key, reverse=reverse)[0]
        return {
            "cod_articulo": best["cod_articulo"],
            "articulo": best["articulo"],
            "bultos": best["bultos"],
            "unidades": best["unidades"],
            "clientes": best["clientes"],
            "intensidad": best["intensidad"],
            "penetracion_pct": best.get("penetracion_pct"),
        }

    positivos = [r for r in sku_rows if r["bultos"] > 0]
    # Concentración: volumen alto en pocos clientes → restringir a la mitad superior por bultos.
    medianos = positivos[: max(1, len(positivos) // 2)] if positivos else []
    return {
        "mas_vendido": _pick(positivos, key=lambda r: r["bultos"]),
        "menos_vendido": _pick(positivos, key=lambda r: r["bultos"], reverse=False),
        "mayor_penetracion": _pick(positivos, key=lambda r: (r["clientes"], r["bultos"])),
        "mayor_intensidad": _pick(positivos, key=lambda r: r["intensidad"]),
        "mayor_concentracion": _pick(medianos, key=lambda r: r["intensidad"]),
    }


def _drill_for_sku(agg: dict, sku_key: str) -> dict:
    """Top/bottom N clientes por bultos netos para un SKU."""
    bucket = agg["clientes_por_sku"].get(sku_key) or {}
    rows = sorted(
        (
            {
                "cliente": c["cliente"],
                "id_cliente_erp": c["id_cliente_erp"],
                "bultos": round(c["bultos"], 2),
                "unidades": round(c["unidades"], 2),
            }
            for c in bucket.values()
        ),
        key=lambda r: r["bultos"],
        reverse=True,
    )
    top = rows[:DRILL_CLIENTES_N]
    resto = rows[DRILL_CLIENTES_N:]
    bottom = resto[-DRILL_CLIENTES_N:] if resto else []
    return {"top": top, "bottom": bottom}


def build_avance_ventas(
    dist_id: int,
    modo: str,
    fecha: str,
    sucursal: str | None = None,
    vendedor: str | None = None,
    incluir_sin_venta: bool = True,
) -> dict:
    """Payload completo de Avance de Ventas para /supervision (sin importes $)."""
    if modo not in ("dia", "semana", "mes"):
        raise ValueError("modo debe ser dia | semana | mes")

    sucursal_clean = (sucursal or "").strip()
    if sucursal_clean in ("", "__all__"):
        sucursal_clean = ""
    vendedor_clean = (vendedor or "").strip()
    if vendedor_clean in ("", "__all__"):
        vendedor_clean = ""

    periodo = resolve_periodo(modo, fecha)
    refs = resolve_referencias(modo, fecha)

    erp_name_map = _get_erp_name_map(dist_id)
    sucursal_norm = sucursal_clean.lower()
    vendedor_norm = (
        "__sin_vendedor__"
        if vendedor_clean == "__sin_vendedor__"
        else vendedor_clean.lower()
    )

    vend_branch: Optional[Set[str]] = None
    if sucursal_norm:
        # Lazy import: helper canónico vive en el router (evita import circular).
        from routers.supervision import _vendor_display_names_for_sucursal_erp

        vend_branch = _vendor_display_names_for_sucursal_erp(dist_id, sucursal_clean) or set()

    def _agg_rango(
        desde: str,
        hasta: str,
        *,
        cod_hints: dict[str, str] | None = None,
    ) -> dict:
        lines = _fetch_avance_lines(dist_id, desde, hasta)
        return aggregate_avance_lines(
            lines,
            erp_name_map=erp_name_map,
            sucursal_norm=sucursal_norm,
            vend_branch=vend_branch,
            vendedor_norm=vendedor_norm,
            cod_articulo_hints=cod_hints,
        )

    # Actual + referencias + cartera + catálogo + sync en paralelo
    # (fetches PostgREST independientes).
    from concurrent.futures import ThreadPoolExecutor

    agg_refs: dict[str, dict | None] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        fut_lines = pool.submit(
            _fetch_avance_lines, dist_id, periodo["desde"], periodo["hasta"]
        )
        fut_cartera = pool.submit(
            _cartera_scope_count, dist_id, sucursal_clean or None, vendedor_clean or None
        )
        fut_catalogo = pool.submit(_fetch_catalogo_skus, dist_id, periodo["hasta"])
        fut_sync = pool.submit(_ventas_sync_info, dist_id)
        fut_ref_lines = {
            ref_key: pool.submit(
                _fetch_avance_lines, dist_id, rango["desde"], rango["hasta"]
            )
            for ref_key, rango in refs.items()
        }
        lines_actual = fut_lines.result()
        lines_for_hints = list(lines_actual)
        for fut in fut_ref_lines.values():
            try:
                lines_for_hints.extend(fut.result())
            except Exception as e:
                logger.warning("[avance-ventas] líneas referencia hints dist=%s: %s", dist_id, e)
        try:
            catalogo = fut_catalogo.result()
        except Exception as e:
            logger.warning("[avance-ventas] catálogo 12m dist=%s: %s", dist_id, e)
            catalogo = None
        sku_hints = build_cod_articulo_hints(lines_for_hints, catalogo)
        if catalogo:
            catalogo = unify_catalog_entries(catalogo, hints=sku_hints)
        fut_refs = {
            ref_key: pool.submit(
                _agg_rango,
                rango["desde"],
                rango["hasta"],
                cod_hints=sku_hints,
            )
            for ref_key, rango in refs.items()
        }
        agg = aggregate_avance_lines(
            lines_actual,
            erp_name_map=erp_name_map,
            sucursal_norm=sucursal_norm,
            vend_branch=vend_branch,
            vendedor_norm=vendedor_norm,
            cod_articulo_hints=sku_hints,
        )
        for ref_key, fut in fut_refs.items():
            try:
                ref_agg = fut.result()
                agg_refs[ref_key] = ref_agg if ref_agg["comprobantes"] > 0 else None
            except Exception as e:
                logger.warning(
                    "[avance-ventas] referencia %s dist=%s: %s", ref_key, dist_id, e
                )
                agg_refs[ref_key] = None
        try:
            cartera_count = fut_cartera.result()
        except Exception as e:
            logger.warning("[avance-ventas] cartera dist=%s: %s", dist_id, e)
            cartera_count = None
        try:
            sync_info = fut_sync.result()
        except Exception as e:
            logger.debug("[avance-ventas] sync dist=%s: %s", dist_id, e)
            sync_info = {"last_updated": None, "next_run_hint": next_ventas_run_ar().isoformat()}

    # ── Ranking SKUs: período + left-join catálogo 12m (R1) ─────────────────
    sku_rows_full = _sku_rows_from_agg(agg, cartera_count, catalogo)
    sku_rows = (
        sku_rows_full
        if incluir_sin_venta
        else [r for r in sku_rows_full if not r["sin_venta"]]
    )
    n_sin_venta = sum(1 for r in sku_rows_full if r["sin_venta"])

    # ── Metadatos + comparativas ────────────────────────────────────────────
    metadatos = {
        "total_bultos": round(agg["total_bultos"], 2),
        "total_unidades": round(agg["total_unidades"], 2),
        "clientes_compra": len(agg["clientes"]),
        "skus_activos": sum(1 for s in agg["por_sku"].values() if abs(s["bultos"]) > 0),
        "comprobantes": agg["comprobantes"],
        "skus_catalogo": len(sku_rows_full),
        "skus_sin_venta": n_sin_venta,
    }

    def _comparativa_bloque(ref_agg: dict | None, rango: dict | None) -> dict:
        disponible = ref_agg is not None
        bloque = {
            "disponible": disponible,
            "periodo": rango,
            "bultos": build_delta_kpi(
                agg["total_bultos"],
                ref_agg["total_bultos"] if disponible else None,
                disponible=disponible,
            ),
            "unidades": build_delta_kpi(
                agg["total_unidades"],
                ref_agg["total_unidades"] if disponible else None,
                disponible=disponible,
            ),
            "clientes": build_delta_kpi(
                len(agg["clientes"]),
                len(ref_agg["clientes"]) if disponible else None,
                disponible=disponible,
            ),
            "skus": build_delta_kpi(
                metadatos["skus_activos"],
                sum(1 for s in ref_agg["por_sku"].values() if abs(s["bultos"]) > 0)
                if disponible
                else None,
                disponible=disponible,
            ),
            "comprobantes": build_delta_kpi(
                agg["comprobantes"],
                ref_agg["comprobantes"] if disponible else None,
                disponible=disponible,
            ),
        }
        return bloque

    comparativas = {
        key: _comparativa_bloque(agg_refs.get(key), refs.get(key)) for key in refs
    }

    # KPI cards: wow/mom en día; semana/mes mapean su única referencia.
    delta_primary_key = {
        "dia": ("wow", "mom"),
        "semana": ("semana_anterior", None),
        "mes": (None, "mes_anterior"),
    }[modo]

    def _delta_for(metric: str, ref_key: str | None) -> dict | None:
        if not ref_key:
            return None
        bloque = comparativas.get(ref_key)
        return bloque.get(metric) if bloque else None

    cobertura_pct = (
        round(metadatos["clientes_compra"] / cartera_count * 100, 1)
        if cartera_count and cartera_count > 0
        else None
    )

    cig_actual = _totales_volumen_cigarrillos(agg)

    def _cig_bultos_delta(ref_key: str | None) -> dict | None:
        if not ref_key:
            return None
        ref_agg = agg_refs.get(ref_key)
        if not ref_agg:
            return build_delta_kpi(cig_actual["bultos"], None, disponible=False)
        ref_cig = _totales_volumen_cigarrillos(ref_agg)
        return build_delta_kpi(
            cig_actual["bultos"],
            ref_cig["bultos"],
            disponible=True,
        )

    kpis_cards = [
        {
            "id": "volumen",
            "valor": cig_actual["bultos"],
            "extra": {
                "bultos_enteros": cig_actual["bultos_enteros"],
                "unidades_resto": cig_actual["unidades_resto"],
                "scope": "cigarrillos",
            },
            "wow": _cig_bultos_delta(delta_primary_key[0]),
            "mom": _cig_bultos_delta(delta_primary_key[1]),
        },
        {
            "id": "cobertura_pdvs",
            "valor": cobertura_pct if cobertura_pct is not None else 0.0,
            "extra": {
                "disponible": bool(cartera_count and cartera_count > 0),
                "cartera": cartera_count or 0,
                "con_compra": metadatos["clientes_compra"],
            },
            "wow": None,
            "mom": None,
        },
        {
            "id": "clientes",
            "valor": metadatos["clientes_compra"],
            "wow": _delta_for("clientes", delta_primary_key[0]),
            "mom": _delta_for("clientes", delta_primary_key[1]),
        },
        {
            "id": "skus",
            "valor": metadatos["skus_activos"],
            "wow": _delta_for("skus", delta_primary_key[0]),
            "mom": _delta_for("skus", delta_primary_key[1]),
        },
    ]

    # ── Share vendedores (solo scope "todos") ───────────────────────────────
    share_vendedores = None
    if not vendedor_norm:
        total_b = agg["total_bultos"] or 0.0
        share_vendedores = sorted(
            (
                {
                    "vendedor": v,
                    "bultos": round(d["bultos"], 2),
                    "unidades": round(d["unidades"], 2),
                    "pct_bultos": round(d["bultos"] / total_b * 100, 1) if total_b else 0.0,
                }
                for v, d in agg["por_vendedor"].items()
            ),
            key=lambda r: r["bultos"],
            reverse=True,
        )

    # ── Deltas por SKU (clave canónica — mismo producto entre períodos) ─────
    delta_resolver = _build_delta_sku_resolver(
        agg, catalogo, agg_refs, hints=sku_hints
    )

    def _ref_sku_bultos_canon(ref_key: str | None) -> dict[str, float] | None:
        if not ref_key:
            return None
        ref_agg = agg_refs.get(ref_key)
        if not ref_agg:
            return None
        return _bultos_por_canon_en_agg(
            ref_agg, hints=sku_hints, resolver=delta_resolver
        )

    wow_sku = _ref_sku_bultos_canon(delta_primary_key[0])
    mom_sku = _ref_sku_bultos_canon(delta_primary_key[1])

    # Tabla completa, sin cap (R1) — el cap defensivo queda solo en series gráficas.
    ranking_skus = []
    for r in sku_rows:
        item = {k: v for k, v in r.items() if k != "sku_key"}
        canon = _row_canon_key(r, delta_resolver, sku_hints)
        if wow_sku is not None:
            item["wow_bultos"] = build_delta_kpi(
                r["bultos"],
                wow_sku.get(canon, 0.0),
                disponible=True,
            )
        if mom_sku is not None:
            item["mom_bultos"] = build_delta_kpi(
                r["bultos"],
                mom_sku.get(canon, 0.0),
                disponible=True,
            )
        ranking_skus.append(item)

    # ── Series para gráficos (carrusel FE — sin por_agrupacion, reemplazado por cobertura) ──
    scatter = [
        {
            "sku": r["articulo"],
            "cod_articulo": r["cod_articulo"],
            "clientes": r["clientes"],
            "bultos": r["bultos"],
            "intensidad": r["intensidad"],
        }
        for r in sku_rows[:RANKING_MAX_SKUS]
        if r["bultos"] > 0
    ]
    heatmap = []
    for r in sku_rows[:HEATMAP_TOP_SKUS]:
        if r["sin_venta"]:
            continue
        canon = _row_canon_key(r, delta_resolver, sku_hints)
        heatmap.append(
            {
                "sku": r["articulo"],
                "cod_articulo": r["cod_articulo"],
                "actual": r["bultos"],
                "ref_wow": round(wow_sku.get(canon, 0.0), 2) if wow_sku is not None else None,
                "ref_mom": round(mom_sku.get(canon, 0.0), 2) if mom_sku is not None else None,
            }
        )

    # ── Convivencia SKU: % del catálogo 12m con al menos 1 venta en el período ──
    n_con_venta = len(sku_rows_full) - n_sin_venta
    convivencia_skus = {
        "disponible": catalogo is not None,
        "catalogo": len(sku_rows_full),
        "con_venta": n_con_venta,
        "sin_venta": n_sin_venta,
        "pct_convivencia": (
            round(n_con_venta / len(sku_rows_full) * 100, 1) if sku_rows_full else None
        ),
    }

    # ── Cobertura PDV: % de la cartera (padrón visible) con compra en el período ──
    clientes_compra = int(metadatos.get("clientes_compra") or 0)
    cobertura_pdvs = {
        "disponible": bool(cartera_count and cartera_count > 0),
        "cartera": cartera_count or 0,
        "con_compra": clientes_compra,
        "sin_compra": max(0, (cartera_count or 0) - clientes_compra),
        "pct_cobertura": (
            round(clientes_compra / cartera_count * 100, 1)
            if cartera_count and cartera_count > 0
            else None
        ),
    }

    # ── Drill clientes (precalculado top 20 SKUs) ───────────────────────────
    drill = {
        r["cod_articulo"]: _drill_for_sku(agg, r["sku_key"])
        for r in sku_rows[:DRILL_TOP_SKUS]
    }

    return {
        "modo": modo,
        "fecha_ancla": str(fecha)[:10],
        "periodo": periodo,
        "sync": sync_info,
        "filtros": {
            "sucursal": sucursal_clean or None,
            "vendedor": vendedor_clean or None,
            "incluir_sin_venta": incluir_sin_venta,
        },
        "cartera_scope": cartera_count,
        "metadatos": metadatos,
        "comparativas": comparativas,
        "kpis_cards": kpis_cards,
        "share_vendedores": share_vendedores,
        "ranking_skus": ranking_skus,
        "insights": _build_insights(sku_rows),
        "series": {
            "scatter_penetracion_intensidad": scatter,
            "heatmap_top_skus": heatmap,
            "convivencia_skus": convivencia_skus,
            "cobertura_pdvs": cobertura_pdvs,
        },
        "auditoria_clientes": _build_auditoria_clientes(agg, cartera_count, dist_id),
        "drill_clientes_por_sku": drill,
    }


def build_avance_ventas_sku_clientes(
    dist_id: int,
    cod_articulo: str,
    modo: str,
    fecha: str,
    sucursal: str | None = None,
    vendedor: str | None = None,
    limit: int = DRILL_CLIENTES_PAGE,
    offset: int = 0,
) -> dict:
    """
    Drill bajo demanda de un SKU: top/bottom (compat) + lista completa de
    clientes paginada (R8 — auditoría al 100%, suma de la lista = bultos del
    ranking para el mismo scope).
    """
    if modo not in ("dia", "semana", "mes"):
        raise ValueError("modo debe ser dia | semana | mes")

    sucursal_clean = (sucursal or "").strip()
    if sucursal_clean in ("", "__all__"):
        sucursal_clean = ""
    vendedor_clean = (vendedor or "").strip()
    if vendedor_clean in ("", "__all__"):
        vendedor_clean = ""

    periodo = resolve_periodo(modo, fecha)
    erp_name_map = _get_erp_name_map(dist_id)

    vend_branch: Optional[Set[str]] = None
    if sucursal_clean:
        from routers.supervision import _vendor_display_names_for_sucursal_erp

        vend_branch = _vendor_display_names_for_sucursal_erp(dist_id, sucursal_clean) or set()

    lines = _fetch_avance_lines(dist_id, periodo["desde"], periodo["hasta"])
    cod_norm = (cod_articulo or "").strip()
    hints = build_cod_articulo_hints(lines)
    unify_key = resolve_unify_key_from_ref(lines, cod_norm, hints=hints)
    lines = [r for r in lines if row_matches_unify_key(r, unify_key, hints=hints)]
    agg = aggregate_avance_lines(
        lines,
        erp_name_map=erp_name_map,
        sucursal_norm=sucursal_clean.lower(),
        vend_branch=vend_branch,
        vendedor_norm=(
            "__sin_vendedor__"
            if vendedor_clean == "__sin_vendedor__"
            else vendedor_clean.lower()
        ),
        cod_articulo_hints=hints,
    )
    drill_key = unify_key if unify_key in agg["clientes_por_sku"] else next(iter(agg["clientes_por_sku"]), None)
    drill = _drill_for_sku(agg, drill_key) if drill_key else {"top": [], "bottom": []}

    # Lista completa ordenada por bultos desc, paginada (auditoría 100%).
    bucket = (agg["clientes_por_sku"].get(drill_key) if drill_key else None) or {}
    todos = sorted(
        (
            {
                "cliente": c["cliente"],
                "id_cliente_erp": c["id_cliente_erp"],
                "bultos": round(c["bultos"], 2),
                "unidades": round(c["unidades"], 2),
            }
            for c in bucket.values()
        ),
        key=lambda r: r["bultos"],
        reverse=True,
    )
    limit = max(1, min(int(limit or DRILL_CLIENTES_PAGE), 200))
    offset = max(0, int(offset or 0))
    return {
        "cod_articulo": cod_norm,
        "modo": modo,
        "periodo": periodo,
        "clientes": todos[offset : offset + limit],
        "total": len(todos),
        "total_bultos": round(sum(r["bultos"] for r in todos), 2),
        "limit": limit,
        "offset": offset,
        **drill,
    }


def build_avance_ventas_cliente_skus(
    dist_id: int,
    id_cliente_erp: str,
    modo: str,
    fecha: str,
    sucursal: str | None = None,
    vendedor: str | None = None,
) -> dict:
    """
    Drill inverso (R8): SKUs que compró un cliente en el período, con
    bultos/unidades + desglose de volumen. Mismas líneas deduplicadas que el
    payload principal — la suma por cliente cierra contra el ranking.
    """
    if modo not in ("dia", "semana", "mes"):
        raise ValueError("modo debe ser dia | semana | mes")

    sucursal_clean = (sucursal or "").strip()
    if sucursal_clean in ("", "__all__"):
        sucursal_clean = ""
    vendedor_clean = (vendedor or "").strip()
    if vendedor_clean in ("", "__all__"):
        vendedor_clean = ""

    periodo = resolve_periodo(modo, fecha)
    erp_name_map = _get_erp_name_map(dist_id)

    vend_branch: Optional[Set[str]] = None
    if sucursal_clean:
        from routers.supervision import _vendor_display_names_for_sucursal_erp

        vend_branch = _vendor_display_names_for_sucursal_erp(dist_id, sucursal_clean) or set()

    lines = _fetch_avance_lines(dist_id, periodo["desde"], periodo["hasta"])
    agg = aggregate_avance_lines(
        lines,
        erp_name_map=erp_name_map,
        sucursal_norm=sucursal_clean.lower(),
        vend_branch=vend_branch,
        vendedor_norm=(
            "__sin_vendedor__"
            if vendedor_clean == "__sin_vendedor__"
            else vendedor_clean.lower()
        ),
    )

    cliente_key = (id_cliente_erp or "").strip()
    pc = (agg.get("por_cliente") or {}).get(cliente_key)
    skus_out: list[dict] = []
    if pc:
        for sku_key, bultos in pc["skus"].items():
            meta = agg["por_sku"].get(sku_key) or {}
            cli_vol = (agg["clientes_por_sku"].get(sku_key) or {}).get(cliente_key) or {}
            articulo = meta.get("articulo") or sku_key
            agrupacion = meta.get("agrupacion") or ""
            skus_out.append(
                {
                    "cod_articulo": meta.get("cod_articulo") or sku_key,
                    "articulo": articulo,
                    "agrupacion": agrupacion,
                    "bultos": round(bultos, 2),
                    "unidades": round(float(cli_vol.get("unidades") or 0), 2),
                    **_sku_volumen_fields(
                        bultos,
                        agrupacion,
                        articulo,
                        unidades=float(cli_vol.get("unidades") or 0),
                    ),
                }
            )
        skus_out.sort(key=lambda r: r["bultos"], reverse=True)

    return {
        "id_cliente_erp": cliente_key,
        "cliente": (pc or {}).get("cliente") or cliente_key,
        "modo": modo,
        "periodo": periodo,
        "skus": skus_out,
        "total_bultos": round((pc or {}).get("bultos", 0.0), 2),
        "total_unidades": round((pc or {}).get("unidades", 0.0), 2),
    }
