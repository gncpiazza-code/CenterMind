"""Tests filtro vendor en get_cc_vendedor (id_vendedor = PK int, no ERP string)."""
from services.vendedor_cc_service import _row_matches_vendor


def test_row_matches_vendor_by_pk():
    row = {"id_vendedor": 30, "vendedor_nombre": "0001 - IVAN SOTO"}
    assert _row_matches_vendor(row, 30, "1001", "IVAN SOTO") is True
    assert _row_matches_vendor(row, 31, "1001", "IVAN SOTO") is False


def test_row_matches_vendor_by_nombre_when_pk_null():
    row = {"id_vendedor": None, "vendedor_nombre": "0037 - DIEGO ACOSTA"}
    assert _row_matches_vendor(row, 99, None, "DIEGO ACOSTA") is True

