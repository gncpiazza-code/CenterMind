# -*- coding: utf-8 -*-
"""
Snapshot service para el visor operativo.

Dato operativo (pendientes del día + stats hoy) → TTL corto: 90 segundos.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from db import sb

logger = logging.getLogger("snapshot_visor_service")

VISOR_MAX_STALE_SECONDS = 90  # 1.5 min — dato operativo en tiempo casi-real


# ── Public API ────────────────────────────────────────────────────────────────

def get_or_refresh_visor(dist_id: int, hide_qa: bool = False) -> dict:
    snap = _read_visor_snapshot(dist_id)
    if snap is not None and _is_fresh(snap["generated_at"], VISOR_MAX_STALE_SECONDS):
        payload = snap["payload"]
        if _pendientes_payload_valid(payload.get("pendientes") or []):
            payload.setdefault("meta", {})["cache_hit"] = True
            return payload
    payload = _compute_visor(dist_id, hide_qa=hide_qa)
    payload.setdefault("meta", {})["cache_hit"] = False
    _upsert_visor_snapshot(dist_id, payload)
    return payload


def mark_visor_stale(dist_id: int) -> None:
    try:
        epoch = "1970-01-01T00:00:00+00:00"
        (
            sb.table("portal_snapshot_visor")
            .update({"generated_at": epoch})
            .eq("id_distribuidor", dist_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"[snap_visor] mark_stale dist={dist_id}: {e}")


# ── Compute ───────────────────────────────────────────────────────────────────

def _pendientes_payload_valid(pendientes: list) -> bool:
    """Snapshots legacy guardaban filas planas de fn_pendientes sin fotos[]."""
    if not pendientes:
        return True
    return isinstance(pendientes[0].get("fotos"), list)


def _compute_visor(dist_id: int, hide_qa: bool = False) -> dict:
    generated_at = datetime.now(timezone.utc).isoformat()

    pendientes: list[dict] = []
    try:
        from services.pendientes_grupo_service import build_pendientes_grupos

        pendientes = build_pendientes_grupos(dist_id, hide_qa=hide_qa)
    except Exception as e:
        logger.warning(f"[snap_visor] pendientes dist={dist_id}: {e}")

    # Stats del día actual (hora AR = UTC-3)
    stats: dict = {}
    try:
        ar_today = (datetime.utcnow() - timedelta(hours=3)).date().isoformat()
        stats_res = (
            sb.table("exhibiciones")
            .select("estado")
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", ar_today)
            .execute()
        )
        stats_rows = stats_res.data or []
        pendientes_count = sum(
            1 for r in stats_rows
            if (r.get("estado") or "").lower() == "pendiente"
        )
        aprobados_count = sum(
            1 for r in stats_rows
            if "aprobad" in (r.get("estado") or "").lower()
        )
        destacados_count = sum(
            1 for r in stats_rows
            if "destacad" in (r.get("estado") or "").lower()
        )
        stats = {
            "pendientes": pendientes_count,
            "aprobados": aprobados_count,
            "destacados": destacados_count,
            "total": len(stats_rows),
        }
    except Exception as e:
        logger.warning(f"[snap_visor] stats dist={dist_id}: {e}")
        stats = {}

    return {
        "meta": {
            "generated_at": generated_at,
            "dist_id": dist_id,
        },
        "pendientes": pendientes,
        "stats": stats,
    }


# ── Snapshot read/write ───────────────────────────────────────────────────────

def _read_visor_snapshot(dist_id: int) -> dict | None:
    try:
        res = (
            sb.table("portal_snapshot_visor")
            .select("payload, generated_at")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"[snap_visor] read dist={dist_id}: {e}")
        return None


def _upsert_visor_snapshot(dist_id: int, payload: dict) -> None:
    """
    Delete-then-insert. El visor tiene índice simple (sin COALESCE) por lo que
    on_conflict funcionaría, pero mantenemos el patrón consistente con los otros servicios.
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        sb.table("portal_snapshot_visor").delete().eq("id_distribuidor", dist_id).execute()
        sb.table("portal_snapshot_visor").insert(
            {
                "id_distribuidor": dist_id,
                "payload": payload,
                "generated_at": now_iso,
            }
        ).execute()
    except Exception as e:
        logger.warning(f"[snap_visor] upsert dist={dist_id}: {e}")


# ── Shared freshness check ────────────────────────────────────────────────────

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
