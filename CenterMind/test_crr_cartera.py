# -*- coding: utf-8 -*-
from core.crr_cartera import (
    build_composicion_exhibicion_compradores,
    build_crr_cartera,
    es_perdido_en_periodo,
    es_proximo_caer,
    es_reactivado_en_periodo,
    ref_cartera_viva,
)


def test_reactivado_requiere_fecha_anterior():
    assert not es_reactivado_en_periodo(
        "2026-05-15", None, "2026-05-01", "2026-05-01", "2026-05-31", compro_en_periodo=True
    )


def test_reactivado_tras_inactividad():
    assert es_reactivado_en_periodo(
        "2026-05-20", "2026-01-10", "2024-01-01", "2026-05-01", "2026-05-31", compro_en_periodo=True
    )


def test_no_reactivado_si_no_compro():
    assert not es_reactivado_en_periodo(
        "2026-05-20", "2026-01-10", "2024-01-01", "2026-05-01", "2026-05-31", compro_en_periodo=False
    )


def test_no_reactivado_sin_gap_inactividad():
    assert not es_reactivado_en_periodo(
        "2026-05-20", "2026-05-10", "2024-01-01", "2026-05-01", "2026-05-31", compro_en_periodo=True
    )


def test_perdido_en_periodo():
    assert es_perdido_en_periodo(
        "2026-04-10", "2026-03-01", "2026-05-01", "2026-05-31", compro_en_periodo=False
    )
    assert not es_perdido_en_periodo(
        "2026-05-15", "2026-04-01", "2026-05-01", "2026-05-31", compro_en_periodo=True
    )


def test_compra_reciente_no_es_perdido():
    """Cliente con compra hace ~8 días no debe figurar como perdido (Facundo / 30-05)."""
    assert not es_perdido_en_periodo(
        "2026-05-30", "2026-04-01", "2026-06-01", "2026-06-30", compro_en_periodo=False
    )


def test_proximo_caer():
    assert es_proximo_caer("2026-05-03", "2026-05-31")
    assert not es_proximo_caer("2026-05-28", "2026-05-31")


def test_ref_cartera_viva_no_proyecta_fin_mes_futuro():
    assert ref_cartera_viva("2026-06-30") <= "2026-06-30"
    assert ref_cartera_viva("2026-03-31") == "2026-03-31"


def test_compra_reciente_no_es_proximo_caer_con_ref_hoy():
    """Compra hace 1 día no debe figurar como «cae en 1 día» (error con ref = fin de mes)."""
    assert not es_proximo_caer("2026-06-01", "2026-06-02")
    assert es_proximo_caer("2026-06-01", "2026-06-30")


def test_build_crr_inactivos():
    pdvs = [
        {
            "id_cliente_erp": "I1",
            "id_ruta": 10,
            "nombre_razon_social": "Inactivo SA",
            "telefono": "1234",
            "celular": "5678",
            "fecha_ultima_compra": "2026-01-01",
            "fecha_compra_anterior": "2025-12-01",
        },
        {
            "id_cliente_erp": "A1",
            "id_ruta": 10,
            "nombre_razon_social": "Activo SA",
            "fecha_ultima_compra": "2026-05-28",
            "fecha_compra_anterior": "2026-04-01",
        },
    ]
    crr = build_crr_cartera(
        pdvs,
        compradores_erp=set(),
        altas_erp=set(),
        exhibidos_erp=set(),
        ultima_exhibicion_por_erp={},
        ruta_meta_by_id={10: {"nombre": "Ruta 10", "dia": "Lunes"}},
        desde="2026-05-01",
        hasta="2026-05-31",
    )
    assert crr["inactivos"] == 1
    assert crr["activos"] == 1
    inactivo = crr["clientes"]["inactivos"][0]
    assert inactivo["id_cliente_erp"] == "I1"
    assert inactivo["contacto"] == "5678"
    assert inactivo["ruta_nombre"] == "Ruta 10"
    assert inactivo["dia_visita"] == "Lunes"
    assert inactivo["dias_sin_compra"] >= 30


def test_build_crr_balance():
    pdvs = [
        {
            "id_cliente_erp": "A1",
            "nombre_razon_social": "Alta SA",
            "fecha_alta": "2026-05-10",
            "fecha_ultima_compra": None,
            "fecha_compra_anterior": None,
        },
        {
            "id_cliente_erp": "R1",
            "nombre_razon_social": "Reactivo SA",
            "fecha_alta": "2024-01-01",
            "fecha_ultima_compra": "2026-05-15",
            "fecha_compra_anterior": "2026-01-10",
        },
    ]
    crr = build_crr_cartera(
        pdvs,
        compradores_erp={"R1"},
        altas_erp={"A1"},
        exhibidos_erp=set(),
        ultima_exhibicion_por_erp={},
        desde="2026-05-01",
        hasta="2026-05-31",
    )
    assert crr["nuevos"] == 1
    assert crr["reactivados"] == 1
    assert crr["balance"] == 2 - crr["perdidos"]


def test_anomalia_exhibicion_compra_antigua():
    from core.crr_cartera import es_anomalia_exhibicion_compra

    assert es_anomalia_exhibicion_compra(
        "2026-03-01", "2026-02-01", "2026-05-20", "2026-05-31", exhibido_en_periodo=True
    )
    assert not es_anomalia_exhibicion_compra(
        "2026-05-15", "2026-04-01", "2026-05-20", "2026-05-31", exhibido_en_periodo=True
    )


def test_cliente_row_enriquecido():
    from core.crr_cartera import _cliente_row

    row = _cliente_row(
        {
            "id_cliente_erp": "X1",
            "nombre_razon_social": "Test SA",
            "fecha_ultima_compra": "2026-04-10",
            "fecha_compra_anterior": "2026-03-01",
        },
        categoria="perdido",
        ref_iso="2026-05-31",
        compro_en_periodo=False,
        ultima_exhibicion="2026-05-18",
    )
    assert row["dias_sin_compra"] == 51
    assert row["fecha_compra_anterior"] == "2026-03-01"
    assert row["ultima_exhibicion"] == "2026-05-18"


def test_composicion():
    comp = build_composicion_exhibicion_compradores({"E1", "E2", "E3"}, {"E2", "C1"})
    assert comp["ambos"] == 1
    assert comp["solo_exhibidos"] == 2
    assert comp["solo_compradores"] == 1
    assert comp["cobertura_exhibicion_pct"] == round(100 / 3, 1)
