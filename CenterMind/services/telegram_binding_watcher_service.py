# -*- coding: utf-8 -*-
"""
Servicio de vigilancia de bindings Telegram ↔ Vendedor ERP.

scan_distribuidor:
  1. Grupos linked/review → detect_group_drift → si hay drift: unlink + create_suggestion.
  2. Grupos unlinked → create_suggestion para matches ≥50% (prefetch ≥75% contabilizado).

scan_all_distributors: aplica scan_distribuidor a todos los tenants activos.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb
from core.telegram_group_matcher import (
    apply_group_binding,
    create_suggestion,
    detect_group_drift,
    score_group_vendor_candidates,
    unlink_group,
)

logger = logging.getLogger("ShelfyAPI")

# Rango de confianza para cola de sugerencias (manual / alertas)
_SUGGESTION_THRESHOLD = 0.50
# Umbral de prefetch semi-automático (confirmar en sheet)
_SCAN_PREFETCH_THRESHOLD = 0.75
# Auto-apply deshabilitado en prod: directorio aprueba desde Fuerza de Ventas / Match Center
_AUTO_APPLY_ENABLED = False
_AUTO_APPLY_THRESHOLD = 0.95


def _fetch_all_grupos(dist_id: int) -> list[dict]:
    """
    Devuelve todos los grupos del distribuidor con los campos relevantes para el scanner.
    """
    rows: list[dict] = []
    offset = 0
    PAGE = 1000
    try:
        while True:
            batch = (
                sb.table("grupos")
                .select(
                    "telegram_chat_id,nombre_grupo,binding_status,"
                    "id_vendedor_v2,id_distribuidor"
                )
                .eq("id_distribuidor", dist_id)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
    except Exception as exc:
        logger.warning("_fetch_all_grupos dist=%s err=%s", dist_id, exc)
    return rows


def _record_suggestion(
    stats: dict,
    dist_id: int,
    chat_id: int,
    candidate: dict,
    source: str,
) -> None:
    score = float(candidate.get("score") or 0)
    if score < _SUGGESTION_THRESHOLD:
        return
    if score >= _SCAN_PREFETCH_THRESHOLD:
        stats["prefetch_ready"] += 1
    outcome = create_suggestion(
        dist_id,
        chat_id,
        candidate["id_vendedor"],
        score,
        candidate.get("reasons") or [],
        source=source,
    )
    if outcome == "created":
        stats["suggestions_created"] += 1
    elif outcome == "updated":
        stats["suggestions_updated"] += 1


def scan_distribuidor(dist_id: int) -> dict:
    """
    Escanea todos los grupos del distribuidor y aplica la lógica de drift / sugerencias.

    Retorna un resumen con contadores de operaciones realizadas.
    """
    grupos = _fetch_all_grupos(dist_id)
    stats = {
        "dist_id": dist_id,
        "grupos_scanned": len(grupos),
        "drifts": 0,
        "auto_applied": 0,
        "suggestions_created": 0,
        "suggestions_updated": 0,
        "prefetch_ready": 0,
    }

    for grupo in grupos:
        chat_id = grupo.get("telegram_chat_id")
        status = grupo.get("binding_status", "unlinked")

        if chat_id is None:
            continue

        try:
            if status in ("linked", "review"):
                drift = detect_group_drift(dist_id, chat_id)
                if drift:
                    logger.info(
                        "drift detectado dist=%s chat=%s tipo=%s",
                        dist_id, chat_id, drift["drift_type"],
                    )
                    unlink_group(
                        dist_id,
                        chat_id,
                        reason=drift["drift_type"],
                        performed_by="watcher",
                    )
                    stats["drifts"] += 1

                    candidates = score_group_vendor_candidates(dist_id, chat_id)
                    if candidates:
                        _record_suggestion(stats, dist_id, chat_id, candidates[0], "drift")

            else:
                candidates = score_group_vendor_candidates(dist_id, chat_id)
                if not candidates:
                    continue

                top = candidates[0]
                top_score = float(top.get("score") or 0)

                if (
                    _AUTO_APPLY_ENABLED
                    and top_score >= _AUTO_APPLY_THRESHOLD
                ):
                    apply_group_binding(
                        dist_id,
                        chat_id,
                        top["id_vendedor"],
                        source="cron_auto",
                        performed_by="watcher",
                    )
                    try:
                        now_iso = datetime.now(timezone.utc).isoformat()
                        sb.table("telegram_binding_suggestions").update({
                            "status": "auto_applied",
                            "resolved_at": now_iso,
                            "resolved_by": "watcher",
                        }).eq("id_distribuidor", dist_id).eq(
                            "telegram_chat_id", chat_id
                        ).eq("id_vendedor_v2", top["id_vendedor"]).eq(
                            "status", "pending"
                        ).execute()
                    except Exception as exc:
                        logger.warning(
                            "scan_distribuidor mark_auto_applied dist=%s chat=%s err=%s",
                            dist_id, chat_id, exc,
                        )
                    stats["auto_applied"] += 1
                else:
                    # Solo el mejor candidato por grupo (evita spam en alertas)
                    _record_suggestion(stats, dist_id, chat_id, top, "manual_scan")

        except Exception as exc:
            logger.warning(
                "scan_distribuidor dist=%s chat=%s err=%s", dist_id, chat_id, exc
            )
            continue

    return stats


def scan_all_distributors() -> list[dict]:
    """
    Escanea todos los distribuidores activos y consolida resultados.
    """
    results: list[dict] = []
    try:
        rows = (
            sb.table("distribuidores")
            .select("id,activo")
            .execute()
            .data or []
        )
        dist_ids = [
            int(r["id"])
            for r in rows
            if r.get("id") is not None and r.get("activo", True) is not False
        ]
    except Exception as exc:
        logger.warning("scan_all_distributors fetch_dists err=%s", exc)
        return []

    for dist_id in dist_ids:
        try:
            result = scan_distribuidor(dist_id)
            results.append(result)
        except Exception as exc:
            logger.warning("scan_all_distributors dist=%s err=%s", dist_id, exc)
            results.append({
                "dist_id": dist_id,
                "error": str(exc),
                "grupos_scanned": 0,
                "drifts": 0,
                "auto_applied": 0,
                "suggestions_created": 0,
                "suggestions_updated": 0,
                "prefetch_ready": 0,
            })

    return results
