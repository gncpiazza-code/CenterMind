# -*- coding: utf-8 -*-
"""Tests partición cartera patrón (Monchi + Jorge = Equipo)."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))

from services.vendedor_patron_cartera_service import (
    RUTA_TAKEOVER_MIN_PDVS,
    _build_ruta_owner_by_ex,
    _build_ruta_takeover,
    _pdvs_con_exhibicion_por_ruta,
    _score_cuenta,
    build_patron_cartera_partition,
)


class _ChainStub:
    def __init__(self, data):
        self._data = data

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._data})()


class _SbPartitionStub:
    """Stub mínimo: 4 PDVs, 2 rutas, ex Monchi domina ruta 1."""

    def table(self, name):
        if name == "integrantes_grupo":
            return _ChainStub(
                [
                    {"id_integrante": 300},
                    {"id_integrante": 352},
                ]
            )
        if name.endswith("rutas_v2_d3") or "rutas_v2" in name:
            return _ChainStub([{"id_ruta": 1}, {"id_ruta": 2}])
        if name.endswith("clientes_pdv_v2_d3") or "clientes_pdv_v2" in name:
            return _ChainStub(
                [
                    {"id_cliente_erp": "A", "id_ruta": 1},
                    {"id_cliente_erp": "B", "id_ruta": 1},
                    {"id_cliente_erp": "C", "id_ruta": 2},
                    {"id_cliente_erp": "D", "id_ruta": 2},
                ]
            )
        if name.endswith("exhibiciones_d3") or "exhibiciones" in name:
            return _ChainStub(
                [
                    {
                        "id_integrante": 300,
                        "cliente_sombra_codigo": "A",
                        "timestamp_subida": "2026-01-01T10:00:00-03:00",
                    },
                    {
                        "id_integrante": 352,
                        "cliente_sombra_codigo": "C",
                        "timestamp_subida": "2026-01-02T10:00:00-03:00",
                    },
                ]
            )
        return _ChainStub([])


def test_score_cuenta():
    ex = {(300, "A"): 3, (352, "A"): 1}
    assert _score_cuenta("A", {300}, ex) == 3
    assert _score_cuenta("A", {352}, ex) == 1


def test_ruta_owner_by_ex():
    ex = {(300, "A"): 5, (300, "B"): 2, (352, "C"): 4}
    erp_to_ruta = {"A": 1, "B": 1, "C": 2}
    owners = _build_ruta_owner_by_ex(ex, {300}, {352}, erp_to_ruta)
    assert owners[1] == "monchi"
    assert owners[2] == "jorge_coronel"


def test_ruta_takeover_when_five_plus_pdvs():
    erp_to_ruta = {f"M{i}": 1 for i in range(5)} | {"M5": 1, "SIN_EX": 1, "J1": 2}
    ex = {(300, f"M{i}"): 1 for i in range(5)} | {(352, "J1"): 1}
    monchi_by, jorge_by = _pdvs_con_exhibicion_por_ruta(ex, {300}, {352}, erp_to_ruta)
    takeover = _build_ruta_takeover(monchi_by, jorge_by, min_pdvs=RUTA_TAKEOVER_MIN_PDVS)
    assert takeover[1] == "monchi"
    assert 2 not in takeover


def test_route_takeover_assigns_pdvs_without_movement(monkeypatch):
    """5+ ex en ruta → todos los PDVs de la ruta, incluso sin exhibición."""
    pdvs_ruta1 = [{"id_cliente_erp": f"R1_{i}", "id_ruta": 1} for i in range(7)]
    sb_data = pdvs_ruta1 + [{"id_cliente_erp": "R2_0", "id_ruta": 2}]

    class _SbTakeoverStub:
        def table(self, name):
            if name == "integrantes_grupo":
                return _ChainStub([{"id_integrante": 300}, {"id_integrante": 352}])
            if "rutas_v2" in name:
                return _ChainStub([{"id_ruta": 1}, {"id_ruta": 2}])
            if "clientes_pdv_v2" in name:
                return _ChainStub(sb_data)
            return _ChainStub([])

    def _fake_paginate(_sb, _dist, integrante_ids, _fd, _fh):
        if 300 not in integrante_ids:
            return []
        return [
            {"id_integrante": 300, "cliente_sombra_codigo": f"R1_{i}"}
            for i in range(RUTA_TAKEOVER_MIN_PDVS)
        ]

    monkeypatch.setattr(
        "services.vendedor_patron_cartera_service._paginate_exhibiciones",
        _fake_paginate,
    )
    part = build_patron_cartera_partition(
        _SbTakeoverStub(),
        3,
        30,
        [
            {"id": "monchi", "integrante_ids": [300]},
            {"id": "jorge_coronel", "integrante_ids": [352]},
        ],
        fecha_desde="2026-01-01",
        fecha_hasta="2026-06-01",
    )
    monchi = part["by_cuenta"]["monchi"]
    assert all(f"R1_{i}" in monchi for i in range(7))
    assert part["asignacion_cartera"]["desde_ruta_takeover"] == 7


def test_partition_sums_to_equipo(monkeypatch):
    sb = _SbPartitionStub()
    cuenta_specs = [
        {"id": "monchi", "integrante_ids": [300]},
        {"id": "jorge_coronel", "integrante_ids": [352]},
    ]

    def _fake_paginate(_sb, _dist, integrante_ids, _fd, _fh):
        rows = []
        if 300 in integrante_ids:
            rows.append({"id_integrante": 300, "cliente_sombra_codigo": "A"})
        if 352 in integrante_ids:
            rows.append({"id_integrante": 352, "cliente_sombra_codigo": "C"})
        return rows

    monkeypatch.setattr(
        "services.vendedor_patron_cartera_service._paginate_exhibiciones",
        _fake_paginate,
    )

    part = build_patron_cartera_partition(
        sb,
        3,
        30,
        cuenta_specs,
        fecha_desde="2026-01-01",
        fecha_hasta="2026-06-01",
    )
    equipo = part["equipo_erps"]
    monchi = part["by_cuenta"]["monchi"]
    jorge = part["by_cuenta"]["jorge_coronel"]

    assert len(equipo) == 4
    assert monchi | jorge == equipo
    assert monchi & jorge == set()
    assert len(monchi) + len(jorge) == len(equipo)
    assert "A" in monchi
    assert "C" in jorge
