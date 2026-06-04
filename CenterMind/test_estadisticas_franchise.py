"""Franquicias Real: ventas en tenant consolido `real`."""
from core.ventas_enriched_tenant import (
    FRANCHISE_VENTAS_SOURCE_DIST,
    build_ventas_read_context,
    load_vendedores_ventas_scope_rows,
)
from core.estadisticas_franchise import resolve_estadisticas_ventas_fetch
from services.estadisticas_service import (
    _carta_tiene_actividad_comercial,
    _count_compradores_en_cartera,
)


def test_franchise_maps_to_real_consolido():
    assert FRANCHISE_VENTAS_SOURCE_DIST[7] == 2
    assert FRANCHISE_VENTAS_SOURCE_DIST[8] == 2
    assert FRANCHISE_VENTAS_SOURCE_DIST[9] == 2


def test_franchise_auto_codigos_caramele_vendedores():
    """Sin vend_rows explícitos, build debe recibir codigos ERP (no scope vacío)."""
    rows = load_vendedores_ventas_scope_rows(8)
    assert rows, "Caramele debe tener vendedores en vendedores_v2_d8"
    ctx = build_ventas_read_context(8, rows)
    assert ctx["is_franchise"] is True
    assert ctx["table_dist"] == 2
    assert "9711" in (ctx.get("codigos") or [])
    assert "9712" in (ctx.get("codigos") or [])


def test_franchise_codigos_from_vendedores():
    rows = [
        {"id_vendedor_erp": "7702"},
        {"id_vendedor_erp": "SIN VENDEDOR"},
        {"id_vendedor_erp": "7715"},
    ]
    ctx = resolve_estadisticas_ventas_fetch(7, rows)
    assert ctx["table_dist"] == 2
    assert ctx["filter_dist"] == 2
    assert ctx["data_tenant_id"] == "real"
    assert ctx["is_franchise"] is True
    assert set(ctx["codigos"]) == {"7702", "7715"}


def test_compradores_no_superan_pdvs_cartera():
    assert _count_compradores_en_cartera({"1", "2", "9"}, {"1", "2", "3"}) == 2
    assert _count_compradores_en_cartera({"9"}, {"1", "2"}) == 0
    assert _count_compradores_en_cartera({"1"}, set()) == 0


def test_carta_actividad_requires_ventas_o_exhibiciones():
    assert _carta_tiene_actividad_comercial({"compradores": 1, "bultos": 0, "exhibiciones": 0})
    assert _carta_tiene_actividad_comercial({"compradores": 0, "bultos": 0, "exhibiciones": 3})
    assert not _carta_tiene_actividad_comercial(
        {"compradores": 0, "bultos": 0, "exhibiciones": 0, "pdvs": 50}
    )
