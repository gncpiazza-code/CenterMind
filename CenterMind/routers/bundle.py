# -*- coding: utf-8 -*-
"""
Router de endpoints bundle: respuestas completas con snapshot cache en Postgres.

Cada endpoint devuelve un payload completo del dominio correspondiente
(dashboard, supervision CC, estadísticas, visor) con cache de 5-15 min.
El campo `meta.cache_hit` indica si el resultado viene de snapshot o fue recomputado.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status

from core.helpers import should_apply_exhibicion_qa_filter
from core.security import verify_auth, check_dist_permission
from services.snapshot_dashboard_service import get_or_refresh_dashboard
from services.snapshot_supervision_service import get_or_refresh_supervision
from services.snapshot_estadisticas_service import get_or_refresh_estadisticas
from services.snapshot_visor_service import get_or_refresh_visor
from services.snapshot_recap_evolucion_service import get_or_refresh_recap_evolucion_bundle
from services.snapshot_refresh_service import warm_portal_bundles

logger = logging.getLogger("bundle_router")
router = APIRouter(prefix="/api/bundle", tags=["Bundle"])


@router.get("/dashboard/{dist_id}")
def bundle_dashboard(
    dist_id: int,
    periodo: str = Query("mes", description="Período: hoy|semana|mes|mes-custom"),
    sucursal_id: Optional[str] = Query(None, description="PK de sucursal para filtrar"),
    payload=Depends(verify_auth),
):
    """
    Bundle completo del dashboard: KPIs + ranking + últimas + sucursales + evolución.
    KPIs y ranking comparten un único fetch de exhibiciones (optimización clave).
    """
    check_dist_permission(payload, dist_id)
    from core.helpers import should_apply_exhibicion_qa_filter
    hide_qa = should_apply_exhibicion_qa_filter(dist_id, payload)
    return get_or_refresh_dashboard(dist_id, periodo, sucursal_id, hide_qa=hide_qa)


@router.get("/supervision/{dist_id}")
def bundle_supervision(
    dist_id: int,
    sucursal: Optional[str] = Query(None, description="Nombre de sucursal para filtrar"),
    id_vendedor: Optional[int] = Query(None, description="PK vendedores_v2 para filtrar"),
    payload=Depends(verify_auth),
):
    """
    Bundle completo de supervision CC: vendedores + clientes deudores + metadatos.
    """
    check_dist_permission(payload, dist_id)
    return get_or_refresh_supervision(dist_id, sucursal, id_vendedor)


@router.get("/estadisticas/{dist_id}")
def bundle_estadisticas(
    dist_id: int,
    meses: Optional[str] = Query(
        None,
        description="CSV de meses YYYY-MM, ej: 2026-05,2026-04. Default: mes actual AR.",
    ),
    sucursal: Optional[str] = Query(None, description="Filtrar por sucursal"),
    refresh: bool = Query(
        False,
        description="Forzar recomputo (ignora snapshot en Postgres).",
    ),
    payload=Depends(verify_auth),
):
    """
    Bundle de estadísticas: cartas de vendedores con radar, score e ideales.
    """
    check_dist_permission(payload, dist_id)
    ar_now = datetime.utcnow() - timedelta(hours=3)
    if meses:
        meses_list = [m.strip() for m in meses.split(",") if m.strip()]
    else:
        meses_list = [ar_now.strftime("%Y-%m")]
    return get_or_refresh_estadisticas(
        dist_id, meses_list, sucursal, force_refresh=refresh
    )


@router.get("/recap-evolucion/{dist_id}")
def bundle_recap_evolucion(
    dist_id: int,
    mes: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Mes YYYY-MM"),
    sucursal: Optional[str] = Query(None, description="Filtrar por sucursal"),
    payload=Depends(verify_auth),
):
    """
    Evolución Q1 → Q2 → C de todos los vendedores con carta en el mes.
    Una sola ida al abrir Estadísticas; alimenta cache por vendedor en el FE.
    """
    check_dist_permission(payload, dist_id)
    return get_or_refresh_recap_evolucion_bundle(dist_id, mes.strip(), sucursal)


@router.get("/visor/{dist_id}")
def bundle_visor(
    dist_id: int,
    payload=Depends(verify_auth),
):
    """
    Bundle del visor operativo: pendientes del día + stats hoy (TTL 90s).
    """
    check_dist_permission(payload, dist_id)
    hide_qa = should_apply_exhibicion_qa_filter(dist_id, payload)
    return get_or_refresh_visor(dist_id, hide_qa=hide_qa)


@router.post("/warm/{dist_id}", status_code=status.HTTP_202_ACCEPTED)
def bundle_warm(
    dist_id: int,
    response: Response,
    domains: Optional[str] = Query(
        None,
        description="CSV de dominios: dashboard,supervision,estadisticas,visor. Default: dashboard,estadisticas.",
    ),
    periodo: Optional[str] = Query(
        None,
        description="Período YYYY-MM o preset (mes) para warm de dashboard/estadísticas.",
    ),
    payload=Depends(verify_auth),
):
    """
    Pre-calienta snapshots en background (fire-and-forget).
    Secuencial por dist — no satura el worker.
    """
    check_dist_permission(payload, dist_id)
    domain_list: list[str] | None = None
    if domains:
        domain_list = [d.strip() for d in domains.split(",") if d.strip()]
    warm_portal_bundles(dist_id, domain_list, periodo=periodo)
    warmed = domain_list or ["dashboard", "estadisticas"]
    response.headers["X-Bundle-Warm"] = "accepted"
    return {"ok": True, "dist_id": dist_id, "warming": warmed, "periodo": periodo}
