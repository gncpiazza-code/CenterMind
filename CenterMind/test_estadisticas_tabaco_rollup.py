"""Tests rollup Tabaco — Ivan Soto / Matias Wutrich."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from core.estadisticas_tabaco_rollup import (
    apply_tabaco_rollups,
    merge_raw_kpis,
    resolve_tabaco_rollup_groups,
    _is_ivan_soto,
    _is_matias_wutrich,
    _is_soto_helper_vendor,
)


def test_name_matchers():
    assert _is_ivan_soto("Ivan Soto")
    assert _is_soto_helper_vendor("Monchi Ayala")
    assert _is_soto_helper_vendor("Jorge Coronel")
    assert not _is_soto_helper_vendor("Ivan Soto")
    assert _is_matias_wutrich("Matias Wutrich")


def test_resolve_groups():
    vend = [
        {"id_vendedor": 30, "nombre_erp": "IVAN SOTO"},
        {"id_vendedor": 101, "nombre_erp": "MONCHI AYALA"},
        {"id_vendedor": 102, "nombre_erp": "JORGE CORONEL"},
        {"id_vendedor": 58, "nombre_erp": "MATIAS WUTRICH"},
        {"id_vendedor": 59, "nombre_erp": "IVAN WUTRICH"},
    ]
    groups = resolve_tabaco_rollup_groups(vend)
    assert len(groups) == 2
    soto = next(g for g in groups if g.leader_vid == 30)
    assert set(soto.member_vids) == {101, 102}
    wut = next(g for g in groups if g.leader_vid == 58)
    assert wut.member_vids == (59,)


def test_merge_and_hide_members():
    vend = [
        {"id_vendedor": 30, "nombre_erp": "IVAN SOTO"},
        {"id_vendedor": 101, "nombre_erp": "MONCHI AYALA"},
        {"id_vendedor": 102, "nombre_erp": "JORGE CORONEL"},
    ]
    raw = {
        "30": {
            "pdvs": 50,
            "altas": 1,
            "exhibiciones": 10,
            "pdvs_exhibidos": 10,
            "compradores": 5,
            "bultos": 100,
            "cobertura_pct": 20.0,
            "objetivos_pct": 50.0,
        },
        "101": {
            "pdvs": 0,
            "altas": 2,
            "exhibiciones": 15,
            "pdvs_exhibidos": 18,
            "compradores": 3,
            "bultos": 40,
            "cobertura_pct": 0.0,
            "objetivos_pct": 0.0,
        },
        "102": {
            "pdvs": 0,
            "altas": 0,
            "exhibiciones": 5,
            "pdvs_exhibidos": 12,
            "compradores": 1,
            "bultos": 10,
            "cobertura_pct": 0.0,
            "objetivos_pct": 0.0,
        },
    }
    merged, hidden = apply_tabaco_rollups(3, raw, vend)
    assert hidden == {"101", "102"}
    assert merged["30"]["exhibiciones"] == 30
    assert merged["30"]["altas"] == 3
    assert merged["30"]["bultos"] == 150
    assert merged["30"]["pdvs"] == 50
    assert merged["30"]["pdvs_exhibidos"] == 40
    assert merged["30"]["cobertura_pct"] == 80.0


def test_merge_raw_kpis_derives_pdvs_exhibidos_from_cobertura():
    merged = merge_raw_kpis(
        [
            {"pdvs_exhibidos": 0, "cobertura_pct": 72.4, "exhibiciones": 100},
        ],
        leader_pdvs=597,
    )
    assert merged["pdvs_exhibidos"] == 432
    assert merged["cobertura_pct"] == pytest.approx(72.4, abs=0.1)


def test_merge_raw_kpis_empty():
    assert merge_raw_kpis([], 0)["pdvs"] == 0


def test_non_tabaco_noop():
    raw = {"1": {"pdvs": 10, "altas": 0, "exhibiciones": 1, "compradores": 0, "bultos": 0, "cobertura_pct": 10.0, "objetivos_pct": 0.0}}
    out, hidden = apply_tabaco_rollups(2, raw, [])
    assert out == raw
    assert hidden == set()
