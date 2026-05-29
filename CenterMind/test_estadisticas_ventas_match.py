"""Matching ventas Consolido → vendedor en estadísticas."""
from services.estadisticas_service import (
    _build_vendor_match_indexes,
    _resolve_vid_from_venta_row,
)


def _idx():
    rows = [
        {"id_vendedor": 132, "id_vendedor_erp": "1006", "nombre_erp": "TOURN DIEGO"},
        {"id_vendedor": 127, "id_vendedor_erp": "1002", "nombre_erp": "VILLANUEVA JUAN"},
    ]
    return _build_vendor_match_indexes(rows, dist_id=6)


def test_resolve_by_codigo_erp():
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
