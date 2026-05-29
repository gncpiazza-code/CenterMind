from __future__ import annotations
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from collections import defaultdict
from threading import Lock

from db import sb
from core.tenant_tables import tenant_table_name, tenant_table_supports_distribuidor_filter
from core.exhibicion_aggregate import (
    EXHIBICION_ROW_COLS,
    exhibicion_score,
    vendor_logic_key,
    resolve_client_key,
    aggregate_exhibicion_counts_vendor_scope,
)
from core.objetivos_filters import objetivo_activo_para_vendedor
from core.helpers import (
    is_exhibicion_qa_display_for_dist,
    is_vendedor_excluido_objetivos,
    build_integrante_to_erp_name,
    _get_erp_name_map,
    _vendor_names_match_venta,
)
from core.estadisticas_franchise import (
    FRANCHISE_VENTAS_SOURCE_DIST,
    resolve_estadisticas_ventas_fetch,
)
from core.ventas_bultos_rules import (
    bultos_desglose_decimal,
    bultos_display_2dec,
    classify_volumen,
    unidades_por_bulto,
    volumen_es_convertido,
)
from core.estadisticas_tabaco_rollup import (
    TABACO_DIST_ID,
    apply_tabaco_rollups,
    build_integrante_to_erp_name_estadisticas,
    tabaco_rollup_integrante_ids,
    _is_ivan_wutrich,
    _is_matias_wutrich,
)
from core.estadisticas_ideal import (
    ideal_meta_display_values,
    meta_periodo_kpi,
    build_radar_normalized,
    score_vendedor,
    diff_ideal,
    KPI_KEYS,
    radar_ideal_target,
    resolve_scoring_ideal,
)

logger = logging.getLogger("estadisticas_service")

PAGE = 1000
_PADRON_VISIBLE_OR = "motivo_inactivo.is.null,motivo_inactivo.not.in.(padron_absent,padron_anulado)"
_CARTA_CACHE: dict[str, tuple[float, list]] = {}
_CARTA_CACHE_LOCK = Lock()
_CARTA_TTL_SEC = 90
_POOL = ThreadPoolExecutor(max_workers=10, thread_name_prefix="estad-stats")


def _paginate(query_fn):
    """Helper: run paginated query. query_fn(offset) returns a Supabase query."""
    rows = []
    offset = 0
    while True:
        batch = query_fn(offset).range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def _es_recaudacion(tipo: str | None) -> bool:
    s = (tipo or "").strip().upper()
    return "RECIB" in s or s in {"RECCC"}


def _es_devolucion(tipo: str | None, importe: float) -> bool:
    if importe < 0:
        return True
    s = (tipo or "").strip().upper()
    return "DEVOL" in s or ("NOTA" in s and "CRED" in s)


def _collect_meses_from_rows(rows: list[dict], field: str) -> set[str]:
    out: set[str] = set()
    for r in rows:
        f = (r.get(field) or "")[:7]
        if f:
            out.add(f)
    return out


def _paginate_meses(dist_id: int, table_base: str, field: str) -> set[str]:
    """Meses YYYY-MM con paginación PostgREST (1000 filas)."""
    t = tenant_table_name(table_base, dist_id)
    meses: set[str] = set()
    offset = 0
    while True:
        q = sb.table(t).select(field)
        if tenant_table_supports_distribuidor_filter(table_base):
            q = q.eq("id_distribuidor", dist_id)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        meses |= _collect_meses_from_rows(batch, field)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return meses


def fetch_sucursales_disponibles(dist_id: int) -> list[str]:
    """Sucursales del tenant (catálogo ERP), independiente del filtro de cartas."""
    t_suc = tenant_table_name("sucursales_v2", dist_id)
    res = (
        sb.table(t_suc)
        .select("nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    names = sorted(
        {
            (r.get("nombre_erp") or "").strip()
            for r in (res.data or [])
            if (r.get("nombre_erp") or "").strip()
        },
        key=lambda s: s.lower(),
    )
    return names


def fetch_meses_disponibles(dist_id: int) -> list[str]:
    """
    Returns sorted desc list of "YYYY-MM" months that have at least one event
    across: ventas_enriched_v2, exhibiciones, clientes_pdv_v2 (altas).
    """
    meses: set[str] = set()
    meses |= _paginate_meses(dist_id, "ventas_enriched_v2", "fecha_factura")
    meses |= _paginate_meses(dist_id, "exhibiciones", "timestamp_subida")
    meses |= _paginate_meses(dist_id, "clientes_pdv_v2", "fecha_alta")
    return sorted(meses, reverse=True)


def _fetch_rutas_vendedor(dist_id: int, id_vendedor: str, select_cols: str = "id_ruta") -> list[dict]:
    """
    rutas_v2_dN no tiene id_distribuidor (el tenant es el sufijo _dN).
    Mismo criterio que supervision._fetch_rutas_rows.
    """
    try:
        vid = int(id_vendedor)
    except (TypeError, ValueError):
        return []
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    try:
        res = (
            sb.table(t_rutas)
            .select(select_cols)
            .eq("id_vendedor", vid)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("[estadisticas] rutas dist=%s vendedor=%s: %s", dist_id, vid, e)
        return []


def _get_fecha_bounds(meses: list[str]) -> tuple[str, str]:
    """Returns (fecha_desde, fecha_hasta) strings for a list of YYYY-MM months."""
    sorted_meses = sorted(meses)
    fecha_desde = sorted_meses[0] + "-01"
    last = sorted_meses[-1]
    # Last day of last month
    year, month = int(last[:4]), int(last[5:7])
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    fecha_hasta = f"{year}-{month:02d}-{last_day}"
    return fecha_desde, fecha_hasta


def _in_meses(date_str: str, meses: set[str]) -> bool:
    return bool(date_str) and date_str[:7] in meses


def _carta_tiene_actividad_comercial(raw: dict) -> bool:
    """Evita cartas solo-padrón (PDVs en ruta sin ventas ni exhibiciones)."""
    return (
        float(raw.get("compradores") or 0) > 0
        or float(raw.get("bultos") or 0) > 0
        or float(raw.get("exhibiciones") or 0) > 0
    )


def _ventas_select_cols() -> str:
    return (
        "codigo_vendedor,nombre_vendedor,id_cliente_erp,tipo_documento,"
        "importe_final,fecha_factura,bultos_total,unidades_total,"
        "descripcion_articulo,agrupacion_art_2"
    )


def _count_compradores_en_cartera(
    compradores_ids: set[str],
    pdv_cartera_ids: set[str],
) -> int:
    """
    Compradores = PDVs del padrón (rutas del vendedor) con al menos una venta en el período.
    No cuenta clientes del informe de ventas que no están en la cartera asignada.
    """
    if not compradores_ids or not pdv_cartera_ids:
        return 0
    return len(compradores_ids & pdv_cartera_ids)


def _acumular_bultos_unidades(
    row: dict,
    bultos_acc: float,
    unidades_cig_acc: float,
) -> tuple[float, float]:
    """Suma bultos de línea; unidades solo en líneas con conversión (cig/papelillo/mix)."""
    b = float(row.get("bultos_total") or 0)
    bultos_acc += b
    kind = classify_volumen(
        row.get("agrupacion_art_2") or "",
        row.get("descripcion_articulo") or "",
        "",
    )
    if volumen_es_convertido(kind):
        unidades_cig_acc += float(row.get("unidades_total") or 0)
    return bultos_acc, unidades_cig_acc


def _apply_ventas_scope(
    q,
    ventas_ctx: dict[str, object],
    vendor_codigos: list[str] | None = None,
):
    """
    Franquicia: lee tabla Real; batch usa todos los códigos ERP del dist,
    detalle por vendedor usa solo los códigos de ese vendedor.
    """
    codigos = vendor_codigos
    if not codigos:
        raw = ventas_ctx.get("codigos")
        codigos = list(raw) if raw else None
    if not codigos:
        return q
    if len(codigos) == 1:
        return q.eq("codigo_vendedor", codigos[0])
    return q.in_("codigo_vendedor", codigos)


def _vendor_context(dist_id: int, id_vendedor: str) -> dict:
    """id_vendedor ERP, código Consolido e integrantes Telegram del vendedor."""
    try:
        vid = int(id_vendedor)
    except (TypeError, ValueError):
        return {"integrante_ids": [], "codigo_vendedor": "", "nombre_erp": ""}

    t_vend = tenant_table_name("vendedores_v2", dist_id)
    res = (
        sb.table(t_vend)
        .select("id_vendedor,id_vendedor_erp,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", vid)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        return {"integrante_ids": [], "codigo_vendedor": "", "nombre_erp": ""}

    erp = str(row.get("id_vendedor_erp") or "").strip()
    nombre = (row.get("nombre_erp") or "").strip()

    int_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", vid)
        .execute()
    )
    int_ids: list[int] = []
    for r in int_res.data or []:
        try:
            int_ids.append(int(r["id_integrante"]))
        except (TypeError, ValueError):
            continue

    extra = tabaco_rollup_integrante_ids(dist_id, nombre)
    if extra:
        int_ids = list({*int_ids, *extra})

    codigos = [erp] if erp else []
    if dist_id == TABACO_DIST_ID and _is_matias_wutrich(nombre):
        t_vend_all = tenant_table_name("vendedores_v2", dist_id)
        all_v = (
            sb.table(t_vend_all)
            .select("id_vendedor_erp,nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data
            or []
        )
        for v in all_v:
            nom_v = (v.get("nombre_erp") or "").strip()
            cod_v = str(v.get("id_vendedor_erp") or "").strip()
            if cod_v and _is_ivan_wutrich(nom_v) and cod_v not in codigos:
                codigos.append(cod_v)

    t_vend_all = tenant_table_name("vendedores_v2", dist_id)
    all_v = (
        sb.table(t_vend_all)
        .select("id_vendedor,id_vendedor_erp,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )

    return {
        "id_vendedor": vid,
        "integrante_ids": int_ids,
        "codigo_vendedor": codigos[0] if codigos else "",
        "codigos_vendedor": codigos,
        "nombre_erp": nombre,
        "match_indexes": _build_vendor_match_indexes(all_v, dist_id),
        "ventas_ctx": resolve_estadisticas_ventas_fetch(dist_id, all_v),
    }


def _build_vendor_match_indexes(
    vend_rows: list[dict], dist_id: int
) -> dict[str, object]:
    """Índices para asignar filas Consolido → id_vendedor (cartas batch)."""
    codigo_to_vid: dict[str, int] = {}
    nombre_to_vid: dict[str, int] = {}
    erp_to_vid: dict[str, int] = {}
    for v in vend_rows:
        try:
            vid = int(v["id_vendedor"])
        except (TypeError, ValueError):
            continue
        erp = str(v.get("id_vendedor_erp") or "").strip()
        if erp:
            codigo_to_vid[erp] = vid
            stripped = erp.lstrip("0") or erp
            if stripped != erp:
                codigo_to_vid[stripped] = vid
        nom = (v.get("nombre_erp") or "").strip().upper()
        if nom:
            nombre_to_vid[nom] = vid
            erp_to_vid[nom] = vid

    consolido_to_vid: dict[str, int] = {}
    for _key, erp_name in (_get_erp_name_map(dist_id) or {}).items():
        erp_u = (erp_name or "").strip().upper()
        vid = erp_to_vid.get(erp_u)
        if vid is not None:
            consolido_to_vid[_key] = vid

    return {
        "codigo_to_vid": codigo_to_vid,
        "nombre_to_vid": nombre_to_vid,
        "consolido_to_vid": consolido_to_vid,
    }


def _resolve_vid_from_venta_row(row: dict, idx: dict[str, object]) -> int | None:
    codigo_to_vid: dict[str, int] = idx.get("codigo_to_vid") or {}
    nombre_to_vid: dict[str, int] = idx.get("nombre_to_vid") or {}
    consolido_to_vid: dict[str, int] = idx.get("consolido_to_vid") or {}

    cod = str(row.get("codigo_vendedor") or "").strip()
    if cod:
        vid = codigo_to_vid.get(cod)
        if vid is None:
            stripped = cod.lstrip("0") or cod
            vid = codigo_to_vid.get(stripped)
        if vid is not None:
            return vid

    raw_nom = (row.get("nombre_vendedor") or "").strip()
    if raw_nom:
        vid = consolido_to_vid.get(raw_nom.lower())
        if vid is not None:
            return vid
        nom = raw_nom.upper()
        vid = nombre_to_vid.get(nom)
        if vid is not None:
            return vid
        for en, v in nombre_to_vid.items():
            if _vendor_names_match_venta(nom, en):
                return v
    return None


def _venta_matches_vendor(row: dict, ctx: dict) -> bool:
    try:
        target_vid = int(ctx["id_vendedor"])
    except (TypeError, ValueError, KeyError):
        target_vid = None
    idx = ctx.get("match_indexes")
    if idx and target_vid is not None:
        resolved = _resolve_vid_from_venta_row(row, idx)
        if resolved is not None:
            return resolved == target_vid

    cod = str(row.get("codigo_vendedor") or "").strip()
    codigos = ctx.get("codigos_vendedor") or (
        [ctx["codigo_vendedor"]] if ctx.get("codigo_vendedor") else []
    )
    if cod:
        if cod in codigos:
            return True
        stripped = cod.lstrip("0") or cod
        if stripped in codigos:
            return True
    nom = (row.get("nombre_vendedor") or "").strip().upper()
    erp_nom = (ctx.get("nombre_erp") or "").strip().upper()
    if erp_nom and nom and _vendor_names_match_venta(nom, erp_nom):
        return True
    if erp_nom and _is_matias_wutrich(erp_nom) and "WUTRICH" in nom:
        return True
    return False


def aggregate_kpis_vendedor(dist_id: int, id_vendedor: str, meses: list[str]) -> dict:
    """
    Aggregate all 7 KPIs for a single vendor over the selected months.
    Returns: {pdvs, altas, exhibiciones, compradores, bultos, cobertura_pct, objetivos_pct}
    """
    meses_set = set(meses)
    fecha_desde, fecha_hasta = _get_fecha_bounds(meses)

    # --- PDVs activos (via rutas del vendedor) ---
    rutas_rows = _fetch_rutas_vendedor(dist_id, id_vendedor, "id_ruta")
    ruta_ids = [r["id_ruta"] for r in rutas_rows if r.get("id_ruta")]

    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    pdvs_unicos: set = set()
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i:i+50]
            q = (sb.table(t_pdv)
                 .select("id_cliente_erp")
                 .eq("id_distribuidor", dist_id)
                 .in_("id_ruta", batch_ids)
                 .or_(_PADRON_VISIBLE_OR))
            rows = q.execute().data or []
            for r in rows:
                eid = r.get("id_cliente_erp")
                if eid:
                    pdvs_unicos.add(str(eid))
    pdvs_activos = len(pdvs_unicos)

    # --- Altas (clientes nuevos en meses seleccionados) ---
    altas = 0
    t_altas = tenant_table_name("clientes_pdv_v2", dist_id)
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i:i+50]
            q = (sb.table(t_altas)
                 .select("fecha_alta")
                 .eq("id_distribuidor", dist_id)
                 .in_("id_ruta", batch_ids)
                 .gte("fecha_alta", fecha_desde)
                 .lte("fecha_alta", fecha_hasta))
            rows = q.execute().data or []
            for r in rows:
                if _in_meses(r.get("fecha_alta", ""), meses_set):
                    altas += 1

    vctx = _vendor_context(dist_id, id_vendedor)
    int_ids = vctx["integrante_ids"]

    # --- Exhibiciones lógicas (vendor-scope) ---
    t_ex = tenant_table_name("exhibiciones", dist_id)

    ex_rows = []
    if int_ids:
        for i in range(0, len(int_ids), 50):
            batch = int_ids[i:i+50]
            def q_fn(offset, b=batch):
                return (sb.table(t_ex)
                        .select(EXHIBICION_ROW_COLS)
                        .eq("id_distribuidor", dist_id)
                        .in_("id_integrante", b)
                        .gte("timestamp_subida", fecha_desde)
                        .lte("timestamp_subida", fecha_hasta + "T23:59:59"))
            rows = _paginate(q_fn)
            ex_rows.extend([r for r in rows if _in_meses(r.get("timestamp_subida", ""), meses_set)])

    ex_counts = aggregate_exhibicion_counts_vendor_scope(ex_rows)
    exhibiciones_logicas = ex_counts.get("total_logicas", 0)

  # PDVs compradores + bultos (ventas_enriched_v2: codigo_vendedor / nombre_vendedor)
    vend_all = (
        sb.table(tenant_table_name("vendedores_v2", dist_id))
        .select("id_vendedor,id_vendedor_erp,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )
    ventas_ctx = resolve_estadisticas_ventas_fetch(dist_id, vend_all)
    t_v = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))
    compradores: set = set()

    def venta_q(offset):
        q = (
            sb.table(t_v)
            .select(
                "id_cliente_erp,codigo_vendedor,nombre_vendedor,tipo_documento,"
                "importe_final,fecha_factura,anulado,bultos_total,unidades_total,"
                "descripcion_articulo,agrupacion_art_2"
            )
            .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
            .gte("fecha_factura", fecha_desde)
            .lte("fecha_factura", fecha_hasta)
            .eq("anulado", False)
        )
        codigos = vctx.get("codigos_vendedor") or []
        return _apply_ventas_scope(q, ventas_ctx, codigos or None)

    venta_rows = _paginate(venta_q)
    if not vctx.get("codigos_vendedor") and not vctx.get("codigo_vendedor"):
        venta_rows = [r for r in venta_rows if _venta_matches_vendor(r, vctx)]

    bultos_total = 0.0
    unidades_cig = 0.0
    for r in venta_rows:
        if not _in_meses(r.get("fecha_factura", ""), meses_set):
            continue
        if not _venta_matches_vendor(r, vctx):
            continue
        tipo = r.get("tipo_documento")
        imp = float(r.get("importe_final") or 0)
        if _es_recaudacion(tipo) or _es_devolucion(tipo, imp):
            continue
        ceid = r.get("id_cliente_erp")
        if ceid:
            compradores.add(str(ceid))
        bultos_total, unidades_cig = _acumular_bultos_unidades(r, bultos_total, unidades_cig)

    # Cobertura exhibición = unique PDVs con exhibicion / PDVs activos
    ex_pdvs_unique: set = set()
    for r in ex_rows:
        ck = (r.get("id_cliente_pdv") or r.get("id_cliente") or r.get("cliente_sombra_codigo") or "")
        if ck:
            ex_pdvs_unique.add(str(ck))

    cobertura_pct = 0.0
    if pdvs_activos > 0:
        cobertura_pct = min(100.0, len(ex_pdvs_unique) / pdvs_activos * 100)

    # Objetivos cumplidos %
    hoy = date.today()
    t_obj = "objetivos"  # global table
    obj_res = sb.table(t_obj).select("*").eq("id_distribuidor", dist_id).execute()
    obj_rows = obj_res.data or []

    # Filter objetivos for this vendor active in the period
    activos = [o for o in obj_rows if objetivo_activo_para_vendedor(o, hoy)]
    vendor_activos = [o for o in activos if str(o.get("id_vendedor", "")) == str(id_vendedor)]
    cumplidos = sum(1 for o in vendor_activos if o.get("cumplido"))
    objetivos_pct = 0.0
    if vendor_activos:
        objetivos_pct = cumplidos / len(vendor_activos) * 100

    return {
        "pdvs": pdvs_activos,
        "altas": altas,
        "exhibiciones": exhibiciones_logicas,
        "compradores": _count_compradores_en_cartera(compradores, pdvs_unicos),
        "bultos": bultos_display_2dec(bultos_total),
        "unidades_cigarrillos": bultos_display_2dec(unidades_cig),
        "cobertura_pct": round(cobertura_pct, 1),
        "objetivos_pct": round(objetivos_pct, 1),
    }


def _get_ideal(dist_id: int | None, origen: str) -> dict | None:
    """Fetch ideal config for dist (compañía = id_distribuidor NULL)."""
    q = sb.table("estadisticas_vendedor_ideal").select("*").eq("origen", origen)
    if origen == "compania":
        q = q.is_("id_distribuidor", "null")
    elif dist_id is not None:
        q = q.eq("id_distribuidor", dist_id)
    else:
        return None
    res = q.execute()
    return (res.data or [None])[0]


def _build_meta_kpis(ideal: dict | None, n_meses: int) -> dict:
    if not ideal:
        return {k: 0 for k in KPI_KEYS}
    km = ideal.get("kpis_mensuales") or {}
    n = max(1, n_meses)
    return {
        "pdvs": meta_periodo_kpi(ideal, "pdvs", n_meses),
        "altas": max(1.0, float(ideal.get("meta_pdvs_total", 0))),
        "exhibiciones": float(km.get("exhibiciones", 0)) * n,
        "compradores": float(km.get("pdvs_compradores", 0)) * n,
        "bultos": float(km.get("bultos", 0)) * n,
        "cobertura": float(km.get("cobertura_pct", 0)),
        "objetivos": float(km.get("objetivos_pct", 0)),
    }


def _carta_cache_key(dist_id: int, meses: list[str], sucursal: str | None) -> str:
    return f"{dist_id}|{','.join(sorted(meses))}|{(sucursal or '').lower()}"


def _exhibiciones_por_vendedor(
    ex_rows: list[dict],
    iid_to_erp: dict[int, str],
    erp_to_vid: dict[str, int],
) -> tuple[dict[int, int], dict[int, int]]:
    """Una pasada: lógicas vendor-scope + PDVs únicos exhibidos por id_vendedor."""
    best: dict[tuple[int, str], dict] = {}
    unique_pdvs: dict[int, set] = defaultdict(set)

    for row in ex_rows:
        try:
            iid = int(row.get("id_integrante"))
        except (TypeError, ValueError):
            continue
        erp = (iid_to_erp.get(iid) or "").strip().upper()
        vid = erp_to_vid.get(erp)
        if vid is None:
            continue
        lk = vendor_logic_key(row)
        key = (vid, lk)
        estado = row.get("estado") or ""
        score = exhibicion_score(estado)
        if key not in best or score > best[key]["score"]:
            best[key] = {"score": score}
        ck = resolve_client_key(row)
        if ck:
            unique_pdvs[vid].add(ck)

    logicas: dict[int, int] = defaultdict(int)
    for vid, _lk in best:
        logicas[vid] += 1
    return dict(logicas), {vid: len(s) for vid, s in unique_pdvs.items()}


def _run_parallel(tasks: dict[str, Callable[[], object]]) -> dict[str, object]:
    out: dict[str, object] = {}
    futures = {_POOL.submit(fn): name for name, fn in tasks.items()}
    for fut in as_completed(futures):
        name = futures[fut]
        try:
            out[name] = fut.result()
        except Exception as e:
            logger.error("[estadisticas] parallel task %s: %s", name, e)
            out[name] = [] if name != "integrantes" else []
    return out


def _batch_caps_from_raw(all_raw: dict[str, dict]) -> dict[str, float]:
    caps: dict[str, float] = {k: 0.0 for k in KPI_KEYS}
    for raw in all_raw.values():
        caps["pdvs"] = max(caps["pdvs"], float(raw.get("pdvs", 0)))
        caps["altas"] = max(caps["altas"], float(raw.get("altas", 0)))
        caps["exhibiciones"] = max(caps["exhibiciones"], float(raw.get("exhibiciones", 0)))
        caps["compradores"] = max(caps["compradores"], float(raw.get("compradores", 0)))
        caps["bultos"] = max(caps["bultos"], float(raw.get("bultos", 0)))
        caps["cobertura"] = max(caps["cobertura"], float(raw.get("cobertura_pct", 0)))
        caps["objetivos"] = max(caps["objetivos"], float(raw.get("objetivos_pct", 0)))
    return caps


def _fetch_carta_source_rows(dist_id: int, meses: list[str]) -> dict[str, object]:
    """Una sola ronda paralela de lecturas (sin anidar el pool)."""
    fecha_desde, fecha_hasta = _get_fecha_bounds(meses)
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    t_ex = tenant_table_name("exhibiciones", dist_id)
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    t_suc = tenant_table_name("sucursales_v2", dist_id)

    vend_prescan: list[dict] = []
    if dist_id in FRANCHISE_VENTAS_SOURCE_DIST:
        vend_prescan = (
            sb.table(t_vend)
            .select("id_vendedor,id_vendedor_erp,nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data
            or []
        )
    ventas_ctx = resolve_estadisticas_ventas_fetch(
        dist_id, vend_prescan if vend_prescan else None
    )
    t_v = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))

    def rutas_q(offset):
        return sb.table(t_rutas).select("id_ruta,id_vendedor")

    def pdv_q(offset):
        return (
            sb.table(t_pdv)
            .select("id_ruta,id_cliente_erp,fecha_alta")
            .eq("id_distribuidor", dist_id)
            .or_(_PADRON_VISIBLE_OR)
        )

    def ex_q(offset):
        return (
            sb.table(t_ex)
            .select(EXHIBICION_ROW_COLS)
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", fecha_desde)
            .lte("timestamp_subida", fecha_hasta + "T23:59:59")
        )

    def venta_q(offset):
        q = (
            sb.table(t_v)
            .select(_ventas_select_cols())
            .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
            .gte("fecha_factura", fecha_desde)
            .lte("fecha_factura", fecha_hasta)
            .eq("anulado", False)
        )
        return _apply_ventas_scope(q, ventas_ctx)

    parallel = _run_parallel(
        {
            "rutas": lambda: _paginate(rutas_q),
            "pdv": lambda: _paginate(pdv_q),
            "ex": lambda: _paginate(ex_q),
            "ventas": lambda: _paginate(venta_q),
            "vendedores": lambda: (
                sb.table(t_vend)
                .select("id_vendedor,id_vendedor_erp,nombre_erp,id_sucursal")
                .eq("id_distribuidor", dist_id)
                .execute()
                .data
                or []
            ),
            "objetivos": lambda: (
                sb.table("objetivos")
                .select("id_vendedor,cumplido,tipo,fecha_objetivo,lanzado_at")
                .eq("id_distribuidor", dist_id)
                .execute()
                .data
                or []
            ),
            "integrantes": lambda: build_integrante_to_erp_name_estadisticas(dist_id),
            "suc": lambda: (
                sb.table(t_suc)
                .select("id_sucursal,nombre_erp")
                .eq("id_distribuidor", dist_id)
                .execute()
                .data
                or []
            ),
            "ideal_dist": lambda: _get_ideal(dist_id, "distribuidora"),
            "ideal_comp": lambda: _get_ideal(None, "compania"),
        }
    )
    ventas_rows = parallel.get("ventas") or []
    if not ventas_rows and ((parallel.get("ex") or []) or (parallel.get("pdv") or [])):
        if dist_id in FRANCHISE_VENTAS_SOURCE_DIST:
            logger.warning(
                "[estadisticas] sin ventas franquicia dist=%s (fuente real=%s codigos=%s) meses=%s",
                dist_id,
                ventas_ctx.get("filter_dist"),
                ventas_ctx.get("codigos"),
                meses,
            )
        else:
            logger.warning(
                "[estadisticas] ventas_enriched vacío dist=%s meses=%s — compradores/bultos quedarán en 0",
                dist_id,
                meses,
            )
    parallel["dist_id"] = dist_id
    parallel["ventas_ctx"] = ventas_ctx
    return parallel


def _aggregate_kpis_from_rows(parallel: dict[str, object], meses: list[str]) -> dict[str, dict]:
    """Agrega KPIs por vendedor a partir de filas ya cargadas."""
    meses_set = set(meses)

    ruta_to_vend: dict[int, int] = {}
    for r in parallel.get("rutas") or []:
        rid, vid = r.get("id_ruta"), r.get("id_vendedor")
        if rid is not None and vid is not None:
            ruta_to_vend[int(rid)] = int(vid)

    pdvs_by_vend: dict[int, set] = defaultdict(set)
    altas_by_vend: dict[int, int] = defaultdict(int)
    for row in parallel.get("pdv") or []:
        rid = row.get("id_ruta")
        if rid is None:
            continue
        vid = ruta_to_vend.get(int(rid))
        if vid is None:
            continue
        eid = row.get("id_cliente_erp")
        if eid:
            pdvs_by_vend[vid].add(str(eid))
        if _in_meses(row.get("fecha_alta", ""), meses_set):
            altas_by_vend[vid] += 1

    vend_rows = parallel.get("vendedores") or []
    dist_id = int(parallel.get("dist_id") or 0)
    match_indexes = _build_vendor_match_indexes(vend_rows, dist_id) if dist_id else {}
    erp_to_vid: dict[str, int] = (match_indexes.get("nombre_to_vid") or {})  # type: ignore[assignment]

    iid_to_erp = parallel.get("integrantes") or {}
    ex_rows = [
        r
        for r in (parallel.get("ex") or [])
        if _in_meses(r.get("timestamp_subida", ""), meses_set)
    ]
    ex_logicas_by_vend, ex_pdvs_unique_by_vend = _exhibiciones_por_vendedor(
        ex_rows, iid_to_erp, erp_to_vid
    )

    bultos_by_vend: dict[int, float] = defaultdict(float)
    unidades_cig_by_vend: dict[int, float] = defaultdict(float)
    compradores_by_vend: dict[int, set] = defaultdict(set)
    for row in parallel.get("ventas") or []:
        if not _in_meses(row.get("fecha_factura", ""), meses_set):
            continue
        tipo = row.get("tipo_documento")
        imp = float(row.get("importe_final") or 0)
        if _es_recaudacion(tipo) or _es_devolucion(tipo, imp):
            continue
        vid = _resolve_vid_from_venta_row(row, match_indexes)
        if vid is None:
            continue
        bultos_by_vend[vid], unidades_cig_by_vend[vid] = _acumular_bultos_unidades(
            row, bultos_by_vend[vid], unidades_cig_by_vend[vid]
        )
        ceid = row.get("id_cliente_erp")
        if ceid:
            compradores_by_vend[vid].add(str(ceid))

    hoy = date.today()
    obj_by_vend: dict[int, list] = defaultdict(list)
    for o in parallel.get("objetivos") or []:
        if objetivo_activo_para_vendedor(o, hoy):
            try:
                obj_by_vend[int(o["id_vendedor"])].append(o)
            except (TypeError, ValueError):
                continue

    out: dict[str, dict] = {}
    for vid, pdv_set in pdvs_by_vend.items():
        if not pdv_set:
            continue
        pdvs = len(pdv_set)
        objs = obj_by_vend.get(vid, [])
        cumplidos = sum(1 for o in objs if o.get("cumplido"))
        obj_pct = (cumplidos / len(objs) * 100) if objs else 0.0
        ex_u = ex_pdvs_unique_by_vend.get(vid, 0)
        cob = min(100.0, ex_u / pdvs * 100) if pdvs else 0.0
        out[str(vid)] = {
            "pdvs": pdvs,
            "altas": altas_by_vend.get(vid, 0),
            "exhibiciones": ex_logicas_by_vend.get(vid, 0),
            "compradores": _count_compradores_en_cartera(
                compradores_by_vend.get(vid) or set(),
                pdv_set,
            ),
            "bultos": bultos_display_2dec(bultos_by_vend.get(vid, 0)),
            "unidades_cigarrillos": bultos_display_2dec(unidades_cig_by_vend.get(vid, 0)),
            "cobertura_pct": round(cob, 1),
            "objetivos_pct": round(obj_pct, 1),
        }
    return out


def _aggregate_kpis_all_vendors(dist_id: int, meses: list[str]) -> dict[str, dict]:
    """Compat: fetch + aggregate (usado por tests/scripts)."""
    rows = _fetch_carta_source_rows(dist_id, meses)
    return _aggregate_kpis_from_rows(rows, meses)


def _build_carta_resumen_impl(dist_id: int, meses: list[str], sucursal: str | None) -> list[dict]:
    n_meses = len(meses)
    source = _fetch_carta_source_rows(dist_id, meses)
    all_raw = _aggregate_kpis_from_rows(source, meses)
    vend_rows = source.get("vendedores") or []
    all_raw, hidden_vids = apply_tabaco_rollups(dist_id, all_raw, vend_rows)

    suc_map = {
        str(r["id_sucursal"]): r.get("nombre_erp", "")
        for r in (source.get("suc") or [])
    }
    ideal_dist = source.get("ideal_dist")
    ideal_comp = source.get("ideal_comp")

    scoring_ideal, active_pesos = resolve_scoring_ideal(ideal_dist, ideal_comp)
    meta_score = _build_meta_kpis(scoring_ideal, n_meses) if scoring_ideal else {k: 0 for k in KPI_KEYS}
    batch_caps = _batch_caps_from_raw(all_raw)

    cards = []
    for v in vend_rows:
        vid = str(v.get("id_vendedor") or "").strip()
        nombre = (v.get("nombre_erp") or "").strip()
        sid = str(v.get("id_sucursal") or "").strip()
        suc_nombre = suc_map.get(sid, "")

        if not vid:
            continue
        if vid in hidden_vids:
            continue
        if is_exhibicion_qa_display_for_dist(dist_id, nombre):
            continue
        if is_vendedor_excluido_objetivos(nombre):
            continue
        if sucursal and suc_nombre.lower() != sucursal.lower():
            continue

        raw = all_raw.get(vid)
        if not raw or raw.get("pdvs", 0) == 0:
            continue
        if not _carta_tiene_actividad_comercial(raw):
            continue

        radar = build_radar_normalized(
            raw, meta_score, ideal=scoring_ideal, batch_caps=batch_caps
        )
        score = score_vendedor(radar, active_pesos) if scoring_ideal else 0

        card: dict = {
            "id_vendedor": vid,
            "nombre": nombre,
            "sucursal": suc_nombre,
            "radar": radar,
            "score": score,
            "raw_kpis": raw,
            "has_ideal_compania": bool(ideal_comp),
            "has_ideal_distribuidora": bool(ideal_dist),
        }

        if ideal_comp:
            card["radar_ideal_compania"] = radar_ideal_target()
            card["ideal_meta_compania"] = ideal_meta_display_values(
                ideal_comp, n_meses, raw
            )
        if ideal_dist:
            card["radar_ideal_dist"] = radar_ideal_target()
            card["ideal_meta_dist"] = ideal_meta_display_values(
                ideal_dist, n_meses, raw
            )

        cards.append(card)

    return sorted(cards, key=lambda c: c["score"], reverse=True)


def build_carta_resumen(dist_id: int, meses: list[str], sucursal: str | None = None) -> list[dict]:
    """Cartas con caché en memoria (90s) para repetición rápida."""
    key = _carta_cache_key(dist_id, meses, sucursal)
    now = time.time()
    with _CARTA_CACHE_LOCK:
        hit = _CARTA_CACHE.get(key)
        if hit and now - hit[0] < _CARTA_TTL_SEC:
            return hit[1]

    cards = _build_carta_resumen_impl(dist_id, meses, sucursal)
    with _CARTA_CACHE_LOCK:
        _CARTA_CACHE[key] = (now, cards)
    return cards


def _normalize_dia_semana(dia: str) -> str:
    import unicodedata
    s = (dia or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


_DIA_SEMANA_ORDEN = {
    "lunes": 1,
    "martes": 2,
    "miercoles": 3,
    "jueves": 4,
    "viernes": 5,
    "sabado": 6,
    "domingo": 7,
    "variable": 98,
    "": 99,
}


def _dia_semana_sort_key(dia: str) -> tuple[int, str]:
    norm = _normalize_dia_semana(dia)
    return (_DIA_SEMANA_ORDEN.get(norm, 50), norm)


def _pdv_detalle_row(row: dict) -> dict:
    tel = str(row.get("telefono") or "").strip()
    cel = str(row.get("celular") or "").strip()
    dom = str(row.get("domicilio") or "").strip()
    loc = str(row.get("localidad") or "").strip()
    direccion = ", ".join(x for x in (dom, loc) if x)
    return {
        "id_cliente_erp": str(row.get("id_cliente_erp") or ""),
        "razon_social": row.get("nombre_razon_social") or "",
        "nombre_fantasia": row.get("nombre_fantasia") or "",
        "telefono": tel,
        "celular": cel,
        "domicilio": dom,
        "localidad": loc,
        "direccion": direccion,
        "fecha_alta": (row.get("fecha_alta") or "")[:10],
    }


def build_detalle_vendedor(dist_id: int, id_vendedor: str, meses: list[str]) -> dict:
    """Lazy detail for expanded card: routes/days, altas, exhibiciones, bultos, compradores."""
    meses_set = set(meses)
    fecha_desde, fecha_hasta = _get_fecha_bounds(meses)

    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)

    rutas_rows = _fetch_rutas_vendedor(dist_id, id_vendedor, "id_ruta,id_ruta_erp,dia_semana")
    rutas_base = [
        {
            "id_ruta": r["id_ruta"],
            "nombre": str(r.get("id_ruta_erp") or f"Ruta {r.get('id_ruta')}"),
            "dia": (r.get("dia_semana") or "").strip() or "Variable",
        }
        for r in rutas_rows
    ]
    ruta_ids = [r["id_ruta"] for r in rutas_base if r.get("id_ruta")]

    pdvs_by_ruta: dict[int, list] = defaultdict(list)
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i : i + 50]
            q = (
                sb.table(t_pdv)
                .select(
                    "id_ruta,id_cliente_erp,nombre_razon_social,nombre_fantasia,"
                    "telefono,celular,domicilio,localidad,fecha_alta"
                )
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch_ids)
                .or_(_PADRON_VISIBLE_OR)
            )
            rows = q.execute().data or []
            for row in rows:
                rid = row.get("id_ruta")
                if rid is None:
                    continue
                pdvs_by_ruta[int(rid)].append(_pdv_detalle_row(row))

    rutas = []
    for r in rutas_base:
        rid = int(r["id_ruta"])
        pdvs = sorted(
            pdvs_by_ruta.get(rid, []),
            key=lambda p: (
                (p.get("razon_social") or p.get("nombre_fantasia") or p.get("id_cliente_erp") or "").lower()
            ),
        )
        rutas.append({**r, "total_pdvs": len(pdvs), "pdvs": pdvs})

    rutas.sort(key=lambda x: (_dia_semana_sort_key(x.get("dia", "")), x.get("nombre", "")))

    # Altas
    altas = []
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            q = (sb.table(t_pdv)
                 .select(
                     "fecha_alta,id_ruta,id_cliente_erp,nombre_razon_social,"
                     "nombre_fantasia,domicilio,localidad"
                 )
                 .eq("id_distribuidor", dist_id)
                 .in_("id_ruta", ruta_ids[i:i+50])
                 .gte("fecha_alta", fecha_desde)
                 .lte("fecha_alta", fecha_hasta))
            rows = q.execute().data or []
            for r in rows:
                if _in_meses(r.get("fecha_alta", ""), meses_set):
                    altas.append({
                        "fecha_alta": r.get("fecha_alta") or "",
                        "id_ruta": r.get("id_ruta"),
                        "id_cliente_erp": str(r.get("id_cliente_erp") or ""),
                        "razon_social": r.get("nombre_razon_social") or "",
                        "nombre_fantasia": r.get("nombre_fantasia") or "",
                        "domicilio": r.get("domicilio") or "",
                        "localidad": r.get("localidad") or "",
                    })
    altas.sort(key=lambda x: x.get("fecha_alta", ""), reverse=True)

    # Exhibiciones resumen
    vctx = _vendor_context(dist_id, id_vendedor)
    int_ids = vctx["integrante_ids"]
    t_ex = tenant_table_name("exhibiciones", dist_id)

    ex_rows = []
    if int_ids:
        for i in range(0, len(int_ids), 50):
            batch = int_ids[i:i+50]
            def q_fn(offset, b=batch):
                return (sb.table(t_ex)
                        .select(EXHIBICION_ROW_COLS)
                        .eq("id_distribuidor", dist_id)
                        .in_("id_integrante", b)
                        .gte("timestamp_subida", fecha_desde)
                        .lte("timestamp_subida", fecha_hasta + "T23:59:59"))
            ex_rows.extend(_paginate(q_fn))

    ex_rows = [r for r in ex_rows if _in_meses(r.get("timestamp_subida", ""), meses_set)]
    ex_counts = aggregate_exhibicion_counts_vendor_scope(ex_rows)

    # Bultos top 20
    ventas_ctx = vctx.get("ventas_ctx") or resolve_estadisticas_ventas_fetch(dist_id, None)
    t_vb = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))

    def ventas_detalle_q(offset):
        q = (
            sb.table(t_vb)
            .select(
                "descripcion_articulo,bultos_total,unidades_total,agrupacion_art_2,"
                "tipo_documento,importe_final,fecha_factura,codigo_vendedor,"
                "nombre_vendedor,id_cliente_erp,nombre_cliente,anulado"
            )
            .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
            .gte("fecha_factura", fecha_desde)
            .lte("fecha_factura", fecha_hasta)
            .eq("anulado", False)
        )
        codigos = vctx.get("codigos_vendedor") or []
        return _apply_ventas_scope(q, ventas_ctx, codigos or None)

    ventas_det = _paginate(ventas_detalle_q)
    if not (vctx.get("codigos_vendedor") or vctx.get("codigo_vendedor")):
        ventas_det = [r for r in ventas_det if _venta_matches_vendor(r, vctx)]

    bultos_by_art: dict[str, dict] = defaultdict(
        lambda: {"bultos": 0.0, "kind": None}
    )
    comp_map: dict[str, str] = {}
    for r in ventas_det:
        if not _in_meses(r.get("fecha_factura", ""), meses_set):
            continue
        if not _venta_matches_vendor(r, vctx):
            continue
        tipo = r.get("tipo_documento")
        imp = float(r.get("importe_final") or 0)
        if _es_recaudacion(tipo) or _es_devolucion(tipo, imp):
            continue
        art = r.get("descripcion_articulo") or "Sin descripción"
        bucket = bultos_by_art[art]
        bucket["bultos"] += float(r.get("bultos_total") or 0)
        kind = classify_volumen(
            r.get("agrupacion_art_2") or "",
            r.get("descripcion_articulo") or "",
            "",
        )
        if volumen_es_convertido(kind):
            bucket["kind"] = kind
        eid = str(r.get("id_cliente_erp") or "")
        if eid and eid not in comp_map:
            comp_map[eid] = r.get("nombre_cliente") or eid

    bultos_top_rows: list[dict] = []
    for k, v in bultos_by_art.items():
        b = bultos_display_2dec(v["bultos"])
        row: dict = {"articulo": k, "bultos": b}
        kind = v.get("kind")
        if kind and volumen_es_convertido(kind):
            factor = unidades_por_bulto(kind) or 250.0
            enteros, resto = bultos_desglose_decimal(b, factor)
            row["bultos_enteros"] = enteros
            row["unidades_resto"] = resto
        bultos_top_rows.append(row)
    bultos_top = sorted(bultos_top_rows, key=lambda x: x["bultos"], reverse=True)[:20]

    compradores = [{"id_cliente_erp": k, "razon_social": v} for k, v in comp_map.items()]

    return {
        "id_vendedor": id_vendedor,
        "rutas": rutas,
        "altas": altas[:100],
        "exhibiciones_resumen": ex_counts,
        "bultos_top": bultos_top,
        "compradores": compradores[:200],
    }


def get_ideal(dist_id: int | None, origen: str) -> dict | None:
    if origen == "compania":
        return _get_ideal(None, origen)
    return _get_ideal(dist_id, origen)


def upsert_ideal(dist_id: int | None, origen: str, data: dict, user_payload: dict) -> dict:
    """Upsert ideal config and append historial entry."""
    existing = _get_ideal(dist_id if origen == "distribuidora" else None, origen)

    payload = {
        "origen": origen,
        "meta_pdvs_total": data["meta_pdvs_total"],
        "kpis_mensuales": data["kpis_mensuales"],
        "pesos": data["pesos"],
        "updated_at": "now()",
        "updated_by_user_id": str(user_payload.get("sub", "")),
        "updated_by_nombre": user_payload.get("nombre", ""),
        "updated_by_rol": user_payload.get("rol", ""),
    }
    if origen == "distribuidora":
        payload["id_distribuidor"] = dist_id
    else:
        payload["id_distribuidor"] = None

    if existing:
        res = sb.table("estadisticas_vendedor_ideal").update(payload).eq("id", existing["id"]).execute()
        updated = (res.data or [payload])[0]
        config_id = existing["id"]
    else:
        res = sb.table("estadisticas_vendedor_ideal").insert(payload).execute()
        updated = (res.data or [payload])[0]
        config_id = updated.get("id")

    # Historial
    delta = diff_ideal(existing, data)
    if delta:
        sb.table("estadisticas_vendedor_ideal_historial").insert({
            "config_id": config_id,
            "updated_by_user_id": str(user_payload.get("sub", "")),
            "updated_by_nombre": user_payload.get("nombre", ""),
            "updated_by_rol": user_payload.get("rol", ""),
            "diff": delta,
        }).execute()

    return updated


def get_historial(config_id: str) -> list[dict]:
    res = (sb.table("estadisticas_vendedor_ideal_historial")
           .select("*")
           .eq("config_id", config_id)
           .order("created_at", desc=True)
           .limit(50)
           .execute())
    return res.data or []
