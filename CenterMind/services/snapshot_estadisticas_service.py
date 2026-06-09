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
    is_invalidated,
    is_serveable_stale,
    run_single_flight,
    trigger_background_refresh,
)

logger = logging.getLogger("snapshot_estadisticas_service")

ESTADISTICAS_MAX_STALE_SECONDS = 900  # 15 min
ESTADISTICAS_SERVE_STALE_SECONDS = 86400  # 24 h
ESTADISTICAS_COLD_COMPUTE_TIMEOUT = 25.0  # single-flight cap (Railway worker)


def _stale_exhibition_coverage(raw: dict) -> bool:
    exh = float(raw.get("pdvs_exhibidos") or 0)
    exhibiciones = float(raw.get("exhibiciones") or 0)
    cobertura = float(raw.get("cobertura_pct") or 0)
    return exh <= 0 and exhibiciones <= 0 and cobertura > 0


def _percent_from_raw(raw: dict, pct_key: str, fallback_num: str) -> float:
    """% 0–100 desde raw_kpis; recalcula desde conteo o usa % del backend."""
    if pct_key == "cobertura_pct" and _stale_exhibition_coverage(raw):
        return 0.0
    pdvs = float(raw.get("pdvs") or 0)
    num = float(raw.get(fallback_num) or 0)
    if pdvs > 0 and num > 0:
        from_counts = min(100.0, num / pdvs * 100)
        pct = float(raw.get(pct_key) or 0)
        if pct <= 0:
            return from_counts
        return min(100.0, pct)
    if fallback_num in raw and num <= 0 and pct_key == "cobertura_pct":
        if float(raw.get("exhibiciones") or 0) <= 0:
            return 0.0
    return min(100.0, float(raw.get(pct_key) or 0))


def _ideal_pct_targets(card: dict) -> tuple[float, float]:
    """Meta % del ideal para CEX (exhibición) y COB (compra), prioriza distribuidora."""
    ideal_cex = 0.0
    ideal_cob = 0.0
    for key in ("ideal_meta_dist", "ideal_meta_compania"):
        meta = card.get(key) or {}
        if not isinstance(meta, dict):
            continue
        if ideal_cex <= 0:
            ideal_cex = float(meta.get("pdvs_exhibidos") or 0)
        if ideal_cob <= 0:
            ideal_cob = float(meta.get("cobertura") or 0)
    if ideal_cex <= 0:
        ideal_cex = 100.0
    if ideal_cob <= 0:
        ideal_cob = 100.0
    return ideal_cex, ideal_cob


def _hydrate_carta_card(card: dict) -> dict:
    """Promueve campos de raw_kpis a la raíz (snapshots legacy)."""
    if not isinstance(card, dict):
        return card
    card = dict(card)
    raw = card.get("raw_kpis")
    if not isinstance(raw, dict):
        return card
    raw = dict(raw)
    if not str(card.get("top_localidades") or "").strip():
        top = str(raw.get("top_localidades") or "").strip()
        if top:
            card["top_localidades"] = top
    card["raw_kpis"] = raw
    return card


def _normalize_carta_radar(card: dict) -> dict:
    """
    Recompone CEX/COB del radar desde raw_kpis.
    CEX = % cartera exhibida (PDVs exhibidos ÷ PDVs), escala 0–100.
    """
    card = _hydrate_carta_card(card)
    if not isinstance(card, dict):
        return card
    radar = card.get("radar")
    raw = card.get("raw_kpis") or {}
    if not isinstance(radar, dict) or not isinstance(raw, dict):
        return card

    cob_exh_real = _percent_from_raw(raw, "cobertura_pct", "pdvs_exhibidos")
    cob_compra_real = _percent_from_raw(raw, "cobertura_compra_pct", "compradores")
    _, ideal_cob = _ideal_pct_targets(card)

    radar = dict(radar)
    radar["pdvs_exhibidos"] = max(0, min(100, round(cob_exh_real)))
    radar["cobertura"] = max(
        0, min(100, round(cob_compra_real / ideal_cob * 100 if ideal_cob > 0 else cob_compra_real)),
    )
    card = dict(card)
    card["radar"] = radar
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
    from services.estadisticas_service import (
        build_carta_resumen_with_meta,
        _cartas_comercial_ventas_plausible,
    )

    cartas, exhib_meta = build_carta_resumen_with_meta(dist_id, meses, sucursal)
    cartas = _normalize_cartas_payload(cartas)
    if not _cartas_comercial_ventas_plausible(
        cartas, exhib_logicas_sum=int(exhib_meta.get("logicas_sum") or 0)
    ):
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
        refresh_key = f"estadisticas:{dist_id}:{meses_hash}:{sucursal}"

        # mark_estadisticas_stale usa epoch: servir cartas existentes mientras recomputa.
        if is_invalidated(gen) and payload:
            trigger_background_refresh(
                refresh_key,
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
            trigger_background_refresh(
                refresh_key,
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
    return run_single_flight(
        key,
        lambda: _cold_compute_estadisticas(dist_id, meses, sucursal, meses_hash),
        timeout=ESTADISTICAS_COLD_COMPUTE_TIMEOUT,
    )


def force_persist_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None = None,
) -> int:
    """Recomputa y persiste cartas de forma síncrona. Retorna cantidad de cartas."""
    meses_hash = _hash_meses(meses)
    from services.estadisticas_service import (
        build_carta_resumen_with_meta,
        _cartas_comercial_ventas_plausible,
    )

    cartas, exhib_meta = build_carta_resumen_with_meta(dist_id, meses, sucursal)
    cartas = _normalize_cartas_payload(cartas)
    if not _cartas_comercial_ventas_plausible(
        cartas, exhib_logicas_sum=int(exhib_meta.get("logicas_sum") or 0)
    ):
        logger.warning(
            "[snap_estadisticas] skip persist dist=%s meses=%s — KPIs no plausibles",
            dist_id,
            meses,
        )
        return 0
    _upsert_estadisticas_snapshot(dist_id, meses_hash, sucursal, cartas)
    return len(cartas)


def _cold_compute_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
    meses_hash: str,
) -> dict:
    from services.estadisticas_service import (
        build_carta_resumen_with_meta,
        _cartas_comercial_ventas_plausible,
    )

    cartas, exhib_meta = build_carta_resumen_with_meta(dist_id, meses, sucursal)
    cartas = _normalize_cartas_payload(cartas)
    if _cartas_comercial_ventas_plausible(
        cartas, exhib_logicas_sum=int(exhib_meta.get("logicas_sum") or 0)
    ):
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


def _cartas_vendor_ids(cartas: list) -> set[str]:
    return {
        str(c.get("id_vendedor") or "").strip()
        for c in cartas
        if str(c.get("id_vendedor") or "").strip()
    }


def _should_accept_cartas_replacement(existing: list, new: list) -> bool:
    """Evita que un refresh parcial (timeout/race) pise un snapshot más completo."""
    if not existing:
        return True
    old_ids = _cartas_vendor_ids(existing)
    new_ids = _cartas_vendor_ids(new)
    if len(new_ids) >= len(old_ids):
        return True
    lost = old_ids - new_ids
    if not lost:
        return True
    logger.warning(
        "[snap_estadisticas] skip persist: perdería %s cartas (ej. %s)",
        len(lost),
        ", ".join(sorted(lost)[:5]),
    )
    return False


def _upsert_estadisticas_snapshot(
    dist_id: int, meses_hash: str, sucursal: str | None, cartas: list[dict]
) -> None:
    """
    Delete-then-insert para evitar el problema de que PostgREST no puede usar
    índices únicos con expresiones (COALESCE) en ON CONFLICT.
    """
    try:
        existing_snap = _read_estadisticas_snapshot(dist_id, meses_hash, sucursal)
        if existing_snap:
            existing_cartas = _normalize_cartas_payload(existing_snap.get("payload"))
            if not _should_accept_cartas_replacement(existing_cartas, cartas):
                return

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


