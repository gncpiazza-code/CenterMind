# -*- coding: utf-8 -*-
"""Tests partición cartera patrón (Monchi + Jorge = Equipo, agrupado por ciudad)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from core.ivan_soto_zona_geografica import build_ivan_soto_city_owner
from services.vendedor_patron_cartera_service import (
    _assign_pdv_owner,
    _build_city_owner_by_ex,
    _score_cuenta,
    build_erp_canonical_lookup,
    build_patron_cartera_partition,
    normalize_cliente_erp_key,
    normalize_localidad,
    resolve_canonical_erp,
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
    """4 PDVs en 2 ciudades — reparto por localidad."""

    def table(self, name):
        if name == "integrantes_grupo":
            return _ChainStub(
                [
                    {"id_integrante": 300},
                    {"id_integrante": 352},
                ]
            )
        if "rutas_v2" in name:
            return _ChainStub([{"id_ruta": 1}, {"id_ruta": 2}])
        if "clientes_pdv_v2" in name:
            return _ChainStub(
                [
                    {"id_cliente_erp": "A", "id_ruta": 1, "localidad": "LAS TOSCAS"},
                    {"id_cliente_erp": "B", "id_ruta": 1, "localidad": "LAS TOSCAS"},
                    {"id_cliente_erp": "C", "id_ruta": 2, "localidad": "VILLA OCAMPO"},
                    {"id_cliente_erp": "D", "id_ruta": 2, "localidad": "VILLA OCAMPO"},
                ]
            )
        return _ChainStub([])


def test_normalize_cliente_erp_key():
    assert normalize_cliente_erp_key("03434") == "3434"
    assert normalize_cliente_erp_key("3434") == "3434"
    lookup = build_erp_canonical_lookup({"3434", "1010"})
    assert resolve_canonical_erp("03434", lookup) == "3434"
    assert resolve_canonical_erp("01010", lookup) == "1010"


def test_normalize_localidad():
    assert normalize_localidad("  villa ocampo ") == "VILLA OCAMPO"
    assert normalize_localidad(None) == "SIN_CIUDAD"


def test_score_cuenta():
    ex = {(300, "A"): 3, (352, "A"): 1}
    assert _score_cuenta("A", {300}, ex) == 3
    assert _score_cuenta("A", {352}, ex) == 1


def test_city_owner_by_ex():
    ex = {
        (300, "A"): 5,
        (300, "B"): 2,
        (352, "C"): 4,
        (352, "D"): 1,
    }
    erp_localidad = {
        "A": "LAS TOSCAS",
        "B": "LAS TOSCAS",
        "C": "VILLA OCAMPO",
        "D": "VILLA OCAMPO",
    }
    owners = _build_city_owner_by_ex(ex, erp_localidad, {300}, {352})
    assert owners["LAS TOSCAS"] == "monchi"
    assert owners["VILLA OCAMPO"] == "jorge_coronel"


def test_assign_pdv_owner_pdv_signal_overrides_city():
    ex = {(300, "A"): 2, (352, "B"): 3}
    erp_localidad = {"A": "LAS TOSCAS", "B": "LAS TOSCAS"}
    city_owner = {"LAS TOSCAS": "monchi"}
    owner_a, reason_a = _assign_pdv_owner(
        "A", {300}, {352}, ex, erp_localidad, city_owner
    )
    owner_b, reason_b = _assign_pdv_owner(
        "B", {300}, {352}, ex, erp_localidad, city_owner
    )
    assert owner_a == "monchi"
    assert owner_b == "jorge_coronel"
    assert reason_a == "exhibiciones_pdv"
    assert reason_b == "exhibiciones_pdv"


def test_assign_pdv_owner_geographic():
    ex = {}
    erp_localidad = {"X": "VILLA OCAMPO", "Y": "VILLA ANA"}
    city_owner = build_ivan_soto_city_owner(set(erp_localidad.values()))
    owner_vo, reason_vo = _assign_pdv_owner(
        "X", {300}, {352}, ex, erp_localidad, city_owner, geographic=True
    )
    owner_va, reason_va = _assign_pdv_owner(
        "Y", {300}, {352}, ex, erp_localidad, city_owner, geographic=True
    )
    assert owner_vo == "jorge_coronel"
    assert owner_va == "jorge_coronel"
    assert reason_vo == "geografia"
    assert reason_va == "geografia"


def test_assign_pdv_owner_falls_back_to_city_by_ex():
    ex = {}
    erp_localidad = {"X": "VILLA OCAMPO"}
    city_owner = {"VILLA OCAMPO": "jorge_coronel"}
    owner, reason = _assign_pdv_owner(
        "X", {300}, {352}, ex, erp_localidad, city_owner, geographic=False
    )
    assert owner == "jorge_coronel"
    assert reason == "ciudad"


def test_city_partition_villa_ocampo_to_jorge(monkeypatch):
    """Toda una ciudad sin ex directa en PDV va al dueño de la ciudad."""
    sb_data = [
        {"id_cliente_erp": f"VO_{i}", "id_ruta": 1, "localidad": "VILLA OCAMPO"}
        for i in range(5)
    ] + [
        {"id_cliente_erp": f"LT_{i}", "id_ruta": 2, "localidad": "LAS TOSCAS"}
        for i in range(3)
    ]

    class _SbStub:
        def table(self, name):
            if "rutas_v2" in name:
                return _ChainStub([{"id_ruta": 1}, {"id_ruta": 2}])
            if "clientes_pdv_v2" in name:
                return _ChainStub(sb_data)
            return _ChainStub([])

    def _fake_paginate(_sb, _dist, integrante_ids, _fd, _fh):
        rows = []
        if 300 in integrante_ids:
            rows.extend(
                {"id_integrante": 300, "cliente_sombra_codigo": f"LT_{i}"}
                for i in range(3)
            )
        if 352 in integrante_ids:
            rows.extend(
                {"id_integrante": 352, "cliente_sombra_codigo": f"VO_{i}"}
                for i in range(5)
            )
        return rows

    monkeypatch.setattr(
        "services.vendedor_patron_cartera_service._paginate_exhibiciones",
        _fake_paginate,
    )
    part = build_patron_cartera_partition(
        _SbStub(),
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
    jorge = part["by_cuenta"]["jorge_coronel"]
    assert all(erp.startswith("LT_") for erp in monchi)
    assert all(erp.startswith("VO_") for erp in jorge)
    assert len(monchi) == 3
    assert len(jorge) == 5
    assert "VILLA OCAMPO" in part["asignacion_cartera"]["ciudades_jorge_coronel"]
    assert "LAS TOSCAS" in part["asignacion_cartera"]["ciudades_monchi"]
    assert part["asignacion_cartera"].get("modo") == "geografia_ivan_soto"


def test_partition_sums_to_equipo(monkeypatch):
    sb = _SbPartitionStub()
    cuenta_specs = [
        {"id": "monchi", "integrante_ids": [300]},
        {"id": "jorge_coronel", "integrante_ids": [352]},
    ]

    def _fake_paginate(_sb, _dist, integrante_ids, _fd, _fh):
        rows = []
        if 300 in integrante_ids:
            rows.extend(
                {"id_integrante": 300, "cliente_sombra_codigo": erp}
                for erp in ("A", "B")
            )
        if 352 in integrante_ids:
            rows.extend(
                {"id_integrante": 352, "cliente_sombra_codigo": erp}
                for erp in ("C", "D")
            )
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
    assert monchi == {"A", "B"}
    assert jorge == {"C", "D"}
