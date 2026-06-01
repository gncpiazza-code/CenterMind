# -*- coding: utf-8 -*-
"""Fechas informe ventas: rolling7 scheduler; full_mtd manual."""

from datetime import date
from unittest.mock import patch

from motores.informe_ventas import (
    _fecha_label_variants,
    _fecha_reporte_label_es,
    _fecha_reporte_rango_es,
    _parse_fecha_es,
)


def test_rolling7_tarde():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 30, 17, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=True)
    assert modo == "rolling7"
    assert desde == date(2026, 5, 24)
    assert hasta == date(2026, 5, 30)


def test_rolling7_manana():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 30, 9, 30, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=False)
    assert modo == "rolling7"
    assert desde == date(2026, 5, 23)
    assert hasta == date(2026, 5, 29)


def test_rolling7_inicio_mes_pocos_dias():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 5, 17, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=True)
    assert modo == "rolling7"
    assert desde == date(2026, 5, 1)
    assert hasta == date(2026, 5, 5)


def test_full_mtd_manual():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 30, 12, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=True, modo="full_mtd")
        d, label = _fecha_reporte_label_es(usar_fecha_hoy=True, modo="full_mtd")
    assert modo == "full_mtd"
    assert desde == date(2026, 5, 1)
    assert hasta == date(2026, 5, 30)
    assert d == date(2026, 5, 1)
    assert label == "1 de mayo de 2026"


def test_custom_rango_explicito():
    desde, hasta, modo = _fecha_reporte_rango_es(
        False,
        fecha_desde=_parse_fecha_es("01/05/2026"),
        fecha_hasta=_parse_fecha_es("06/05/2026"),
    )
    assert modo == "custom"
    assert desde == date(2026, 5, 1)
    assert hasta == date(2026, 5, 6)


def test_junio_1_madrugada_cierra_mes_anterior():
    """1/jun 09:30: ayer=31/may; no mezcla mayo en rolling7 de junio."""
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 6, 1, 9, 30, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=False)
    assert desde == hasta == date(2026, 5, 31)
    assert modo == "ayer"


def test_junio_1_tarde_cubre_dia_1():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 6, 1, 17, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=True)
    assert modo == "rolling7"
    assert desde == date(2026, 6, 1)
    assert hasta == date(2026, 6, 1)


def test_junio_8_rolling_ultimos_7_dias_en_mes():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 6, 8, 17, 0, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=True)
    assert desde == date(2026, 6, 2)
    assert hasta == date(2026, 6, 8)


def test_primer_dia_del_mes_solo_ayer():
    with patch("motores.informe_ventas.datetime") as mock_dt:
        mock_dt.now.return_value = __import__("datetime").datetime(
            2026, 5, 1, 9, 30, tzinfo=__import__("zoneinfo").ZoneInfo("America/Argentina/Buenos_Aires")
        )
        desde, hasta, modo = _fecha_reporte_rango_es(usar_fecha_hoy=False)
    assert desde == hasta == date(2026, 4, 30)
    assert modo == "ayer"


def test_fecha_label_variants_incluye_formato_es():
    labels = _fecha_label_variants(date(2026, 5, 25))
    assert "25 de mayo de 2026" in labels
