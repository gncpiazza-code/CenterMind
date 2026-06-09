"""Tests: merge vendedor + prevención duplicado ERP en padrón."""
from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

from services.padron_ingestion_service import PadronIngestionService, _norm


class _Chain:
    def __init__(self, data=None):
        self._data = data or []

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def update(self, *a, **k):
        return self

    def delete(self, *a, **k):
        return self

    def execute(self):
        m = MagicMock()
        m.data = self._data
        return m


def test_padron_sync_vendedores_migrates_erp_by_name_not_insert():
    """Si el ERP cambió pero nombre+sucursal coincide, actualiza ERP en vez de insertar."""
    svc = PadronIngestionService()
    df = MagicMock()
    df.iterrows.return_value = [
        (0, {
            "vendedor_nombre": "MIGUEL ANGEL MUÑOZ",
            "vendedor_erp_cod": "5102",
            "id_sucursal": "5",
        }),
    ]
    cols = {
        "vendedor_nombre": "vendedor_nombre",
        "vendedor_erp_cod": "vendedor_erp_cod",
        "id_sucursal": "id_sucursal",
        "sucursal": "sucursal",
    }
    suc_map = {"5": 8}
    existing = [{
        "id_vendedor": 67,
        "id_vendedor_erp": "5082",
        "nombre_erp": "MIGUEL ANGEL MUÑOZ",
        "id_sucursal": 8,
    }]

    updates: list[dict] = []
    inserts: list[dict] = []

    def _table(name):
        chain = _Chain(existing if "vendedores" in name else [])
        if name == "vendedores_v2_d3":
            orig_update = chain.update

            def _capture_update(patch):
                updates.append(patch)
                return orig_update(patch)

            chain.update = _capture_update
        if name == "vendedores_v2":
            orig_insert = chain.insert

            def _capture_insert(batch):
                inserts.extend(batch)
                return orig_insert(batch)

            chain.insert = _capture_insert
        return chain

    with patch("services.padron_ingestion_service.sb") as mock_sb:
        mock_sb.table.side_effect = _table
        count, mapping = svc._sync_vendedores(df, cols, 3, suc_map)

    assert count == 1
    assert not inserts
    assert updates and updates[0]["id_vendedor_erp"] == "5102"
    assert mapping.get(("5102", "5")) == 67


def test_merge_vendedor_requires_both_rows():
    mock_db = MagicMock()
    mock_db.sb = MagicMock()
    mock_db.sb.table.return_value = _Chain([])
    with patch.dict(sys.modules, {"db": mock_db}):
        from core.vendedor_merge import merge_vendedor_v2

        try:
            merge_vendedor_v2(3, 69, 67)
            assert False, "expected ValueError"
        except ValueError as e:
            assert "no encontrados" in str(e)


def test_norm_collapses_accents():
    assert _norm("MIGUEL ANGEL MUÑOZ") == _norm("MIGUEL ANGEL MUNOZ")
