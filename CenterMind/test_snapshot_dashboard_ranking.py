"""Regresión: bundle dashboard debe exponer ranking como lista, no dict aggregate."""
from unittest.mock import patch

from services.snapshot_dashboard_service import (
    _normalize_ranking_field,
    _normalize_dashboard_payload,
)


def test_normalize_ranking_list_passthrough():
    rows = [{"vendedor": "VENDEDOR A", "puntos": 3, "aprobadas": 1, "destacadas": 1, "rechazadas": 0}]
    assert _normalize_ranking_field(rows, 1) == rows


def test_normalize_ranking_from_aggregate_dict():
    stats = {
        "VENDEDOR A": {"aprobadas": 2, "destacadas": 0, "rechazadas": 0, "puntos": 2},
    }
    enriched = [{"vendedor": "VENDEDOR A", "puntos": 2, "aprobadas": 2, "destacadas": 0, "rechazadas": 0}]
    with patch("routers.reportes._dashboard_ranking_rows", return_value=enriched) as mock_rows:
        out = _normalize_ranking_field(stats, 99)
        mock_rows.assert_called_once_with(99, stats)
        assert out == enriched
        assert isinstance(out, list)


def test_normalize_dashboard_payload_fixes_legacy_snapshot():
    payload = {
        "kpis": {"total": 1},
        "ranking": {"X": {"puntos": 1, "aprobadas": 1, "destacadas": 0, "rechazadas": 0}},
        "ultimas": None,
    }
    enriched = [{"vendedor": "X", "puntos": 1}]
    with patch("routers.reportes._dashboard_ranking_rows", return_value=enriched):
        out = _normalize_dashboard_payload(payload, 5)
    assert isinstance(out["ranking"], list)
    assert out["ranking"][0]["vendedor"] == "X"
    assert out["ultimas"] == []


def test_dashboard_ranking_rows_returns_sorted_list():
    from routers.reportes import _dashboard_ranking_rows

    stats = {
        "B": {"aprobadas": 1, "destacadas": 0, "rechazadas": 0, "puntos": 1},
        "A": {"aprobadas": 0, "destacadas": 1, "rechazadas": 0, "puntos": 2},
    }
    with patch("routers.reportes._build_erp_sucursal_map", return_value={}):
        with patch("routers.reportes._build_ciudad_dominante_map", return_value={}):
            with patch("routers.reportes.sb") as mock_sb:
                mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
                result = _dashboard_ranking_rows(1, stats)
    assert isinstance(result, list)
    assert result[0]["vendedor"] == "A"
    assert result[0]["puntos"] == 2
