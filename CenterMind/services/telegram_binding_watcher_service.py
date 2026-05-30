# -*- coding: utf-8 -*-
"""
Servicio de vigilancia de bindings Telegram ↔ Vendedor ERP.

scan_distribuidor:
  1. Grupos linked/review → detect_group_drift → si hay drift: unlink + create_suggestion.
  2. Grupos unlinked con actividad reciente → create_suggestion (sin auto-apply en prod).

scan_all_distributors: aplica scan_distribuidor a todos los tenants activos.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb
from core.tenant_tables import tenant_table_name
from core.telegram_group_matcher import (
    apply_group_binding,
    create_suggestion,
    detect_group_drift,
    score_group_vendor_candidates,
    unlink_group,
)

logger = logging.getLogger("ShelfyAPI")

# Score mínimo para levantar una sugerencia
_SUGGESTION_THRESHOLD = 0.5
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


def _grupo_tiene_actividad(dist_id: int, telegram_chat_id: int) -> bool:
    """
    Verifica si el grupo tiene al menos una exhibición registrada (proxy de actividad).
    """
    try:
        res = (
            sb.table("exhibiciones")
            .select("id_exhibicion")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_chat_id", telegram_chat_id)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        logger.warning(
            "_grupo_tiene_actividad dist=%s chat=%s err=%s", dist_id, telegram_chat_id, exc
        )
        return False


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
    }

    for grupo in grupos:
        chat_id = grupo.get("telegram_chat_id")
        status = grupo.get("binding_status", "unlinked")

        if chat_id is None:
            continue

        try:
            if status in ("linked", "review"):
                # Paso 1: detectar drift en grupos ya vinculados
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

                    # Generar sugerencia post-drift para los mejores candidatos
                    candidates = score_group_vendor_candidates(dist_id, chat_id)
                    for c in candidates:
                        if c["score"] > _SUGGESTION_THRESHOLD:
                            create_suggestion(
                                dist_id,
                                chat_id,
                                c["id_vendedor"],
                                c["score"],
                                c["reasons"],
                                source="drift",
                            )
                            stats["suggestions_created"] += 1

            else:
                # Paso 2 y 3: grupos no vinculados
                if not _grupo_tiene_actividad(dist_id, chat_id):
                    continue

                candidates = score_group_vendor_candidates(dist_id, chat_id)
                if not candidates:
                    continue

                top = candidates[0]

                if (
                    _AUTO_APPLY_ENABLED
                    and top["score"] >= _AUTO_APPLY_THRESHOLD
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
                    for c in candidates:
                        if c["score"] > _SUGGESTION_THRESHOLD:
                            create_suggestion(
                                dist_id,
                                chat_id,
                                c["id_vendedor"],
                                c["score"],
                                c["reasons"],
                                source="cron",
                            )
                            stats["suggestions_created"] += 1

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
        # Compat: algunos registros usan 'id' y otros no tienen campo activo
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
            })

    return results
