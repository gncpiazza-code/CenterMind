# -*- coding: utf-8 -*-
"""Bultos netos Consolido: ventas + devoluciones (PRDVO), sin recaudaciones."""
from services.estadisticas_service import (
    _acumular_bultos_unidades,
    _es_devolucion,
    _es_operacion_bultos_neto,
    _es_recaudacion,
)


def test_es_devolucion_prdvo():
    assert _es_devolucion("PRDVO", 100.0) is True
    assert _es_devolucion("FAC", -1.0) is True
    assert _es_devolucion("FAC", 100.0) is False


def test_operacion_bultos_neto_incluye_devolucion_excluye_recibo():
    assert _es_operacion_bultos_neto("FAC", 100.0) is True
    assert _es_operacion_bultos_neto("PRDVO", -50.0) is True
    assert _es_operacion_bultos_neto("RECIBO", 100.0) is False
    assert _es_recaudacion("RECCC") is True


def test_acumular_bultos_neto_resta_devolucion():
    bultos = 0.0
    unidades = 0.0
    venta = {
        "bultos_total": 64.8,
        "unidades_total": 16200,
        "agrupacion_art_2": "CIGARRILLOS",
        "descripcion_articulo": "CORONA PROMOCION",
    }
    devol = {
        "bultos_total": -5.0,
        "unidades_total": -1250,
        "agrupacion_art_2": "CIGARRILLOS",
        "descripcion_articulo": "CORONA PROMOCION",
    }
    bultos, unidades = _acumular_bultos_unidades(venta, bultos, unidades)
    bultos, unidades = _acumular_bultos_unidades(devol, bultos, unidades)
    assert abs(bultos - 59.8) < 0.01
