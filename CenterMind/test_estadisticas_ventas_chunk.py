"""Ventas en cartas: chunks de fecha y detección de snapshot sin ventas."""
from unittest.mock import MagicMock, patch

from services.estadisticas_service import (
    _cartas_comercial_ventas_plausible,
    _fetch_ventas_estadisticas,
    _ventas_date_chunks,
)


def test_ventas_date_chunks_splits_may():
    chunks = _ventas_date_chunks("2026-05-01", "2026-05-31", chunk_days=7)
    assert chunks[0][0] == "2026-05-01"
    assert chunks[-1][1] == "2026-05-31"
    assert len(chunks) >= 4


def test_cartas_plausible_rejects_exhibiciones_sin_ventas():
    cartas = [
        {
            "raw_kpis": {
                "exhibiciones": 100,
                "compradores": 0,
                "bultos_raw": 0,
            }
        }
    ]
    assert _cartas_comercial_ventas_plausible(cartas) is False


def test_cartas_plausible_accepts_con_ventas():
    cartas = [
        {
            "raw_kpis": {
                "exhibiciones": 100,
                "compradores": 5,
                "bultos_raw": 12.5,
            }
        }
    ]
    assert _cartas_comercial_ventas_plausible(cartas) is True


def test_fetch_ventas_estadisticas_one_chunk():
    ctx = {"table_dist": 2, "filter_dist": 2, "codigos": None}
    sb = MagicMock()
    chain = MagicMock()
    chain.range.return_value.execute.return_value.data = [
        {"codigo_vendedor": "9", "bultos_total": 2}
    ]
    sb.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.eq.return_value = chain

    with patch(
        "services.estadisticas_service._ventas_date_chunks",
        return_value=[("2026-05-01", "2026-05-07")],
    ), patch("services.estadisticas_service.sb", sb), patch(
        "services.estadisticas_service._apply_ventas_scope",
        side_effect=lambda q, _ctx, **_kw: q,
    ):
        rows = _fetch_ventas_estadisticas(2, "2026-05-01", "2026-05-31", ctx)

    assert len(rows) == 1
    assert rows[0]["codigo_vendedor"] == "9"
