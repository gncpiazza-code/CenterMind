# -*- coding: utf-8 -*-
from datetime import date, timedelta

from core.padron_cliente_vitalidad import (
    activo_comercial_por_fecha,
    apply_vitalidad_padron_row,
    es_anulado_en_padron,
)


def test_es_anulado_motivos():
    assert es_anulado_en_padron("padron_anulado")
    assert es_anulado_en_padron("padron_absent")
    assert not es_anulado_en_padron("sin_compra_30d")
    assert not es_anulado_en_padron(None)


def test_compra_anula_flag_anulado():
    row = {
        "motivo_inactivo": "padron_anulado",
        "fecha_ultima_compra": date.today().isoformat(),
    }
    apply_vitalidad_padron_row(row, compra_desde_ventas=True)
    assert row["padron_anulado"] is False
    assert row["activo_comercial"] is True


def test_sin_compra_anulado_padron():
    row = {"motivo_inactivo": "padron_anulado", "fecha_ultima_compra": None}
    apply_vitalidad_padron_row(row)
    assert row["padron_anulado"] is True
    assert row["activo_comercial"] is False


def test_inactivo_comercial_sin_anulado():
    vieja = (date.today() - timedelta(days=60)).isoformat()
    row = {"motivo_inactivo": "sin_compra_30d", "fecha_ultima_compra": vieja}
    apply_vitalidad_padron_row(row)
    assert row["padron_anulado"] is False
    assert row["activo_comercial"] is False
    assert activo_comercial_por_fecha(vieja) is False
