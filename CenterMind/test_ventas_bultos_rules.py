"""Reglas de bultos — Informe de Ventas."""
import pytest

from core.ventas_bultos_rules import (
    bultos_desglose_decimal,
    bultos_desglose_from_unidades,
    bultos_efectivos,
    classify_volumen,
    is_encendedor,
)


def test_encendedor_crudo_sin_conversion():
    assert is_encendedor("ENCENDEDORES", "MK ENCENDEDOR CLIPPER", "")
    b = bultos_efectivos("ENCENDEDORES", "MK ENCENDEDOR", "", 50.0, 0.05)
    assert b == pytest.approx(0.05)


def test_cigarrillo_250_unidades():
    b = bultos_efectivos("CIGARRILLOS", "MARLBORO BOX", "", 250.0, 99.0)
    assert b == pytest.approx(1.0)


def test_papelillo_100_por_agrupacion():
    assert classify_volumen("PAPELILLOS", "PIER AND ROLL", "") == "cig_papelillo"
    b = bultos_efectivos("PAPELILLOS", "PIER AND ROLL NATURAL", "", 100.0, 0.01)
    assert b == pytest.approx(1.0)


def test_mix_exhibidores_25():
    b = bultos_efectivos("CIGARRILLOS", "MIX EXHIBIDORES X", "", 25.0, 0.0)
    assert b == pytest.approx(1.0)


def test_otro_producto_usa_excel():
    b = bultos_efectivos("BEBIDAS", "COCA 2L", "", 12.0, 3.5)
    assert b == pytest.approx(3.5)


def test_desglose_42_37_bultos_250():
    enteros, resto = bultos_desglose_decimal(42.37, 250)
    assert enteros == 42
    assert resto == 92


def test_desglose_from_unidades_cig_250():
    assert bultos_desglose_from_unidades(1092.0, "cig_default") == (4, 92)


def test_desglose_from_unidades_papelillo_100():
    assert bultos_desglose_from_unidades(150.0, "cig_papelillo") == (1, 50)


def test_bultos_pdf_html_cigarrillos_con_unidades():
    from core.ventas_bultos_rules import bultos_pdf_html

    html = bultos_pdf_html(42.37, "cig_default")
    assert "42,37 bultos" in html
    assert "42 Bultos · 92 Unidades" in html


def test_bultos_pdf_html_no_convertido_sin_desglose():
    from core.ventas_bultos_rules import bultos_pdf_html

    html = bultos_pdf_html(10.5, None)
    assert html == "10,50 bultos"
