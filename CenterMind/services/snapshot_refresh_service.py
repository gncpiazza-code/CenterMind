# -*- coding: utf-8 -*-
"""
Servicio de refresh/invalidación de snapshots.

Punto central para marcar snapshots como stale tras eventos de ingesta.
Usar desde motor_runs / ingestion hooks tras completar una ingesta.
"""
from __future__ import annotations

import logging

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


def refresh_eager(dist_id: int, domains: list[str] | None = None) -> None:
    """
    Pre-calienta snapshots de forma no bloqueante tras una ingesta.

    Primero marca stale, luego dispara recompute en background usando
    FastAPI BackgroundTasks o threading según contexto de llamada.
    """
    import threading
    all_domains = domains or ["dashboard", "estadisticas"]

    def _recompute():
        for domain in all_domains:
            try:
                if domain == "dashboard":
                    from services.snapshot_dashboard_service import get_or_refresh_dashboard
                    # Recomputa período más común (mes actual) sin sucursal
                    get_or_refresh_dashboard(dist_id, "mes", None, hide_qa=False)
                elif domain == "supervision":
                    from services.snapshot_supervision_service import get_or_refresh_supervision
                    get_or_refresh_supervision(dist_id, None, None)
                elif domain == "estadisticas":
                    from services.snapshot_estadisticas_service import get_or_refresh_estadisticas
                    from datetime import datetime, timedelta
                    mes_actual = (datetime.utcnow() - timedelta(hours=3)).strftime("%Y-%m")
                    get_or_refresh_estadisticas(dist_id, [mes_actual], None)
                elif domain == "visor":
                    from services.snapshot_visor_service import get_or_refresh_visor
                    get_or_refresh_visor(dist_id)
            except Exception as e:
                logger.warning(f"[snap_refresh] refresh_eager domain={domain} dist={dist_id}: {e}")

    # Primero marcar stale para que cualquier request entrante durante el compute obtenga dato fresco
    mark_all_stale(dist_id, all_domains)
    # Luego recomputar en hilo daemon para no bloquear el request entrante
    t = threading.Thread(target=_recompute, daemon=True)
    t.start()
