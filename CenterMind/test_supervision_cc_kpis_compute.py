"""KPI pdvs_atraso_15 alineado a antigüedad mostrada (padrón + CC)."""
import os
import sys
from datetime import date
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

from routers.supervision import _compute_cc_kpis_from_detalle


def test_pdvs_atraso_15_usa_antiguedad_padron_cuando_cc_marca_cero():
    rows = [
        {
            "cliente_nombre": "040712 - TRINIDAD",
            "id_cliente_erp": "40712",
            "deuda_total": 12500,
            "antiguedad_dias": 0,
        },
        {
            "cliente_nombre": "042588 - JERBY",
            "id_cliente_erp": "42588",
            "deuda_total": 12500,
            "antiguedad_dias": 0,
        },
        {
            "cliente_nombre": "099999 - AL DIA",
            "id_cliente_erp": "99999",
            "deuda_total": 5000,
            "antiguedad_dias": 5,
        },
    ]

    def fake_maps(_d_id, _rows):
        return {}, {}, {}, {}, {}, {}

    def fake_antig(item, **kwargs):
        erp = str(item.get("id_cliente_erp") or "")
        if erp == "40712":
            return 241, 0, "+30 Días", True
        if erp == "42588":
            return 106, 0, "+30 Días", True
        return 5, 5, "1-7 Días", False

    with patch("routers.supervision._build_pdv_metadata_maps", side_effect=fake_maps):
        with patch("routers.supervision._cc_cliente_antiguedad_fields", side_effect=fake_antig):
            with patch("routers.supervision._today_ar", return_value=date(2026, 6, 4)):
                kpis = _compute_cc_kpis_from_detalle(3, rows)

    assert kpis["clientes_deudores"] == 3
    assert kpis["pdvs_atraso_15"] == 2
    assert kpis["total_deuda"] == 30000.0


def test_pdvs_atraso_15_solo_chess_sin_padron():
    rows = [
        {"cliente_nombre": "A", "deuda_total": 100, "antiguedad_dias": 20},
        {"cliente_nombre": "B", "deuda_total": 200, "antiguedad_dias": 10},
    ]

    with patch("routers.supervision._build_pdv_metadata_maps", return_value=({},) * 6):
        with patch(
            "routers.supervision._cc_cliente_antiguedad_fields",
            side_effect=lambda item, **kw: (
                int(item.get("antiguedad_dias") or 0),
                int(item.get("antiguedad_dias") or 0),
                "",
                False,
            ),
        ):
            kpis = _compute_cc_kpis_from_detalle(1, rows)

    assert kpis["pdvs_atraso_15"] == 1
