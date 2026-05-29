"""Regresión: alias 'Nacho' no debe cruzar NACHO PIAZZA (TEST) con IGNACIO LERF."""
from unittest.mock import patch

from core.helpers import (
    _get_erp_name_map,
    _looks_like_full_name,
    _vendor_names_match_venta,
    build_integrante_to_erp_name,
    resolve_exhibicion_vendedor_display,
)


def test_full_name_required_for_global_map_key():
    assert _looks_like_full_name("Nacho Piazza")
    assert not _looks_like_full_name("Nacho")


def test_erp_map_no_single_token_nacho(monkeypatch):
    """Sin alias global 'nacho' aunque exista integrante TEST con v2=157."""
    vend = [
        {"id_vendedor": 31, "nombre_erp": "IGNACIO LERF RECONQUISTA"},
        {"id_vendedor": 157, "nombre_erp": "NACHO PIAZZA"},
    ]
    integrantes = [
        {
            "nombre_integrante": "Nacho",
            "id_vendedor_v2": 157,
            "id_vendedor_erp": None,
            "telegram_user_id": 2037005531,
            "telegram_group_id": -1003108035087,
        },
        {
            "nombre_integrante": "Nacho",
            "id_vendedor_v2": 31,
            "id_vendedor_erp": None,
            "telegram_user_id": 5902152313,
            "telegram_group_id": -1003355556463,
        },
        {
            "nombre_integrante": "Nacho Piazza",
            "id_vendedor_v2": 157,
            "id_vendedor_erp": None,
            "telegram_user_id": 9000166,
            "telegram_group_id": -1003108035087,
        },
    ]

    class _Q:
        def __init__(self, data):
            self._data = data

        def select(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def execute(self):
            class R:
                data = self._data

            return R()

    def fake_table(name):
        if "vendedores_v2" in name:
            return _Q(vend)
        if "integrantes" in name:
            return _Q(integrantes)
        if "binding" in name:
            return _Q([])
        return _Q([])

    with patch("core.helpers.sb") as sb:
        sb.table.side_effect = fake_table
        emap = _get_erp_name_map(3)

    assert "nacho" not in emap
    assert emap.get("nacho piazza") == "NACHO PIAZZA"
    assert emap.get("ignacio lerf reconquista") == "IGNACIO LERF RECONQUISTA"


def test_resolve_display_lerf_vs_piazza_by_integrante():
    i2e = {
        335: "IGNACIO LERF RECONQUISTA",
        454: "NACHO PIAZZA",
    }
    emap = {"nacho piazza": "NACHO PIAZZA", "ignacio lerf reconquista": "IGNACIO LERF RECONQUISTA"}

    assert (
        resolve_exhibicion_vendedor_display(
            3, 335, "Nacho", integrante_to_erp=i2e, erp_name_map=emap
        )
        == "IGNACIO LERF RECONQUISTA"
    )
    assert (
        resolve_exhibicion_vendedor_display(
            3, 454, "Nacho", integrante_to_erp=i2e, erp_name_map=emap
        )
        == "NACHO PIAZZA"
    )


def test_qa_telegram_uid_maps_to_nacho_piazza(monkeypatch):
    integrantes = [
        {
            "id_integrante": 316,
            "nombre_integrante": "Nacho",
            "id_vendedor_v2": None,
            "telegram_user_id": 2037005531,
            "telegram_group_id": -1,
        },
    ]
    vend = [{"id_vendedor": 157, "nombre_erp": "NACHO PIAZZA"}]

    class _Q:
        def __init__(self, data):
            self._data = data

        def select(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def execute(self):
            class R:
                data = self._data

            return R()

    def fake_table(name):
        if "vendedores_v2" in name:
            return _Q(vend)
        if "integrantes" in name:
            return _Q(integrantes)
        return _Q([])

    with patch("core.helpers.sb") as sb:
        sb.table.side_effect = fake_table
        i2e = build_integrante_to_erp_name(3)

    assert i2e[316] == "NACHO PIAZZA"


def test_vendor_names_match_requires_two_tokens():
    assert _vendor_names_match_venta("IGNACIO LERF", "IGNACIO LERF RECONQUISTA")
    assert _vendor_names_match_venta("05-TOURN DIEGO", "TOURN DIEGO")
    assert not _vendor_names_match_venta("NACHO", "IGNACIO LERF RECONQUISTA")
    assert not _vendor_names_match_venta("NACHO", "NACHO PIAZZA")
