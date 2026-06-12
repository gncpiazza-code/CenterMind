# -*- coding: utf-8 -*-
"""
Exclusiones de líneas ventas_enriched para Avance de ventas (KPIs supervisión).

Cuentas ERP internas (stock en mano del vendedor) no son ventas a PDV.
"""
from __future__ import annotations

from core.rpa_tenant_registry import TENANT_DIST_MAP

# Real Distribución - T&H (tenant tabaco, dist 3): cuentas de mercadería en mano.
_TABACO_VENDEDOR_STOCK_CLIENTES: frozenset[str] = frozenset(
    {
        "125",
        "160",
        "114",
        "111",
        "113",
        "2906",
        "11645",
        "10008",
        "30146",
        "21465",
        "12376",
        "11744",
        "30030",
        "33982",
        "34195",
        "30366",
        "34225",
        "21429",
        "10009",
        "21826",
        "20186",
        "21794",
        "30878",
        "40150",
        "40153",
        "40161",
        "41801",
        "42250",
        "42595",
        "42607",
        "44337",
        "44158",
        "43872",
        "43232",
        "44125",
        "43904",
        "43069",
        "43984",
    }
)

AVANCE_EXCLUDED_CLIENTE_ERP_BY_DIST: dict[int, frozenset[str]] = {
    TENANT_DIST_MAP["tabaco"]: _TABACO_VENDEDOR_STOCK_CLIENTES,
}


def _cliente_erp_variants(codigo: str) -> set[str]:
    c = str(codigo or "").strip()
    if not c:
        return set()
    stripped = c.lstrip("0") or c
    return {c, stripped}


def avance_excluded_cliente_erps(dist_id: int) -> frozenset[str] | None:
    return AVANCE_EXCLUDED_CLIENTE_ERP_BY_DIST.get(int(dist_id))


def is_avance_line_excluded(dist_id: int, row: dict) -> bool:
    """True si la línea no debe entrar a KPIs/ranking de Avance (p. ej. stock vendedor)."""
    excluded = avance_excluded_cliente_erps(dist_id)
    if not excluded:
        return False
    erp = str(row.get("id_cliente_erp") or "").strip()
    if not erp:
        return False
    return bool(_cliente_erp_variants(erp) & excluded)
