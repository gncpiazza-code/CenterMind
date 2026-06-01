"""Pendientes del visor: backlog sin corte de mes y orden más antiguo primero."""
from unittest.mock import MagicMock, patch

from services.pendientes_grupo_service import (
    _enrich_pendientes_nro_cliente,
    _grupo_nro_cliente,
    _padron_lookup_keys,
    _valid_nro_cliente,
    sort_pendientes_grupos,
)


def test_valid_nro_cliente_rejects_zero_and_sc():
    assert _valid_nro_cliente("0") is None
    assert _valid_nro_cliente("S/C") is None
    assert _valid_nro_cliente("011395") == "011395"


def test_padron_lookup_keys_includes_zfill():
    keys = _padron_lookup_keys("11395")
    assert "11395" in keys
    assert "011395" in keys


def test_grupo_nro_cliente_prefers_resolved_nro():
    assert _grupo_nro_cliente({"nro_cliente": "011395"}) == "011395"
    assert _grupo_nro_cliente({"nro_cliente": "0", "cliente_sombra_codigo": "012428"}) == "012428"
    assert _grupo_nro_cliente({"nro_cliente": "0"}) == "S/C"


def test_enrich_pendientes_nro_cliente_matches_telegram_to_padron():
    rows = [
        {
            "id_exhibicion": 1,
            "nro_cliente": "0",
            "cliente_sombra_codigo": "11395",
        },
        {
            "id_exhibicion": 2,
            "nro_cliente": "0",
            "id_cliente_pdv": 99,
        },
    ]

    def table_side_effect(name):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        if name.endswith("clientes_pdv_v2"):
            chain.execute.return_value.data = [
                {"id_cliente": 55, "id_cliente_erp": "011395", "cliente_sombra_codigo": None},
                {"id_cliente": 99, "id_cliente_erp": "012415", "cliente_sombra_codigo": None},
            ]
        else:
            chain.execute.return_value.data = []
        return chain

    sb = MagicMock()
    sb.table.side_effect = table_side_effect

    with patch("services.pendientes_grupo_service.sb", sb):
        with patch(
            "services.pendientes_grupo_service.tenant_table_name",
            return_value="tabaco_clientes_pdv_v2",
        ):
            _enrich_pendientes_nro_cliente(3, rows)

    assert rows[0]["nro_cliente"] == "011395"
    assert rows[1]["nro_cliente"] == "012415"


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
