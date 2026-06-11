# -*- coding: utf-8 -*-
"""
Ingesta de ventas enriquecidas (Reporteador Genérico: Informe de Ventas).
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name
from services.ventas_enriched_parser import parse_informe_ventas_enriched
from services.ventas_ingestion_service import TENANT_DIST_MAP

logger = logging.getLogger("VentasEnrichedIngestion")

_UPSERT_BATCH = 100
_UPSERT_MAX_RETRIES = 5


def _upsert_ventas_chunk(table: str, chunk: list[dict[str, Any]]) -> None:
    """Upsert con reintentos y subdivisión ante statement timeout (MTD grande)."""
    if not chunk:
        return
    last_err: Exception | None = None
    for attempt in range(1, _UPSERT_MAX_RETRIES + 1):
        try:
            sb.table(table).upsert(
                chunk,
                on_conflict="id_distribuidor,fecha_factura,numero_documento,id_cliente_erp,cod_articulo",
            ).execute()
            return
        except Exception as e:
            last_err = e
            msg = str(e).lower()
            if ("57014" in msg or "statement timeout" in msg) and len(chunk) > 25:
                mid = len(chunk) // 2
                _upsert_ventas_chunk(table, chunk[:mid])
                _upsert_ventas_chunk(table, chunk[mid:])
                return
            time.sleep(min(2 * attempt, 12))
    if last_err:
        raise last_err


def _start_run(dist_id: int) -> int:
    res = sb.table("motor_runs").insert({
        "motor": "ventas_enriched",
        "dist_id": dist_id,
        "estado": "en_curso",
        "iniciado_en": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return int(res.data[0]["id"])


def _finish_run(
    run_id: int,
    estado: str,
    *,
    dist_id: int,
    registros: dict[str, Any] | None = None,
    error_msg: str | None = None,
) -> None:
    sb.table("motor_runs").update({
        "estado": estado,
        "finalizado_en": datetime.now(timezone.utc).isoformat(),
        "registros": registros,
        "error_msg": (error_msg or "")[:500] or None,
    }).eq("id", run_id).execute()
    if estado == "error" and error_msg:
        try:
            from services.motor_ops_notification_service import notify_run_error

            notify_run_error("ventas_enriched", dist_id, error_msg[:500], run_id)
        except Exception as e_ops:
            logger.debug("[ventas_enriched] notify ops omitido: %s", e_ops)


def _resolve_dist_id(tenant_id: str) -> int:
    dist_id = TENANT_DIST_MAP.get((tenant_id or "").strip().lower())
    if not dist_id:
        raise ValueError(f"tenant_id desconocido para enriquecido: {tenant_id}")
    return int(dist_id)


def ingest_enriched_rpa_background(tenant_id: str, file_bytes: bytes, run_id: int) -> None:
    """Worker en thread: parseo + upsert pesado fuera del request HTTP."""
    tid = (tenant_id or "").strip().lower()
    try:
        dist_id = _resolve_dist_id(tid)
    except ValueError as e:
        logger.error("[ventas_enriched RPA] tenant inválido %s: %s", tenant_id, e)
        return
    try:
        ingest_enriched(tid, file_bytes, run_id=run_id)
    except Exception as exc:
        logger.exception(
            "[ventas_enriched RPA] ingest falló tras POST async (dist=%s run=%s): %s",
            dist_id,
            run_id,
            exc,
        )


def record_sin_cambios_run(dist_id: int, source: str = "rpa_hash_guard") -> int:
    """
    Registra verificación RPA sin re-ingesta (Hash Guard / sin movimientos).
    Mantiene motor_runs y el badge de sync al día aunque no haya upsert.
    """
    run_id = _start_run(dist_id)
    _finish_run(
        run_id,
        "ok",
        dist_id=dist_id,
        registros={
            "sin_cambios": True,
            "skipped": True,
            "reason": source,
            "rows": 0,
            "upserted": 0,
        },
    )
    return run_id


def accept_enriched_upload(tenant_id: str, file_bytes: bytes) -> dict[str, Any]:
    """
    Valida tenant, crea motor_run en_curso y devuelve payload para 202 Accepted.
    La ingesta corre en thread (ver ingest_enriched_rpa_background).
    """
    tid = (tenant_id or "").strip().lower()
    dist_id = _resolve_dist_id(tid)
    if not file_bytes:
        raise ValueError("Archivo vacío")
    run_id = _start_run(dist_id)
    threading.Thread(
        target=ingest_enriched_rpa_background,
        args=(tid, file_bytes, run_id),
        daemon=True,
    ).start()
    return {
        "status": "accepted",
        "ok": True,
        "dist_id": dist_id,
        "run_id": run_id,
        "tenant_id": tid,
        "bytes": len(file_bytes),
        "message": (
            f"Informe ventas recibido para {tid} (dist {dist_id}, "
            f"{len(file_bytes):,} bytes). Procesando en segundo plano."
        ),
    }


def ingest_enriched(
    tenant_id: str,
    file_bytes: bytes,
    *,
    run_id: int | None = None,
) -> dict[str, Any]:
    tid = (tenant_id or "").strip().lower()
    dist_id = _resolve_dist_id(tid)
    own_run = run_id is None
    if own_run:
        run_id = _start_run(dist_id)

    try:
        result = _ingest_enriched_core(tid, dist_id, file_bytes)
        _finish_run(
            run_id,
            "ok",
            dist_id=dist_id,
            registros={
                "rows": result["rows"],
                "upserted": result["upserted"],
                "actualizados": result["actualizados"],
            },
        )
        return result
    except Exception as e:
        _finish_run(run_id, "error", dist_id=dist_id, error_msg=str(e))
        raise


def _ingest_enriched_core(
    tenant_id: str,
    dist_id: int,
    file_bytes: bytes,
) -> dict[str, Any]:
    rows = parse_informe_ventas_enriched(file_bytes)
    if not rows:
        return {
            "ok": True,
            "rows": 0,
            "upserted": 0,
            "actualizados": 0,
            "dist_id": dist_id,
        }

    payload: list[dict[str, Any]] = []
    tenant_table = tenant_table_name("ventas_enriched_v2", dist_id)
    for r in rows:
        payload.append(
            {
                "id_distribuidor": dist_id,
                "tenant_id": tenant_id.strip().lower() if isinstance(tenant_id, str) else tenant_id,
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
    
    # Fechas padrón solo si nomcli del informe coincide con el PDV (mismo id_cliente_erp).
    from core.cliente_nombre_match import cliente_nombre_coincide_padron
    from core.compras_fechas import _padron_nombres_por_erp

    erps_en_archivo = {
        str(r.get("id_cliente_erp") or "").strip()
        for r in records
        if str(r.get("id_cliente_erp") or "").strip()
    }
    padron_nombres = _padron_nombres_por_erp(dist_id, erps_en_archivo)

    ids_cliente_erp_actualizados: dict[str, str] = {}
    for r in records:
        fecha = r.get("fecha_factura")
        id_cliente_erp = r.get("id_cliente_erp")
        anulado = r.get("anulado")
        if not fecha or not id_cliente_erp or anulado or r.get("importe_final", 0) < 0:
            continue

        id_cliente_erp_str = str(id_cliente_erp).strip()
        pnom = padron_nombres.get(id_cliente_erp_str) or {}
        if pnom and not cliente_nombre_coincide_padron(
            r.get("nombre_cliente"),
            nombre_fantasia=pnom.get("nombre_fantasia"),
            nombre_razon_social=pnom.get("nombre_razon_social"),
        ):
            continue

        prev = ids_cliente_erp_actualizados.get(id_cliente_erp_str)
        if not prev or fecha > prev:
            ids_cliente_erp_actualizados[id_cliente_erp_str] = fecha

    upserted = 0
    for i in range(0, len(records), _UPSERT_BATCH):
        chunk = records[i : i + _UPSERT_BATCH]
        _upsert_ventas_chunk("ventas_enriched_v2", chunk)
        _upsert_ventas_chunk(tenant_table, chunk)
        upserted += len(chunk)
        if i and i % 2000 == 0:
            logger.info(
                "[ventas_enriched] dist=%s progreso upsert %s/%s",
                dist_id,
                min(i + _UPSERT_BATCH, len(records)),
                len(records),
            )

    logger.info("[ventas_enriched] dist=%s rows=%s upserted=%s", dist_id, len(rows), upserted)

    # Actualizar fecha_ultima_compra + fecha_compra_anterior (días distintos)
    actualizados = 0
    try:
        from core.compras_fechas import batch_update_fechas_compra_desde_ventas

        actualizados = batch_update_fechas_compra_desde_ventas(
            dist_id,
            ids_cliente_erp_actualizados.keys(),
            nuevas_por_erp=ids_cliente_erp_actualizados,
        )
    except Exception as e:
        logger.warning(f"[ventas_enriched] batch fechas compra falló: {e}")

    logger.info(
        "[ventas_enriched] fechas compra (ultima+anterior) actualizadas: %s clientes",
        actualizados,
    )

    # Actualizar progreso de objetivos activos
    try:
        from services.objetivos_watcher_service import objetivos_watcher
        objetivos_watcher.run_watcher(dist_id)
    except Exception as e_watch:
        logger.warning(f"[ventas_enriched] Watcher de objetivos omitido: {e_watch}")

    try:
        from services.snapshot_refresh_service import refresh_eager
        refresh_eager(dist_id, ["estadisticas", "dashboard"])
    except Exception as e_snap:
        logger.warning(f"[ventas_enriched] snapshot refresh_eager omitido: {e_snap}")

    return {
        "ok": True,
        "rows": len(rows),
        "upserted": upserted,
        "actualizados": actualizados,
        "dist_id": dist_id,
    }
