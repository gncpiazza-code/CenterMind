# -*- coding: utf-8 -*-
"""Zonas geográficas Ivan Soto → Monchi / Jorge."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from core.ivan_soto_zona_geografica import (
    build_ivan_soto_city_owner,
    resolve_ivan_soto_localidad_cuenta,
)


def test_monchi_corredor_este():
    for loc in (
        "TACUARENDI",
        "BASAIL",
        "LAS TOSCAS",
        "FLORENCIA",
        "VILLA GUILLERMINA",
        "SAN ANTONIO DE OBLIGADO",
    ):
        assert resolve_ivan_soto_localidad_cuenta(loc) == "monchi"


def test_jorge_oeste_sur():
    for loc in (
        "VILLA OCAMPO",
        "LAS GARZAS",
        "VILLA ANA",
        "LANTERI",
        "AGUA SUCIA",
    ):
        assert resolve_ivan_soto_localidad_cuenta(loc) == "jorge_coronel"


def test_villa_ana_es_jorge_no_monchi():
    assert resolve_ivan_soto_localidad_cuenta("VILLA ANA") == "jorge_coronel"


def test_build_city_owner_includes_all_cartera_cities():
    cartera = {
        "LAS TOSCAS",
        "VILLA OCAMPO",
        "VILLA GUILLERMINA",
        "FLORENCIA",
        "VILLA ANA",
        "TACUARENDI",
        "BASAIL",
        "SAN ANTONIO DE OBLIGADO",
        "LAS GARZAS",
        "GUADALUPE NORTE",
        "LANTERI",
        "AGUA SUCIA",
        "ARROYO CEIBAL",
    }
    owners = build_ivan_soto_city_owner(cartera)
    monchi = {c for c, o in owners.items() if o == "monchi"}
    jorge = {c for c, o in owners.items() if o == "jorge_coronel"}
    assert "VILLA ANA" in jorge
    assert "VILLA OCAMPO" in jorge
    assert "LAS TOSCAS" in monchi
    assert "TACUARENDI" in monchi
    assert "BASAIL" in monchi
