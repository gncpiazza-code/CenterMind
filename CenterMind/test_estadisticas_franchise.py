"""Franquicias Real: ventas en tenant consolido `real`."""
from core.ventas_enriched_tenant import (
    FRANCHISE_VENTAS_SOURCE_DIST,
    build_ventas_read_context,
    load_vendedores_ventas_scope_rows,
)
from core.estadisticas_franchise import resolve_estadisticas_ventas_fetch
from services.estadisticas_service import (
    _carta_tiene_actividad_comercial,
    _compradores_cids_by_vend_from_parallel,
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


def test_compradores_batch_from_parallel_ventas_y_padron():
    parallel = {
        "vendedores": [{"id_vendedor": 1, "id_vendedor_erp": "10", "nombre_erp": "V1"}],
        "ventas": [
            {
                "fecha_factura": "2026-05-10",
                "importe_final": 100,
                "anulado": False,
                "id_cliente_erp": "100",
                "codigo_vendedor": "10",
            },
            {
                "fecha_factura": "2026-05-11",
                "importe_final": -5,
                "anulado": False,
                "id_cliente_erp": "200",
                "codigo_vendedor": "10",
            },
        ],
        "pdv": [
            {
                "id_ruta": 1,
                "id_cliente": 10,
                "id_cliente_erp": "100",
                "fecha_ultima_compra": "2026-05-01",
            },
            {
                "id_ruta": 1,
                "id_cliente": 30,
                "id_cliente_erp": "300",
                "fecha_ultima_compra": "2026-05-15",
            },
            {
                "id_ruta": 2,
                "id_cliente": 40,
                "id_cliente_erp": "400",
                "fecha_ultima_compra": "2026-04-01",
            },
        ],
    }
    meses = {"2026-05"}
    match_indexes = {
        "codigo_to_vid": {"10": 1},
        "nombre_to_vid": {},
        "integrante_to_vid": {},
        "vid_to_nombre": {1: "V1"},
    }
    ruta_to_vend = {1: 1, 2: 2}
    by_vend = _compradores_cids_by_vend_from_parallel(
        1, parallel, meses, "2026-05-01", "2026-05-31", match_indexes, ruta_to_vend
    )
    assert by_vend[1] == {10, 30}
    assert 40 not in by_vend.get(2, set())


def test_compradores_batch_matchea_variante_erp_consolido():
    """Venta con id_cliente_erp exacto de variante padrón → 1 comprador."""
    parallel = {
        "vendedores": [{"id_vendedor": 1, "id_vendedor_erp": "10", "nombre_erp": "V1"}],
        "ventas": [
            {
                "fecha_factura": "2026-05-10",
                "importe_final": 50,
                "anulado": False,
                "id_cliente_erp": "100",
                "codigo_vendedor": "10",
            },
        ],
        "pdv": [
            {
                "id_ruta": 1,
                "id_cliente": 99,
                "id_cliente_erp": "100",
                "fecha_ultima_compra": "2026-04-01",
            },
        ],
    }
    match_indexes = {
        "codigo_to_vid": {"10": 1},
        "nombre_to_vid": {},
        "integrante_to_vid": {},
        "vid_to_nombre": {1: "V1"},
    }
    by_vend = _compradores_cids_by_vend_from_parallel(
        1,
        parallel,
        {"2026-05"},
        "2026-05-01",
        "2026-05-31",
        match_indexes,
        {1: 1},
    )
    assert by_vend[1] == {99}


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
