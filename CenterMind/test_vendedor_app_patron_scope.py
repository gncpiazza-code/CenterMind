# -*- coding: utf-8 -*-
"""Tests scope multi-cuenta patrón SHELFYAPP (Ivan Soto → Monchi / Jorge Coronel)."""
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(__file__))

from core.vendedor_app_patron_scope import (
    _cuenta_key_from_nombre,
    _pick_best_integrante_rows,
    list_patron_cuentas,
    resolve_patron_scope,
)


class _TableStub:
    def __init__(self, data):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("R", (), {"data": self._data})()


class _SbStub:
    def __init__(self, integrantes):
        self._integrantes = integrantes

    def table(self, name):
        assert name == "integrantes_grupo"
        return _TableStub(self._integrantes)


def test_cuenta_key_from_nombre():
    assert _cuenta_key_from_nombre("Monchi") == "monchi"
    assert _cuenta_key_from_nombre("Jorge Coronel") == "jorge_coronel"
    assert _cuenta_key_from_nombre("IVAN SOTO") == "ivan_soto"


def test_pick_best_integrante_rows_prefers_real_telegram():
    rows = [
        {"id_integrante": 246, "nombre_integrante": "Monchi", "telegram_user_id": 9001087},
        {"id_integrante": 300, "nombre_integrante": "Monchi", "telegram_user_id": 5466310928},
    ]
    picked = _pick_best_integrante_rows(rows)
    assert len(picked) == 1
    assert picked[0]["id_integrante"] == 300


def test_list_patron_cuentas_ivan_soto():
    sb = _SbStub(
        [
            {"id_integrante": 300, "nombre_integrante": "Monchi", "telegram_user_id": 5466310928, "id_vendedor_v2": 30},
            {"id_integrante": 352, "nombre_integrante": "Jorge Coronel", "telegram_user_id": 6258637035, "id_vendedor_v2": 30},
        ]
    )
    cuentas = list_patron_cuentas(sb, 3, 30)
    assert [c["id"] for c in cuentas] == ["monchi", "jorge_coronel"]
    assert cuentas[0]["integrante_ids"] == [300]
    assert cuentas[1]["integrante_ids"] == [352]


def test_list_patron_cuentas_empty_for_other_vendor():
    sb = _SbStub([])
    assert list_patron_cuentas(sb, 3, 99) == []
    assert list_patron_cuentas(sb, 2, 30) == []


def test_resolve_patron_scope_invalid_cuenta():
    sb = _SbStub(
        [
            {"id_integrante": 300, "nombre_integrante": "Monchi", "telegram_user_id": 5466310928, "id_vendedor_v2": 30},
        ]
    )
    with pytest.raises(HTTPException) as exc:
        resolve_patron_scope(sb, 3, 30, "no_existe")
    assert exc.value.status_code == 400


def test_resolve_patron_scope_defaults_first_cuenta():
    sb = _SbStub(
        [
            {"id_integrante": 300, "nombre_integrante": "Monchi", "telegram_user_id": 5466310928, "id_vendedor_v2": 30},
            {"id_integrante": 352, "nombre_integrante": "Jorge Coronel", "telegram_user_id": 6258637035, "id_vendedor_v2": 30},
        ]
    )
    scope = resolve_patron_scope(sb, 3, 30, None)
    assert scope["patron_mode"] is True
    assert scope["cuenta_id"] == "monchi"
    assert scope["integrante_ids"] == [300]

    scope_j = resolve_patron_scope(sb, 3, 30, "jorge_coronel")
    assert scope_j["integrante_ids"] == [352]
    assert scope_j["ranking_nombre"] == "Jorge Coronel"
