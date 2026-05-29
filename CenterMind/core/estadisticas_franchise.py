# -*- coding: utf-8 -*-
"""
Franquicias Real (Bolívar, Caramele, LAG): padrón/exhibiciones en dist propio,
ventas Consolido en informe tenant `real` (id_distribuidor 2).
"""
from __future__ import annotations

from core.rpa_tenant_registry import TENANT_DIST_MAP

# dist franquicia → dist donde vive ventas_enriched_v2 (Consolido Real)
FRANCHISE_VENTAS_SOURCE_DIST: dict[int, int] = {
    7: TENANT_DIST_MAP["real"],   # Bolívar
    8: TENANT_DIST_MAP["real"],   # Caramele
    9: TENANT_DIST_MAP["real"],   # LAG
}


def _codigos_franquicia(vend_rows: list[dict]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in vend_rows or []:
        erp = str(v.get("id_vendedor_erp") or "").strip()
        if not erp or erp.upper() == "SIN VENDEDOR":
            continue
        if erp not in seen:
            seen.add(erp)
            out.append(erp)
    return out


def resolve_estadisticas_ventas_fetch(
    dist_id: int,
    vend_rows: list[dict] | None = None,
) -> dict[str, object]:
    """
    Contexto de lectura de ventas_enriched_v2 para estadísticas.

    Returns:
        table_dist: sufijo tenant de la tabla
        filter_dist: valor id_distribuidor en filas
        codigos: lista para .in_(codigo_vendedor) en franquicias, o None
    """
    source = FRANCHISE_VENTAS_SOURCE_DIST.get(dist_id)
    if source is None:
        return {"table_dist": dist_id, "filter_dist": dist_id, "codigos": None}
    codigos = _codigos_franquicia(vend_rows or [])
    return {
        "table_dist": source,
        "filter_dist": source,
        "codigos": codigos if codigos else None,
    }
