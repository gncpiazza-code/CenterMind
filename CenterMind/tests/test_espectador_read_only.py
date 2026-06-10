"""Tests para rol espectador (solo lectura)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.espectador_guard import espectador_write_allowed, is_espectador_payload
from core.roles import is_espectador_rol, ROL_ESPECTADOR


def test_is_espectador_rol():
    assert is_espectador_rol("espectador")
    assert is_espectador_rol("Espectador")
    assert not is_espectador_rol("admin")


def test_is_espectador_payload_by_rol():
    assert is_espectador_payload({"rol": ROL_ESPECTADOR})


def test_is_espectador_payload_by_read_only_flag():
    assert is_espectador_payload({"rol": "admin", "read_only": True})


def test_write_allowlist_login_and_preview():
    assert espectador_write_allowed("/auth/login")
    assert espectador_write_allowed("/api/difusion/cc-telegram/preview")
    assert espectador_write_allowed("/api/bundle/warm/4")
    assert not espectador_write_allowed("/api/evaluar")
