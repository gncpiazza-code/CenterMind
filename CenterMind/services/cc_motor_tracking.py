# -*- coding: utf-8 -*-
"""Registro en motor_runs para ingesta de cuentas corrientes (métricas estilo padrón)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from db import sb

logger = logging.getLogger("CCMotorTracking")

_CC_METRIC_KEYS = (
    "registros_cc",
    "vendedores",
    "clientes",
    "alertas_credito",
    "deuda_total",
    "fecha_snapshot",
)


def build_cc_registros_from_rows(rows: list[dict], fecha_snapshot: str) -> dict[str, Any]:
    """Desde filas crudas del parser RPA (antes de enrich)."""
    pseudo = [
        {
            "vendedor_nombre": (r.get("vendedor") or r.get("Vendedor") or "").strip(),
            "deuda_total": (
                r.get("deuda_total")
                or r.get("saldo_total")
                or r.get("Saldo Total")
                or 0
            ),
            "alerta_credito": r.get("alerta_credito") or r.get("Alerta de Crédito") or "",
        }
        for r in rows
    ]
    return build_cc_registros_from_records(pseudo, fecha_snapshot)


def build_cc_registros_from_records(records: list[dict], fecha_snapshot: str) -> dict[str, Any]:
    """Métricas del snapshot a persistir en motor_runs.registros."""
    if not records:
        return {
            "registros_cc": 0,
            "vendedores": 0,
            "clientes": 0,
            "alertas_credito": 0,
            "deuda_total": 0.0,
            "fecha_snapshot": fecha_snapshot,
        }
    vendedores: set[str] = set()
    deuda = 0.0
    alertas = 0
    for r in records:
        vn = (r.get("vendedor_nombre") or "").strip()
        if vn:
            vendedores.add(vn.lower())
        deuda += float(r.get("deuda_total") or 0)
        alert = (r.get("alerta_credito") or "").strip()
        if alert and alert.lower() not in ("", "ok", "sin alerta", "n/a"):
            alertas += 1
    return {
        "registros_cc": len(records),
        "vendedores": len(vendedores),
        "clientes": len(records),
        "alertas_credito": alertas,
        "deuda_total": round(deuda, 2),
        "fecha_snapshot": fecha_snapshot,
    }


def build_cc_registros_from_detalle(dist_id: int) -> dict[str, Any] | None:
    """Lee cc_detalle actual y arma métricas (backfill / digest)."""
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    try:
        while True:
            chunk = (
                sb.table("cc_detalle")
                .select(
                    "vendedor_nombre, cliente_nombre, deuda_total, alerta_credito, "
                    "fecha_snapshot, created_at"
                )
                .eq("id_distribuidor", int(dist_id))
                .range(offset, offset + page_size - 1)
                .execute()
            ).data or []
            if not chunk:
                break
            rows.extend(chunk)
            if len(chunk) < page_size:
                break
            offset += page_size
    except Exception as e:
        logger.warning("[CCMotor] leer cc_detalle dist=%s: %s", dist_id, e)
        return None
    if not rows:
        return None
    fecha = rows[0].get("fecha_snapshot") or ""
    pseudo = [
        {
            "vendedor_nombre": r.get("vendedor_nombre"),
            "deuda_total": r.get("deuda_total"),
            "alerta_credito": r.get("alerta_credito"),
        }
        for r in rows
    ]
    regs = build_cc_registros_from_records(pseudo, str(fecha))
    regs["created_at"] = rows[0].get("created_at")
    return regs


def start_cc_motor_run(dist_id: int) -> int | None:
    try:
        res = sb.table("motor_runs").insert({
            "motor": "cuentas_corrientes",
            "dist_id": int(dist_id),
            "estado": "en_curso",
            "iniciado_en": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.warning("[CCMotor] start dist=%s: %s", dist_id, e)
        return None


def finish_cc_motor_run(
    run_id: int | None,
    dist_id: int,
    estado: str,
    registros: dict[str, Any] | int | None = None,
    *,
    error_msg: str | None = None,
    sin_cambios: bool = False,
    source: str | None = None,
) -> None:
    regs: dict[str, Any]
    if isinstance(registros, int):
        regs = {"registros_cc": registros}
    elif isinstance(registros, dict):
        regs = dict(registros)
    else:
        regs = {}
    if sin_cambios:
        regs = {**regs, "sin_cambios": True, "skipped": True, "reason": source or "hash_guard"}
    if source:
        regs["source"] = source

    if run_id:
        try:
            sb.table("motor_runs").update({
                "estado": estado,
                "finalizado_en": datetime.now(timezone.utc).isoformat(),
                "registros": regs,
                "error_msg": error_msg,
            }).eq("id", run_id).execute()
        except Exception as e:
            logger.warning("[CCMotor] finish id=%s: %s", run_id, e)

    try:
        from services.motor_ops_notification_service import on_cc_run_finished
        saved = int(regs.get("registros_cc") or 0)
        on_cc_run_finished(dist_id, run_id, estado, saved, error_msg)
    except Exception:
        pass

    if estado == "ok":
        try:
            from services.snapshot_refresh_service import handle_ingestion_event
            handle_ingestion_event("cuentas_corrientes", dist_id)
        except Exception as e_snap:
            logger.debug("[CCMotor] snapshot invalidate omitido: %s", e_snap)


def record_cc_sin_cambios(dist_id: int, source: str = "rpa_hash_guard") -> int | None:
    run_id = start_cc_motor_run(dist_id)
    finish_cc_motor_run(
        run_id, dist_id, "ok", {"registros_cc": 0},
        sin_cambios=True, source=source,
    )
    return run_id


def backfill_cc_motor_runs_from_detalle(*, skip_if_recent_hours: float = 24) -> list[int]:
    """
    Crea un motor_run OK por distribuidor con datos actuales en cc_detalle.
    Útil cuando el RPA guardó filas pero no había tracking en motor_runs.
    """
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(hours=skip_if_recent_hours)
    created_ids: list[int] = []
    try:
        dists = (
            sb.table("distribuidores")
            .select("id_distribuidor")
            .eq("estado", "activo")
            .execute()
        ).data or []
    except Exception as e:
        logger.warning("[CCMotor] backfill dists: %s", e)
        return created_ids

    for d in dists:
        dist_id = int(d["id_distribuidor"])
        try:
            recent = (
                sb.table("motor_runs")
                .select("id")
                .eq("motor", "cuentas_corrientes")
                .eq("dist_id", dist_id)
                .gte("iniciado_en", since.isoformat())
                .limit(1)
                .execute()
            )
            if recent.data:
                continue
        except Exception:
            pass

        regs = build_cc_registros_from_detalle(dist_id)
        if not regs or not regs.get("registros_cc"):
            continue

        ts = regs.pop("created_at", None) or datetime.now(timezone.utc).isoformat()
        try:
            res = sb.table("motor_runs").insert({
                "motor": "cuentas_corrientes",
                "dist_id": dist_id,
                "estado": "ok",
                "iniciado_en": ts,
                "finalizado_en": ts,
                "registros": {**regs, "source": "cc_detalle_backfill"},
            }).execute()
            if res.data:
                created_ids.append(int(res.data[0]["id"]))
        except Exception as e:
            logger.warning("[CCMotor] backfill insert dist=%s: %s", dist_id, e)
    return created_ids


def close_padron_zombie_runs() -> list[int]:
    """Cierra runs padron en_curso con más de 2h."""
    from datetime import timedelta

    closed: list[int] = []
    try:
        two_h = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        zombies = (
            sb.table("motor_runs")
            .select("id, dist_id, iniciado_en")
            .eq("motor", "padron")
            .eq("estado", "en_curso")
            .lt("iniciado_en", two_h)
            .execute()
        ).data or []
        now = datetime.now(timezone.utc).isoformat()
        for z in zombies:
            rid = int(z["id"])
            sb.table("motor_runs").update({
                "estado": "error",
                "finalizado_en": now,
                "error_msg": (
                    "Cerrado automático: run zombie (en_curso >2h, "
                    f"iniciado {z.get('iniciado_en')})"
                ),
            }).eq("id", rid).execute()
            closed.append(rid)
    except Exception as e:
        logger.error("[CCMotor] close zombies: %s", e)
    return closed
