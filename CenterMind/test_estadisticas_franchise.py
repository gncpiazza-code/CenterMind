"""Franquicias Real: ventas en tenant consolido `real`."""
from core.estadisticas_franchise import (
    FRANCHISE_VENTAS_SOURCE_DIST,
    resolve_estadisticas_ventas_fetch,
)
from services.estadisticas_service import _carta_tiene_actividad_comercial


def test_franchise_maps_to_real_consolido():
    assert FRANCHISE_VENTAS_SOURCE_DIST[7] == 2
    assert FRANCHISE_VENTAS_SOURCE_DIST[8] == 2
    assert FRANCHISE_VENTAS_SOURCE_DIST[9] == 2


def test_franchise_codigos_from_vendedores():
    rows = [
        {"id_vendedor_erp": "7702"},
        {"id_vendedor_erp": "SIN VENDEDOR"},
        {"id_vendedor_erp": "7715"},
    ]
    ctx = resolve_estadisticas_ventas_fetch(7, rows)
    assert ctx["table_dist"] == 2
    assert ctx["filter_dist"] == 2
    assert set(ctx["codigos"]) == {"7702", "7715"}


def test_carta_actividad_requires_ventas_o_exhibiciones():
    assert _carta_tiene_actividad_comercial({"compradores": 1, "bultos": 0, "exhibiciones": 0})
    assert _carta_tiene_actividad_comercial({"compradores": 0, "bultos": 0, "exhibiciones": 3})
    assert not _carta_tiene_actividad_comercial(
        {"compradores": 0, "bultos": 0, "exhibiciones": 0, "pdvs": 50}
    )
