"""Tests para deltas de cc_kpi_snapshot (flechas supervisión)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from core.helpers import (
    build_cc_kpi_deltas,
    cc_kpi_delta,
    cc_kpi_trend_reference_valid,
)


def test_cc_kpi_delta_subio_deuda():
    actual = {"total_deuda": 1100}
    anterior = {"total_deuda": 1000}
    d = cc_kpi_delta(actual, anterior, "total_deuda")
    assert d["dir"] == "up"
    assert d["diff"] == 100
    assert d["pct"] == 10.0
    assert d["anterior"] == 1000
    assert d["actual"] == 1100


def test_cc_kpi_delta_bajo_sin_pct_previo_cero():
    actual = {"clientes_deudores": 5}
    anterior = {"clientes_deudores": 0}
    d = cc_kpi_delta(actual, anterior, "clientes_deudores")
    assert d["dir"] == "up"
    assert d["diff"] == 5
    assert d["pct"] is None


def test_cc_kpi_delta_sin_anterior():
    assert cc_kpi_delta({"total_deuda": 1}, None, "total_deuda") is None


def test_cc_kpi_delta_neutral():
    d = cc_kpi_delta({"pdvs_atraso_15": 3}, {"pdvs_atraso_15": 3}, "pdvs_atraso_15")
    assert d["dir"] == "neutral"


def test_cc_kpi_trend_reference_valid_requiere_7_dias():
    actual = {"fecha_snapshot": "2026-05-30"}
    ref_ok = {"fecha_snapshot": "2026-05-23"}
    ref_corta = {"fecha_snapshot": "2026-05-28"}
    assert cc_kpi_trend_reference_valid(actual, ref_ok, lookback_days=7) is True
    assert cc_kpi_trend_reference_valid(actual, ref_corta, lookback_days=7) is False


def test_build_cc_kpi_deltas_sin_referencia_valida():
    actual = {"fecha_snapshot": "2026-05-30", "total_deuda": 100}
    ref_corta = {"fecha_snapshot": "2026-05-28", "total_deuda": 90}
    assert build_cc_kpi_deltas(actual, ref_corta, lookback_days=7) is None


def test_build_cc_kpi_deltas_con_referencia_valida():
    actual = {
        "fecha_snapshot": "2026-05-30",
        "total_deuda": 110,
        "clientes_deudores": 5,
        "pdvs_atraso_15": 1,
    }
    ref = {
        "fecha_snapshot": "2026-05-23",
        "total_deuda": 100,
        "clientes_deudores": 4,
        "pdvs_atraso_15": 0,
    }
    deltas = build_cc_kpi_deltas(actual, ref, lookback_days=7)
    assert deltas is not None
    assert deltas["total_deuda"]["dir"] == "up"
