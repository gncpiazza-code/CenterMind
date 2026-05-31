# -*- coding: utf-8 -*-
"""Desglose bultos por artículo debe usar la misma asignación que el KPI batch."""
from services.estadisticas_service import (
    _build_bultos_desglose,
    _venta_pertenece_vendedor,
    _cartas_comercial_ventas_plausible,
    bultos_display_2dec,
)


def _vctx(vid: int, idx: dict | None = None) -> dict:
    return {"id_vendedor": vid, "match_indexes": idx or {}, "codigos_vendedor": ["1001"], "nombre_erp": "IVAN SOTO"}


def test_venta_pertenece_vendedor_por_codigo():
    idx = {"codigo_to_vid": {"1001": 30}, "nombre_to_vid": {}, "consolido_to_vid": {}}
    row = {"codigo_vendedor": "1001", "nombre_vendedor": "OTRO NOMBRE"}
    assert _venta_pertenece_vendedor(row, _vctx(30, idx)) is True
    assert _venta_pertenece_vendedor(row, _vctx(31, idx)) is False


def test_venta_pertenece_vendedor_por_nombre_cuando_codigo_falta():
    idx = {
        "codigo_to_vid": {"1001": 30},
        "nombre_to_vid": {"IVAN SOTO": 30},
        "consolido_to_vid": {},
    }
    row = {"codigo_vendedor": "9999", "nombre_vendedor": "IVAN SOTO"}
    assert _venta_pertenece_vendedor(row, _vctx(30, idx)) is True


def test_build_bultos_desglose_suma_coincide_con_total():
    rows = [
        {
            "fecha_factura": "2026-05-10",
            "tipo_documento": "FAC",
            "importe_final": 100,
            "descripcion_articulo": "ART A",
            "bultos_total": 10.333,
            "agrupacion_art_2": "BEBIDAS",
        },
        {
            "fecha_factura": "2026-05-11",
            "tipo_documento": "FAC",
            "importe_final": 50,
            "descripcion_articulo": "ART A",
            "bultos_total": 5.111,
            "agrupacion_art_2": "BEBIDAS",
        },
        {
            "fecha_factura": "2026-05-12",
            "tipo_documento": "FAC",
            "importe_final": 20,
            "descripcion_articulo": "ART B",
            "bultos_total": 2.556,
            "agrupacion_art_2": "CIGARRILLOS",
            "unidades_total": 639,
        },
        {
            "fecha_factura": "2026-05-13",
            "tipo_documento": "RECIBO",
            "importe_final": 100,
            "descripcion_articulo": "ART C",
            "bultos_total": 99,
        },
    ]
    meses = {"2026-05"}
    top, total_raw = _build_bultos_desglose(rows, meses)
    assert len(top) == 2
    assert abs(total_raw - (10.333 + 5.111 + 2.556)) < 0.001
    assert bultos_display_2dec(total_raw) == bultos_display_2dec(
        sum(float(x.get("bultos_raw") or 0) for x in top)
    )


def test_cartas_plausible_rechaza_ventas_parciales():
    """Snapshot con ventas truncadas (exhibiciones OK, bultos muy bajos) no debe persistirse."""
    cartas = [
        {
            "nombre": "IVAN SOTO",
            "raw_kpis": {
                "exhibiciones": 432,
                "compradores": 411,
                "bultos": 95,
                "bultos_raw": 95.0,
            },
        }
    ]
    assert _cartas_comercial_ventas_plausible(cartas) is False


def test_cartas_plausible_acepta_kpis_coherentes():
    cartas = [
        {
            "nombre": "IVAN SOTO",
            "raw_kpis": {
                "exhibiciones": 432,
                "compradores": 544,
                "bultos": 329,
                "bultos_raw": 329.0,
            },
        }
    ]
    assert _cartas_comercial_ventas_plausible(cartas) is True
