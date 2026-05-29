"""Reglas de bultos — Informe de Ventas."""
import pytest

from core.ventas_bultos_rules import (
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
