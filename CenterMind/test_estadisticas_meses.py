"""Meses disponibles en selector de Estadísticas."""
from services.estadisticas_service import _mes_from_venta_row, fetch_meses_disponibles


def test_mes_from_venta_row_ignora_recaudacion():
    assert _mes_from_venta_row({"fecha_factura": "2026-05-12", "tipo_documento": "RECCC"}) is None
    assert _mes_from_venta_row({"fecha_factura": "2026-04-01", "tipo_documento": "FV"}) == "2026-04"


def test_mes_from_venta_row_sin_fecha():
    assert _mes_from_venta_row({"tipo_documento": "FV"}) is None


def test_fetch_meses_excluye_futuros(monkeypatch):
    monkeypatch.setattr(
        "services.estadisticas_service._collect_meses_ventas_comerciales",
        lambda _d: {"2026-05", "2026-12"},
    )
    monkeypatch.setattr(
        "services.estadisticas_service._paginate_meses",
        lambda _d, _t, _f: {"2026-06"},
    )
    monkeypatch.setattr(
        "services.estadisticas_service._mes_actual_ar",
        lambda: "2026-06",
    )
    assert fetch_meses_disponibles(1) == ["2026-06", "2026-05"]
