"""T4b — Regresión: eventos de ingesta invalidan los dominios de snapshot correctos."""
from unittest.mock import call, patch

from services.snapshot_refresh_service import handle_ingestion_event


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_padron_invalida_dashboard_estadisticas():
    """handle_ingestion_event('padron', ...) debe llamar mark_dashboard_stale y mark_estadisticas_stale."""
    with patch(
        "services.snapshot_refresh_service.mark_all_stale"
    ) as mock_stale:
        handle_ingestion_event("padron", 1)
    mock_stale.assert_called_once_with(1, ["dashboard", "estadisticas"])


def test_cuentas_invalida_supervision():
    """handle_ingestion_event('cuentas_corrientes', ...) debe llamar mark_supervision_stale."""
    with patch(
        "services.snapshot_refresh_service.mark_all_stale"
    ) as mock_stale:
        handle_ingestion_event("cuentas_corrientes", 1)
    mock_stale.assert_called_once_with(1, ["supervision"])


def test_ventas_invalida_estadisticas_dashboard():
    """handle_ingestion_event('ventas_enriched', ...) debe llamar mark_estadisticas_stale y mark_dashboard_stale."""
    with patch(
        "services.snapshot_refresh_service.mark_all_stale"
    ) as mock_stale:
        handle_ingestion_event("ventas_enriched", 1)
    mock_stale.assert_called_once_with(1, ["estadisticas", "dashboard"])


def test_evaluacion_invalida_dashboard_visor():
    """handle_ingestion_event('evaluacion', ...) debe llamar mark_dashboard_stale y mark_visor_stale."""
    with patch(
        "services.snapshot_refresh_service.mark_all_stale"
    ) as mock_stale:
        handle_ingestion_event("evaluacion", 1)
    mock_stale.assert_called_once_with(1, ["dashboard", "visor"])


def test_evento_desconocido_no_invalida_nada():
    """Evento sin mapeo no debe llamar mark_all_stale."""
    with patch(
        "services.snapshot_refresh_service.mark_all_stale"
    ) as mock_stale:
        handle_ingestion_event("evento_inexistente", 1)
    mock_stale.assert_not_called()


def test_padron_calls_mark_dashboard_stale_directly():
    """Verificación de segunda capa: mark_all_stale llama a mark_dashboard_stale y mark_estadisticas_stale."""
    with patch(
        "services.snapshot_dashboard_service.mark_dashboard_stale"
    ) as mock_dash, patch(
        "services.snapshot_estadisticas_service.mark_estadisticas_stale"
    ) as mock_stats:
        handle_ingestion_event("padron", 42)

    mock_dash.assert_called_once_with(42)
    mock_stats.assert_called_once_with(42)


def test_cuentas_calls_mark_supervision_stale_directly():
    """Verificación de segunda capa: mark_all_stale llama a mark_supervision_stale."""
    with patch(
        "services.snapshot_supervision_service.mark_supervision_stale"
    ) as mock_sup:
        handle_ingestion_event("cuentas_corrientes", 7)

    mock_sup.assert_called_once_with(7)


def test_ventas_calls_mark_estadisticas_and_dashboard_stale_directly():
    """Verificación de segunda capa: ventas_enriched invalida estadísticas y dashboard."""
    with patch(
        "services.snapshot_estadisticas_service.mark_estadisticas_stale"
    ) as mock_stats, patch(
        "services.snapshot_dashboard_service.mark_dashboard_stale"
    ) as mock_dash:
        handle_ingestion_event("ventas_enriched", 3)

    mock_stats.assert_called_once_with(3)
    mock_dash.assert_called_once_with(3)


def test_evaluacion_calls_mark_dashboard_and_visor_stale_directly():
    """Verificación de segunda capa: evaluacion invalida dashboard y visor."""
    with patch(
        "services.snapshot_dashboard_service.mark_dashboard_stale"
    ) as mock_dash, patch(
        "services.snapshot_visor_service.mark_visor_stale"
    ) as mock_visor:
        handle_ingestion_event("evaluacion", 5)

    mock_dash.assert_called_once_with(5)
    mock_visor.assert_called_once_with(5)
