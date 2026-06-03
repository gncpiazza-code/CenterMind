"""Matching ventas Consolido → vendedor en estadísticas."""
from services.estadisticas_service import (
    _build_vendor_match_indexes,
    _dedupe_ventas_enriched_lines,
    _resolve_vid_from_venta_row,
)


def _idx():
    rows = [
        {"id_vendedor": 132, "id_vendedor_erp": "1006", "nombre_erp": "TOURN DIEGO"},
        {"id_vendedor": 127, "id_vendedor_erp": "1002", "nombre_erp": "VILLANUEVA JUAN"},
        {"id_vendedor": 89, "id_vendedor_erp": "1001", "nombre_erp": "01-CORIA BLAS GUILLE"},
    ]
    return _build_vendor_match_indexes(rows, dist_id=6)


def test_resolve_by_codigo_erp_sin_nombre():
    idx = _idx()
    assert _resolve_vid_from_venta_row({"codigo_vendedor": "1006"}, idx) == 132


def test_resolve_by_codigo_sin_ceros():
    idx = _idx()
    assert _resolve_vid_from_venta_row({"codigo_vendedor": "0001006"}, idx) == 132


def test_resolve_by_nombre_erp_substring():
    idx = _idx()
    assert (
        _resolve_vid_from_venta_row(
            {"nombre_vendedor": "05-TOURN DIEGO", "codigo_vendedor": ""}, idx
        )
        == 132
    )


def test_resolve_unknown_returns_none():
    idx = _idx()
    assert _resolve_vid_from_venta_row({"nombre_vendedor": "OTRO VENDEDOR"}, idx) is None


def test_codigo_no_asigna_si_nombre_no_coincide():
    """Aloma: c_perso 1001 compartido entre CORIA y suplentes (GALLO, IVAN SOTO)."""
    idx = _idx()
    assert (
        _resolve_vid_from_venta_row(
            {
                "codigo_vendedor": "1001",
                "nombre_vendedor": "GALLO RICARDO",
            },
            idx,
        )
        is None
    )


def test_nombre_gana_sobre_codigo_compartido():
    idx = _idx()
    assert (
        _resolve_vid_from_venta_row(
            {
                "codigo_vendedor": "1001",
                "nombre_vendedor": "01-CORIA BLAS GUILLE",
            },
            idx,
        )
        == 89
    )


def test_dedupe_ventas_enriched_lines():
    rows = [
        {
            "fecha_factura": "2026-05-08",
            "numero_documento": "10122",
            "id_cliente_erp": "2211",
            "cod_articulo": "10003",
            "bultos_total": 0.08,
        },
        {
            "fecha_factura": "2026-05-08",
            "numero_documento": "10122",
            "id_cliente_erp": "2211",
            "cod_articulo": "10003",
            "bultos_total": 0.08,
        },
        {
            "fecha_factura": "2026-05-09",
            "numero_documento": "10123",
            "id_cliente_erp": "2211",
            "cod_articulo": "10003",
            "bultos_total": 1.0,
        },
    ]
    out = _dedupe_ventas_enriched_lines(rows)
    assert len(out) == 2
