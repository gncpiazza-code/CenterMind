# -*- coding: utf-8 -*-
from core.compras_fechas import (
    advance_fechas_compra,
    es_activacion_en_periodo,
    inactivo_comercial_en,
    resolve_fechas_compra_persistidas,
    ultima_compra_antes_de,
    _top2_from_dias,
    _pair_validas,
)


def test_pair_rechaza_iguales():
    u, a = _pair_validas("2026-05-10", "2026-05-10")
    assert u == "2026-05-10"
    assert a is None


def test_advance_nueva_compra():
    u, a = advance_fechas_compra("2026-04-01", None, "2026-05-15")
    assert u == "2026-05-15"
    assert a == "2026-04-01"


def test_advance_no_degrada():
    u, a = advance_fechas_compra("2026-05-20", "2026-04-01", "2026-03-01")
    assert u == "2026-05-20"
    assert a == "2026-04-01"


def test_top2_dias():
    u, a = _top2_from_dias({"2026-01-01", "2026-05-01", "2026-05-01"})
    assert u == "2026-05-01"
    assert a == "2026-01-01"


def test_resolve_merge():
    u, a = resolve_fechas_compra_persistidas(
        "2026-04-10", "2026-02-01", "2026-05-01", "2026-03-15"
    )
    assert u == "2026-05-01"
    assert a == "2026-04-10"


def test_ultima_compra_antes_de():
    assert ultima_compra_antes_de("2026-05-15", "2026-01-10", "2026-05-01") == "2026-01-10"
    assert ultima_compra_antes_de("2026-03-01", "2026-01-10", "2026-05-01") == "2026-03-01"


def test_inactivo_y_activacion():
    # Compró en mayo; penúltima en enero → inactivo al 1/may
    assert inactivo_comercial_en("2026-05-15", "2026-01-10", "2026-05-01")
    assert es_activacion_en_periodo("2026-05-15", "2026-01-10", "2026-05-01", "2026-05-31")
    # Penúltima en abril → activo al 1/may → no es activación
    assert not inactivo_comercial_en("2026-05-15", "2026-04-20", "2026-05-01")
    assert not es_activacion_en_periodo("2026-05-15", "2026-04-20", "2026-05-01", "2026-05-31")
