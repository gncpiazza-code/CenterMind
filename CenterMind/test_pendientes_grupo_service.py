"""Pendientes del visor: backlog sin corte de mes y orden más antiguo primero."""
from services.pendientes_grupo_service import sort_pendientes_grupos


def test_sort_pendientes_grupos_oldest_first():
    grupos = [
        {"fecha_hora": "2026-05-28T10:00:00+00:00", "nro_cliente": "2", "fotos": []},
        {"fecha_hora": "2026-04-15T08:00:00+00:00", "nro_cliente": "1", "fotos": []},
        {"fecha_hora": "2026-05-01T12:00:00+00:00", "nro_cliente": "3", "fotos": []},
    ]
    out = sort_pendientes_grupos(grupos)
    assert out[0]["fecha_hora"].startswith("2026-04")
    assert out[-1]["fecha_hora"].startswith("2026-05-28")


def test_fetch_pendientes_orders_asc_and_no_rpc():
    """La query directa pagina en orden ascendente (sin fn_pendientes DESC)."""
    from unittest.mock import MagicMock, patch

    calls: list[dict] = []

    def fake_order(field, desc=False):
        calls.append({"field": field, "desc": desc})
        return chain

    chain = MagicMock()
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.order.side_effect = fake_order
    chain.range.return_value = chain
    chain.execute.return_value.data = []

    sb = MagicMock()
    sb.table.return_value.select.return_value = chain

    with patch("services.pendientes_grupo_service.sb", sb):
        from services.pendientes_grupo_service import _fetch_pendientes_exhibiciones

        _fetch_pendientes_exhibiciones(3)

    assert calls
    assert calls[0]["field"] == "timestamp_subida"
    assert calls[0]["desc"] is False
    sb.rpc.assert_not_called()
