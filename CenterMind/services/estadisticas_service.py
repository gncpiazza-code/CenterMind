from __future__ import annotations
import logging
from datetime import date, datetime
from collections import defaultdict

from db import sb
from core.tenant_tables import tenant_table_name
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    EXHIBICION_ROW_COLS,
)
from core.objetivos_filters import objetivo_activo_para_vendedor
from core.helpers import is_exhibicion_qa_display_for_dist
from core.estadisticas_ideal import (
    meta_periodo_kpi, build_radar_normalized, score_vendedor, diff_ideal, KPI_KEYS
)

logger = logging.getLogger("estadisticas_service")

PAGE = 1000
_PADRON_VISIBLE_OR = "motivo_inactivo.is.null,motivo_inactivo.not.in.(padron_absent,padron_anulado)"


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


def fetch_meses_disponibles(dist_id: int) -> list[str]:
    """
    Returns sorted desc list of "YYYY-MM" months that have at least one event
    across: ventas_enriched_v2, exhibiciones, clientes_pdv_v2 (altas), objetivos.
    """
    meses: set[str] = set()

    # ventas
    t_v = tenant_table_name("ventas_enriched_v2", dist_id)
    res = sb.table(t_v).select("fecha_factura").eq("id_distribuidor", dist_id).execute()
    for r in (res.data or []):
        f = (r.get("fecha_factura") or "")[:7]
        if f: meses.add(f)

    # exhibiciones
    t_e = tenant_table_name("exhibiciones", dist_id)
    res = sb.table(t_e).select("timestamp_subida").eq("id_distribuidor", dist_id).execute()
    for r in (res.data or []):
        f = (r.get("timestamp_subida") or "")[:7]
        if f: meses.add(f)

    # altas (clientes_pdv_v2)
    t_p = tenant_table_name("clientes_pdv_v2", dist_id)
    res = sb.table(t_p).select("fecha_alta").eq("id_distribuidor", dist_id).execute()
    for r in (res.data or []):
        f = (r.get("fecha_alta") or "")[:7]
        if f: meses.add(f)

    return sorted(meses, reverse=True)


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

    return {"integrante_ids": int_ids, "codigo_vendedor": erp, "nombre_erp": nombre}


def _venta_matches_vendor(row: dict, ctx: dict) -> bool:
    cod = str(row.get("codigo_vendedor") or "").strip()
    if ctx.get("codigo_vendedor") and cod == ctx["codigo_vendedor"]:
        return True
    nom = (row.get("nombre_vendedor") or "").strip().upper()
    erp_nom = (ctx.get("nombre_erp") or "").strip().upper()
    if erp_nom and nom and (erp_nom in nom or nom in erp_nom):
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
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_res = sb.table(t_rutas).select("id_ruta").eq("id_distribuidor", dist_id).eq("id_vendedor", id_vendedor).execute()
    ruta_ids = [r["id_ruta"] for r in (rutas_res.data or []) if r.get("id_ruta")]

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
    t_v = tenant_table_name("ventas_enriched_v2", dist_id)
    compradores: set = set()

    def venta_q(offset):
        q = (
            sb.table(t_v)
            .select(
                "id_cliente_erp,codigo_vendedor,nombre_vendedor,tipo_documento,"
                "importe_final,fecha_factura,anulado,bultos_total,descripcion_articulo"
            )
            .eq("id_distribuidor", dist_id)
            .gte("fecha_factura", fecha_desde)
            .lte("fecha_factura", fecha_hasta)
            .eq("anulado", False)
        )
        cod = vctx.get("codigo_vendedor")
        if cod:
            q = q.eq("codigo_vendedor", cod)
        return q

    venta_rows = _paginate(venta_q)
    if not vctx.get("codigo_vendedor"):
        venta_rows = [r for r in venta_rows if _venta_matches_vendor(r, vctx)]

    bultos_total = 0.0
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
        bultos_total += float(r.get("bultos_total") or 0)

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
        "compradores": len(compradores),
        "bultos": round(bultos_total),
        "cobertura_pct": round(cobertura_pct, 1),
        "objetivos_pct": round(objetivos_pct, 1),
    }


def _get_ideal(dist_id: int, origen: str) -> dict | None:
    """Fetch ideal config for dist (or compania if origen='compania')."""
    q = sb.table("estadisticas_vendedor_ideal").select("*").eq("origen", origen)
    if origen == "compania":
        q = q.is_("id_distribuidor", "null")
    else:
        q = q.eq("id_distribuidor", dist_id)
    res = q.execute()
    return (res.data or [None])[0]


def _build_meta_kpis(ideal: dict | None, n_meses: int) -> dict:
    if not ideal:
        return {k: 0 for k in KPI_KEYS}
    km = ideal.get("kpis_mensuales") or {}
    n = max(1, n_meses)
    return {
        "pdvs": meta_periodo_kpi(ideal, "pdvs", n_meses),
        "altas": meta_periodo_kpi(ideal, "altas", n_meses),
        "exhibiciones": float(km.get("exhibiciones", 0)) * n,
        "compradores": float(km.get("pdvs_compradores", 0)) * n,
        "bultos": float(km.get("bultos", 0)) * n,
        "cobertura": float(km.get("cobertura_pct", 0)),
        "objetivos": float(km.get("objetivos_pct", 0)),
    }


def build_carta_resumen(dist_id: int, meses: list[str], sucursal: str | None = None) -> list[dict]:
    """
    Build collection of vendor cards with radar 0-100 and score.
    Returns list sorted by score desc.
    """
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    t_suc = tenant_table_name("sucursales_v2", dist_id)

    suc_res = sb.table(t_suc).select("id_sucursal,nombre_erp").eq("id_distribuidor", dist_id).execute()
    suc_map = {str(r["id_sucursal"]): r.get("nombre_erp", "") for r in (suc_res.data or [])}

    vend_res = sb.table(t_vend).select("id_vendedor,nombre_erp,id_sucursal").eq("id_distribuidor", dist_id).execute()

    ideal_dist = _get_ideal(dist_id, "distribuidora")
    ideal_comp = _get_ideal(dist_id, "compania")
    n_meses = len(meses)

    meta_dist = _build_meta_kpis(ideal_dist, n_meses)
    meta_comp = _build_meta_kpis(ideal_comp, n_meses)

    pesos_dist = ideal_dist.get("pesos", {}) if ideal_dist else {}
    pesos_comp = ideal_comp.get("pesos", {}) if ideal_comp else {}
    default_pesos = {"pdvs": 15, "altas": 15, "exhibiciones": 15, "compradores": 15, "bultos": 15, "cobertura": 15, "objetivos": 10}
    active_pesos = pesos_dist or pesos_comp or default_pesos

    cards = []
    for v in (vend_res.data or []):
        vid = str(v.get("id_vendedor") or "").strip()
        nombre = (v.get("nombre_erp") or "").strip()
        sid = str(v.get("id_sucursal") or "").strip()
        suc_nombre = suc_map.get(sid, "")

        if not vid:
            continue
        if is_exhibicion_qa_display_for_dist(dist_id, nombre):
            continue
        if sucursal and suc_nombre.lower() != sucursal.lower():
            continue

        try:
            raw = aggregate_kpis_vendedor(dist_id, vid, meses)
        except Exception as e:
            logger.warning(f"Error KPIs vendedor {vid}: {e}")
            continue

        if raw["pdvs"] == 0:
            continue

        radar = build_radar_normalized(raw, meta_dist or meta_comp or {k: 0 for k in KPI_KEYS})
        score = score_vendedor(radar, active_pesos)

        card: dict = {
            "id_vendedor": vid,
            "nombre": nombre,
            "sucursal": suc_nombre,
            "radar": radar,
            "score": score,
            "raw_kpis": raw,
        }

        if ideal_comp:
            radar_comp = build_radar_normalized(raw, meta_comp)
            card["radar_ideal_compania"] = radar_comp
        if ideal_dist:
            radar_dist = build_radar_normalized(raw, meta_dist)
            card["radar_ideal_dist"] = radar_dist

        cards.append(card)

    return sorted(cards, key=lambda c: c["score"], reverse=True)


def build_detalle_vendedor(dist_id: int, id_vendedor: str, meses: list[str]) -> dict:
    """Lazy detail for expanded card: routes/days, altas, exhibiciones, bultos, compradores."""
    meses_set = set(meses)
    fecha_desde, fecha_hasta = _get_fecha_bounds(meses)

    # Rutas/días
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    t_pdv = tenant_table_name("clientes_pdv_v2", dist_id)

    rutas_res = (
        sb.table(t_rutas)
        .select("id_ruta,id_ruta_erp,dia_semana")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", id_vendedor)
        .execute()
    )
    rutas = [
        {
            "id_ruta": r["id_ruta"],
            "nombre": str(r.get("id_ruta_erp") or f"Ruta {r.get('id_ruta')}"),
            "dia": r.get("dia_semana", ""),
        }
        for r in (rutas_res.data or [])
    ]
    ruta_ids = [r["id_ruta"] for r in rutas if r["id_ruta"]]

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
                    altas.append(r)
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
    t_vb = tenant_table_name("ventas_enriched_v2", dist_id)

    def ventas_detalle_q(offset):
        q = (
            sb.table(t_vb)
            .select(
                "descripcion_articulo,bultos_total,tipo_documento,importe_final,"
                "fecha_factura,codigo_vendedor,nombre_vendedor,id_cliente_erp,"
                "nombre_cliente,anulado"
            )
            .eq("id_distribuidor", dist_id)
            .gte("fecha_factura", fecha_desde)
            .lte("fecha_factura", fecha_hasta)
            .eq("anulado", False)
        )
        cod = vctx.get("codigo_vendedor")
        if cod:
            q = q.eq("codigo_vendedor", cod)
        return q

    ventas_det = _paginate(ventas_detalle_q)
    if not vctx.get("codigo_vendedor"):
        ventas_det = [r for r in ventas_det if _venta_matches_vendor(r, vctx)]

    bultos_by_art: dict[str, float] = defaultdict(float)
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
        bultos_by_art[art] += float(r.get("bultos_total") or 0)
        eid = str(r.get("id_cliente_erp") or "")
        if eid and eid not in comp_map:
            comp_map[eid] = r.get("nombre_cliente") or eid

    bultos_top = sorted([{"articulo": k, "bultos": round(v)} for k, v in bultos_by_art.items()], key=lambda x: x["bultos"], reverse=True)[:20]

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
    return _get_ideal(dist_id or 0, origen)


def upsert_ideal(dist_id: int | None, origen: str, data: dict, user_payload: dict) -> dict:
    """Upsert ideal config and append historial entry."""
    existing = _get_ideal(dist_id or 0, origen)

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
