# -*- coding: utf-8 -*-
"""Tests core/ultima_compra.py (sin DB)."""
from core.ultima_compra import (
    _mejor_ultima,
    comprobante_from_venta_row,
    comprobante_label,
    comprobantes_ultima_fecha_from_docs,
    resolve_fecha_ultima_compra,
)


def test_comprobante_label():
    assert comprobante_label("FAC A", "123", "0001") == "FAC A 0001 #123"


def test_resolve_prefiere_enriched():
    ent = {"fecha": "2026-05-28", "comprobante": {"label": "FAC 1"}}
    f, c = resolve_fecha_ultima_compra("2026-05-01", ent)
    assert f == "2026-05-28"
    assert c["label"] == "FAC 1"


def test_resolve_fallback_padron():
    f, c = resolve_fecha_ultima_compra("2026-04-10", None)
    assert f == "2026-04-10"
    assert c is None


def test_mejor_ultima_por_fecha():
    a = {"fecha": "2026-05-01", "comprobante": {"importe_final": 100}}
    b = {"fecha": "2026-05-15", "comprobante": {"importe_final": 1}}
    assert _mejor_ultima(a, b)["fecha"] == "2026-05-15"


def test_comprobantes_mismo_dia():
    docs = {
        ("2026-05-28", "111", "FCVTA"): {
            "fecha": "2026-05-28",
            "importe_total": 100.0,
            "comprobante": {"label": "FCVTA #111"},
            "articulos_map": {"A": {"descripcion": "A", "bultos_total": 1, "unidades_total": 10, "importe_final": 100}},
        },
        ("2026-05-28", "222", "FCVTA"): {
            "fecha": "2026-05-28",
            "importe_total": 200.0,
            "comprobante": {"label": "FCVTA #222"},
            "articulos_map": {"B": {"descripcion": "B", "bultos_total": 1, "unidades_total": 20, "importe_final": 200}},
        },
        ("2026-05-20", "999", "FCVTA"): {
            "fecha": "2026-05-20",
            "importe_total": 50.0,
            "comprobante": {"label": "FCVTA #999"},
            "articulos_map": {},
        },
    }
    blocks = comprobantes_ultima_fecha_from_docs(docs)
    assert len(blocks) == 2
    assert blocks[0]["comprobante"]["label"] == "FCVTA #222"
    assert blocks[1]["comprobante"]["label"] == "FCVTA #111"


def test_comprobante_from_row():
    row = {
        "fecha_factura": "2026-05-20",
        "tipo_documento": "FAC",
        "numero_documento": "99",
        "serie": "A",
        "importe_final": 1500.5,
        "nombre_vendedor": "Juan",
    }
    c = comprobante_from_venta_row(row)
    assert c["fecha"] == "2026-05-20"
    assert c["importe_final"] == 1500.5
    assert "FAC" in c["label"]
