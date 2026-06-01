"""T2 — Regresión: bundle estadísticas debe exponer cartas como lista con schema correcto."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from services.snapshot_estadisticas_service import (
    _normalize_cartas_payload,
    get_or_refresh_estadisticas,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_carta(id_vendedor="V1", nombre="Vendedor 1"):
    return {
        "id_vendedor": id_vendedor,
        "nombre": nombre,
        "score": 75.0,
        "radar": {"exhibicion": 80, "ventas": 70, "cumplimiento": 75},
        "raw_kpis": {"total_exhibiciones": 10, "total_ventas": 5},
    }


def _fresh_generated_at():
    return datetime.now(timezone.utc).isoformat()


def _make_sb_miss():
    """Supabase mock que simula cache miss (data=[])."""
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = []
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value = chain
    # delete chain
    del_chain = MagicMock()
    del_chain.eq.return_value.is_.return_value.execute.return_value = MagicMock()
    del_chain.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock()
    sb.table.return_value.delete.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    # insert chain
    sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    return sb


def _make_sb_hit(cartas: list):
    """Supabase mock que simula cache hit con cartas dadas."""
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [
        {"payload": cartas, "generated_at": _fresh_generated_at()}
    ]
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value = chain
    return sb


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_normalize_cartas_dict_to_list():
    """Snapshots corruptos: cartas como dict → list."""
    raw = {"0": _make_carta("V1"), "1": _make_carta("V2")}
    out = _normalize_cartas_payload(raw)
    assert isinstance(out, list)
    assert len(out) == 2


def test_normalize_cartas_backfills_cex_radar_axis():
    """Si falta radar.pdvs_exhibidos en snapshot viejo, se recompone desde cobertura_pct."""
    raw = [
        {
            "id_vendedor": "V1",
            "nombre": "Vendedor 1",
            "radar": {"pdvs": 80, "exhibiciones": 70},
            "raw_kpis": {"cobertura_pct": 42.5},
            "ideal_meta_dist": {"pdvs_exhibidos": 85},
        }
    ]
    out = _normalize_cartas_payload(raw)
    assert isinstance(out, list)
    assert out[0]["radar"]["pdvs_exhibidos"] == 50


def test_cartas_is_list():
    """get_or_refresh_estadisticas debe retornar 'cartas' como list."""
    cartas = [_make_carta("V1"), _make_carta("V2")]
    sb_mock = _make_sb_hit(cartas)
    with patch("services.snapshot_estadisticas_service.sb", sb_mock):
        result = get_or_refresh_estadisticas(1, ["2026-05"], None)
    assert "cartas" in result
    assert isinstance(result["cartas"], list)


def test_cartas_schema_fields():
    """Cada carta devuelta debe tener los campos obligatorios del schema."""
    cartas = [_make_carta("V1", "Vendedor A"), _make_carta("V2", "Vendedor B")]
    sb_mock = _make_sb_hit(cartas)
    with patch("services.snapshot_estadisticas_service.sb", sb_mock):
        result = get_or_refresh_estadisticas(1, ["2026-05"], None)
    required_fields = {"id_vendedor", "nombre", "score", "radar", "raw_kpis"}
    for carta in result["cartas"]:
        missing = required_fields - carta.keys()
        assert not missing, f"Carta le faltan campos: {missing}"


def test_snapshot_round_trip_cache_miss_then_hit():
    """
    Primera llamada (cache miss): respuesta inmediata parcial + refresh en background.
    Segunda llamada (cache hit): meta.cache_hit=True.
    """
    cartas = [_make_carta()]

    sb_miss = _make_sb_miss()

    def _run_bg(_key, fn):
        fn()

    with patch("services.snapshot_estadisticas_service.sb", sb_miss):
        with patch(
            "services.snapshot_estadisticas_service.trigger_background_refresh",
            side_effect=_run_bg,
        ):
            with patch(
                "services.estadisticas_service.build_carta_resumen", return_value=cartas
            ) as mock_build:
                first = get_or_refresh_estadisticas(1, ["2026-05"], None)

    assert isinstance(first["cartas"], list)
    assert first["meta"]["cache_hit"] is False
    assert first["meta"]["revalidating"] is True
    assert first["cartas"] == []
    mock_build.assert_called_once()

    sb_hit = _make_sb_hit(cartas)
    with patch("services.snapshot_estadisticas_service.sb", sb_hit):
        with patch("services.estadisticas_service.build_carta_resumen") as mock_build_2:
            second = get_or_refresh_estadisticas(1, ["2026-05"], None)

    assert second["meta"]["cache_hit"] is True
    mock_build_2.assert_not_called()
    assert isinstance(second["cartas"], list)


def test_meta_cache_hit_field():
    """El dict 'meta' debe contener el campo 'cache_hit' como bool."""
    cartas = [_make_carta()]
    sb_mock = _make_sb_hit(cartas)
    with patch("services.snapshot_estadisticas_service.sb", sb_mock):
        result = get_or_refresh_estadisticas(1, ["2026-05"], None)
    assert "meta" in result
    assert "cache_hit" in result["meta"]
    assert isinstance(result["meta"]["cache_hit"], bool)


def test_build_carta_resumen_impl_shape():
    """_build_carta_resumen_impl produce cartas con los campos del schema."""
    from services.estadisticas_service import _build_carta_resumen_impl

    raw = {
        "42": {
            "pdvs": 5,
            "altas": 0,
            "exhibiciones": 2,
            "compradores": 1,
            "bultos": 1.0,
            "bultos_raw": 1.0,
            "unidades_cigarrillos": 0.0,
            "cobertura_pct": 40.0,
            "objetivos_pct": 0.0,
        },
        "__ventas_meta__": {"ventas_total": 10, "ventas_unmatched": 0, "ventas_unmatched_pct": 0.0},
    }
    with patch(
        "services.estadisticas_service._fetch_carta_source_rows",
        return_value={
            "vendedores": [{"id_vendedor": 42, "nombre_erp": "Test", "id_sucursal": 1}],
            "suc": [{"id_sucursal": 1, "nombre_erp": "CENTRO"}],
            "ideal_dist": None,
            "ideal_comp": None,
        },
    ), patch(
        "services.estadisticas_service._aggregate_kpis_from_rows",
        return_value=raw,
    ), patch(
        "services.estadisticas_service.apply_tabaco_rollups",
        side_effect=lambda _d, r, _v: (r, set()),
    ), patch(
        "services.estadisticas_service.resolve_scoring_ideal",
        return_value=(None, {}),
    ), patch(
        "services.estadisticas_service.build_radar_normalized",
        return_value={},
    ), patch(
        "services.estadisticas_service.score_vendedor",
        return_value=50,
    ):
        result = _build_carta_resumen_impl(1, ["2026-05"], None)

    assert isinstance(result, list)
    assert len(result) >= 1
    required = {"id_vendedor", "nombre", "score", "radar", "raw_kpis"}
    for carta in result:
        assert not (required - carta.keys())
