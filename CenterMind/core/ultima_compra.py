# -*- coding: utf-8 -*-
"""
Última compra operativa desde ventas_enriched_v2 (Informe Consolido).

Regla:
  1) Si hay filas en ventas_enriched para el ERP → fecha + detalle del comprobante más reciente.
  2) Fallback padrón: clientes_pdv_v2.fecha_ultima_compra.

Usar este módulo en endpoints que hoy leen solo el padrón.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

from db import sb
from core.exhibicion_aggregate import erp_lookup_keys
from core.objetivos_compradores import _norm_erp
from core.tenant_tables import tenant_table_name
from core.ventas_enriched_tenant import filter_ventas_rows_for_tenant, ventas_enriched_base_query
from core.ventas_bultos_rules import classify_volumen, unidades_por_bulto, volumen_es_convertido

PAGE = 1000


def erp_query_variants(erp_id: str) -> list[str]:
    """Variantes id_cliente_erp para ventas/padrón (Telegram vs Consolido)."""
    raw = str(erp_id or "").strip()
    if not raw:
        return []
    keys: list[str] = []
    seen: set[str] = set()
    for k in erp_lookup_keys(raw):
        if k and k not in seen:
            seen.add(k)
            keys.append(k)
    if raw.isdigit():
        z6 = raw.zfill(6)
        if z6 not in seen:
            seen.add(z6)
            keys.append(z6)
    return keys


_VENTAS_SELECT = (
    "id_cliente_erp,fecha_factura,tipo_documento,numero_documento,serie,"
    "importe_final,nombre_vendedor,anulado"
)

_VENTAS_SELECT_DETALLE = (
    "id_cliente_erp,fecha_factura,tipo_documento,numero_documento,serie,"
    "importe_final,nombre_vendedor,anulado,cod_articulo,descripcion_articulo,"
    "bultos_total,unidades_total,agrupacion_art_2"
)

_MAX_ARTICULOS_UI = 8
_MAX_COMPROBANTES_MISMO_DIA = 5


def comprobante_label(tipo: str | None, numero: str | None, serie: str | None = None) -> str:
    """Etiqueta corta para UI: 'FAC A 00123456'."""
    parts: list[str] = []
    t = (tipo or "").strip()
    s = (serie or "").strip()
    n = (numero or "").strip()
    if t:
        parts.append(t)
    if s:
        parts.append(s)
    if n:
        parts.append(f"#{n.lstrip('#')}")
    return " ".join(parts) if parts else ""


def _unidades_linea(
    descripcion: str,
    bultos_total: float,
    unidades_total: float,
    agrupacion_art_2: str = "",
) -> float:
    """Unidades para UI: Consolido unidades_total o conversión desde bultos (cig)."""
    u = float(unidades_total or 0)
    if u > 0:
        return u
    b = float(bultos_total or 0)
    if b <= 0:
        return 0.0
    desc = (descripcion or "").strip()
    agr = (agrupacion_art_2 or "").strip()
    kind = classify_volumen(agr, desc, "")
    if volumen_es_convertido(kind):
        factor = unidades_por_bulto(kind) or 250.0
        return round(b * factor, 2)
    return b


def _fmt_unidades(value: float) -> str:
    v = float(value or 0)
    if v <= 0:
        return "0 u."
    if abs(v - round(v)) < 0.01:
        return f"{int(round(v))} u."
    return f"{v:.1f} u."


def comprobante_from_venta_row(row: dict[str, Any]) -> dict[str, Any]:
    tipo = (row.get("tipo_documento") or "").strip()
    numero = (row.get("numero_documento") or "").strip()
    serie = (row.get("serie") or "").strip() or None
    return {
        "fecha": str(row.get("fecha_factura") or "")[:10],
        "tipo_documento": tipo or None,
        "numero_documento": numero or None,
        "serie": serie,
        "importe_final": float(row.get("importe_final") or 0),
        "nombre_vendedor": (row.get("nombre_vendedor") or "").strip() or None,
        "label": comprobante_label(tipo, numero, serie),
    }


def _venta_cuenta_como_compra(row: dict[str, Any]) -> bool:
    if row.get("anulado"):
        return False
    return float(row.get("importe_final") or 0) > 0


def _mejor_ultima(actual: dict[str, Any] | None, candidato: dict[str, Any]) -> dict[str, Any]:
    if actual is None:
        return candidato
    f_act = str(actual.get("fecha") or "")[:10]
    f_new = str(candidato.get("fecha") or "")[:10]
    if f_new > f_act:
        return candidato
    if f_new < f_act:
        return actual
    imp_act = float((actual.get("comprobante") or {}).get("importe_final") or 0)
    imp_new = float((candidato.get("comprobante") or {}).get("importe_final") or 0)
    return candidato if imp_new >= imp_act else actual


def resolve_fecha_ultima_compra(
    padron_fuc: Any,
    enriched: dict[str, Any] | None,
) -> tuple[str | None, dict[str, Any] | None]:
    """(fecha ISO YYYY-MM-DD, comprobante | None)."""
    if enriched and enriched.get("fecha"):
        return str(enriched["fecha"])[:10], enriched.get("comprobante")
    if padron_fuc:
        f = str(padron_fuc).strip()[:10]
        if len(f) >= 10:
            return f, None
    return None, None


def fetch_ultima_compra_por_erp(
    dist_id: int,
    erp_ids: Iterable[str],
    *,
    ventana_dias: int = 450,
    fecha_hasta: date | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Mapa erp normalizado → {fecha, comprobante}.
    Escanea ventas_enriched en ventana [hasta - ventana_dias, hasta].
    """
    erp_raw: list[str] = []
    erp_norm_set: set[str] = set()
    for e in erp_ids:
        for v in erp_query_variants(str(e or "")):
            if not v:
                continue
            if v not in erp_raw:
                erp_raw.append(v)
            n = _norm_erp(v)
            if n:
                erp_norm_set.add(n)
    if not erp_norm_set:
        return {}

    hasta = fecha_hasta or date.today()
    desde = (hasta - timedelta(days=max(1, ventana_dias))).isoformat()
    hasta_s = hasta.isoformat()

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
    best: dict[str, dict[str, Any]] = {}

    # PostgREST: .in_ con lista grande; trocear ERPs crudos (incluye variantes con ceros).
    chunk_size = 400
    for i in range(0, len(erp_raw), chunk_size):
        chunk = erp_raw[i : i + chunk_size]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta_s)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                n = _norm_erp(row.get("id_cliente_erp"))
                if not n or n not in erp_norm_set:
                    continue
                cand = {
                    "fecha": str(row.get("fecha_factura") or "")[:10],
                    "comprobante": comprobante_from_venta_row(row),
                }
                best[n] = _mejor_ultima(best.get(n), cand)
            if len(batch) < PAGE:
                break
            offset += PAGE

    return best


def ultima_compra_en_periodo_por_cliente(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde: str,
    hasta: str,
) -> dict[int, dict[str, Any]]:
    """
    Por id_cliente: última venta en [desde, hasta] con detalle de comprobante.
    """
    desde_d = desde[:10]
    hasta_d = hasta[:10]
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

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
    best: dict[int, dict[str, Any]] = {}

    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
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
                .data or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                n = _norm_erp(row.get("id_cliente_erp"))
                cid = erp_to_cid.get(n) if n else None
                if cid is None:
                    continue
                cand = {
                    "fecha": str(row.get("fecha_factura") or "")[:10],
                    "comprobante": comprobante_from_venta_row(row),
                }
                best[cid] = _mejor_ultima(best.get(cid), cand)
            if len(batch) < PAGE:
                break
            offset += PAGE

    return best


def enrich_filas_fecha_ultima_compra(
    dist_id: int,
    filas: list[dict],
    *,
    erp_key: str = "id_cliente_erp",
    fecha_key: str = "fecha_ultima_compra",
    comprobante_key: str = "ultimo_comprobante",
) -> None:
    """
    In-place: setea fecha_ultima_compra y ultimo_comprobante en cada fila con ERP.
    """
    erps = [str(r.get(erp_key) or "").strip() for r in filas if r.get(erp_key)]
    by_erp = fetch_ultima_compra_por_erp(dist_id, erps)
    for r in filas:
        raw = str(r.get(erp_key) or "").strip()
        if not raw:
            continue
        ent = by_erp.get(_norm_erp(raw) or "")
        fuc, cbte = resolve_fecha_ultima_compra(r.get(fecha_key), ent)
        if fuc:
            r[fecha_key] = fuc
        if cbte:
            r[comprobante_key] = cbte


def overlay_padron_fuc_maps_from_ventas(
    dist_id: int,
    erp_fuc_map: dict[str, Any],
    id_cliente_fuc_map: dict[int, Any],
    erp_to_id_cliente: dict[str, int],
    erp_ids_raw: Iterable[str],
) -> dict[str, dict[str, Any]]:
    """
    Actualiza mapas FUC del padrón con ventas_enriched (solo si la venta es más reciente).
    Retorna comprobante por ERP normalizado para la UI.
    """
    by_erp = fetch_ultima_compra_por_erp(dist_id, erp_ids_raw)
    comprobante_by_erp: dict[str, dict[str, Any]] = {}
    for norm, ent in by_erp.items():
        f = str(ent.get("fecha") or "")[:10]
        if len(f) < 10:
            continue
        prev = str(erp_fuc_map.get(norm) or "")[:10]
        if not prev or f > prev:
            erp_fuc_map[norm] = f
            cbte = ent.get("comprobante")
            if cbte:
                comprobante_by_erp[norm] = cbte
        pk = erp_to_id_cliente.get(norm)
        if pk is not None:
            prev_pk = str(id_cliente_fuc_map.get(pk) or "")[:10]
            if not prev_pk or f > prev_pk:
                id_cliente_fuc_map[pk] = f
    return comprobante_by_erp


def _articulos_lista_desde_map(articulos_map: dict[str, Any]) -> list[dict[str, Any]]:
    articulos_raw = sorted(
        articulos_map.values(),
        key=lambda a: float(a.get("importe_final") or 0),
        reverse=True,
    )[:_MAX_ARTICULOS_UI]
    out: list[dict[str, Any]] = []
    for a in articulos_raw:
        desc = str(a.get("descripcion") or "")
        b = float(a.get("bultos_total") or 0)
        u = float(a.get("unidades_total") or 0)
        out.append(
            {
                "descripcion": desc,
                "bultos_total": b,
                "unidades_total": u,
                "importe_final": float(a.get("importe_final") or 0),
            }
        )
    return out


def comprobantes_ultima_fecha_from_docs(
    docs: dict[tuple[str, str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    """Todos los comprobantes de la fecha más reciente (mismo día), ordenados por importe desc."""
    if not docs:
        return []
    max_fecha = max(str(d.get("fecha") or "")[:10] for d in docs.values())
    if not max_fecha:
        return []
    items = [
        (_k, d)
        for _k, d in docs.items()
        if str(d.get("fecha") or "")[:10] == max_fecha
    ]
    items.sort(key=lambda x: float(x[1].get("importe_total") or 0), reverse=True)
    blocks: list[dict[str, Any]] = []
    for _k, d in items[:_MAX_COMPROBANTES_MISMO_DIA]:
        blocks.append(
            {
                "comprobante": d["comprobante"],
                "articulos": _articulos_lista_desde_map(d.get("articulos_map") or {}),
            }
        )
    return blocks


def _doc_key_row(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("fecha_factura") or "")[:10],
        (row.get("numero_documento") or "").strip(),
        (row.get("tipo_documento") or "").strip(),
    )


def _fetch_ventas_docs_por_erps(
    dist_id: int,
    erp_variants: list[str],
    *,
    ventana_dias: int = 450,
    fecha_hasta: date | None = None,
    nombre_fantasia: str | None = None,
    nombre_razon_social: str | None = None,
    filtrar_nombre: bool = False,
) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Acumula comprobantes de ventas para una lista de variantes ERP."""
    if not erp_variants:
        return {}

    hasta = fecha_hasta or date.today()
    desde = (hasta - timedelta(days=max(1, ventana_dias))).isoformat()
    hasta_s = hasta.isoformat()
    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_DETALLE)

    docs: dict[tuple[str, str, str], dict[str, Any]] = {}
    chunk_size = 400
    for i in range(0, len(erp_variants), chunk_size):
        chunk = erp_variants[i : i + chunk_size]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT_DETALLE)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta_s)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            for row in batch:
                if not _venta_cuenta_como_compra(row):
                    continue
                if filtrar_nombre and (nombre_fantasia or nombre_razon_social):
                    from core.cliente_nombre_match import cliente_nombre_coincide_padron

                    if not cliente_nombre_coincide_padron(
                        row.get("nombre_cliente"),
                        nombre_fantasia=nombre_fantasia,
                        nombre_razon_social=nombre_razon_social,
                    ):
                        continue
                key = _doc_key_row(row)
                if not key[0] or not key[1]:
                    continue
                doc = docs.get(key)
                if doc is None:
                    doc = {
                        "fecha": key[0],
                        "comprobante": comprobante_from_venta_row(row),
                        "importe_total": 0.0,
                        "articulos_map": {},
                    }
                    docs[key] = doc
                imp = float(row.get("importe_final") or 0)
                doc["importe_total"] += imp
                doc["comprobante"]["importe_final"] = doc["importe_total"]
                desc = (row.get("descripcion_articulo") or "").strip()
                cod = (row.get("cod_articulo") or "").strip()
                agr = (row.get("agrupacion_art_2") or "").strip()
                label = desc or cod or "Artículo"
                prev = doc["articulos_map"].get(
                    label,
                    {
                        "descripcion": label,
                        "bultos_total": 0.0,
                        "unidades_total": 0.0,
                        "importe_final": 0.0,
                    },
                )
                b_line = float(row.get("bultos_total") or 0)
                u_line = float(row.get("unidades_total") or 0)
                prev["bultos_total"] += b_line
                prev["unidades_total"] += _unidades_linea(desc, b_line, u_line, agr)
                prev["importe_final"] += imp
                doc["articulos_map"][label] = prev
            if len(batch) < PAGE:
                break
            offset += PAGE
    return docs


def fetch_ultima_compra_detalle_por_erp(
    dist_id: int,
    erp_id: str,
    *,
    ventana_dias: int = 450,
    fecha_hasta: date | None = None,
    nombre_fantasia: str | None = None,
    nombre_razon_social: str | None = None,
) -> dict[str, Any] | None:
    """
    Última compra de un ERP con líneas por comprobante.
    Si hay varios comprobantes el mismo día (última fecha), devuelve todos en `comprobantes`.
    Retorna {fecha, comprobante, articulos, comprobantes, comprobantes_mismo_dia, articulos_resumen} o None.
    """
    variants = erp_query_variants(erp_id)
    if not variants:
        return None

    docs = _fetch_ventas_docs_por_erps(
        dist_id,
        variants,
        ventana_dias=ventana_dias,
        fecha_hasta=fecha_hasta,
        nombre_fantasia=nombre_fantasia,
        nombre_razon_social=nombre_razon_social,
        filtrar_nombre=False,
    )
    if not docs and (nombre_fantasia or nombre_razon_social):
        docs = _fetch_ventas_docs_por_erps(
            dist_id,
            variants,
            ventana_dias=ventana_dias,
            fecha_hasta=fecha_hasta,
            nombre_fantasia=nombre_fantasia,
            nombre_razon_social=nombre_razon_social,
            filtrar_nombre=True,
        )

    if not docs:
        return None

    blocks = comprobantes_ultima_fecha_from_docs(docs)
    if not blocks:
        return None

    winner = blocks[0]
    articulos = winner["articulos"]
    max_fecha = max(str(d["fecha"])[:10] for d in docs.values())
    resumen_parts = [
        f"{a['descripcion']} ({_fmt_unidades(a['unidades_total'])})"
        for a in articulos[:3]
    ]
    return {
        "fecha": max_fecha,
        "comprobante": winner["comprobante"],
        "articulos": articulos,
        "comprobantes": blocks,
        "comprobantes_mismo_dia": len(blocks),
        "articulos_resumen": " · ".join(resumen_parts) if resumen_parts else None,
    }


def apply_ultima_compra_enriched(
    cliente: dict[str, Any],
    enriched: dict[str, Any] | None,
    *,
    detalle: dict[str, Any] | None = None,
) -> None:
    """In-place: fecha_ultima_compra, ultimo_comprobante, ultima_compra_articulos."""
    fuc, cbte = resolve_fecha_ultima_compra(cliente.get("fecha_ultima_compra"), enriched)
    if detalle:
        fuc = str(detalle.get("fecha") or fuc or "")[:10] or fuc
        cbte = detalle.get("comprobante") or cbte
    if fuc:
        cliente["fecha_ultima_compra"] = fuc
    if cbte:
        cliente["ultimo_comprobante"] = cbte
    if detalle and detalle.get("articulos"):
        cliente["ultima_compra_articulos"] = detalle["articulos"]
    if detalle and detalle.get("comprobantes"):
        cliente["ultima_compra_comprobantes"] = detalle["comprobantes"]
    if detalle and detalle.get("articulos_resumen"):
        cliente["ultima_compra_articulos_resumen"] = detalle["articulos_resumen"]


def enrich_cliente_dict(
    dist_id: int,
    cliente: dict,
    *,
    enriched_by_erp: dict[str, dict[str, Any]] | None = None,
    con_articulos: bool = False,
) -> dict:
    """Retorna copia superficial con fecha/comprobante resueltos."""
    erp = str(cliente.get("id_cliente_erp") or "").strip()
    ent = None
    if enriched_by_erp is not None and erp:
        ent = enriched_by_erp.get(_norm_erp(erp) or "")
    elif erp:
        ent = fetch_ultima_compra_por_erp(dist_id, [erp]).get(_norm_erp(erp) or "")
    detalle = None
    if con_articulos and erp:
        detalle = fetch_ultima_compra_detalle_por_erp(dist_id, erp)
        if detalle and not ent:
            ent = {"fecha": detalle["fecha"], "comprobante": detalle.get("comprobante")}
    out = {**cliente}
    apply_ultima_compra_enriched(out, ent, detalle=detalle if con_articulos else None)
    return out
