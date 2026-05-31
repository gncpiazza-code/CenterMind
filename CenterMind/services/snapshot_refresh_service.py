# -*- coding: utf-8 -*-
"""
Servicio de refresh/invalidación de snapshots.

Punto central para marcar snapshots como stale tras eventos de ingesta.
Usar desde motor_runs / ingestion hooks tras completar una ingesta.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

logger = logging.getLogger("snapshot_refresh_service")

# Mapeo de tipo de evento a dominios que deben invalidarse
_DOMAIN_MAP: dict[str, list[str]] = {
    "padron": ["dashboard", "estadisticas"],
    "cuentas_corrientes": ["supervision"],
    "ventas_enriched": ["estadisticas", "dashboard"],
    "evaluacion": ["dashboard", "visor"],
}


def mark_all_stale(dist_id: int, domains: list[str] | None = None) -> None:
    """
    Marca snapshots como stale para re-compute en el siguiente request.

    Args:
        dist_id: ID del distribuidor.
        domains: Lista de dominios a invalidar. Si es None, invalida todos.
    """
    all_domains = domains or ["dashboard", "supervision", "estadisticas", "visor"]

    for domain in all_domains:
        try:
            if domain == "dashboard":
                from services.snapshot_dashboard_service import mark_dashboard_stale
                mark_dashboard_stale(dist_id)
            elif domain == "supervision":
                from services.snapshot_supervision_service import mark_supervision_stale
                mark_supervision_stale(dist_id)
            elif domain == "estadisticas":
                from services.snapshot_estadisticas_service import mark_estadisticas_stale
                mark_estadisticas_stale(dist_id)
            elif domain == "visor":
                from services.snapshot_visor_service import mark_visor_stale
                mark_visor_stale(dist_id)
            else:
                logger.warning(f"[snap_refresh] Dominio desconocido: {domain}")
        except Exception as e:
            logger.warning(f"[snap_refresh] mark_all_stale domain={domain} dist={dist_id}: {e}")


def handle_ingestion_event(event_type: str, dist_id: int) -> None:
    """
    Llamar desde motor_runs / ingestion hooks tras completar una ingesta.

    Args:
        event_type: Tipo de evento. Ej: 'padron', 'cuentas_corrientes',
                    'ventas_enriched', 'evaluacion'.
        dist_id: ID del distribuidor afectado.
    """
    domains = _DOMAIN_MAP.get(event_type)
    if not domains:
        logger.debug(f"[snap_refresh] evento '{event_type}' no mapea a ningun snapshot, skipping.")
        return
    logger.info(f"[snap_refresh] event_type={event_type} dist={dist_id} → invalida domains={domains}")
    mark_all_stale(dist_id, domains)


def _recompute_domain(dist_id: int, domain: str) -> None:
    """Recompute directo (sin path SWR) para warm/cron."""
    try:
        mes_actual = (datetime.utcnow() - timedelta(hours=3)).strftime("%Y-%m")
        if domain == "dashboard":
            from services.snapshot_dashboard_service import force_persist_dashboard
            force_persist_dashboard(dist_id, "mes", None, hide_qa=False)
        elif domain == "supervision":
            from services.snapshot_supervision_service import force_persist_supervision
            force_persist_supervision(dist_id, None, None)
        elif domain == "estadisticas":
            from services.snapshot_estadisticas_service import force_persist_estadisticas
            force_persist_estadisticas(dist_id, [mes_actual], None)
        elif domain == "visor":
            from services.snapshot_visor_service import force_persist_visor
            force_persist_visor(dist_id)
        else:
            logger.warning(f"[snap_refresh] recompute dominio desconocido: {domain}")
    except Exception as e:
        logger.warning(f"[snap_refresh] recompute domain={domain} dist={dist_id}: {e}")


def warm_portal_bundles(dist_id: int, domains: list[str] | None = None) -> None:
    """
    Pre-calienta snapshots en background (solo cron / endpoint manual).
    No usar desde login FE — satura el worker con computes paralelos.
    """
    from services.snapshot_common import trigger_background_refresh

    all_domains = domains or ["dashboard", "estadisticas"]
    for domain in all_domains:
        key = f"warm:{dist_id}:{domain}"
        trigger_background_refresh(key, lambda d=domain: _recompute_domain(dist_id, d))


def refresh_eager(dist_id: int, domains: list[str] | None = None) -> None:
    """
    Pre-calienta snapshots tras ingesta: marca stale y recomputa en background.
    """
    all_domains = domains or ["dashboard", "estadisticas"]
    mark_all_stale(dist_id, all_domains)
    warm_portal_bundles(dist_id, all_domains)


def prewarm_all_active_distributors(domains: list[str] | None = None) -> None:
    """Cron matutino: warm de todos los distribuidores activos (paginado, secuencial por dist)."""
    from db import sb
    from services.snapshot_common import trigger_background_refresh

    target_domains = domains or ["dashboard", "estadisticas"]
    PAGE = 1000
    offset = 0
    warmed = 0
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
            logger.warning(f"[snap_refresh] prewarm list dists offset={offset}: {e}")
            break
        for row in batch:
            dist_id = row.get("id_distribuidor")
            if not dist_id:
                continue
            dist_int = int(dist_id)
            # Un solo job por dist (encadena dominios) para no saturar Railway
            trigger_background_refresh(
                f"prewarm-cron:{dist_int}",
                lambda d=dist_int, doms=target_domains: _prewarm_dist_sequential(d, doms),
            )
            warmed += 1
        if len(batch) < PAGE:
            break
        offset += PAGE
    logger.info(f"[snap_refresh] prewarm_all queued dists={warmed} domains={target_domains}")


def _prewarm_dist_sequential(dist_id: int, domains: list[str]) -> None:
    for domain in domains:
        _recompute_domain(dist_id, domain)
