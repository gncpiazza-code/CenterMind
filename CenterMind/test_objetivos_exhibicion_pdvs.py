# -*- coding: utf-8 -*-
"""
test_objetivos_exhibicion_pdvs.py
====================================
Tests para core/objetivos_exhibicion_pdvs.py

Verifica la lógica de "exhibición con PDVs distintos":
cumplido solo cuando puntos >= meta AND pdvs_distintos >= min_pdvs.
"""
from __future__ import annotations

import pytest
from core.objetivos_exhibicion_pdvs import (
    metricas_exhibicion_global,
    ajustar_valor_aprobados_con_pdvs,
)


# ── metricas_exhibicion_global ────────────────────────────────────────────────

class TestMetricasExhibicionGlobal:
    def test_sin_restriccion_pdvs(self):
        """Sin min_pdvs: cumple_pdvs siempre True."""
        res = metricas_exhibicion_global(
            puntos=80,
            pdv_ids_aprobados=[1, 2, 3, 4],
            min_pdvs=None,
        )
        assert res["puntos"] == 80
        assert res["pdvs_distintos"] == 4
        assert res["cumple_pdvs"] is True
        assert res["min_pdvs_requeridos"] is None

    def test_cumple_ambas_condiciones(self):
        """100 exhibiciones en 80 PDVs, min_pdvs=80 → cumple."""
        pdvs = list(range(80))  # 80 PDVs distintos
        res = metricas_exhibicion_global(
            puntos=100,
            pdv_ids_aprobados=pdvs,
            min_pdvs=80,
        )
        assert res["pdvs_distintos"] == 80
        assert res["cumple_pdvs"] is True

    def test_no_cumple_pdvs_distintos(self):
        """100 exhibiciones pero solo 60 PDVs distintos, min=80 → no cumple PDVs."""
        pdvs = list(range(60)) * 2  # 60 PDVs distintos, con duplicados
        res = metricas_exhibicion_global(
            puntos=100,
            pdv_ids_aprobados=pdvs,
            min_pdvs=80,
        )
        assert res["pdvs_distintos"] == 60
        assert res["cumple_pdvs"] is False

    def test_dedup_pdv_ids(self):
        """PDVs con duplicados se deduplicaron correctamente."""
        pdvs = [1, 1, 2, 2, 3]  # 3 distintos
        res = metricas_exhibicion_global(
            puntos=5,
            pdv_ids_aprobados=pdvs,
            min_pdvs=3,
        )
        assert res["pdvs_distintos"] == 3
        assert res["cumple_pdvs"] is True

    def test_lista_vacia(self):
        """Sin PDVs aprobados."""
        res = metricas_exhibicion_global(
            puntos=0,
            pdv_ids_aprobados=[],
            min_pdvs=80,
        )
        assert res["pdvs_distintos"] == 0
        assert res["cumple_pdvs"] is False

    def test_exactamente_min_pdvs(self):
        """Exactamente en el límite: pdvs_distintos == min_pdvs → cumple."""
        pdvs = list(range(50))
        res = metricas_exhibicion_global(
            puntos=50,
            pdv_ids_aprobados=pdvs,
            min_pdvs=50,
        )
        assert res["cumple_pdvs"] is True


# ── ajustar_valor_aprobados_con_pdvs ──────────────────────────────────────────

class TestAjustarValorAprobados:
    def test_sin_min_pdvs_retorna_puntos(self):
        """Sin restricción: retorna float(puntos) sin modificación."""
        result = ajustar_valor_aprobados_con_pdvs(
            puntos=80,
            pdv_ids_aprobados=list(range(80)),
            valor_objetivo=100.0,
            min_pdvs=None,
        )
        assert result == 80.0

    def test_cumple_ambas_condiciones_retorna_puntos(self):
        """Cumple exhibiciones y PDVs: retorna puntos."""
        result = ajustar_valor_aprobados_con_pdvs(
            puntos=100,
            pdv_ids_aprobados=list(range(80)),
            valor_objetivo=100.0,
            min_pdvs=80,
        )
        assert result == 100.0

    def test_no_cumple_pdvs_retorna_bajo_meta(self):
        """100 exhibiciones, 60 PDVs, min=80, meta=100 → valor queda bajo meta."""
        result = ajustar_valor_aprobados_con_pdvs(
            puntos=100,
            pdv_ids_aprobados=list(range(60)),
            valor_objetivo=100.0,
            min_pdvs=80,
        )
        assert result < 100.0, "Debe quedar bajo la meta para evitar cumplido prematuro"
        assert result == pytest.approx(99.99, abs=0.01)

    def test_exhibicion_100_pdvs_60_min_80(self):
        """Caso del criterio de aceptación: 100 ex en 60 PDVs, min 80 → no cumplido."""
        result = ajustar_valor_aprobados_con_pdvs(
            puntos=100,
            pdv_ids_aprobados=list(range(60)),  # solo 60 PDVs distintos
            valor_objetivo=100.0,
            min_pdvs=80,
        )
        # El valor debe ser MENOR que 100 (meta) para que el watcher NO marque cumplido
        assert result < 100.0

    def test_min_pdvs_mayor_que_meta_422_en_api(self):
        """La API rechaza min_pdvs_distintos > valor_objetivo con 422.
        Este test verifica la lógica de ajuste cuando puntos < meta (escenario extremo)."""
        result = ajustar_valor_aprobados_con_pdvs(
            puntos=50,
            pdv_ids_aprobados=list(range(30)),  # 30 PDVs, min=80 no cumple
            valor_objetivo=100.0,
            min_pdvs=80,
        )
        assert result < 100.0
        assert result >= 0.0


# ── Regresión: exhibicion_aggregate intacto ───────────────────────────────────

def test_exhibicion_aggregate_invariante_importable():
    """exhibicion_aggregate debe seguir siendo importable sin errores."""
    from core.exhibicion_aggregate import (
        aggregate_ranking_by_vendor,
        aggregate_exhibicion_counts_vendor_scope,
        count_logical_per_client,
    )
    assert callable(aggregate_ranking_by_vendor)
    assert callable(aggregate_exhibicion_counts_vendor_scope)
    assert callable(count_logical_per_client)
