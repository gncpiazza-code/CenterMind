"""Tests SWR stale-serve para snapshots portal."""
import threading
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from services.snapshot_common import clear_in_flight_for_tests
from services.snapshot_dashboard_service import get_or_refresh_dashboard
from services.snapshot_estadisticas_service import get_or_refresh_estadisticas


def _stale_generated_at(minutes_ago: int = 20) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def _fresh_generated_at() -> str:
    return datetime.now(timezone.utc).isoformat()


def setup_function():
    clear_in_flight_for_tests()


def _dashboard_sb_stale(payload: dict, generated_at: str):
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [{"payload": payload, "generated_at": generated_at}]
    chain.is_.return_value = chain
    chain.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value = chain
    return sb


def _estadisticas_sb_stale(cartas: list, generated_at: str):
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [{"payload": cartas, "generated_at": generated_at}]
    chain.is_.return_value = chain
    chain.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value = chain
    return sb


def test_dashboard_serves_stale_with_revalidating_flag():
    payload = {
        "kpis": {"total": 1},
        "ranking": [{"vendedor": "A", "puntos": 1}],
        "ultimas": [],
        "sucursales": [],
        "evolucion": [],
        "meta": {"generated_at": _stale_generated_at()},
    }
    gen = _stale_generated_at()
    sb = _dashboard_sb_stale(payload, gen)

    with patch("services.snapshot_dashboard_service.sb", sb), patch(
        "services.snapshot_dashboard_service.trigger_background_refresh"
    ) as mock_bg:
        out = get_or_refresh_dashboard(1, "mes", None)

    assert out["meta"]["stale"] is True
    assert out["meta"]["revalidating"] is True
    assert out["meta"]["cache_hit"] is False
    assert isinstance(out["ranking"], list)
    mock_bg.assert_called_once()


def test_dashboard_epoch_invalid_returns_partial_and_background():
    payload = {"kpis": {}, "ranking": [], "ultimas": [], "sucursales": [], "evolucion": []}
    sb = _dashboard_sb_stale(payload, "1970-01-01T00:00:00+00:00")
    partial = {
        **payload,
        "meta": {"generated_at": _fresh_generated_at(), "periodo": "mes"},
    }

    with patch("services.snapshot_dashboard_service.sb", sb), patch(
        "services.snapshot_dashboard_service._partial_dashboard_payload", return_value=partial
    ), patch("services.snapshot_dashboard_service.trigger_background_refresh") as mock_bg:
        out = get_or_refresh_dashboard(1, "mes", None)

    assert out["meta"]["cache_hit"] is False
    assert out["meta"]["revalidating"] is True
    mock_bg.assert_called_once()


def test_estadisticas_serves_stale_cartas():
    cartas = [{"id_vendedor": "1", "nombre": "Test", "score_global": 80}]
    gen = _stale_generated_at(30)
    sb = _estadisticas_sb_stale(cartas, gen)

    with patch("services.snapshot_estadisticas_service.sb", sb), patch(
        "services.snapshot_estadisticas_service.trigger_background_refresh"
    ) as mock_bg:
        out = get_or_refresh_estadisticas(1, ["2026-05"], None)

    assert out["meta"]["stale"] is True
    assert out["meta"]["revalidating"] is True
    assert len(out["cartas"]) == 1
    mock_bg.assert_called_once()


def test_background_refresh_dedup_concurrent():
    from services.snapshot_common import trigger_background_refresh

    calls: list[str] = []
    started = threading.Event()
    release = threading.Event()

    def fn():
        started.set()
        release.wait(timeout=1)
        calls.append("run")

    trigger_background_refresh("dedup-key", fn)
    assert started.wait(timeout=1)
    trigger_background_refresh("dedup-key", fn)
    release.set()
    time.sleep(0.05)
    assert len(calls) == 1
