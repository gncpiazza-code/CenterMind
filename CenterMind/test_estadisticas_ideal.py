"""
Tests unitarios para core/estadisticas_ideal.py.
Solo funciones puras — sin I/O ni dependencia de Supabase.
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(__file__))

from core.estadisticas_ideal import (
    validate_pesos,
    repartir_pesos,
    score_vendedor,
    build_radar_normalized,
    build_radar_scoring_normalized,
    cobertura_exhibicion_pct_from_raw,
    ideal_meta_display_values,
    meta_periodo_kpi,
    normalize_kpi,
    KPI_KEYS,
)


# ---------------------------------------------------------------------------
# validate_pesos
# ---------------------------------------------------------------------------

def test_validate_pesos_valido():
    pesos = {"pdvs": 15, "altas": 15, "exhibiciones": 15, "compradores": 15,
             "bultos": 15, "cobertura": 15, "objetivos": 10}
    ok, err = validate_pesos(pesos)
    assert ok, err


def test_validate_pesos_no_suma_100():
    # All 10 → sum = 70
    pesos = {k: 10 for k in KPI_KEYS}
    ok, err = validate_pesos(pesos)
    assert not ok
    assert "100" in err


def test_validate_pesos_cero():
    pesos = {"pdvs": 0, "altas": 20, "exhibiciones": 20, "compradores": 20,
             "bultos": 20, "cobertura": 10, "objetivos": 10}
    ok, err = validate_pesos(pesos)
    assert not ok


def test_validate_pesos_falta_clave():
    pesos = {"pdvs": 20, "altas": 20, "exhibiciones": 20, "compradores": 20, "bultos": 20}
    ok, err = validate_pesos(pesos)
    assert not ok
    assert "Falta" in err or "falta" in err.lower()


def test_validate_pesos_negativo():
    pesos = {"pdvs": -5, "altas": 25, "exhibiciones": 20, "compradores": 20,
             "bultos": 20, "cobertura": 10, "objetivos": 10}
    ok, err = validate_pesos(pesos)
    assert not ok


def test_validate_pesos_suma_exacta_100():
    # Use exact distribution that sums to 100
    pesos = {"pdvs": 20, "altas": 20, "exhibiciones": 20, "compradores": 15,
             "bultos": 10, "cobertura": 10, "objetivos": 5}
    assert sum(pesos.values()) == 100
    ok, err = validate_pesos(pesos)
    assert ok, err


# ---------------------------------------------------------------------------
# repartir_pesos
# ---------------------------------------------------------------------------

def test_repartir_pesos_suma_100():
    pesos = {k: 10 for k in KPI_KEYS}  # sum = 70
    result = repartir_pesos(pesos, bloqueados=[])
    assert sum(result.values()) == 100


def test_repartir_pesos_todos_al_menos_1():
    pesos = {k: 10 for k in KPI_KEYS}
    result = repartir_pesos(pesos, bloqueados=[])
    assert all(v >= 1 for v in result.values())


def test_repartir_pesos_bloqueado_no_cambia():
    pesos = {"pdvs": 40, "altas": 10, "exhibiciones": 10, "compradores": 10,
             "bultos": 10, "cobertura": 10, "objetivos": 10}
    result = repartir_pesos(pesos, bloqueados=["pdvs"])
    assert result["pdvs"] == 40
    assert sum(result.values()) == 100


def test_repartir_pesos_multiples_bloqueados():
    # Lock two keys; unlocked ones must absorb remainder
    pesos = {"pdvs": 30, "altas": 30, "exhibiciones": 5, "compradores": 5,
             "bultos": 5, "cobertura": 5, "objetivos": 5}
    result = repartir_pesos(pesos, bloqueados=["pdvs", "altas"])
    assert result["pdvs"] == 30
    assert result["altas"] == 30
    assert sum(result.values()) == 100
    libres = [k for k in KPI_KEYS if k not in ("pdvs", "altas")]
    assert all(result[k] >= 1 for k in libres)


def test_repartir_pesos_sin_bloqueados():
    pesos = {"pdvs": 14, "altas": 14, "exhibiciones": 14, "compradores": 14,
             "bultos": 14, "cobertura": 14, "objetivos": 14}  # sum=98
    result = repartir_pesos(pesos, bloqueados=None)
    assert sum(result.values()) == 100


# ---------------------------------------------------------------------------
# score_vendedor
# ---------------------------------------------------------------------------

def test_score_vendedor_perfecto():
    pesos = {"pdvs": 15, "altas": 15, "exhibiciones": 15, "compradores": 15,
             "bultos": 15, "cobertura": 15, "objetivos": 10}
    radar = {k: 100 for k in KPI_KEYS}
    assert score_vendedor(radar, pesos) == 100


def test_score_vendedor_cero():
    pesos = {"pdvs": 15, "altas": 15, "exhibiciones": 15, "compradores": 15,
             "bultos": 15, "cobertura": 15, "objetivos": 10}
    radar = {k: 0 for k in KPI_KEYS}
    assert score_vendedor(radar, pesos) == 0


def test_score_vendedor_cap_100():
    # Even if radar values are > 100, score should be capped
    pesos = {"pdvs": 20, "altas": 20, "exhibiciones": 20, "compradores": 15,
             "bultos": 10, "cobertura": 10, "objetivos": 5}
    radar = {k: 200 for k in KPI_KEYS}
    assert score_vendedor(radar, pesos) == 100


def test_score_vendedor_solo_un_kpi_activo():
    # All weight on pdvs; pdvs is 50 → score = 50*100/100 = 50
    pesos = {"pdvs": 100, "altas": 0, "exhibiciones": 0, "compradores": 0,
             "bultos": 0, "cobertura": 0, "objetivos": 0}
    radar = {"pdvs": 50, "altas": 100, "exhibiciones": 100, "compradores": 100,
             "bultos": 100, "cobertura": 100, "objetivos": 100}
    assert score_vendedor(radar, pesos) == 50


def test_score_vendedor_ponderado_exacto():
    # pdvs=20 weight, radar=80 → contribution=1600; rest all 0 → score=16
    pesos = {"pdvs": 20, "altas": 0, "exhibiciones": 0, "compradores": 0,
             "bultos": 0, "cobertura": 0, "objetivos": 0}
    radar = {"pdvs": 80, "altas": 0, "exhibiciones": 0, "compradores": 0,
             "bultos": 0, "cobertura": 0, "objetivos": 0}
    assert score_vendedor(radar, pesos) == 16


# ---------------------------------------------------------------------------
# build_radar_normalized
# ---------------------------------------------------------------------------

def test_build_radar_normalized_meta_cero_usa_fallback_visual():
    real = {
        "pdvs": 10, "altas": 5, "exhibiciones": 20, "pdvs_exhibidos": 8,
        "compradores": 3, "bultos": 100, "cobertura_pct": 50,
        "cobertura_compra_pct": 30, "objetivos_pct": 75,
    }
    meta = {k: 0 for k in KPI_KEYS}
    meta["pdvs_exhibidos"] = 0
    radar = build_radar_normalized(real, meta)
    assert all(v > 0 for v in radar.values())
    assert all(v <= 100 for v in radar.values())


def test_cobertura_exhibicion_pct_from_raw_fallback_conteo():
    real = {
        "pdvs": 255,
        "pdvs_exhibidos": 63,
        "cobertura_pct": 0,
    }
    pct = cobertura_exhibicion_pct_from_raw(real)
    assert pct == pytest.approx(24.7, abs=0.1)


def test_cobertura_exhibicion_pct_from_raw_zero_sin_exhibidos():
    real = {
        "pdvs": 200,
        "pdvs_exhibidos": 0,
        "cobertura_pct": 12.5,
        "exhibiciones": 0,
    }
    assert cobertura_exhibicion_pct_from_raw(real) == 0.0


def test_cobertura_exhibicion_pct_from_raw_usa_cobertura_con_exhibiciones():
    real = {
        "pdvs": 100,
        "pdvs_exhibidos": 0,
        "cobertura_pct": 42.5,
        "exhibiciones": 30,
    }
    assert cobertura_exhibicion_pct_from_raw(real) == pytest.approx(42.5)


def test_build_radar_normalized_pdvs_exhibidos_fallback_cobertura_cero():
    real = {
        "pdvs": 255,
        "altas": 0,
        "exhibiciones": 101,
        "pdvs_exhibidos": 63,
        "compradores": 241,
        "bultos": 0,
        "cobertura_pct": 0,
        "cobertura_compra_pct": 94.5,
        "objetivos_pct": 0,
    }
    meta = {
        "pdvs": 1,
        "altas": 1,
        "exhibiciones": 1,
        "compradores": 1,
        "bultos": 1,
        "cobertura": 100,
        "objetivos": 1,
        "pdvs_exhibidos": 80,
    }
    radar = build_radar_normalized(real, meta)
    assert radar["pdvs_exhibidos"] == 31


def test_build_radar_normalized_pdvs_exhibidos_vs_meta_ideal_pct():
    real = {
        "pdvs": 100, "altas": 0, "exhibiciones": 50, "pdvs_exhibidos": 40,
        "compradores": 0, "bultos": 0, "cobertura_pct": 40,
        "cobertura_compra_pct": 0, "objetivos_pct": 0,
    }
    meta = {
        "pdvs": 1, "altas": 1, "exhibiciones": 1, "compradores": 1,
        "bultos": 1, "cobertura": 1, "objetivos": 1, "pdvs_exhibidos": 80,
    }
    radar = build_radar_normalized(real, meta)
    assert radar["pdvs_exhibidos"] == 50


def test_build_radar_normalized_cap_100():
    real = {"pdvs": 200, "altas": 10, "exhibiciones": 50, "compradores": 10,
            "bultos": 1000, "cobertura_pct": 100, "objetivos_pct": 100}
    meta = {"pdvs": 100, "altas": 5, "exhibiciones": 30, "compradores": 5,
            "bultos": 500, "cobertura": 80, "objetivos": 80}
    radar = build_radar_normalized(real, meta)
    assert all(v <= 100 for v in radar.values())
    # pdvs: 200/100 → capped at 100
    assert radar["pdvs"] == 100


def test_build_radar_normalized_exacto():
    # pdvs: real=50, meta=100 → 50
    real = {"pdvs": 50, "altas": 0, "exhibiciones": 0, "compradores": 0,
            "bultos": 0, "cobertura_pct": 0, "objetivos_pct": 0}
    meta = {"pdvs": 100, "altas": 1, "exhibiciones": 1, "compradores": 1,
            "bultos": 1, "cobertura": 1, "objetivos": 1}
    radar = build_radar_normalized(real, meta)
    assert radar["pdvs"] == 50


def test_build_radar_normalized_cobertura_usa_cobertura_compra_pct():
    real = {
        "pdvs": 0, "altas": 0, "exhibiciones": 0, "pdvs_exhibidos": 0,
        "compradores": 0, "bultos": 0, "cobertura_pct": 40,
        "cobertura_compra_pct": 80, "objetivos_pct": 0,
    }
    meta = {"pdvs": 1, "altas": 1, "exhibiciones": 1, "compradores": 1,
            "bultos": 1, "cobertura": 100, "objetivos": 1}
    radar = build_radar_normalized(real, meta)
    assert radar["cobertura"] == 80


def test_build_radar_normalized_keys_correctas():
    from core.estadisticas_ideal import RADAR_OUTPUT_KEYS

    real = {
        "pdvs": 10, "altas": 10, "exhibiciones": 10, "pdvs_exhibidos": 5,
        "compradores": 10, "bultos": 10, "cobertura_pct": 10,
        "cobertura_compra_pct": 10, "objetivos_pct": 10,
    }
    meta = {
        "pdvs": 100, "altas": 100, "exhibiciones": 100, "compradores": 100,
        "bultos": 100, "cobertura": 100, "objetivos": 100, "pdvs_exhibidos": 50,
    }
    radar = build_radar_normalized(real, meta)
    assert set(radar.keys()) == set(RADAR_OUTPUT_KEYS)
    assert radar["pdvs_exhibidos"] == 20


# ---------------------------------------------------------------------------
# meta_periodo_kpi
# ---------------------------------------------------------------------------

def test_meta_periodo_kpi_pdvs_no_multiplica():
    ideal = {"meta_pdvs_total": 150, "kpis_mensuales": {"exhibiciones": 30}}
    # pdvs is a fixed total, not monthly
    assert meta_periodo_kpi(ideal, "pdvs", 3) == 150.0


def test_meta_periodo_kpi_mensual_multiplica():
    ideal = {"meta_pdvs_total": 150, "kpis_mensuales": {"exhibiciones": 30}}
    assert meta_periodo_kpi(ideal, "exhibiciones", 3) == 90.0


def test_meta_periodo_kpi_un_mes():
    ideal = {"meta_pdvs_total": 100, "kpis_mensuales": {"bultos": 50}}
    assert meta_periodo_kpi(ideal, "bultos", 1) == 50.0


def test_meta_periodo_kpi_kpi_faltante_devuelve_cero():
    ideal = {"meta_pdvs_total": 100, "kpis_mensuales": {}}
    assert meta_periodo_kpi(ideal, "compradores", 2) == 0.0


# ---------------------------------------------------------------------------
# normalize_kpi
# ---------------------------------------------------------------------------

def test_normalize_kpi_meta_cero():
    assert normalize_kpi(99, 0) == 0


def test_normalize_kpi_exacto_100():
    assert normalize_kpi(100, 100) == 100


def test_normalize_kpi_encima_capped():
    assert normalize_kpi(150, 100) == 100


def test_normalize_kpi_parcial():
    assert normalize_kpi(50, 100) == 50


def test_normalize_kpi_fraccion_redondeo():
    # 1/3 * 100 = 33.33 → 33
    assert normalize_kpi(1, 3) == 33


# ---------------------------------------------------------------------------
# ideal_meta_display_values (tooltips carta)
# ---------------------------------------------------------------------------

def test_ideal_meta_display_values_periodo_y_pdvs():
    ideal = {
        "meta_pdvs_total": 250,
        "kpis_mensuales": {
            "exhibiciones": 100,
            "pdvs_compradores": 220,
            "bultos": 40,
            "cobertura_pct": 80,
            "objetivos_pct": 90,
        },
    }
    meta = ideal_meta_display_values(ideal, 1)
    assert meta["pdvs"] == 250.0
    assert meta["exhibiciones"] == 100.0
    assert meta["compradores"] == 220.0
    assert meta["bultos"] == 40.0
    assert meta["cobertura"] == 80.0
    assert meta["objetivos"] == 90.0
    assert meta["pdvs_exhibidos"] == 0.0


def test_ideal_meta_display_values_cobertura_exhibicion():
    ideal = {
        "meta_pdvs_total": 200,
        "kpis_mensuales": {"cobertura_exhibicion_pct": 65, "cobertura_pct": 55},
    }
    meta = ideal_meta_display_values(ideal, 2)
    assert meta["pdvs_exhibidos"] == 65.0
    assert meta["cobertura"] == 55.0


def test_ideal_meta_display_values_altas_faltante_pdvs():
    ideal = {"meta_pdvs_total": 250, "kpis_mensuales": {}}
    meta = ideal_meta_display_values(ideal, 1, {"pdvs": 100})
    assert meta["altas"] == 150.0


def test_ideal_meta_display_values_tres_meses():
    ideal = {
        "meta_pdvs_total": 100,
        "kpis_mensuales": {"exhibiciones": 10, "pdvs_compradores": 5, "bultos": 2},
    }
    meta = ideal_meta_display_values(ideal, 3)
    assert meta["exhibiciones"] == 30.0
    assert meta["compradores"] == 15.0
    assert meta["bultos"] == 6.0
