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

from core.helpers import _get_erp_name_map
from core.tenant_tables import tenant_table_name
from core.ventas_bultos_rules import classify_volumen, volumen_es_convertido
from db import sb

logger = logging.getLogger("ShelfyAPI")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Ingestas Informe de Ventas Consolido (hora AR) — ver CLAUDE.md §7 RPA.
VENTAS_RUN_SLOTS_AR = ((9, 30), (13, 0), (17, 0), (21, 0))

SIN_VENDEDOR_LABEL = "Sin vendedor"

PAGE = 1000
RANKING_MAX_SKUS = 150
HEATMAP_TOP_SKUS = 15
DRILL_TOP_SKUS = 20
DRILL_CLIENTES_N = 10

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
) -> dict:
    """
    Agrega líneas ventas_enriched (ya deduplicadas) a estructura de avance.
    Filtra recaudaciones (_es_operacion_bultos_neto); devoluciones netas restan.
    `vendedor_norm == "__sin_vendedor__"` filtra solo el bucket sin vendedor.
    """
    from services.estadisticas_service import _es_operacion_bultos_neto

    erp_name_map = erp_name_map or {}

    total_bultos = 0.0
    total_unidades = 0.0
    clientes: set[str] = set()
    comprobantes: set[tuple] = set()
    por_vendedor: dict[str, dict] = {}
    por_sku: dict[str, dict] = {}
    por_agrupacion: dict[str, dict] = {}
    clientes_por_sku: dict[str, dict[str, dict]] = {}

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
        cod = (row.get("cod_articulo") or "").strip()
        desc = (row.get("descripcion_articulo") or "").strip()
        agr2 = (row.get("agrupacion_art_2") or "").strip() or "Sin agrupación"

        total_bultos += bultos
        total_unidades += unidades
        if cliente_key:
            clientes.add(cliente_key)
        comprobantes.add((fecha, tipo, num, erp_cli))

        vb = por_vendedor.setdefault(v_disp, {"bultos": 0.0, "unidades": 0.0})
        vb["bultos"] += bultos
        vb["unidades"] += unidades

        sku_key = cod or desc or "Sin código"
        sk = por_sku.setdefault(
            sku_key,
            {
                "cod_articulo": cod,
                "articulo": desc or cod or "Artículo sin descripción",
                "agrupacion": agr2,
                "bultos": 0.0,
                "unidades": 0.0,
                "clientes": set(),
            },
        )
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

    return {
        "total_bultos": total_bultos,
        "total_unidades": total_unidades,
        "clientes": clientes,
        "comprobantes": len(comprobantes),
        "por_vendedor": por_vendedor,
        "por_sku": por_sku,
        "por_agrupacion": por_agrupacion,
        "clientes_por_sku": clientes_por_sku,
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
    """last_updated del motor ventas_enriched + próxima ingesta programada (AR)."""
    last_updated: str | None = None
    try:
        run = (
            sb.table("motor_runs")
            .select("finalizado_en,iniciado_en")
            .eq("motor", "ventas_enriched")
            .eq("dist_id", dist_id)
            .eq("estado", "ok")
            .order("finalizado_en", desc=True)
            .limit(1)
            .execute()
        )
        if run.data:
            row = run.data[0]
            last_updated = row.get("finalizado_en") or row.get("iniciado_en")
    except Exception as e:
        logger.debug("[avance-ventas] sync motor_runs dist=%s: %s", dist_id, e)
    return {
        "last_updated": last_updated,
        "next_run_hint": next_ventas_run_ar().isoformat(),
    }


# ─── Builders de respuesta ────────────────────────────────────────────────────

def _sku_rows_from_agg(agg: dict, cartera_count: int | None) -> list[dict]:
    rows = []
    for sku_key, s in agg["por_sku"].items():
        n_cli = len(s["clientes"])
        bultos = round(s["bultos"], 2)
        row = {
            "sku_key": sku_key,
            "cod_articulo": s["cod_articulo"] or sku_key,
            "articulo": s["articulo"],
            "agrupacion": s["agrupacion"],
            "bultos": bultos,
            "unidades": round(s["unidades"], 2),
            "clientes": n_cli,
            "intensidad": round(s["bultos"] / n_cli, 2) if n_cli else 0.0,
            "penetracion_pct": (
                round(n_cli / cartera_count * 100, 1) if cartera_count else None
            ),
        }
        rows.append(row)
    rows.sort(key=lambda r: r["bultos"], reverse=True)
    return rows


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

    def _agg_rango(desde: str, hasta: str) -> dict:
        lines = _fetch_avance_lines(dist_id, desde, hasta)
        return aggregate_avance_lines(
            lines,
            erp_name_map=erp_name_map,
            sucursal_norm=sucursal_norm,
            vend_branch=vend_branch,
            vendedor_norm=vendedor_norm,
        )

    # Actual + referencias + cartera en paralelo (fetches PostgREST independientes).
    from concurrent.futures import ThreadPoolExecutor

    agg_refs: dict[str, dict | None] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        fut_actual = pool.submit(_agg_rango, periodo["desde"], periodo["hasta"])
        fut_cartera = pool.submit(
            _cartera_scope_count, dist_id, sucursal_clean or None, vendedor_clean or None
        )
        fut_refs = {
            ref_key: pool.submit(_agg_rango, rango["desde"], rango["hasta"])
            for ref_key, rango in refs.items()
        }
        agg = fut_actual.result()
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

    # ── Metadatos + comparativas ────────────────────────────────────────────
    metadatos = {
        "total_bultos": round(agg["total_bultos"], 2),
        "total_unidades": round(agg["total_unidades"], 2),
        "clientes_compra": len(agg["clientes"]),
        "skus_activos": sum(1 for s in agg["por_sku"].values() if abs(s["bultos"]) > 0),
        "comprobantes": agg["comprobantes"],
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

    kpis_cards = [
        {
            "id": metric_id,
            "valor": metadatos[meta_key],
            "wow": _delta_for(metric_id, delta_primary_key[0]),
            "mom": _delta_for(metric_id, delta_primary_key[1]),
        }
        for metric_id, meta_key in (
            ("bultos", "total_bultos"),
            ("unidades", "total_unidades"),
            ("clientes", "clientes_compra"),
            ("skus", "skus_activos"),
            ("comprobantes", "comprobantes"),
        )
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

    # ── Ranking SKUs + deltas por SKU ───────────────────────────────────────
    sku_rows = _sku_rows_from_agg(agg, cartera_count)

    def _ref_sku_bultos(ref_key: str | None) -> dict[str, float] | None:
        if not ref_key:
            return None
        ref_agg = agg_refs.get(ref_key)
        if not ref_agg:
            return None
        return {k: s["bultos"] for k, s in ref_agg["por_sku"].items()}

    wow_sku = _ref_sku_bultos(delta_primary_key[0])
    mom_sku = _ref_sku_bultos(delta_primary_key[1])

    ranking_skus = []
    for r in sku_rows[:RANKING_MAX_SKUS]:
        item = {k: v for k, v in r.items() if k != "sku_key"}
        if wow_sku is not None:
            item["wow_bultos"] = build_delta_kpi(r["bultos"], wow_sku.get(r["sku_key"], 0.0))
        if mom_sku is not None:
            item["mom_bultos"] = build_delta_kpi(r["bultos"], mom_sku.get(r["sku_key"], 0.0))
        ranking_skus.append(item)

    # ── Series para gráficos ────────────────────────────────────────────────
    por_agrupacion = sorted(
        (
            {"label": label, "bultos": round(d["bultos"], 2), "unidades": round(d["unidades"], 2)}
            for label, d in agg["por_agrupacion"].items()
        ),
        key=lambda r: r["bultos"],
        reverse=True,
    )
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
    heatmap = [
        {
            "sku": r["articulo"],
            "cod_articulo": r["cod_articulo"],
            "actual": r["bultos"],
            "ref_wow": round(wow_sku.get(r["sku_key"], 0.0), 2) if wow_sku is not None else None,
            "ref_mom": round(mom_sku.get(r["sku_key"], 0.0), 2) if mom_sku is not None else None,
        }
        for r in sku_rows[:HEATMAP_TOP_SKUS]
    ]

    # ── Drill clientes (precalculado top 20 SKUs) ───────────────────────────
    drill = {
        r["cod_articulo"]: _drill_for_sku(agg, r["sku_key"])
        for r in sku_rows[:DRILL_TOP_SKUS]
    }

    return {
        "modo": modo,
        "fecha_ancla": str(fecha)[:10],
        "periodo": periodo,
        "sync": _ventas_sync_info(dist_id),
        "filtros": {
            "sucursal": sucursal_clean or None,
            "vendedor": vendedor_clean or None,
        },
        "cartera_scope": cartera_count,
        "metadatos": metadatos,
        "comparativas": comparativas,
        "kpis_cards": kpis_cards,
        "share_vendedores": share_vendedores,
        "ranking_skus": ranking_skus,
        "insights": _build_insights(sku_rows),
        "series": {
            "por_agrupacion": por_agrupacion,
            "scatter_penetracion_intensidad": scatter,
            "heatmap_top_skus": heatmap,
        },
        "drill_clientes_por_sku": drill,
    }


def build_avance_ventas_sku_clientes(
    dist_id: int,
    cod_articulo: str,
    modo: str,
    fecha: str,
    sucursal: str | None = None,
    vendedor: str | None = None,
) -> dict:
    """Drill bajo demanda: top/bottom clientes de un SKU fuera del top 20 precalculado."""
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
    lines = [
        r
        for r in lines
        if (r.get("cod_articulo") or "").strip() == cod_norm
        or (not (r.get("cod_articulo") or "").strip() and (r.get("descripcion_articulo") or "").strip() == cod_norm)
    ]
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
    sku_keys = list(agg["clientes_por_sku"].keys())
    drill = _drill_for_sku(agg, sku_keys[0]) if sku_keys else {"top": [], "bottom": []}
    return {
        "cod_articulo": cod_norm,
        "modo": modo,
        "periodo": periodo,
        **drill,
    }
