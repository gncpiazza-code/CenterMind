"""
Tests para overlay de re-evaluación compañía y ranking paralelo.

Escenario base:
  - Vendedor ERP "Juan" tiene id_integrante 10
  - 2 exhibiciones del mismo cliente/día (lógicamente una sola visita)
  - Exhibición 101: estado Aprobada  (score 2)
  - Exhibición 102: estado Rechazada (score 1)
  → Ranking oficial: Juan 1 punto (aprobada gana por score)
  → Si re-evaluamos 101 a Destacada: Juan 2 puntos en ranking compañía
  → Regresión: ranking oficial sin cambios

Escenario vendor-scope: dos integrantes del mismo vendedor ERP.
  - id_integrante 10 y 11 ambos son "Ana"
  - Ambos subieron el mismo cliente/día
  → 1 sola visita lógica en ranking compañía (idéntico a oficial)
"""
from core.exhibicion_aggregate import (
    aggregate_ranking_by_vendor,
    apply_compania_estado_overlay,
    aggregate_ranking_by_vendor_compania,
)

IID_TO_ERP = {10: "Juan", 11: "Ana", 12: "Ana"}

BASE_ROWS = [
    {
        "id_exhibicion": 101,
        "id_integrante": 10,
        "estado": "Aprobada",
        "timestamp_subida": "2026-05-01T10:00:00",
        "id_cliente_pdv": 500,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": "http://a",
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    },
    {
        "id_exhibicion": 102,
        "id_integrante": 10,
        "estado": "Rechazada",
        "timestamp_subida": "2026-05-01T11:00:00",
        "id_cliente_pdv": 500,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": "http://b",
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    },
]

ANA_ROWS = [
    {
        "id_exhibicion": 201,
        "id_integrante": 11,
        "estado": "Aprobada",
        "timestamp_subida": "2026-05-01T09:00:00",
        "id_cliente_pdv": 600,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": "http://c",
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    },
    {
        "id_exhibicion": 202,
        "id_integrante": 12,
        "estado": "Aprobada",
        "timestamp_subida": "2026-05-01T09:30:00",
        "id_cliente_pdv": 600,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": "http://d",
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    },
]


def test_overlay_no_muta_filas_originales():
    latest = {101: "Destacada"}
    overlaid = apply_compania_estado_overlay(BASE_ROWS, latest)
    assert BASE_ROWS[0]["estado"] == "Aprobada", "Original no debe mutar"
    assert overlaid[0]["estado"] == "Destacada"
    assert overlaid[1]["estado"] == "Rechazada"


def test_ranking_oficial_sin_cambios():
    latest = {101: "Destacada"}
    stats_antes = aggregate_ranking_by_vendor(BASE_ROWS, IID_TO_ERP)
    apply_compania_estado_overlay(BASE_ROWS, latest)
    stats_despues = aggregate_ranking_by_vendor(BASE_ROWS, IID_TO_ERP)
    assert stats_antes == stats_despues, "Ranking oficial no debe cambiar"


def test_ranking_oficial_juan_1_punto():
    stats = aggregate_ranking_by_vendor(BASE_ROWS, IID_TO_ERP)
    juan = stats.get("Juan", {})
    assert juan.get("puntos") == 1
    assert juan.get("aprobadas") == 1
    assert juan.get("rechazadas") == 0


def test_ranking_compania_juan_2_puntos_con_overlay():
    latest = {101: "Destacada"}
    stats = aggregate_ranking_by_vendor_compania(BASE_ROWS, IID_TO_ERP, latest)
    juan = stats.get("Juan", {})
    assert juan.get("puntos") == 2
    assert juan.get("destacadas") == 1


def test_ranking_compania_sin_overlay_igual_oficial():
    stats_compania = aggregate_ranking_by_vendor_compania(BASE_ROWS, IID_TO_ERP, {})
    stats_oficial = aggregate_ranking_by_vendor(BASE_ROWS, IID_TO_ERP)
    assert stats_compania == stats_oficial


def test_vendor_scope_dos_integrantes_mismo_erp_1_punto():
    """Dos integrantes del mismo vendedor ERP (Ana) → ranking compañía 1 visita lógica."""
    latest = {}
    stats = aggregate_ranking_by_vendor_compania(ANA_ROWS, IID_TO_ERP, latest)
    ana = stats.get("Ana", {})
    assert ana.get("puntos") == 1, f"Esperaba 1 punto, obtuvo {ana}"


def test_overlay_re_evaluacion_rechazada_quita_puntos():
    """Si la única aprobada se re-evalúa a Rechazada, compañía pierde el punto."""
    latest = {101: "Rechazada"}
    stats = aggregate_ranking_by_vendor_compania(BASE_ROWS, IID_TO_ERP, latest)
    juan = stats.get("Juan", {})
    assert juan.get("puntos") == 0


def test_overlay_preserva_filas_sin_reevaluacion():
    latest = {999: "Destacada"}  # ID que no existe en filas
    overlaid = apply_compania_estado_overlay(BASE_ROWS, latest)
    assert overlaid[0]["estado"] == "Aprobada"
    assert overlaid[1]["estado"] == "Rechazada"


if __name__ == "__main__":
    tests = [
        test_overlay_no_muta_filas_originales,
        test_ranking_oficial_sin_cambios,
        test_ranking_oficial_juan_1_punto,
        test_ranking_compania_juan_2_puntos_con_overlay,
        test_ranking_compania_sin_overlay_igual_oficial,
        test_vendor_scope_dos_integrantes_mismo_erp_1_punto,
        test_overlay_re_evaluacion_rechazada_quita_puntos,
        test_overlay_preserva_filas_sin_reevaluacion,
    ]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓ {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} tests passed")
