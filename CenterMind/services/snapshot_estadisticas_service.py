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

logger = logging.getLogger("snapshot_estadisticas_service")

ESTADISTICAS_MAX_STALE_SECONDS = 900  # 15 min


# ── Public API ────────────────────────────────────────────────────────────────

def get_or_refresh_estadisticas(
    dist_id: int,
    meses: list[str],
    sucursal: str | None,
) -> dict:
    meses_hash = _hash_meses(meses)
    snap = _read_estadisticas_snapshot(dist_id, meses_hash, sucursal)
    if snap is not None and _is_fresh(snap["generated_at"], ESTADISTICAS_MAX_STALE_SECONDS):
        cartas = snap["payload"]
        return {
            "meta": {
                "cache_hit": True,
                "generated_at": snap["generated_at"],
                "meses": meses,
                "sucursal": sucursal,
                "dist_id": dist_id,
            },
            "cartas": cartas,
            "total": len(cartas) if isinstance(cartas, list) else 0,
        }

    from services.estadisticas_service import build_carta_resumen

    cartas = build_carta_resumen(dist_id, meses, sucursal)
    _upsert_estadisticas_snapshot(dist_id, meses_hash, sucursal, cartas)

    generated_at = datetime.now(timezone.utc).isoformat()
    return {
        "meta": {
            "cache_hit": False,
            "generated_at": generated_at,
            "meses": meses,
            "sucursal": sucursal,
            "dist_id": dist_id,
        },
        "cartas": cartas,
        "total": len(cartas),
    }


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


def _is_fresh(generated_at_iso: str, max_stale_seconds: int) -> bool:
    try:
        if generated_at_iso.startswith("1970"):
            return False
        generated_at = datetime.fromisoformat(
            generated_at_iso.replace("Z", "+00:00")
        )
        age = (datetime.now(timezone.utc) - generated_at).total_seconds()
        return age < max_stale_seconds
    except Exception:
        return False
