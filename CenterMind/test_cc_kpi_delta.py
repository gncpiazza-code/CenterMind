"""Tests para deltas de cc_kpi_snapshot (flechas supervisión)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from core.helpers import cc_kpi_delta


def test_cc_kpi_delta_subio_deuda():
    actual = {"total_deuda": 1100}
    anterior = {"total_deuda": 1000}
    d = cc_kpi_delta(actual, anterior, "total_deuda")
    assert d["dir"] == "up"
    assert d["diff"] == 100
    assert d["pct"] == 10.0


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
