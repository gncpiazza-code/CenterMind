"""E8 — erp_sync_alert en cartas cuando hay ventas sin match de vendedor."""
from unittest.mock import patch

from services.estadisticas_service import (
    _ERP_SYNC_UNMATCHED_UMBRAL,
    _ERP_SYNC_VENTAS_UMBRAL,
    _build_carta_resumen_impl,
)


def _minimal_source(vid: int = 42, nombre: str = "ROMINA SORU"):
    return {
        "vendedores": [
            {"id_vendedor": vid, "nombre_erp": nombre, "id_sucursal": 1},
        ],
        "suc": [{"id_sucursal": 1, "nombre_erp": "CENTRO"}],
        "ideal_dist": None,
        "ideal_comp": None,
        "ventas": [],
        "ex": [],
        "objetivos": [],
        "integrantes": {},
    }


def test_erp_sync_alert_when_high_unmatched_pct():
    raw = {
        "42": {
            "pdvs": 10,
            "altas": 0,
            "exhibiciones": 3,
            "compradores": 0,
            "bultos": 0.0,
            "bultos_raw": 0.0,
            "unidades_cigarrillos": 0.0,
            "cobertura_pct": 0.0,
            "objetivos_pct": 0.0,
        },
        "__ventas_meta__": {
            "ventas_total": _ERP_SYNC_VENTAS_UMBRAL + 50,
            "ventas_unmatched": 120,
            "ventas_unmatched_pct": _ERP_SYNC_UNMATCHED_UMBRAL + 10,
        },
    }
    with patch(
        "services.estadisticas_service._fetch_carta_source_rows",
        return_value=_minimal_source(),
    ), patch(
        "services.estadisticas_service._aggregate_kpis_from_rows",
        return_value=raw,
    ), patch(
        "services.estadisticas_service.apply_tabaco_rollups",
        side_effect=lambda _d, r, _v: (r, set()),
    ), patch(
        "services.estadisticas_service.resolve_scoring_ideal",
        return_value=(None, {}),
    ):
        cards = _build_carta_resumen_impl(1, ["2026-05"], None)

    assert len(cards) == 1
    assert cards[0].get("erp_sync_alert") is True
    assert cards[0].get("erp_sync_reason") == "ventas_sin_match_vendedor"


def test_no_erp_sync_alert_when_exhibicion_only_activity():
    raw = {
        "42": {
            "pdvs": 10,
            "altas": 0,
            "exhibiciones": 5,
            "compradores": 0,
            "bultos": 0.0,
            "bultos_raw": 0.0,
            "unidades_cigarrillos": 0.0,
            "cobertura_pct": 50.0,
            "objetivos_pct": 0.0,
        },
        "__ventas_meta__": {
            "ventas_total": 0,
            "ventas_unmatched": 0,
            "ventas_unmatched_pct": 0.0,
        },
    }
    with patch(
        "services.estadisticas_service._fetch_carta_source_rows",
        return_value=_minimal_source(),
    ), patch(
        "services.estadisticas_service._aggregate_kpis_from_rows",
        return_value=raw,
    ), patch(
        "services.estadisticas_service.apply_tabaco_rollups",
        side_effect=lambda _d, r, _v: (r, set()),
    ), patch(
        "services.estadisticas_service.resolve_scoring_ideal",
        return_value=(None, {}),
    ):
        cards = _build_carta_resumen_impl(1, ["2026-05"], None)

    assert len(cards) == 1
    assert not cards[0].get("erp_sync_alert")
