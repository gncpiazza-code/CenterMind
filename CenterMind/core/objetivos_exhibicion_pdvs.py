# -*- coding: utf-8 -*-
"""
core/objetivos_exhibicion_pdvs.py
===================================
Módulo de cómputo puro para objetivos de exhibición con restricción de
PDVs distintos (min_pdvs_distintos).

No accede a la base de datos: opera sobre datos ya deduplicados provistos
por aggregate_exhibicion_counts_vendor_scope del watcher.

Regla de negocio:
  - Un objetivo de exhibición puede requerir cumplir DOS condiciones:
      1) puntos >= valor_objetivo (exhibiciones lógicas aprobadas/destacadas)
      2) pdvs_distintos >= min_pdvs_distintos (PDVs únicos con exhibición OK)
  - Si min_pdvs_distintos es None, solo aplica la condición de puntos.
  - cumplido = ambas condiciones satisfechas (o solo la primera si no hay restricción).
"""
from __future__ import annotations

from typing import Any


def metricas_exhibicion_global(
    puntos: int,
    pdv_ids_aprobados: list[int],
    min_pdvs: int | None,
) -> dict[str, Any]:
    """
    Calcula métricas de una exhibición global con (opcional) restricción de PDVs distintos.

    Parámetros:
      puntos:            exhibiciones lógicas aprobadas o destacadas (score >= 2)
                         ya deduplicadas por aggregate_exhibicion_counts_vendor_scope.
      pdv_ids_aprobados: lista de id_cliente de cada exhibición aprobada/destacada
                         (puede tener duplicados si un PDV tiene varias fechas con exhibición OK;
                          se dedup aquí vía set).
      min_pdvs:          mínimo de PDVs distintos requeridos, o None si no aplica.

    Retorna:
      {
        "puntos": int,
        "pdvs_distintos": int,
        "cumple_pdvs": bool,      # True si min_pdvs is None
        "min_pdvs_requeridos": int | None,
      }

    Nota: cumple_exhib y cumple_ambos NO se calculan aquí porque dependen de
    valor_objetivo, que es conocido por el watcher. El watcher usa esta función
    solo para enriquecer el desglose_cache con pdvs_distintos_count.
    """
    pdvs_distintos = len(set(p for p in pdv_ids_aprobados if p is not None))
    cumple_pdvs = (min_pdvs is None) or (pdvs_distintos >= min_pdvs)

    return {
        "puntos": puntos,
        "pdvs_distintos": pdvs_distintos,
        "cumple_pdvs": cumple_pdvs,
        "min_pdvs_requeridos": min_pdvs,
    }


def ajustar_valor_aprobados_con_pdvs(
    puntos: int,
    pdv_ids_aprobados: list[int],
    valor_objetivo: float | None,
    min_pdvs: int | None,
) -> float:
    """
    Ajusta el valor_aprobados que se retorna al watcher para forzar la semántica
    de cumplido=True solo cuando AMBAS condiciones están satisfechas.

    Lógica:
      - Si min_pdvs es None: retorna float(puntos) sin modificación.
      - Si cumple_pdvs: retorna float(puntos) — el watcher comparará con meta y marcará cumplido.
      - Si no cumple_pdvs: retorna min(puntos, valor_objetivo - 0.01) para quedar justo bajo meta,
        evitando que el watcher marque cumplido aunque se alcancen los puntos.

    Parámetros:
      puntos:            exhibiciones lógicas aprobadas.
      pdv_ids_aprobados: lista de id_cliente de exhibiciones aprobadas (puede tener dups).
      valor_objetivo:    meta numérica del objetivo (valor_objetivo campo DB).
      min_pdvs:          mínimo de PDVs distintos, o None.

    Retorna: float con el valor_aprobados ajustado.
    """
    if min_pdvs is None:
        return float(puntos)

    metricas = metricas_exhibicion_global(puntos, pdv_ids_aprobados, min_pdvs)

    if metricas["cumple_pdvs"]:
        return float(puntos)

    # No cumple restricción de PDVs: forzar valor bajo la meta
    if valor_objetivo and float(valor_objetivo) > 0:
        return float(min(puntos, max(0, float(valor_objetivo) - 0.01)))
    # Sin valor_objetivo configurado: retornar puntos sin cambio
    return float(puntos)
