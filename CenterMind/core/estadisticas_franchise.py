# -*- coding: utf-8 -*-
"""
Franquicias Real (Bolívar, Caramele, LAG): padrón/exhibiciones en dist propio,
ventas Consolido en informe tenant `real` (id_distribuidor 2).

Lógica de lectura ventas: core/ventas_enriched_tenant.py (filtro estricto).
"""
from __future__ import annotations

from core.rpa_tenant_registry import TENANT_DIST_MAP
from core.ventas_enriched_tenant import (
    FRANCHISE_VENTAS_SOURCE_DIST,
    build_ventas_read_context,
    resolve_estadisticas_ventas_fetch,
)

__all__ = [
    "FRANCHISE_VENTAS_SOURCE_DIST",
    "build_ventas_read_context",
    "resolve_estadisticas_ventas_fetch",
]
