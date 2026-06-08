"""Meses disponibles en selector de Estadísticas."""
from services.estadisticas_service import _mes_from_venta_row, fetch_meses_disponibles


def test_mes_from_venta_row_ignora_recaudacion():
    assert _mes_from_venta_row({"fecha_factura": "2026-05-12", "tipo_documento": "RECCC"}) is None
    assert _mes_from_venta_row({"fecha_factura": "2026-04-01", "tipo_documento": "FV"}) == "2026-04"


def test_mes_from_venta_row_sin_fecha():
    assert _mes_from_venta_row({"tipo_documento": "FV"}) is None


def test_fetch_meses_excluye_futuros(monkeypatch):
    monkeypatch.setattr(
        "services.estadisticas_service._MESES_DISPONIBLES_CACHE",
        {},
    )
    monkeypatch.setattr(
        "services.estadisticas_service._mes_actual_ar",
        lambda: "2026-06",
    )
    monkeypatch.setattr(
        "services.estadisticas_service._meses_candidatos_selector",
        lambda _cap, limit=24: ["2026-06", "2026-05", "2026-12"],
    )
    monkeypatch.setattr(
        "services.estadisticas_service._meses_con_cartas_visibles",
        lambda _d, candidates: [m for m in candidates if m <= "2026-06"],
    )
    assert fetch_meses_disponibles(1) == ["2026-06", "2026-05"]


def test_meses_con_cartas_visibles_filtra_sin_actividad(monkeypatch):
    from services.estadisticas_service import _meses_con_cartas_visibles

    monkeypatch.setattr(
        "services.estadisticas_service._mes_tiene_actividad_comercial",
        lambda _d, mes: mes == "2026-05",
    )

    assert _meses_con_cartas_visibles(1, ["2026-06", "2026-05"]) == ["2026-05"]


def test_fetch_meses_usa_cache(monkeypatch):
    calls = {"n": 0}

    def fake_visible(_d, candidates):
        calls["n"] += 1
        return list(candidates)

    monkeypatch.setattr(
        "services.estadisticas_service._meses_con_cartas_visibles",
        fake_visible,
    )
    monkeypatch.setattr(
        "services.estadisticas_service._meses_candidatos_selector",
        lambda _cap, limit=24: ["2026-05"],
    )
    monkeypatch.setattr(
        "services.estadisticas_service._mes_actual_ar",
        lambda: "2026-06",
    )
    monkeypatch.setattr(
        "services.estadisticas_service._MESES_DISPONIBLES_CACHE",
        {},
    )

    from services.estadisticas_service import fetch_meses_disponibles

    assert fetch_meses_disponibles(99) == ["2026-05"]
    assert fetch_meses_disponibles(99) == ["2026-05"]
    assert calls["n"] == 1


def test_any_vendor_carta_visible_requiere_actividad_comercial():
    from services.estadisticas_service import _any_vendor_carta_visible

    vend = [{"id_vendedor": 1, "nombre_erp": "Vendedor A", "id_sucursal": 1}]
    assert _any_vendor_carta_visible(
        1,
        {"1": {"pdvs": 10, "compradores": 2, "bultos": 0, "exhibiciones": 0}},
        vend,
        set(),
    )
    assert not _any_vendor_carta_visible(
        1,
        {"1": {"pdvs": 10, "compradores": 0, "bultos": 0, "exhibiciones": 0}},
        vend,
        set(),
    )
