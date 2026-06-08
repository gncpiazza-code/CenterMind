# -*- coding: utf-8 -*-
from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from services.cc_difusion_service import _filter_cc_rows_por_hoy

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def test_filter_cc_hoy_sin_id_distribuidor_en_rutas():
    """rutas_v2_d* no admite id_distribuidor; debe filtrar por día sin caer al listado general."""
    sb_mock = MagicMock()
    rutas_eq_cols: list[str] = []

    def _table(name):
        tbl = MagicMock()
        q = tbl
        q.select.return_value = q
        q.eq.return_value = q
        q.in_.return_value = q
        q.range.return_value = q

        if "rutas_v2" in (name or ""):

            def _eq(col, val):
                rutas_eq_cols.append(col)
                return q

            q.eq = _eq
            dia_hoy = {
                0: "Lunes",
                1: "Martes",
                2: "Miércoles",
                3: "Jueves",
                4: "Viernes",
                5: "Sábado",
                6: "Domingo",
            }[datetime.now(AR_TZ).weekday()]
            q.execute.return_value.data = [
                {"id_ruta": 10, "dia_semana": dia_hoy},
                {"id_ruta": 20, "dia_semana": "OtroDía"},
            ]
        elif "clientes_pdv_v2" in (name or ""):
            q.execute.return_value.data = [
                {"id_cliente_erp": "100", "id_ruta": 10},
            ]
        else:
            q.execute.return_value.data = []
        return tbl

    sb_mock.table.side_effect = _table

    all_rows = [
        {"id_cliente_erp": "100", "deuda_total": 500},
        {"id_cliente_erp": "200", "deuda_total": 300},
        {"id_cliente_erp": "300", "deuda_total": 100},
    ]

    with patch("services.cc_difusion_service.sb", sb_mock):
        filtered = _filter_cc_rows_por_hoy(3, 42, all_rows)

    assert "id_distribuidor" not in rutas_eq_cols
    assert "id_vendedor" in rutas_eq_cols
    assert len(filtered) == 1
    assert filtered[0]["id_cliente_erp"] == "100"


def test_filter_cc_hoy_error_no_devuelve_general():
    sb_mock = MagicMock()
    sb_mock.table.side_effect = RuntimeError("db down")

    all_rows = [{"id_cliente_erp": "1", "deuda_total": 10}]
    with patch("services.cc_difusion_service.sb", sb_mock):
        filtered = _filter_cc_rows_por_hoy(3, 42, all_rows)

    assert filtered == []
