"""Filtro CC por vendedor: incluye filas sin id_vendedor si matchea código CHESS."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from routers.supervision import _filter_cc_rows_for_vendedor


def test_filter_cc_rows_matches_by_id_vendedor():
    rows = [
        {"vendedor_nombre": "0013 - MARCELO OCARANZA", "id_vendedor": 182, "deuda_total": 100},
        {"vendedor_nombre": "0014 - JUAN BAUTISTA", "id_vendedor": 194, "deuda_total": 200},
    ]
    out = _filter_cc_rows_for_vendedor(
        rows,
        vend_row={"id_vendedor": 182, "id_vendedor_erp": "1013", "nombre_erp": "MARCELO OCARANZA"},
        id_vendedor=182,
    )
    assert len(out) == 1
    assert out[0]["deuda_total"] == 100


def test_filter_cc_rows_matches_orphan_by_erp_code():
    rows = [
        {"vendedor_nombre": "0013 - MARCELO OCARANZA", "id_vendedor": None, "deuda_total": 50},
        {"vendedor_nombre": "0014 - JUAN BAUTISTA", "id_vendedor": 194, "deuda_total": 200},
    ]
    out = _filter_cc_rows_for_vendedor(
        rows,
        vend_row={"id_vendedor": 182, "id_vendedor_erp": "1013", "nombre_erp": "MARCELO OCARANZA"},
        id_vendedor=182,
    )
    assert len(out) == 1
    assert out[0]["deuda_total"] == 50


def test_filter_cc_rows_empty_when_vendor_has_no_deudores():
    rows = [
        {"vendedor_nombre": "0014 - JUAN BAUTISTA", "id_vendedor": 194, "deuda_total": 200},
    ]
    out = _filter_cc_rows_for_vendedor(
        rows,
        vend_row={"id_vendedor": 182, "id_vendedor_erp": "1013", "nombre_erp": "MARCELO OCARANZA"},
        id_vendedor=182,
    )
    assert out == []
