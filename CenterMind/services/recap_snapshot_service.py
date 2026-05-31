# -*- coding: utf-8 -*-
"""
Persistencia de snapshots de Repaso Comercial en Supabase.

Tablas:
  - portal_snapshot_recap_vendedor: snapshot por (dist, vendedor, período)
  - portal_recap_visto: registro de lectura por usuario
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb

logger = logging.getLogger("recap_snapshot_service")

PAGE = 1000
_RECAP_TABLE = "portal_snapshot_recap_vendedor"
_VISTO_TABLE = "portal_recap_visto"


# ── Snapshot CRUD ─────────────────────────────────────────────────────────────

def persist_recap(
    dist_id: int,
    id_vendedor: str,
    periodo_key: str,
    payload: dict,
    status: str = "ok",
) -> dict:
    """
    Upsert del snapshot en portal_snapshot_recap_vendedor.
    Idempotente: si ya existe el registro para (dist, vendedor, período), lo sobreescribe.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "id_distribuidor": dist_id,
        "id_vendedor": str(id_vendedor),
        "periodo_key": periodo_key,
        "payload": payload,
        "status": status,
        "generated_at": now_iso,
    }
    res = (
        sb.table(_RECAP_TABLE)
        .upsert(row, on_conflict="id_distribuidor,id_vendedor,periodo_key")
        .execute()
    )
    return (res.data or [row])[0]


def read_recap(
    dist_id: int,
    id_vendedor: str,
    periodo_key: str,
) -> dict | None:
    """Lee el snapshot de DB. Retorna None si no existe."""
    res = (
        sb.table(_RECAP_TABLE)
        .select("*")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", str(id_vendedor))
        .eq("periodo_key", periodo_key)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def list_recaps_historial(
    dist_id: int,
    id_vendedor: str,
    limit: int = 6,
) -> list[dict]:
    """
    Historial de snapshots del vendedor, ordenados por generated_at DESC.
    Retorna solo metadatos (sin payload).
    """
    res = (
        sb.table(_RECAP_TABLE)
        .select("periodo_key,generated_at,status")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", str(id_vendedor))
        .order("generated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def list_recaps_for_mes(
    dist_id: int,
    mes: str,
) -> list[dict]:
    """
    Lista todos los snapshots del dist para un mes dado (ej. "2026-05").
    Busca periodo_key que empiece con "YYYY-MM-".
    """
    rows: list[dict] = []
    offset = 0
    prefix = f"{mes}-"
    while True:
        res = (
            sb.table(_RECAP_TABLE)
            .select("*")
            .eq("id_distribuidor", dist_id)
            .like("periodo_key", f"{prefix}%")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


# ── Visto ──────────────────────────────────────────────────────────────────────

def mark_visto(
    user_id: int,
    dist_id: int,
    periodo_key: str,
) -> None:
    """Marca el período como visto por el usuario."""
    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user_id,
        "id_distribuidor": dist_id,
        "periodo_key": periodo_key,
        "viewed_at": now_iso,
    }
    sb.table(_VISTO_TABLE).upsert(
        row, on_conflict="user_id,id_distribuidor,periodo_key"
    ).execute()


def resolve_sample_vendedor(
    dist_id: int,
    periodo_key: str,
) -> str | None:
    """Primer vendedor con snapshot para el período (preview en gate)."""
    res = (
        sb.table(_RECAP_TABLE)
        .select("id_vendedor")
        .eq("id_distribuidor", dist_id)
        .eq("periodo_key", periodo_key)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    return str(rows[0].get("id_vendedor") or "") or None


def list_recap_periodos_dist(
    user_id: int,
    dist_id: int,
    limit: int = 12,
) -> list[dict]:
    """
    Períodos distintos con snapshots para la distribuidora, más recientes primero.
    Incluye flag revisado por usuario y vendedor de ejemplo para abrir el story.
    """
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table(_RECAP_TABLE)
            .select("periodo_key,generated_at,id_vendedor")
            .eq("id_distribuidor", dist_id)
            .order("generated_at", desc=True)
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    if not rows:
        return []

    periodos: list[str] = []
    meta: dict[str, dict] = {}
    counts: dict[str, int] = {}

    for row in rows:
        pk = str(row.get("periodo_key") or "")
        if not pk:
            continue
        counts[pk] = counts.get(pk, 0) + 1
        if pk in meta:
            continue
        meta[pk] = {
            "periodo_key": pk,
            "id_vendedor": str(row.get("id_vendedor") or ""),
            "generated_at": row.get("generated_at") or "",
        }
        periodos.append(pk)
        if len(periodos) >= limit:
            break

    visto_res = (
        sb.table(_VISTO_TABLE)
        .select("periodo_key")
        .eq("user_id", user_id)
        .eq("id_distribuidor", dist_id)
        .in_("periodo_key", periodos)
        .execute()
    )
    vistos: set[str] = {r["periodo_key"] for r in (visto_res.data or [])}

    return [
        {
            **meta[pk],
            "revisado": pk in vistos,
            "total_vendedores": counts.get(pk, 0),
        }
        for pk in periodos
        if meta[pk].get("id_vendedor")
    ]


def get_pendientes_visto(
    user_id: int,
    dist_id: int,
) -> list[dict]:
    """
    Retorna hasta 3 períodos distintos del dist con snapshots no marcados como vistos
    por el usuario. Cada ítem incluye un id_vendedor de ejemplo para abrir el story.
    """
    return [
        {"periodo_key": p["periodo_key"], "id_vendedor": p["id_vendedor"]}
        for p in list_recap_periodos_dist(user_id, dist_id, limit=12)
        if not p.get("revisado")
    ][:3]


def list_recap_carrusel(dist_id: int, periodo_key: str) -> dict:
    """
    Lista vendedores con snapshot para el período + resumen agregado (carrusel UI).
    """
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table(_RECAP_TABLE)
            .select("id_vendedor,payload,status")
            .eq("id_distribuidor", dist_id)
            .eq("periodo_key", periodo_key)
            .order("id_vendedor")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    vendedores: list[dict] = []
    ex_total = 0
    bultos_total = 0.0
    deltas: list[int] = []

    from services.recap_service import recap_carrusel_entry_from_payload

    for row in rows:
        payload = row.get("payload") or {}
        if not isinstance(payload, dict):
            continue
        vid = str(row.get("id_vendedor") or "")
        score, nombre, sucursal = recap_carrusel_entry_from_payload(dist_id, vid, payload)
        ant = payload.get("carta_anterior") or {}
        ant_score = float(ant.get("score") or 0) if ant else None
        delta = round(score - ant_score) if ant_score is not None else None
        if delta is not None:
            deltas.append(delta)
        ex = payload.get("exhibiciones") or {}
        ex_total += int(ex.get("total_logicas") or 0)
        bultos_total += float(payload.get("bultos_total") or 0)

        vendedores.append(
            {
                "id_vendedor": vid,
                "nombre": nombre,
                "sucursal": sucursal,
                "score": score,
                "delta": delta,
                "status": row.get("status") or payload.get("status") or "ok",
            }
        )

    vendedores.sort(key=lambda v: (-v.get("score", 0), (v.get("nombre") or "").lower()))

    scores = [v["score"] for v in vendedores]
    resumen = {
        "total_vendedores": len(vendedores),
        "score_promedio": round(sum(scores) / len(scores), 1) if scores else 0,
        "score_max": max(scores) if scores else 0,
        "score_min": min(scores) if scores else 0,
        "mejoras": sum(1 for d in deltas if d > 0),
        "bajadas": sum(1 for d in deltas if d < 0),
        "sin_cambio": sum(1 for d in deltas if d == 0),
        "exhibiciones_enviadas": ex_total,
        "bultos_total": round(bultos_total, 2),
    }

    return {
        "periodo_key": periodo_key,
        "vendedores": vendedores,
        "resumen": resumen,
    }
