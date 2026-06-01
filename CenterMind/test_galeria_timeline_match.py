"""Resolución PDV en timeline galería (paridad con grilla de clientes)."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from routers.fuerza_ventas import (
    _exhibition_belongs_to_pdv,
    _pdv_shadow_map_for_target,
    _resolve_pdv_id_for_exhibition,
)


def test_resolve_pdv_from_sombra_codigo():
    shadow = _pdv_shadow_map_for_target(33938, {"0033938", "33938"})
    ex = {
        "id_exhibicion": 1,
        "id_cliente_pdv": None,
        "id_cliente": None,
        "cliente_sombra_codigo": "33938",
    }
    assert _resolve_pdv_id_for_exhibition(ex, shadow) == 33938
    assert _exhibition_belongs_to_pdv(ex, 33938, {"33938", "0033938"}, shadow)


def test_belongs_when_fk_legacy_differs_but_erp_matches():
    shadow = _pdv_shadow_map_for_target(33938, {"33938"})
    ex = {
        "id_exhibicion": 2,
        "id_cliente_pdv": 99999,
        "id_cliente": None,
        "cliente_sombra_codigo": "33938",
    }
    assert _exhibition_belongs_to_pdv(ex, 33938, {"33938"}, shadow)


def test_resolve_pdv_direct_fk():
    shadow = {}
    ex = {"id_cliente_pdv": 33938, "id_cliente": None}
    assert _resolve_pdv_id_for_exhibition(ex, shadow) == 33938


def test_resolve_prefers_sombra_over_stale_fk():
    shadow = _pdv_shadow_map_for_target(33938, {"33938"})
    ex = {
        "id_cliente_pdv": 99999,
        "id_cliente": None,
        "cliente_sombra_codigo": "33938",
    }
    assert _resolve_pdv_id_for_exhibition(ex, shadow) == 33938


def test_belongs_direct_id_cliente_without_erp_variants():
    shadow = {}
    ex = {"id_cliente_pdv": None, "id_cliente": 32484}
    assert _exhibition_belongs_to_pdv(ex, 32484, set(), shadow)


def test_build_directas_from_rows():
    from routers.fuerza_ventas import _galeria_directas_from_rows

    rows = [
        {"id_exhibicion": 10, "url_foto_drive": "u1", "estado": "Aprobada", "timestamp_subida": "2026-05-01T10:00:00"},
        {"id_exhibicion": 11, "url_foto_drive": "u2", "estado": "Pendiente", "timestamp_subida": "2026-05-02T10:00:00"},
    ]
    items = _galeria_directas_from_rows(rows)
    assert len(items) == 2
    assert items[0].id_exhibicion == 11
    assert items[0].url_foto == "u2"
