from __future__ import annotations
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
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
    build_client_key_to_erp_map,
    count_exhibited_clientes_in_cartera,
    map_exhibidos_erp,
    resolve_exhibition_cliente_erp,
)
from core.crr_cartera import build_composicion_exhibicion_compradores, build_crr_cartera
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
_VENTAS_CHUNK_DAYS = 7
_VENTAS_CHUNK_RETRIES = 3


class VentasFetchIncompleteError(RuntimeError):
    """Ventas_enriched incompleto (timeout parcial) — no usar para KPIs ni snapshot."""


def _ventas_date_chunks(fecha_desde: str, fecha_hasta: str, chunk_days: int = _VENTAS_CHUNK_DAYS) -> list[tuple[str, str]]:
    """Parte el rango en ventanas chicas: el mes entero en una query hace timeout en PostgREST."""
    start = date.fromisoformat(fecha_desde)
    end = date.fromisoformat(fecha_hasta)
    chunks: list[tuple[str, str]] = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end)
        chunks.append((cur.isoformat(), chunk_end.isoformat()))
        cur = chunk_end + timedelta(days=1)
    return chunks


def _fetch_ventas_estadisticas(
    dist_id: int,
    fecha_desde: str,
    fecha_hasta: str,
    ventas_ctx: dict[str, object],
) -> list[dict]:
    """Lee ventas_enriched paginado por ventanas de fecha (evita statement timeout)."""
    t_v = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))
    rows: list[dict] = []

    def fetch_chunk(desde: str, hasta: str) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            q = (
                sb.table(t_v)
                .select(_ventas_select_cols())
                .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta)
                .eq("anulado", False)
            )
            q = _apply_ventas_scope(q, ventas_ctx)
            batch = q.range(offset, offset + PAGE - 1).execute().data or []
            out.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
        return out

    for desde, hasta in _ventas_date_chunks(fecha_desde, fecha_hasta):
        last_err: Exception | None = None
        for attempt in range(_VENTAS_CHUNK_RETRIES):
            try:
                rows.extend(fetch_chunk(desde, hasta))
                last_err = None
                break
            except Exception as e:
                last_err = e
                logger.warning(
                    "[estadisticas] ventas chunk %s..%s attempt=%s dist=%s: %s",
                    desde,
                    hasta,
                    attempt + 1,
                    dist_id,
                    e,
                )
        if last_err is not None:
            raise VentasFetchIncompleteError(
                f"ventas_enriched incompleto dist={dist_id} rango={desde}..{hasta}: {last_err}"
            ) from last_err
    return rows


def _cartas_comercial_ventas_plausible(cartas: list) -> bool:
    """Detecta snapshots/cartas con ventas vacías o parciales (timeout silencioso)."""
    if not cartas:
        return False
    ex_sum = 0
    cmp_sum = 0
    blt_sum = 0.0
    for c in cartas:
        raw = c.get("raw_kpis") or {}
        if not isinstance(raw, dict):
            return False
        ex_sum += int(raw.get("exhibiciones") or 0)
        cmp_sum += int(raw.get("compradores") or 0)
        blt_sum += float(raw.get("bultos_raw") or raw.get("bultos") or 0)
        cmp = int(raw.get("compradores") or 0)
        ex = int(raw.get("exhibiciones") or 0)
        blt = float(raw.get("bultos_raw") or raw.get("bultos") or 0)
        # Ventas parciales: exhibiciones altas + muchos compradores + bultos muy bajos
        if cmp >= 100 and ex >= 120 and blt > 0 and (blt / cmp) < 0.35:
            logger.warning(
                "[estadisticas] carta implausible bultos/compradores dist=%s vendedor=%s "
                "bultos=%s compradores=%s exhibiciones=%s",
                c.get("id_distribuidor"),
                c.get("nombre"),
                blt,
                cmp,
                ex,
            )
            return False
    if ex_sum >= 20 and cmp_sum == 0 and blt_sum == 0:
        return False
    return True


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
    return "DEVOL" in s or "PRDVO" in s or ("NOTA" in s and "CRED" in s)


def _es_operacion_bultos_neto(tipo: str | None, importe: float) -> bool:
    """
    Bultos netos al estilo Informe Consolido / comprobantes: ventas + devoluciones.
    Excluye solo recaudaciones (sin volumen comercial).
    """
    return not _es_recaudacion(tipo)


def _collect_meses_from_rows(rows: list[dict], field: str) -> set[str]:
    out: set[str] = set()
    for r in rows:
        f = (r.get(field) or "")[:7]
        if f:
            out.add(f)
    return out


def _mes_actual_ar() -> str:
    """YYYY-MM en calendario Argentina (UTC-3)."""
    ar_now = datetime.utcnow() - timedelta(hours=3)
    return ar_now.strftime("%Y-%m")


def _mes_from_venta_row(row: dict) -> str | None:
    """Mes comercial de una fila ventas_enriched (excluye recaudaciones)."""
    if _es_recaudacion(row.get("tipo_documento")):
        return None
    f = (row.get("fecha_factura") or "")[:7]
    return f or None


def _vendedores_prescan_franquicia(dist_id: int) -> list[dict]:
    if dist_id not in FRANCHISE_VENTAS_SOURCE_DIST:
        return []
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    return (
        sb.table(t_vend)
        .select("id_vendedor,id_vendedor_erp,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )


def _collect_meses_ventas_comerciales(dist_id: int) -> set[str]:
    """Meses con ventas no anuladas (mismo scope que cartas, incl. franquicias Real)."""
    vend_prescan = _vendedores_prescan_franquicia(dist_id)
    ventas_ctx = resolve_estadisticas_ventas_fetch(
        dist_id, vend_prescan if vend_prescan else None
    )
    t = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))
    meses: set[str] = set()
    offset = 0
    while True:
        q = (
            sb.table(t)
            .select("fecha_factura,tipo_documento")
            .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
            .eq("anulado", False)
        )
        q = _apply_ventas_scope(q, ventas_ctx)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        for r in batch:
            m = _mes_from_venta_row(r)
            if m:
                meses.add(m)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return meses


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


def _any_vendor_carta_visible(
    dist_id: int,
    all_raw: dict[str, dict],
    vend_rows: list[dict],
    hidden_vids: set[str],
    sucursal: str | None = None,
    suc_map: dict[str, str] | None = None,
) -> bool:
    """Misma elegibilidad que build_carta_resumen (sin armar radar/score)."""
    suc_map = suc_map or {}
    for v in vend_rows:
        vid = str(v.get("id_vendedor") or "").strip()
        nombre = (v.get("nombre_erp") or "").strip()
        if not vid:
            continue
        if vid in hidden_vids:
            continue
        if is_exhibicion_qa_display_for_dist(dist_id, nombre):
            continue
        if is_vendedor_excluido_objetivos(nombre):
            continue
        if sucursal:
            sid = str(v.get("id_sucursal") or "").strip()
            suc_nombre = suc_map.get(sid, "")
            if suc_nombre.lower() != sucursal.lower():
                continue
        raw = all_raw.get(vid)
        if raw and raw.get("pdvs", 0) > 0 and _carta_tiene_actividad_comercial(raw):
            return True
    return False


def _meses_con_cartas_visibles(dist_id: int, candidates: list[str]) -> list[str]:
    """
    Filtra candidatos a meses con al menos una carta vendedor visible.
    Una sola lectura de fuentes para todo el rango; agrega KPIs por mes.
    """
    if not candidates:
        return []
    source = _fetch_carta_source_rows(dist_id, candidates)
    vend_rows = source.get("vendedores") or []
    visible: list[str] = []
    for mes in sorted(candidates, reverse=True):
        all_raw = _aggregate_kpis_from_rows(source, [mes])
        all_raw.pop("__ventas_meta__", None)  # type: ignore[call-overload]
        rolled, hidden_vids = apply_tabaco_rollups(dist_id, all_raw, vend_rows)
        if _any_vendor_carta_visible(dist_id, rolled, vend_rows, hidden_vids):
            visible.append(mes)
    return visible


def fetch_meses_disponibles(dist_id: int) -> list[str]:
    """
    Meses YYYY-MM con al menos una carta vendedor visible (desc).
    Candidatos: ventas comerciales y/o exhibiciones; excluye padrón y meses futuros AR.
    """
    meses: set[str] = set()
    meses |= _collect_meses_ventas_comerciales(dist_id)
    meses |= _paginate_meses(dist_id, "exhibiciones", "timestamp_subida")
    cap = _mes_actual_ar()
    candidates = sorted((m for m in meses if m <= cap), reverse=True)
    if not candidates:
        return []
    return _meses_con_cartas_visibles(dist_id, candidates)


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
        "cod_articulo,descripcion_articulo,agrupacion_art_2"
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


def _venta_pertenece_vendedor(row: dict, vctx: dict) -> bool:
    """Misma asignación de fila Consolido → vendedor que el batch de cartas."""
    idx = vctx.get("match_indexes")
    target_vid = vctx.get("id_vendedor")
    if idx and target_vid is not None:
        resolved = _resolve_vid_from_venta_row(row, idx)
        if resolved is not None:
            return resolved == int(target_vid)
    return _venta_matches_vendor(row, vctx)


def _fetch_ventas_rows_vendedor(
    dist_id: int,
    vctx: dict,
    fecha_desde: str,
    fecha_hasta: str,
    *,
    select_cols: str | None = None,
) -> list[dict]:
    """
    Ventas del vendedor en el rango, con el mismo criterio que _aggregate_kpis_from_rows
    (franquicia + resolve por código/nombre ERP), no solo filtro por codigo_vendedor.
    """
    ventas_ctx = vctx.get("ventas_ctx") or resolve_estadisticas_ventas_fetch(dist_id, None)
    cols = select_cols or (
        "cod_articulo,descripcion_articulo,bultos_total,unidades_total,agrupacion_art_2,"
        "tipo_documento,importe_final,fecha_factura,codigo_vendedor,"
        "nombre_vendedor,id_cliente_erp,nombre_cliente,anulado"
    )
    t_v = tenant_table_name("ventas_enriched_v2", int(ventas_ctx["table_dist"]))
    rows: list[dict] = []

    def fetch_chunk(desde: str, hasta: str) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            q = (
                sb.table(t_v)
                .select(cols)
                .eq("id_distribuidor", int(ventas_ctx["filter_dist"]))
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta)
                .eq("anulado", False)
            )
            q = _apply_ventas_scope(q, ventas_ctx)
            batch = q.range(offset, offset + PAGE - 1).execute().data or []
            out.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
        return out

    for desde, hasta in _ventas_date_chunks(fecha_desde, fecha_hasta):
        rows.extend(fetch_chunk(desde, hasta))
    return [r for r in rows if _venta_pertenece_vendedor(r, vctx)]


def _bultos_linea_desglose(row: dict) -> float:
    """
    Bultos por línea para desglose por artículo.
    Prefer bultos_excel (crudo Consolido pre-conversión) si está en raw_json.
    """
    raw_j = row.get("raw_json") or {}
    excel = raw_j.get("bultos_excel")
    if excel is not None:
        return float(excel or 0)
    bc = float(raw_j.get("bultos_con_cargo") or 0)
    bs = float(raw_j.get("bultos_sin_cargo") or 0)
    if bc or bs:
        return bc + bs
    return float(row.get("bultos_total") or 0)


def _build_bultos_desglose(
    venta_rows: list[dict],
    meses_set: set[str],
) -> tuple[list[dict], float]:
    """
    Agrupa bultos por cod_articulo (como ERP Consolido). Retorna (filas, total crudo).
    El total debe coincidir con el KPI batch del vendedor.
    """
    bultos_by_key: dict[str, dict] = defaultdict(
        lambda: {"bultos": 0.0, "kind": None, "desc": "", "cod": ""}
    )
    bultos_total = 0.0
    for r in venta_rows:
        if not _in_meses(r.get("fecha_factura", ""), meses_set):
            continue
        tipo = r.get("tipo_documento")
        imp = float(r.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp):
            continue
        cod = str(r.get("cod_articulo") or "").strip()
        desc = (r.get("descripcion_articulo") or "").strip() or "Sin descripción"
        key = cod if cod else desc
        b = float(r.get("bultos_total") or 0)
        bucket = bultos_by_key[key]
        bucket["bultos"] += b
        bucket["desc"] = desc
        bucket["cod"] = cod
        bultos_total += b
        kind = classify_volumen(
            r.get("agrupacion_art_2") or "",
            desc,
            "",
        )
        if volumen_es_convertido(kind):
            bucket["kind"] = kind

    rows_out: list[dict] = []
    for _key, v in bultos_by_key.items():
        b_raw = v["bultos"]
        b = bultos_display_2dec(b_raw)
        row: dict = {
            "articulo": v["desc"],
            "cod_articulo": v["cod"] or None,
            "bultos": b,
            "bultos_raw": b_raw,
        }
        kind = v.get("kind")
        if kind and volumen_es_convertido(kind):
            factor = unidades_por_bulto(kind) or 250.0
            enteros, resto = bultos_desglose_decimal(b_raw, factor)
            row["bultos_enteros"] = enteros
            row["unidades_resto"] = resto
        rows_out.append(row)
    rows_out.sort(
        key=lambda x: (float(x.get("bultos_raw") or 0), x.get("cod_articulo") or ""),
        reverse=True,
    )
    return rows_out, bultos_total


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
    pdv_rows_map: list[dict] = []
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i:i+50]
            q = (sb.table(t_pdv)
                 .select(_PDV_EXHIBICION_MAP_SELECT)
                 .eq("id_distribuidor", dist_id)
                 .in_("id_ruta", batch_ids)
                 .or_(_PADRON_VISIBLE_OR))
            rows = q.execute().data or []
            for r in rows:
                pdv_rows_map.append(r)
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
        if not _es_operacion_bultos_neto(tipo, imp):
            continue
        if not _es_devolucion(tipo, imp):
            ceid = r.get("id_cliente_erp")
            if ceid:
                compradores.add(str(ceid))
        bultos_total, unidades_cig = _acumular_bultos_unidades(r, bultos_total, unidades_cig)

    # PDVs exhibidos = clientes de cartera con al menos 1 exhibición mapeable a ERP
    compradores_count = _count_compradores_en_cartera(compradores, pdvs_unicos)
    client_key_to_erp = build_client_key_to_erp_map(pdv_rows_map)
    pdvs_exhibidos = count_exhibited_clientes_in_cartera(ex_rows, client_key_to_erp, pdvs_unicos)
    cobertura_compra_pct = 0.0
    if pdvs_activos > 0:
        cobertura_compra_pct = min(100.0, compradores_count / pdvs_activos * 100)

    cobertura_pct = 0.0
    if pdvs_activos > 0:
        cobertura_pct = min(100.0, pdvs_exhibidos / pdvs_activos * 100)
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
        "pdvs_exhibidos": pdvs_exhibidos,
        "compradores": compradores_count,
        "bultos": bultos_display_2dec(bultos_total),
        "unidades_cigarrillos": bultos_display_2dec(unidades_cig),
        "cobertura_pct": round(cobertura_pct, 1),
        "cobertura_compra_pct": round(cobertura_compra_pct, 1),
        "objetivos_pct": round(objetivos_pct, 1),
    }


def aggregate_kpis_vendedor_bounds(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
) -> dict:
    """KPIs de un vendedor en un rango de fechas exacto (repaso Q1/Q2/C)."""
    fd = (fecha_desde or "")[:10]
    fh = (fecha_hasta or "")[:10]

    rutas_rows = _fetch_rutas_vendedor(dist_id, id_vendedor, "id_ruta")
    ruta_ids = [r["id_ruta"] for r in rutas_rows if r.get("id_ruta")]

    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)
    pdvs_unicos: set = set()
    localidad_clients: dict[str, set[str]] = defaultdict(set)
    pdv_rows_map: list[dict] = []
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i : i + 50]
            q = (
                sb.table(t_pdv)
                .select(f"{_PDV_EXHIBICION_MAP_SELECT},localidad")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch_ids)
                .or_(_PADRON_VISIBLE_OR)
            )
            rows = q.execute().data or []
            for r in rows:
                pdv_rows_map.append(r)
                eid = r.get("id_cliente_erp")
                if eid:
                    eid_s = str(eid)
                    pdvs_unicos.add(eid_s)
                    loc = _normalize_localidad_label(r.get("localidad"))
                    if loc:
                        localidad_clients[loc].add(eid_s)
    pdvs_activos = len(pdvs_unicos)

    altas = 0
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i : i + 50]
            q = (
                sb.table(t_pdv)
                .select("fecha_alta")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch_ids)
                .gte("fecha_alta", fd)
                .lte("fecha_alta", fh)
            )
            altas += len(q.execute().data or [])

    vctx = _vendor_context(dist_id, id_vendedor)
    int_ids = vctx["integrante_ids"]

    t_ex = tenant_table_name("exhibiciones", dist_id)
    ex_rows: list[dict] = []
    if int_ids:
        for i in range(0, len(int_ids), 50):
            batch = int_ids[i : i + 50]

            def q_fn(offset, b=batch):
                return (
                    sb.table(t_ex)
                    .select(EXHIBICION_ROW_COLS)
                    .eq("id_distribuidor", dist_id)
                    .in_("id_integrante", b)
                    .gte("timestamp_subida", fd)
                    .lte("timestamp_subida", fh + "T23:59:59")
                )

            ex_rows.extend(_paginate(q_fn))

    ex_counts = aggregate_exhibicion_counts_vendor_scope(ex_rows)
    exhibiciones_logicas = ex_counts.get("total_logicas", 0)

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
            .gte("fecha_factura", fd)
            .lte("fecha_factura", fh)
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
        if not _venta_matches_vendor(r, vctx):
            continue
        tipo = r.get("tipo_documento")
        imp = float(r.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp):
            continue
        if not _es_devolucion(tipo, imp):
            ceid = r.get("id_cliente_erp")
            if ceid:
                compradores.add(str(ceid))
        bultos_total, unidades_cig = _acumular_bultos_unidades(r, bultos_total, unidades_cig)

    client_key_to_erp = build_client_key_to_erp_map(pdv_rows_map)
    pdvs_exhibidos = count_exhibited_clientes_in_cartera(ex_rows, client_key_to_erp, pdvs_unicos)
    compradores_count = _count_compradores_en_cartera(compradores, pdvs_unicos)
    cobertura_compra_pct = 0.0
    if pdvs_activos > 0:
        cobertura_compra_pct = min(100.0, compradores_count / pdvs_activos * 100)

    cobertura_pct = 0.0
    if pdvs_activos > 0:
        cobertura_pct = min(100.0, pdvs_exhibidos / pdvs_activos * 100)
    hoy = date.today()
    t_obj = "objetivos"
    obj_res = sb.table(t_obj).select("*").eq("id_distribuidor", dist_id).execute()
    obj_rows = obj_res.data or []
    activos = [o for o in obj_rows if objetivo_activo_para_vendedor(o, hoy)]
    vendor_activos = [o for o in activos if str(o.get("id_vendedor", "")) == str(id_vendedor)]
    cumplidos = sum(1 for o in vendor_activos if o.get("cumplido"))
    objetivos_pct = (cumplidos / len(vendor_activos) * 100) if vendor_activos else 0.0

    raw_out: dict = {
        "pdvs": pdvs_activos,
        "altas": altas,
        "exhibiciones": exhibiciones_logicas,
        "pdvs_exhibidos": pdvs_exhibidos,
        "compradores": compradores_count,
        "bultos": bultos_display_2dec(bultos_total),
        "bultos_raw": bultos_total,
        "unidades_cigarrillos": bultos_display_2dec(unidades_cig),
        "cobertura_pct": round(cobertura_pct, 1),
        "cobertura_compra_pct": round(cobertura_compra_pct, 1),
        "objetivos_pct": round(objetivos_pct, 1),
    }
    top_loc = _top_localidades_label(localidad_clients)
    if top_loc:
        raw_out["top_localidades"] = top_loc
    return raw_out


def build_carta_for_vendor_period(
    dist_id: int,
    id_vendedor: str,
    fecha_desde: str,
    fecha_hasta: str,
) -> dict | None:
    """Carta FIFA de un vendedor acotada a un rango de fechas (repaso comercial)."""
    raw = aggregate_kpis_vendedor_bounds(dist_id, id_vendedor, fecha_desde, fecha_hasta)
    if raw.get("pdvs", 0) == 0:
        return None

    t_vend = tenant_table_name("vendedores_v2", dist_id)
    vend_res = (
        sb.table(t_vend)
        .select("id_vendedor,nombre_erp,id_sucursal")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", int(id_vendedor))
        .limit(1)
        .execute()
    )
    vend = (vend_res.data or [None])[0]
    if not vend:
        return None

    nombre = (vend.get("nombre_erp") or "").strip()
    if is_exhibicion_qa_display_for_dist(dist_id, nombre):
        return None
    if is_vendedor_excluido_objetivos(nombre):
        return None

    suc_nombre = ""
    sid = vend.get("id_sucursal")
    if sid is not None:
        suc_res = (
            sb.table(tenant_table_name("sucursales_v2", dist_id))
            .select("nombre_erp")
            .eq("id_sucursal", sid)
            .limit(1)
            .execute()
        )
        suc_nombre = ((suc_res.data or [{}])[0]).get("nombre_erp") or ""

    ideal_dist = get_ideal(dist_id, "distribuidora")
    ideal_comp = get_ideal(dist_id, "compania")
    scoring_ideal, active_pesos = resolve_scoring_ideal(ideal_dist, ideal_comp)

    fd = datetime.strptime(fecha_desde[:10], "%Y-%m-%d").date()
    fh = datetime.strptime(fecha_hasta[:10], "%Y-%m-%d").date()
    period_days = max(1, (fh - fd).days + 1)
    n_meses = max(1, round(period_days / 30))

    meta_score = _build_meta_kpis(scoring_ideal, n_meses) if scoring_ideal else {k: 0 for k in KPI_KEYS}
    batch_caps = _batch_caps_from_raw({str(id_vendedor): raw})

    radar = build_radar_normalized(
        raw, meta_score, ideal=scoring_ideal, batch_caps=batch_caps
    )
    score = score_vendedor(radar, active_pesos) if scoring_ideal else 0

    card: dict = {
        "id_vendedor": str(id_vendedor),
        "nombre": nombre,
        "sucursal": suc_nombre,
        "radar": radar,
        "score": score,
        "raw_kpis": raw,
        "has_ideal_compania": bool(ideal_comp),
        "has_ideal_distribuidora": bool(ideal_dist),
    }
    top_loc = raw.get("top_localidades")
    if top_loc:
        card["top_localidades"] = top_loc
    if ideal_comp:
        card["radar_ideal_compania"] = radar_ideal_target()
        card["ideal_meta_compania"] = ideal_meta_display_values(ideal_comp, n_meses, raw)
    if ideal_dist:
        card["radar_ideal_dist"] = radar_ideal_target()
        card["ideal_meta_dist"] = ideal_meta_display_values(ideal_dist, n_meses, raw)
    return card


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
        "pdvs_exhibidos": float(km.get("cobertura_exhibicion_pct", 0)),
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
    client_key_to_erp: dict[str, str],
    pdvs_by_vend: dict[int, set],
) -> tuple[dict[int, int], dict[int, int]]:
    """Una pasada: lógicas vendor-scope + PDVs únicos exhibidos (ERP en cartera) por vendedor."""
    best: dict[tuple[int, str], dict] = {}
    unique_erp: dict[int, set] = defaultdict(set)

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
        cartera = pdvs_by_vend.get(vid) or set()
        erp_cliente = resolve_exhibition_cliente_erp(row, client_key_to_erp, cartera)
        if erp_cliente:
            unique_erp[vid].add(erp_cliente)

    logicas: dict[int, int] = defaultdict(int)
    for vid, _lk in best:
        logicas[vid] += 1
    return dict(logicas), {vid: len(s) for vid, s in unique_erp.items()}


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
    caps["pdvs_exhibidos"] = 0.0
    for raw in all_raw.values():
        caps["pdvs"] = max(caps["pdvs"], float(raw.get("pdvs", 0)))
        caps["altas"] = max(caps["altas"], float(raw.get("altas", 0)))
        caps["exhibiciones"] = max(caps["exhibiciones"], float(raw.get("exhibiciones", 0)))
        caps["pdvs_exhibidos"] = max(caps["pdvs_exhibidos"], float(raw.get("cobertura_pct", 0)))
        caps["compradores"] = max(caps["compradores"], float(raw.get("compradores", 0)))
        caps["bultos"] = max(caps["bultos"], float(raw.get("bultos", 0)))
        caps["cobertura"] = max(
            caps["cobertura"],
            float(raw.get("cobertura_compra_pct", raw.get("cobertura_pct", 0))),
        )
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

    def rutas_q(offset):
        return sb.table(t_rutas).select("id_ruta,id_vendedor")

    def pdv_q(offset):
        return (
            sb.table(t_pdv)
            .select(f"id_ruta,{_PDV_EXHIBICION_MAP_SELECT},fecha_alta,localidad")
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

    parallel = _run_parallel(
        {
            "rutas": lambda: _paginate(rutas_q),
            "pdv": lambda: _paginate(pdv_q),
            "ex": lambda: _paginate(ex_q),
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
    parallel["ventas"] = _fetch_ventas_estadisticas(
        dist_id, fecha_desde, fecha_hasta, ventas_ctx
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
    localidad_clients_by_vend: dict[int, dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    for row in parallel.get("pdv") or []:
        rid = row.get("id_ruta")
        if rid is None:
            continue
        vid = ruta_to_vend.get(int(rid))
        if vid is None:
            continue
        eid = row.get("id_cliente_erp")
        if eid:
            eid_s = str(eid)
            pdvs_by_vend[vid].add(eid_s)
            loc = _normalize_localidad_label(row.get("localidad"))
            if loc:
                localidad_clients_by_vend[vid][loc].add(eid_s)
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
        ex_rows,
        iid_to_erp,
        erp_to_vid,
        build_client_key_to_erp_map(parallel.get("pdv") or []),
        pdvs_by_vend,
    )

    bultos_by_vend: dict[int, float] = defaultdict(float)
    unidades_cig_by_vend: dict[int, float] = defaultdict(float)
    compradores_by_vend: dict[int, set] = defaultdict(set)
    ventas_total = 0
    ventas_unmatched = 0
    for row in parallel.get("ventas") or []:
        if not _in_meses(row.get("fecha_factura", ""), meses_set):
            continue
        tipo = row.get("tipo_documento")
        imp = float(row.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp):
            continue
        es_dev = _es_devolucion(tipo, imp)
        if not es_dev:
            ventas_total += 1
        vid = _resolve_vid_from_venta_row(row, match_indexes)
        if vid is None:
            if not es_dev:
                ventas_unmatched += 1
            continue
        bultos_by_vend[vid], unidades_cig_by_vend[vid] = _acumular_bultos_unidades(
            row, bultos_by_vend[vid], unidades_cig_by_vend[vid]
        )
        if not es_dev:
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
        compradores_n = _count_compradores_en_cartera(
            compradores_by_vend.get(vid) or set(),
            pdv_set,
        )
        cob = min(100.0, ex_u / pdvs * 100) if pdvs else 0.0
        cob_compra = min(100.0, compradores_n / pdvs * 100) if pdvs else 0.0
        bultos_raw = bultos_by_vend.get(vid, 0.0)
        raw_entry: dict = {
            "pdvs": pdvs,
            "altas": altas_by_vend.get(vid, 0),
            "exhibiciones": ex_logicas_by_vend.get(vid, 0),
            "pdvs_exhibidos": ex_u,
            "compradores": compradores_n,
            "bultos": bultos_display_2dec(bultos_raw),
            "bultos_raw": bultos_raw,
            "unidades_cigarrillos": bultos_display_2dec(unidades_cig_by_vend.get(vid, 0)),
            "cobertura_pct": round(cob, 1),
            "cobertura_compra_pct": round(cob_compra, 1),
            "objetivos_pct": round(obj_pct, 1),
        }
        top_loc = _top_localidades_label(localidad_clients_by_vend.get(vid))
        if top_loc:
            raw_entry["top_localidades"] = top_loc
        out[str(vid)] = raw_entry
    unmatched_pct = round(ventas_unmatched / max(ventas_total, 1) * 100, 1)
    out["__ventas_meta__"] = {  # type: ignore[assignment]
        "ventas_total": ventas_total,
        "ventas_unmatched": ventas_unmatched,
        "ventas_unmatched_pct": unmatched_pct,
    }
    return out


def _aggregate_kpis_all_vendors(dist_id: int, meses: list[str]) -> dict[str, dict]:
    """Compat: fetch + aggregate (usado por tests/scripts)."""
    rows = _fetch_carta_source_rows(dist_id, meses)
    return _aggregate_kpis_from_rows(rows, meses)


_ERP_SYNC_VENTAS_UMBRAL = 100   # filas mínimas en dist para disparar alerta
_ERP_SYNC_UNMATCHED_UMBRAL = 50.0  # % de ventas sin match para flagear


def _build_carta_resumen_impl(dist_id: int, meses: list[str], sucursal: str | None) -> list[dict]:
    n_meses = len(meses)
    source = _fetch_carta_source_rows(dist_id, meses)
    all_raw = _aggregate_kpis_from_rows(source, meses)
    ventas_meta: dict = all_raw.pop("__ventas_meta__", {})  # type: ignore[call-overload]
    vend_rows = source.get("vendedores") or []
    all_raw, hidden_vids = apply_tabaco_rollups(dist_id, all_raw, vend_rows)
    ventas_total_dist: int = ventas_meta.get("ventas_total", 0)
    ventas_unmatched_pct: float = ventas_meta.get("ventas_unmatched_pct", 0.0)

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

        compradores_val = float(raw.get("compradores") or 0)
        bultos_val = float(raw.get("bultos_raw") or 0)
        erp_sync_alert = (
            ventas_total_dist >= _ERP_SYNC_VENTAS_UMBRAL
            and int(raw.get("pdvs") or 0) > 0
            and compradores_val == 0
            and bultos_val == 0
            and ventas_unmatched_pct >= _ERP_SYNC_UNMATCHED_UMBRAL
        )

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
        top_loc = raw.get("top_localidades")
        if top_loc:
            card["top_localidades"] = top_loc
        if erp_sync_alert:
            card["erp_sync_alert"] = True
            card["erp_sync_reason"] = "ventas_sin_match_vendedor"
            card["erp_sync_unmatched_pct"] = ventas_unmatched_pct

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


def _normalize_localidad_label(loc: object) -> str:
    s = " ".join(str(loc or "").strip().split())
    return s.upper() if s else ""


def _top_localidades_label(
    localidad_clients: dict[str, set[str]] | None,
    *,
    limit: int = 2,
) -> str:
    """Las N localidades con más clientes únicos en cartera (ej. 'PARANA - DIAMANTE')."""
    if not localidad_clients:
        return ""
    ranked = sorted(
        localidad_clients.items(),
        key=lambda item: (-len(item[1]), item[0]),
    )
    names = [name for name, clients in ranked[:limit] if clients and name]
    return " - ".join(names)


_PDV_EXHIBICION_MAP_SELECT = "id_cliente_erp,id_cliente"


_PDV_DETALLE_SELECT = (
    "id_cliente,id_ruta,id_cliente_erp,nombre_razon_social,nombre_fantasia,"
    "telefono,celular,domicilio,localidad,fecha_alta,fecha_ultima_compra,fecha_compra_anterior"
)


def _build_ultima_exhibicion_por_erp(
    ex_rows: list[dict],
    client_key_to_erp: dict[str, str],
) -> dict[str, str]:
    from core.exhibicion_aggregate import resolve_day_key

    ultima: dict[str, str] = {}
    for row in ex_rows:
        erp = resolve_exhibition_cliente_erp(row, client_key_to_erp)
        if not erp:
            continue
        day = resolve_day_key(row)
        if day and (erp not in ultima or day > ultima[erp]):
            ultima[erp] = day
    return ultima


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
    pdv_raw_rows: list[dict] = []
    if ruta_ids:
        for i in range(0, len(ruta_ids), 50):
            batch_ids = ruta_ids[i : i + 50]
            q = (
                sb.table(t_pdv)
                .select(_PDV_DETALLE_SELECT)
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", batch_ids)
                .or_(_PADRON_VISIBLE_OR)
            )
            rows = q.execute().data or []
            pdv_raw_rows.extend(rows)
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

    # Bultos por artículo (misma asignación de ventas que KPI batch)
    ventas_vend = _fetch_ventas_rows_vendedor(
        dist_id, vctx, fecha_desde, fecha_hasta
    )
    bultos_top, bultos_desglose_raw = _build_bultos_desglose(ventas_vend, meses_set)

    comp_map: dict[str, str] = {}
    for r in ventas_vend:
        if not _in_meses(r.get("fecha_factura", ""), meses_set):
            continue
        tipo = r.get("tipo_documento")
        imp = float(r.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp) or _es_devolucion(tipo, imp):
            continue
        eid = str(r.get("id_cliente_erp") or "")
        if eid and eid not in comp_map:
            comp_map[eid] = r.get("nombre_cliente") or eid

    compradores = [{"id_cliente_erp": k, "razon_social": v} for k, v in comp_map.items()]
    compradores_erp_all = set(comp_map.keys())
    pdv_erp_cartera = {
        str(r.get("id_cliente_erp") or "").strip()
        for r in pdv_raw_rows
        if str(r.get("id_cliente_erp") or "").strip()
    }
    compradores_erp = compradores_erp_all & pdv_erp_cartera
    compradores = [
        {"id_cliente_erp": k, "razon_social": comp_map[k]}
        for k in sorted(compradores_erp)
    ]

    client_key_to_erp = build_client_key_to_erp_map(pdv_raw_rows)
    exhibidos_erp = map_exhibidos_erp(ex_rows, client_key_to_erp, pdv_erp_cartera)
    ultima_exhibicion_por_erp = _build_ultima_exhibicion_por_erp(ex_rows, client_key_to_erp)
    altas_erp = {a["id_cliente_erp"] for a in altas if a.get("id_cliente_erp")}

    ruta_meta_by_id = {
        int(r["id_ruta"]): {"nombre": r["nombre"], "dia": r["dia"]}
        for r in rutas_base
        if r.get("id_ruta") is not None
    }

    composicion = build_composicion_exhibicion_compradores(exhibidos_erp, compradores_erp)
    crr = build_crr_cartera(
        pdv_raw_rows,
        compradores_erp=compradores_erp,
        altas_erp=altas_erp,
        exhibidos_erp=exhibidos_erp,
        ultima_exhibicion_por_erp=ultima_exhibicion_por_erp,
        ruta_meta_by_id=ruta_meta_by_id,
        desde=fecha_desde,
        hasta=fecha_hasta,
    )

    pdv_nombre: dict[str, str] = {}
    for row in pdv_raw_rows:
        erp = str(row.get("id_cliente_erp") or "").strip()
        if erp:
            pdv_nombre[erp] = (
                row.get("nombre_razon_social") or row.get("nombre_fantasia") or erp
            )

    exhibidos_list = [
        {
            "id_cliente_erp": erp,
            "razon_social": pdv_nombre.get(erp, erp),
            "es_comprador": erp in compradores_erp,
        }
        for erp in sorted(exhibidos_erp)
    ]

    return {
        "id_vendedor": id_vendedor,
        "rutas": rutas,
        "altas": altas[:100],
        "exhibiciones_resumen": ex_counts,
        "bultos_top": bultos_top,
        "bultos_desglose_total": bultos_display_2dec(bultos_desglose_raw),
        "bultos_desglose_count": len(bultos_top),
        "compradores": compradores[:200],
        "cartera": {
            "exhibidos": exhibidos_list[:200],
            "composicion": composicion,
            "crr": crr,
        },
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

    _invalidate_cartas_after_ideal_change(dist_id, origen)
    return updated


def _invalidate_cartas_after_ideal_change(dist_id: int | None, origen: str) -> None:
    """Cartas/snapshots embedean metas del ideal — recomputar tras guardar config."""
    with _CARTA_CACHE_LOCK:
        _CARTA_CACHE.clear()
    from services.snapshot_estadisticas_service import (
        mark_all_estadisticas_stale,
        mark_estadisticas_stale,
    )

    if origen == "compania":
        mark_all_estadisticas_stale()
    elif dist_id is not None:
        mark_estadisticas_stale(dist_id)


def get_historial(config_id: str) -> list[dict]:
    res = (sb.table("estadisticas_vendedor_ideal_historial")
           .select("*")
           .eq("config_id", config_id)
           .order("created_at", desc=True)
           .limit(50)
           .execute())
    return res.data or []
