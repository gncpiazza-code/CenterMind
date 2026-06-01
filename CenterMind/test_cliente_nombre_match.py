# -*- coding: utf-8 -*-
from core.cliente_nombre_match import cliente_nombre_coincide_padron


def test_viejitos_no_gran_can():
    assert not cliente_nombre_coincide_padron(
        "KIOSCO GRAN CAN",
        nombre_fantasia="EL VIEJITO",
        nombre_razon_social="EL VIEJITO",
    )


def test_viejitos_match():
    assert cliente_nombre_coincide_padron(
        "EL VIEJITO",
        nombre_fantasia="EL VIEJITO",
    )


def test_substring_match():
    assert cliente_nombre_coincide_padron(
        "KIOSCO EL VIEJITO SA",
        nombre_fantasia="EL VIEJITO",
    )
