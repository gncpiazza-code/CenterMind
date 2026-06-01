# -*- coding: utf-8 -*-
"""
Snapshot service para estadísticas cartas.

Mueve la caché RAM de estadisticas_service a Postgres para persistir entre
reinicios y compartir entre workers (Railway multi-instance).
TTL: 15 minutos.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from db import sb
from services.snapshot_common import (
    apply_meta_flags,
    is_fresh,
    is_serveable_stale,
    trigger_background_refresh,
)

logger = logging.getLogger("snapshot_estadisticas_service")

ESTADISTICAS_MAX_STALE_SECONDS = 900  # 15 min
ESTADISTICAS_SERVE_STALE_SECONDS = 86400  # 24 h


def _normalize_carta_radar(card: dict) -> dict:
    """
    Backfill radar axis values for legacy/partial snapshots.

    Production snapshots may contain `raw_kpis` + ideal metadata but an outdated
    `radar` shape missing `pdvs_exhibidos` (CEX). In that case, reconstruct CEX
    from `% cartera exhibida` to preserve expected rendering.
    """
    if not isinstance(card, dict):
        return card
    radar = card.get("radar")
    if not isinstance(radar, dict):
        return card

    if "pdvs_exhibidos" in radar and radar.get("pdvs_exhibidos") is not None:
        return card

    raw = card.get("raw_kpis") or {}
    if not isinstance(raw, dict):
        return card

    cobertura_real = float(raw.get("cobertura_pct") or 0)
    ideal_target = 0.0
    for key in ("ideal_meta_dist", "ideal_meta_compania"):
        meta = card.get(key) or {}
        if not isinstance(meta, dict):
            continue
        candidate = float(meta.get("pdvs_exhibidos") or 0)
        if candidate > 0:
            ideal_target = candidate
            break
    if ideal_target <= 0:
        ideal_target = 100.0

    radar["pdvs_exhibidos"] = max(
        0,
        min(100, round((cobertura_real / ideal_target) * 100)),
    )
    return card


def _normalize_cartas_payload(raw) -> list:
    """Snapshots corruptos pueden guardar cartas como dict; el FE espera list."""
    if isinstance(raw, list):
        return [_normalize_carta_radar(item) for item in raw]
    if isinstance(raw, dict):
        vals = list(raw.values())
        if vals and isinstance(vals[0], dict):
            return [_normalize_carta_radar(item) for item in vals]
    return []


# ── Public API ────────────────────────────────────────────────────────────────

def _build_estadisticas_response(
    cartas: list,
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
    generated_at: str,
    *,
    cache_hit: bool,
    stale: bool,
    revalidating: bool,
) -> dict:
    cartas_norm = _normalize_cartas_payload(cartas)
    meta = apply_meta_flags(
        {
            "meses": meses,
            "sucursal": sucursal,
            "dist_id": dist_id,
        },
        cache_hit=cache_hit,
        stale=stale,
        revalidating=revalidating,
        generated_at=generated_at,
    )
    return {
        "meta": meta,
        "cartas": cartas_norm,
        "total": len(cartas_norm),
    }


def _refresh_estadisticas_background(
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
    meses_hash: str,
) -> None:
    from services.estadisticas_service import build_carta_resumen, _cartas_comercial_ventas_plausible

    cartas = _normalize_cartas_payload(build_carta_resumen(dist_id, meses, sucursal))
    if not _cartas_comercial_ventas_plausible(cartas):
        logger.warning(
            "[snap_estadisticas] skip persist dist=%s meses=%s — ventas KPIs vacíos con exhibiciones",
            dist_id,
            meses,
        )
        return
    _upsert_estadisticas_snapshot(dist_id, meses_hash, sucursal, cartas)


def get_or_refresh_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
    *,
    force_refresh: bool = False,
) -> dict:
    from services.estadisticas_service import _cartas_comercial_ventas_plausible

    meses_hash = _hash_meses(meses)
    if force_refresh:
        key = f"estadisticas:{dist_id}:{meses_hash}:{sucursal}"
        trigger_background_refresh(
            key,
            lambda: _refresh_estadisticas_background(dist_id, meses, sucursal, meses_hash),
        )
        snap = _read_estadisticas_snapshot(dist_id, meses_hash, sucursal)
        if snap is not None:
            gen = snap["generated_at"]
            payload = _normalize_cartas_payload(snap["payload"])
            return _build_estadisticas_response(
                payload,
                dist_id,
                meses,
                sucursal,
                gen,
                cache_hit=False,
                stale=True,
                revalidating=True,
            )
        return _build_estadisticas_response(
            [],
            dist_id,
            meses,
            sucursal,
            datetime.now(timezone.utc).isoformat(),
            cache_hit=False,
            stale=False,
            revalidating=True,
        )
    snap = _read_estadisticas_snapshot(dist_id, meses_hash, sucursal)
    if snap is not None:
        gen = snap["generated_at"]
        payload = _normalize_cartas_payload(snap["payload"])
        plausible = _cartas_comercial_ventas_plausible(payload)
        if is_fresh(gen, ESTADISTICAS_MAX_STALE_SECONDS) and plausible:
            return _build_estadisticas_response(
                payload,
                dist_id,
                meses,
                sucursal,
                gen,
                cache_hit=True,
                stale=False,
                revalidating=False,
            )
        if is_serveable_stale(gen, ESTADISTICAS_SERVE_STALE_SECONDS) and plausible:
            key = f"estadisticas:{dist_id}:{meses_hash}:{sucursal}"
            trigger_background_refresh(
                key,
                lambda: _refresh_estadisticas_background(dist_id, meses, sucursal, meses_hash),
            )
            return _build_estadisticas_response(
                payload,
                dist_id,
                meses,
                sucursal,
                gen,
                cache_hit=False,
                stale=True,
                revalidating=True,
            )

    key = f"estadisticas:{dist_id}:{meses_hash}:{sucursal}"
    trigger_background_refresh(
        key,
        lambda: _refresh_estadisticas_background(dist_id, meses, sucursal, meses_hash),
    )
    return _build_estadisticas_response(
        [],
        dist_id,
        meses,
        sucursal,
        datetime.now(timezone.utc).isoformat(),
        cache_hit=False,
        stale=False,
        revalidating=True,
    )


def force_persist_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None = None,
) -> None:
    meses_hash = _hash_meses(meses)
    _refresh_estadisticas_background(dist_id, meses, sucursal, meses_hash)


def _cold_compute_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
    meses_hash: str,
) -> dict:
    from services.estadisticas_service import build_carta_resumen, _cartas_comercial_ventas_plausible

    cartas = _normalize_cartas_payload(build_carta_resumen(dist_id, meses, sucursal))
    if _cartas_comercial_ventas_plausible(cartas):
        _upsert_estadisticas_snapshot(dist_id, meses_hash, sucursal, cartas)
    else:
        logger.warning(
            "[snap_estadisticas] cold compute sin persist dist=%s meses=%s — ventas KPIs vacíos",
            dist_id,
            meses,
        )
    generated_at = datetime.now(timezone.utc).isoformat()
    return _build_estadisticas_response(
        cartas,
        dist_id,
        meses,
        sucursal,
        generated_at,
        cache_hit=False,
        stale=False,
        revalidating=False,
    )


def mark_estadisticas_stale(dist_id: int) -> None:
    try:
        epoch = "1970-01-01T00:00:00+00:00"
        (
            sb.table("portal_snapshot_estadisticas_cartas")
            .update({"generated_at": epoch})
            .eq("id_distribuidor", dist_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"[snap_estadisticas] mark_stale dist={dist_id}: {e}")


def mark_all_estadisticas_stale() -> None:
    """Ideal compañía afecta cartas de todos los tenants."""
    PAGE = 1000
    offset = 0
    while True:
        try:
            batch = (
                sb.table("distribuidores")
                .select("id_distribuidor")
                .eq("estado", "activo")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data
                or []
            )
        except Exception as e:
            logger.warning(f"[snap_estadisticas] mark_all_stale list dists: {e}")
            break
        for row in batch:
            did = row.get("id_distribuidor")
            if did is not None:
                mark_estadisticas_stale(int(did))
        if len(batch) < PAGE:
            break
        offset += PAGE


# ── Snapshot read/write ───────────────────────────────────────────────────────

def _read_estadisticas_snapshot(
    dist_id: int, meses_hash: str, sucursal: str | None
) -> dict | None:
    try:
        q = (
            sb.table("portal_snapshot_estadisticas_cartas")
            .select("payload, generated_at")
            .eq("id_distribuidor", dist_id)
            .eq("meses_hash", meses_hash)
        )
        if sucursal is None:
            q = q.is_("sucursal", "null")
        else:
            q = q.eq("sucursal", sucursal)
        res = q.limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"[snap_estadisticas] read dist={dist_id}: {e}")
        return None


def _upsert_estadisticas_snapshot(
    dist_id: int, meses_hash: str, sucursal: str | None, cartas: list[dict]
) -> None:
    """
    Delete-then-insert para evitar el problema de que PostgREST no puede usar
    índices únicos con expresiones (COALESCE) en ON CONFLICT.
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        # Borrar snapshot existente
        dq = (
            sb.table("portal_snapshot_estadisticas_cartas")
            .delete()
            .eq("id_distribuidor", dist_id)
            .eq("meses_hash", meses_hash)
        )
        if sucursal is None:
            dq = dq.is_("sucursal", "null")
        else:
            dq = dq.eq("sucursal", sucursal)
        dq.execute()
        # Insertar nuevo
        sb.table("portal_snapshot_estadisticas_cartas").insert(
            {
                "id_distribuidor": dist_id,
                "meses_hash": meses_hash,
                "sucursal": sucursal,
                "payload": cartas,
                "generated_at": now_iso,
            }
        ).execute()
    except Exception as e:
        logger.warning(f"[snap_estadisticas] upsert dist={dist_id}: {e}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_meses(meses: list[str]) -> str:
    return hashlib.md5(",".join(sorted(meses)).encode()).hexdigest()[:16]


