# -*- coding: utf-8 -*-
"""Insight comercial PDV para Galería — no requiere fila en cc_detalle."""

from __future__ import annotations

from datetime import date
from typing import Any

from db import sb
from core.cc_deuda_match import match_comprobantes_adeudo_cc
from core.tenant_tables import tenant_table_name
from core.ventas_enriched_tenant import filter_ventas_rows_for_tenant, ventas_enriched_base_query
from core.ultima_compra import (
    apply_ultima_compra_enriched,
    erp_query_variants,
    fetch_ultima_compra_detalle_por_erp,
    fetch_ultima_compra_por_erp,
)

PAGE = 1000


def _venta_es_compra(row: dict[str, Any]) -> bool:
    if row.get("anulado"):
        return False
    tipo = (row.get("tipo_documento") or "").upper()
    if any(k in tipo for k in ("RECIBO", "RECAUDACION", "COBRO", "PAGO")):
        return False
    return float(row.get("importe_final") or 0) >= 0


def _comprobante_label(tipo: str | None, numero: str | None) -> str:
    parts = [(tipo or "").strip(), (numero or "").strip()]
    return " ".join(p for p in parts if p) or (numero or "Comprobante")


def fetch_ventas_enriched_periodo(
    dist_id: int,
    id_cliente_erp: str,
    desde: str,
    hasta: str,
) -> list[dict[str, Any]]:
    """Ventas enriched del ERP (variantes) en [desde, hasta] inclusive."""
    variants = erp_query_variants(id_cliente_erp)
    if not variants or not desde or not hasta:
        return []

    cols = (
        "fecha_factura, tipo_documento, numero_documento, serie, "
        "cod_articulo, descripcion_articulo, bultos_total, importe_final, anulado"
    )
    ventas_ctx, q_ventas = ventas_enriched_base_query(sb, dist_id, cols)
    rows: list[dict] = []
    chunk_size = 400
    for i in range(0, len(variants), chunk_size):
        chunk = variants[i : i + chunk_size]
        offset = 0
        while True:
            batch = (
                q_ventas.in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde)
                .lte("fecha_factura", hasta)
                .order("fecha_factura", desc=True)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
    return [r for r in rows if _venta_es_compra(r)]


def aggregate_ventas_comprobantes(ventas_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa líneas enriched en comprobantes (remitos) ordenados por fecha desc."""
    by_doc: dict[str, dict[str, Any]] = {}
    for row in ventas_rows:
        num = (row.get("numero_documento") or "").strip()
        if not num:
            continue
        fecha = str(row.get("fecha_factura") or "")[:10]
        key = f"{fecha}|{num}"
        if key not in by_doc:
            by_doc[key] = {
                "numero": num,
                "fecha": fecha,
                "tipo_documento": (row.get("tipo_documento") or "").strip() or None,
                "importe_total": 0.0,
                "articulos": [],
            }
        by_doc[key]["importe_total"] += float(row.get("importe_final") or 0)
        cod = (row.get("cod_articulo") or "").strip()
        desc = (row.get("descripcion_articulo") or "").strip()
        if cod or desc:
            by_doc[key]["articulos"].append(
                {
                    "cod_articulo": cod,
                    "descripcion": desc,
                    "bultos_total": float(row.get("bultos_total") or 0),
                    "importe_final": float(row.get("importe_final") or 0),
                }
            )

    out: list[dict[str, Any]] = []
    for doc in by_doc.values():
        doc["label"] = _comprobante_label(doc.get("tipo_documento"), doc.get("numero"))
        doc["match_status"] = "matched"
        out.append(doc)
    out.sort(key=lambda d: (d.get("fecha") or "", d.get("numero") or ""), reverse=True)
    return out


def _load_pdv_por_erp(dist_id: int, erp_raw: str) -> dict[str, Any] | None:
    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    variants = erp_query_variants(erp_raw)
    if not variants:
        return None

    pdv: dict | None = None
    for i in range(0, len(variants), 400):
        chunk = variants[i : i + 400]
        res = (
            sb.table(t_clientes)
            .select(
                "id_cliente, nombre_fantasia, nombre_razon_social, telefono, celular, "
                "domicilio, latitud, longitud, id_ruta, fecha_ultima_compra, id_cliente_erp"
            )
            .eq("id_distribuidor", dist_id)
            .in_("id_cliente_erp", chunk)
            .limit(1)
            .execute()
            .data
            or []
        )
        if res:
            pdv = res[0]
            break
    if not pdv:
        return None

    perfil: dict[str, Any] = {
        "nombre_fantasia": pdv.get("nombre_fantasia"),
        "razon_social": pdv.get("nombre_razon_social"),
        "telefono": pdv.get("telefono"),
        "celular": pdv.get("celular"),
        "domicilio": pdv.get("domicilio"),
        "latitud": pdv.get("latitud"),
        "longitud": pdv.get("longitud"),
        "dia_visita": None,
        "ruta_numero": None,
        "ruta_nombre": None,
        "id_cliente_erp": str(pdv.get("id_cliente_erp") or erp_raw).strip(),
    }

    id_ruta = pdv.get("id_ruta")
    if id_ruta:
        ruta_res = (
            sb.table(t_rutas)
            .select("id_ruta, id_ruta_erp, dia_semana")
            .eq("id_ruta", int(id_ruta))
            .limit(1)
            .execute()
            .data
            or []
        )
        if ruta_res:
            r = ruta_res[0]
            perfil["dia_visita"] = r.get("dia_semana")
            perfil["ruta_numero"] = str(r.get("id_ruta_erp") or "")
            perfil["ruta_nombre"] = str(r.get("id_ruta_erp") or "")

    try:
        detalle_uc = fetch_ultima_compra_detalle_por_erp(
            dist_id,
            erp_raw,
            nombre_fantasia=pdv.get("nombre_fantasia"),
            nombre_razon_social=pdv.get("nombre_razon_social"),
        )
        if detalle_uc:
            stub = {"fecha_ultima_compra": pdv.get("fecha_ultima_compra")}
            ent = {"fecha": detalle_uc["fecha"], "comprobante": detalle_uc.get("comprobante")}
            apply_ultima_compra_enriched(stub, ent, detalle=detalle_uc)
            if stub.get("fecha_ultima_compra"):
                perfil["fecha_ultima_compra"] = str(stub["fecha_ultima_compra"])[:10]
            if stub.get("ultimo_comprobante"):
                perfil["ultimo_comprobante"] = stub["ultimo_comprobante"]
            if stub.get("ultima_compra_articulos"):
                perfil["ultima_compra_articulos"] = stub["ultima_compra_articulos"]
            if stub.get("ultima_compra_articulos_resumen"):
                perfil["ultima_compra_articulos_resumen"] = stub["ultima_compra_articulos_resumen"]
        elif pdv.get("fecha_ultima_compra"):
            perfil["fecha_ultima_compra"] = str(pdv["fecha_ultima_compra"])[:10]
    except Exception:
        if pdv.get("fecha_ultima_compra"):
            perfil["fecha_ultima_compra"] = str(pdv["fecha_ultima_compra"])[:10]

    return perfil


def build_galeria_pdv_insight(
    dist_id: int,
    id_cliente_erp: str,
    *,
    desde: str | None = None,
    hasta: str | None = None,
    hoy: date | None = None,
) -> dict[str, Any]:
    """
    Perfil + compras del período (ventas enriched) + deuda CC opcional.
    No falla si el cliente no está en cc_detalle.
    """
    erp_raw = str(id_cliente_erp).strip()
    perfil = _load_pdv_por_erp(dist_id, erp_raw)
    if not perfil:
        return {"found": False}

    desde_s = (desde or "")[:10]
    hasta_s = (hasta or "")[:10]
    ventas_periodo = (
        fetch_ventas_enriched_periodo(dist_id, erp_raw, desde_s, hasta_s)
        if desde_s and hasta_s
        else []
    )
    comprobantes_mes = aggregate_ventas_comprobantes(ventas_periodo)

    cc_rows = (
        sb.table("cc_detalle")
        .select(
            "id_cliente, id_cliente_erp, cliente_nombre, deuda_total, "
            "deuda_7_dias, deuda_15_dias, deuda_30_dias, deuda_60_dias, "
            "deuda_mas_60_dias, antiguedad_dias, rango_antiguedad, "
            "cantidad_comprobantes, vendedor_nombre, id_vendedor"
        )
        .eq("id_distribuidor", dist_id)
        .eq("id_cliente_erp", erp_raw)
        .limit(1)
        .execute()
        .data
        or []
    )

    deuda_block = {
        "total_deuda": 0.0,
        "antiguedad_dias": 0,
        "rango_antiguedad": None,
        "cantidad_comprobantes": 0,
        "desglose_antiguedad": [
            {"rango": "1-7d", "monto": 0.0},
            {"rango": "8-15d", "monto": 0.0},
            {"rango": "16-30d", "monto": 0.0},
            {"rango": "31-60d", "monto": 0.0},
            {"rango": "+60d", "monto": 0.0},
        ],
    }
    comprobantes_deuda: list[dict] = []
    estado = "sin_comprobantes"
    confianza = None
    resumen = None

    if cc_rows:
        cc_row = cc_rows[0]
        deuda_block = {
            "total_deuda": float(cc_row.get("deuda_total") or 0),
            "antiguedad_dias": int(cc_row.get("antiguedad_dias") or 0),
            "rango_antiguedad": cc_row.get("rango_antiguedad"),
            "cantidad_comprobantes": int(cc_row.get("cantidad_comprobantes") or 0),
            "desglose_antiguedad": [
                {"rango": "1-7d", "monto": float(cc_row.get("deuda_7_dias") or 0)},
                {"rango": "8-15d", "monto": float(cc_row.get("deuda_15_dias") or 0)},
                {"rango": "16-30d", "monto": float(cc_row.get("deuda_30_dias") or 0)},
                {"rango": "31-60d", "monto": float(cc_row.get("deuda_60_dias") or 0)},
                {"rango": "+60d", "monto": float(cc_row.get("deuda_mas_60_dias") or 0)},
            ],
        }
        hoy = hoy or date.today()
        match = match_comprobantes_adeudo_cc(cc_row, dist_id, erp_raw, hoy=hoy)
        comprobantes_deuda = match.get("comprobantes") or []
        estado = match.get("estado") or "sin_comprobantes"
        confianza = match.get("confianza")
        resumen = match.get("resumen")

    return {
        "found": True,
        "perfil": perfil,
        "deuda": deuda_block,
        "estado": estado,
        "confianza": confianza,
        "comprobantes": comprobantes_deuda,
        "comprobantes_mes": comprobantes_mes,
        "comprobantes_adeuda_resumen": resumen,
        "fuente_deuda": "cc_detalle" if cc_rows else None,
        "fuente_comprobantes": "ventas_enriched_v2",
    }
