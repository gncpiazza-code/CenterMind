# -*- coding: utf-8 -*-
"""
Ingesta de ventas enriquecidas (Reporteador Genérico: Informe de Ventas).
"""

from __future__ import annotations

import logging
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name
from services.ventas_enriched_parser import parse_informe_ventas_enriched
from services.ventas_ingestion_service import TENANT_DIST_MAP

logger = logging.getLogger("VentasEnrichedIngestion")


def ingest_enriched(tenant_id: str, file_bytes: bytes) -> dict[str, Any]:
    dist_id = TENANT_DIST_MAP.get((tenant_id or "").strip().lower())
    if not dist_id:
        raise ValueError(f"tenant_id desconocido para enriquecido: {tenant_id}")

    rows = parse_informe_ventas_enriched(file_bytes)
    if not rows:
        return {"ok": True, "rows": 0, "upserted": 0, "dist_id": dist_id}

    payload: list[dict[str, Any]] = []
    tenant_table = tenant_table_name("ventas_enriched_v2", dist_id)
    for r in rows:
        payload.append(
            {
                "id_distribuidor": dist_id,
                "tenant_id": tenant_id,
                "fecha_factura": r.get("fecha_factura"),
                "fecha_pedido": r.get("fecha_pedido"),
                "anulado": bool(r.get("anulado", False)),
                "tipo_documento": r.get("tipo_documento"),
                "serie": r.get("serie"),
                "numero_documento": r.get("numero_documento"),
                "id_cliente_erp": r.get("id_cliente_erp"),
                "nombre_cliente": r.get("nombre_cliente"),
                "codigo_vendedor": r.get("codigo_vendedor"),
                "nombre_vendedor": r.get("nombre_vendedor"),
                "ruta": r.get("ruta"),
                "cod_articulo": r.get("cod_articulo"),
                "descripcion_articulo": r.get("descripcion_articulo"),
                "agrupacion_art_1": r.get("agrupacion_art_1"),
                "agrupacion_art_2": r.get("agrupacion_art_2"),
                "canal": r.get("canal"),
                "subcanal": r.get("subcanal"),
                "subcanal_mkt": r.get("subcanal_mkt"),
                "bultos_total": float(r.get("bultos_total") or 0.0),
                "unidades_total": float(r.get("unidades_total") or 0.0),
                "importe_final": float(r.get("importe_final") or 0.0),
                "importe_neto": float(r.get("importe_neto") or 0.0),
                "importe_bruto": float(r.get("importe_bruto") or 0.0),
                "raw_json": r,
            }
        )

    # Deduplicación in-memory para evitar conflictos repetidos del mismo archivo.
    merged: dict[tuple, dict[str, Any]] = {}
    for p in payload:
        key = (
            p.get("id_distribuidor"),
            p.get("fecha_factura"),
            p.get("numero_documento"),
            p.get("id_cliente_erp"),
            p.get("cod_articulo"),
        )
        prev = merged.get(key)
        if prev is None:
            merged[key] = dict(p)
            continue
        prev["bultos_total"] = float(prev.get("bultos_total") or 0.0) + float(p.get("bultos_total") or 0.0)
        prev["unidades_total"] = float(prev.get("unidades_total") or 0.0) + float(p.get("unidades_total") or 0.0)
        prev["importe_final"] = float(prev.get("importe_final") or 0.0) + float(p.get("importe_final") or 0.0)
        prev["importe_neto"] = float(prev.get("importe_neto") or 0.0) + float(p.get("importe_neto") or 0.0)
        prev["importe_bruto"] = float(prev.get("importe_bruto") or 0.0) + float(p.get("importe_bruto") or 0.0)

    records = list(merged.values())
    
    # Acumular fecha más reciente por cliente (para actualizar fecha_ultima_compra)
    ids_cliente_erp_actualizados: dict[str, str] = {}
    for r in records:
        fecha = r.get("fecha_factura")
        id_cliente_erp = r.get("id_cliente_erp")
        anulado = r.get("anulado")
        # Ignorar anulados o devoluciones (importe negativo)
        if not fecha or not id_cliente_erp or anulado or r.get("importe_final", 0) < 0:
            continue
            
        id_cliente_erp_str = str(id_cliente_erp)
        prev = ids_cliente_erp_actualizados.get(id_cliente_erp_str)
        if not prev or fecha > prev:
            ids_cliente_erp_actualizados[id_cliente_erp_str] = fecha

    upserted = 0
    BATCH = 500
    for i in range(0, len(records), BATCH):
        chunk = records[i : i + BATCH]
        sb.table("ventas_enriched_v2").upsert(
            chunk,
            on_conflict="id_distribuidor,fecha_factura,numero_documento,id_cliente_erp,cod_articulo",
        ).execute()
        sb.table(tenant_table).upsert(
            chunk,
            on_conflict="id_distribuidor,fecha_factura,numero_documento,id_cliente_erp,cod_articulo",
        ).execute()
        upserted += len(chunk)

    logger.info("[ventas_enriched] dist=%s rows=%s upserted=%s", dist_id, len(rows), upserted)

    # Actualizar fecha_ultima_compra en clientes_pdv_v2
    actualizados = 0
    for id_cliente_erp, fecha_str in ids_cliente_erp_actualizados.items():
        try:
            sb.table(tenant_table_name("clientes_pdv_v2", dist_id)) \
                .update({"fecha_ultima_compra": fecha_str}) \
                .eq("id_cliente_erp", id_cliente_erp) \
                .lt("fecha_ultima_compra", fecha_str) \
                .execute()
            actualizados += 1
        except Exception as e:
            logger.warning(f"[ventas_enriched] No se pudo actualizar cliente_erp {id_cliente_erp}: {e}")

    logger.info(f"[ventas_enriched] fecha_ultima_compra actualizada: {actualizados} clientes")

    # Actualizar progreso de objetivos activos
    try:
        from services.objetivos_watcher_service import objetivos_watcher
        objetivos_watcher.run_watcher(dist_id)
    except Exception as e_watch:
        logger.warning(f"[ventas_enriched] Watcher de objetivos omitido: {e_watch}")

    # Registrar en motor_runs
    try:
        sb.table("motor_runs").insert({
            "dist_id": dist_id,
            "motor": "ventas_enriched",
            "estado": "ok",
            "registros": {"rows": len(rows), "upserted": upserted, "actualizados": actualizados}
        }).execute()
    except Exception as e:
        logger.warning(f"[ventas_enriched] No se pudo registrar en motor_runs: {e}")

    return {"ok": True, "rows": len(rows), "upserted": upserted, "actualizados": actualizados, "dist_id": dist_id}
