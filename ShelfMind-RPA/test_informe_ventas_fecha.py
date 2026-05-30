# -*- coding: utf-8 -*-
"""Fechas del informe de ventas: primera corrida ayer, resto hoy."""

from datetime import date
from unittest.mock import patch

from motores.informe_ventas import _fecha_reporte_label_es


def test_fecha_ayer_primera_corrida():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 30, 9, 30, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        d, label = _fecha_reporte_label_es(usar_fecha_hoy=False)
    assert d == date(2026, 5, 29)
    assert label == "29 de mayo de 2026"


def test_fecha_hoy_corridas_tarde():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 30, 17, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        d, label = _fecha_reporte_label_es(usar_fecha_hoy=True)
    assert d == date(2026, 5, 30)
    assert label == "30 de mayo de 2026"
