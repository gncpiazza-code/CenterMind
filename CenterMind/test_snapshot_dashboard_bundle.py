"""T1 — Bundle dashboard: ranking/list shape + cache_hit en get_or_refresh_dashboard."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from services.snapshot_dashboard_service import get_or_refresh_dashboard


def _fresh_generated_at():
    return datetime.now(timezone.utc).isoformat()


def _payload(ranking=None):
    return {
        "kpis": {"total": 1, "aprobadas": 1, "destacadas": 0, "rechazadas": 0, "pendientes": 0},
        "ranking": ranking if ranking is not None else [],
        "ultimas": [],
        "sucursales": [],
        "evolucion": [],
        "meta": {"generated_at": _fresh_generated_at()},
    }


def _sb_hit(payload: dict):
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [
        {"payload": payload, "generated_at": _fresh_generated_at()}
    ]
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value = chain
    return sb


def test_dashboard_bundle_ranking_is_list_on_hit():
    rows = [{"vendedor": "A", "puntos": 2, "aprobadas": 1, "destacadas": 1, "rechazadas": 0}]
    sb = _sb_hit(_payload(rows))
    with patch("services.snapshot_dashboard_service.sb", sb), patch(
        "services.snapshot_dashboard_service._is_fresh", return_value=True
    ):
        out = get_or_refresh_dashboard(1, "mes", None)
    assert isinstance(out["ranking"], list)
    assert out["meta"]["cache_hit"] is True


def test_dashboard_bundle_normalizes_legacy_ranking_dict():
    from services.snapshot_dashboard_service import _normalize_dashboard_payload

    stats = {"VENDEDOR A": {"puntos": 2, "aprobadas": 2, "destacadas": 0, "rechazadas": 0}}
    enriched = [{"vendedor": "VENDEDOR A", "puntos": 2, "aprobadas": 2, "destacadas": 0, "rechazadas": 0}]
    payload = {"ranking": stats, "ultimas": None, "kpis": {"total": 1}}
    with patch("routers.reportes._dashboard_ranking_rows", return_value=enriched):
        out = _normalize_dashboard_payload(payload, 1)
    assert isinstance(out["ranking"], list)
    assert out["ranking"][0]["vendedor"] == "VENDEDOR A"


def test_dashboard_bundle_cache_miss_flag():
    fresh = _payload([{"vendedor": "X", "puntos": 1, "aprobadas": 1, "destacadas": 0, "rechazadas": 0}])
    sb = MagicMock()
    miss = MagicMock()
    miss.execute.return_value.data = []
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value = miss
    sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    with patch("services.snapshot_dashboard_service.sb", sb), patch(
        "services.snapshot_dashboard_service._compute_dashboard", return_value=fresh
    ):
        out = get_or_refresh_dashboard(1, "mes", None)
    assert out["meta"]["cache_hit"] is False
    assert isinstance(out["ranking"], list)
