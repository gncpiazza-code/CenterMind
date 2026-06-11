"""Tests de alcance de sucursales por usuario."""
import pytest
from fastapi import HTTPException

from core.usuario_sucursal_scope import (
    assert_sucursal_nombre_allowed,
    assert_vendedor_id_allowed,
    filter_sucursal_names,
    is_unrestricted_sucursales,
    jwt_sucursal_claims,
)


def test_jwt_claims_unrestricted():
    claims = jwt_sucursal_claims({"restricted": False, "ids": [], "names": []})
    assert claims["sucursales_restringidas"] is False
    assert claims["sucursales_permitidas_ids"] == []


def test_jwt_claims_restricted():
    claims = jwt_sucursal_claims({"restricted": True, "ids": [1, 2], "names": ["A", "B"]})
    assert claims["sucursales_restringidas"] is True
    assert claims["sucursales_permitidas_ids"] == [1, 2]
    assert claims["sucursales_permitidas_nombres"] == ["A", "B"]


def test_filter_sucursal_names():
    payload = {
        "is_superadmin": False,
        "sucursales_restringidas": True,
        "sucursales_permitidas_nombres": ["Norte"],
    }
    assert filter_sucursal_names(["Norte", "Sur"], payload) == ["Norte"]


def test_superadmin_unrestricted():
    assert is_unrestricted_sucursales({"is_superadmin": True, "sucursales_restringidas": True})


def test_assert_sucursal_nombre_allowed_ok():
    payload = {
        "sucursales_restringidas": True,
        "sucursales_permitidas_nombres": ["Centro"],
    }
    assert_sucursal_nombre_allowed(payload, "Centro")


def test_assert_sucursal_nombre_allowed_all():
    assert_sucursal_nombre_allowed(
        {"sucursales_restringidas": True, "sucursales_permitidas_nombres": ["Centro"]},
        "__all__",
    )


def test_assert_vendedor_id_allowed_sin_restriccion():
    assert_vendedor_id_allowed({"sucursales_restringidas": False}, 3, 99)


def test_assert_vendedor_id_allowed_rechaza_otra_sucursal(monkeypatch):
    monkeypatch.setattr(
        "core.usuario_sucursal_scope.vendedor_sucursal_id",
        lambda _d, _v: 5,
    )
    payload = {
        "sucursales_restringidas": True,
        "sucursales_permitidas_ids": [1],
    }
    with pytest.raises(HTTPException) as exc:
        assert_vendedor_id_allowed(payload, 3, 42)
    assert exc.value.status_code == 403


def test_assert_vendedor_id_allowed_ok_misma_sucursal(monkeypatch):
    monkeypatch.setattr(
        "core.usuario_sucursal_scope.vendedor_sucursal_id",
        lambda _d, _v: 1,
    )
    payload = {
        "sucursales_restringidas": True,
        "sucursales_permitidas_ids": [1],
    }
    assert_vendedor_id_allowed(payload, 3, 42)
