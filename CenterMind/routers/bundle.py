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

from fastapi import APIRouter, Depends, Query

from core.helpers import should_apply_exhibicion_qa_filter
from core.security import verify_auth, check_dist_permission
from services.snapshot_dashboard_service import get_or_refresh_dashboard
from services.snapshot_supervision_service import get_or_refresh_supervision
from services.snapshot_estadisticas_service import get_or_refresh_estadisticas
from services.snapshot_visor_service import get_or_refresh_visor

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
    return get_or_refresh_estadisticas(dist_id, meses_list, sucursal)


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
