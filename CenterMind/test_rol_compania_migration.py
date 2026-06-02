"""Tests para normalize_rol y migración de rol compania."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from core.roles import normalize_rol, ROL_COMPANIA, ROLES_COMPANIA_SCOPE


def test_normalize_directorio_to_compania():
    assert normalize_rol("directorio") == "compania"


def test_normalize_compania_unchanged():
    assert normalize_rol("compania") == "compania"


def test_normalize_other_roles_unchanged():
    for rol in ("admin", "supervisor", "evaluador", "superadmin"):
        assert normalize_rol(rol) == rol, f"Expected {rol} unchanged, got {normalize_rol(rol)}"


def test_normalize_uppercase():
    assert normalize_rol("Directorio") == "compania"
    assert normalize_rol("DIRECTORIO") == "compania"


def test_normalize_empty():
    assert normalize_rol("") == ""
    assert normalize_rol(None) == ""


def test_roles_compania_scope_contains_compania():
    assert "compania" in ROLES_COMPANIA_SCOPE
    assert "superadmin" in ROLES_COMPANIA_SCOPE
    assert "directorio" not in ROLES_COMPANIA_SCOPE


def test_rol_compania_constant():
    assert ROL_COMPANIA == "compania"


def test_normalize_preserves_other_case():
    """Otros roles se devuelven en minúsculas."""
    assert normalize_rol("Admin") == "admin"
    assert normalize_rol("SUPERVISOR") == "supervisor"
