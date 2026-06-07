# -*- coding: utf-8 -*-
"""Tests tabla detalle PDF cuentas corrientes."""
import sys
from unittest.mock import MagicMock

if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()

from services.cc_difusion_service import (
    _build_cc_detail_table,
    _build_cc_pdf,
    _format_antiguedad_dias,
    _group_clientes_por_dia_semana,
)


def test_format_antiguedad_dias_exacto():
    assert _format_antiguedad_dias({"antiguedad": 248}) == "248"
    assert _format_antiguedad_dias({"antiguedad_dias": 15}) == "15"
    assert _format_antiguedad_dias({}) == "—"


def test_detail_table_header_banner_y_antiguedad():
    tbl = _build_cc_detail_table([
        {
            "cliente": "Kiosco Test",
            "id_cliente_erp": "123",
            "antiguedad": 42,
            "deuda_total": 1000,
            "deuda_7_dias": 100,
            "deuda_15_dias": 200,
            "deuda_30_dias": 0,
            "deuda_60_dias": 0,
            "deuda_mas_60_dias": 700,
        },
    ])
    rows = tbl._cellvalues
    assert rows[0][2] == "Antigüedad total"
    assert rows[0][4] == "Desglose de la deuda por días"
    assert rows[1][4:9] == ["7 Días", "15 Días", "30 Días", "60 Días", "+60 Días"]
    assert rows[2][2] == "42"


def test_build_cc_pdf_genera_bytes():
    pdf = _build_cc_pdf(
        vendedor_nombre="Vendedor Test",
        dist_nombre="Dist Test",
        fecha="07/06/2026",
        clientes=[{
            "cliente": "Cliente A",
            "id_cliente_erp": "1",
            "antiguedad": 10,
            "deuda_total": 500,
            "deuda_7_dias": 500,
        }],
        deuda_total=500,
    )
    assert pdf[:4] == b"%PDF"


def test_group_clientes_por_dia_semana():
    erp_map = {"100": "Lunes", "200": "Martes", "300": "Viernes"}
    clientes = [
        {"id_cliente_erp": "100", "deuda_total": 10, "antiguedad": 5},
        {"id_cliente_erp": "200", "deuda_total": 20, "antiguedad": 10},
        {"id_cliente_erp": "999", "deuda_total": 5, "antiguedad": 1},
        {"id_cliente_erp": "300", "deuda_total": 30, "antiguedad": 15},
    ]
    groups = _group_clientes_por_dia_semana(clientes, erp_map)
    labels = [g[0] for g in groups]
    assert labels == ["Lunes", "Martes", "Viernes", "Sin día asignado"]
    assert len(groups[0][1]) == 1
    assert groups[3][1][0]["id_cliente_erp"] == "999"
