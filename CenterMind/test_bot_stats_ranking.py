# -*- coding: utf-8 -*-
"""Tests resolución integrantes vendedor y posición ranking /stats."""
import sys
from unittest.mock import MagicMock, patch

if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()
if "supabase" not in sys.modules:
    sys.modules["supabase"] = MagicMock()

from core.bot_ranking_delta import find_ranking_position
from core.bot_vendor_stats import (
    complete_ranking_with_active_vendors,
    filter_exhibiciones_for_vendor_erp,
    partition_exhibiciones_by_month,
)
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


def test_resolve_integrante_ids_for_vendor_v2_por_codigo_erp_sin_v2():
    mock_sb = MagicMock()

    def table_side(name):
        tbl = MagicMock()
        if "vendedores_v2" in name:
            tbl.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"nombre_erp": "ROMINA SORU", "id_vendedor_erp": "4047"}
            ]
        elif name == "integrantes_grupo":
            chain = tbl.select.return_value.eq.return_value
            # Primera query: id_vendedor_v2 (vacía)
            chain.eq.return_value.execute.return_value.data = []
            # Segunda query: id_vendedor_erp in (...)
            chain.in_.return_value.execute.return_value.data = [
                {"id_integrante": 328, "id_vendedor_v2": None},
            ]
        return tbl

    mock_sb.table.side_effect = table_side

    with patch("core.helpers.sb", mock_sb), patch(
        "core.helpers.build_integrante_to_erp_name", return_value={}
    ):
        ids = resolve_integrante_ids_for_vendor_v2(3, 81)

    assert ids == [328]


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


def test_partition_exhibiciones_by_month():
    rows = [
        {"timestamp_subida": "2026-06-03T10:00:00", "id_integrante": 1},
        {"timestamp_subida": "2026-05-28T09:00:00", "id_integrante": 1},
        {"timestamp_subida": "2026-04-30T23:59:59", "id_integrante": 1},
    ]
    actual, prev = partition_exhibiciones_by_month(rows, "2026-06", "2026-05")
    assert len(actual) == 1
    assert len(prev) == 1


def test_filter_exhibiciones_for_vendor_erp_normalizado():
    iid_to_erp = {1: "ROMINA SORU", 2: "OTRO VENDEDOR"}
    rows = [
        {"id_integrante": 1, "estado": "Aprobado", "timestamp_subida": "2026-06-01"},
        {"id_integrante": 2, "estado": "Aprobado", "timestamp_subida": "2026-06-01"},
    ]
    out = filter_exhibiciones_for_vendor_erp(
        rows, iid_to_erp, _norm_name("romina soru"), set(), dist_id=3
    )
    assert len(out) == 1
    assert out[0]["id_integrante"] == 1


def test_complete_ranking_with_active_vendors():
    ranking = [{"vendedor": "IVAN SOTO", "puntos": 5, "pos_now": 1, "delta": 0}]
    mock_sb = MagicMock()
    t_vend = "vendedores_v2_real"

    with patch("core.bot_vendor_stats.tenant_table_name", return_value=t_vend), patch(
        "core.bot_vendor_stats.load_active_vendedor_ids", return_value={1, 2}
    ), patch(
        "core.bot_vendor_stats.is_exhibicion_qa_display_for_dist", return_value=False
    ), patch(
        "core.bot_vendor_stats.is_vendedor_excluido_objetivos", return_value=False
    ):

        def table_side(name):
            tbl = MagicMock()
            if name == t_vend:
                tbl.select.return_value.eq.return_value.execute.return_value.data = [
                    {"id_vendedor": 1, "nombre_erp": "IVAN SOTO"},
                    {"id_vendedor": 2, "nombre_erp": "ROMINA SORU"},
                ]
            return tbl

        mock_sb.table.side_effect = table_side
        completed = complete_ranking_with_active_vendors(mock_sb, 3, ranking)

    assert len(completed) == 2
    assert completed[1]["vendedor"] == "ROMINA SORU"
    assert completed[1]["pos_now"] == 2
    assert completed[1]["puntos"] == 0

    pos, total, _ = find_ranking_position(completed, "ROMINA SORU")
    assert pos == 2
    assert total == 2
