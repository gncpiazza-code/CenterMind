# -*- coding: utf-8 -*-
"""Tests resolución integrantes vendedor y posición ranking /stats."""
import sys
from unittest.mock import MagicMock, patch

if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()
if "supabase" not in sys.modules:
    sys.modules["supabase"] = MagicMock()

from core.bot_ranking_delta import find_ranking_position
from core.helpers import _norm_name, resolve_integrante_ids_for_vendor_v2


def test_find_ranking_position_normalizado():
    ranking = [
        {"vendedor": "IVAN SOTO", "pos_now": 1, "delta": 0},
        {"vendedor": "juan perez", "pos_now": 2, "delta": 1},
    ]
    pos, total, delta = find_ranking_position(ranking, "ivan soto")
    assert pos == 1
    assert total == 2
    assert delta == 0

    pos2, _, _ = find_ranking_position(ranking, "JUAN PÉREZ")
    assert pos2 == 2


def test_resolve_integrante_ids_for_vendor_v2_por_nombre_erp():
    iid_to_erp = {10: "MARIA GARCIA", 11: "MARIA GARCIA", 20: "OTRO"}
    mock_sb = MagicMock()

    def table_side(name):
        tbl = MagicMock()
        if "vendedores_v2" in name:
            tbl.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"nombre_erp": "MARIA GARCIA"}
            ]
        elif name == "integrantes_grupo":
            tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"id_integrante": 99}
            ]
        return tbl

    mock_sb.table.side_effect = table_side

    with patch("core.helpers.sb", mock_sb):
        ids = resolve_integrante_ids_for_vendor_v2(3, 42, iid_to_erp=iid_to_erp)

    assert sorted(ids) == [10, 11, 99]


def test_norm_name_accent_insensitive():
    assert _norm_name("José María") == _norm_name("JOSE MARIA")
