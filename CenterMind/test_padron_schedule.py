# -*- coding: utf-8 -*-
"""Regresión: orden de tenants padrón y detección de stale."""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

RPA_ROOT = Path(__file__).resolve().parents[1] / "ShelfMind-RPA"
sys.path.insert(0, str(RPA_ROOT))

from lib.padron_schedule import (  # noqa: E402
    ordenar_tenants_para_corrida,
    list_stale_tenant_ids,
)


def test_ordenar_tenants_chicos_antes_tabaco_aloma():
    tenants = [
        {"id": "tabaco", "id_dist": 3},
        {"id": "beltrocco", "id_dist": 11},
        {"id": "aloma", "id_dist": 4},
        {"id": "hugo_cena", "id_dist": 12},
    ]
    ordered = ordenar_tenants_para_corrida(tenants)
    ids = [t["id"] for t in ordered]
    assert ids.index("beltrocco") < ids.index("tabaco")
    assert ids.index("hugo_cena") < ids.index("aloma")
    assert set(ids[-2:]) == {"tabaco", "aloma"}


def test_list_stale_tenant_ids():
    tenants = [
        {"id": "beltrocco", "id_dist": 11},
        {"id": "tabaco", "id_dist": 3},
    ]
    fresh = datetime.now(timezone.utc) - timedelta(hours=1)
    old = datetime.now(timezone.utc) - timedelta(hours=30)

    with patch("lib.padron_schedule.last_padron_run_utc") as mock_last:
        mock_last.side_effect = lambda dist: fresh if dist == 3 else old
        stale = list_stale_tenant_ids(tenants, max_age_hours=11)
    assert stale == ["beltrocco"]


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
