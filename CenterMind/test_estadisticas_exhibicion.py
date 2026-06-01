"""
Tests del invariante vendor-scope en el contexto de estadísticas de vendedor.

Invariante central: dos integrantes del mismo vendedor ERP visitando el mismo
cliente en el mismo día = 1 exhibición lógica, no 2.
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(__file__))

from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    EXHIBICION_ROW_COLS,
)


def make_row(id_int, cliente_pdv, timestamp, estado="Aprobado"):
    """Factoría de filas con los campos mínimos requeridos."""
    return {
        "id_exhibicion": f"ex_{id_int}_{cliente_pdv}_{timestamp[:10]}",
        "id_integrante": id_int,
        "estado": estado,
        "timestamp_subida": timestamp,
        "id_cliente_pdv": cliente_pdv,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": None,
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    }


# ---------------------------------------------------------------------------
# Invariante core: vendor-scope no duplica por integrante
# ---------------------------------------------------------------------------

def test_dos_integrantes_mismo_cliente_mismo_dia_un_punto():
    """
    Core invariant: dos integrantes (mismo vendedor ERP) que visitan el
    mismo cliente el mismo día → 1 exhibición lógica.
    """
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00"),
        make_row(id_int=102, cliente_pdv="CLI_A", timestamp="2026-05-10T14:00:00"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1, f"Esperado 1, got {counts['total_logicas']}"


def test_mismo_integrante_dos_clientes_dos_puntos():
    """Dos clientes distintos el mismo día = 2 visitas lógicas."""
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00"),
        make_row(id_int=101, cliente_pdv="CLI_B", timestamp="2026-05-10T11:00:00"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 2


def test_mismo_cliente_dos_dias_diferentes():
    """Mismo cliente, días distintos → 2 visitas lógicas."""
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00"),
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-11T10:00:00"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 2


# ---------------------------------------------------------------------------
# Selección del mejor estado
# ---------------------------------------------------------------------------

def test_gana_mejor_estado_destacado_sobre_rechazado():
    """
    Dos integrantes, mismo cliente, mismo día:
    uno Rechazado y otro Destacado → gana Destacado, 1 lógica.
    """
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00",
                 estado="Rechazado"),
        make_row(id_int=102, cliente_pdv="CLI_A", timestamp="2026-05-10T14:00:00",
                 estado="Destacado"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1
    assert counts["destacadas"] == 1
    assert counts["rechazadas"] == 0


def test_gana_mejor_estado_aprobado_sobre_pendiente():
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T08:00:00",
                 estado="Pendiente"),
        make_row(id_int=102, cliente_pdv="CLI_A", timestamp="2026-05-10T09:00:00",
                 estado="Aprobado"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1
    assert counts["aprobadas"] == 1
    assert counts["pendientes"] == 0


def test_tres_fotos_mismo_cliente_mismo_dia_un_punto():
    """Tres fotos del mismo cliente el mismo día = 1 lógica; gana Destacado."""
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00",
                 estado="Rechazado"),
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T11:00:00",
                 estado="Aprobado"),
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T12:00:00",
                 estado="Destacado"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1
    assert counts["destacadas"] == 1


# ---------------------------------------------------------------------------
# Escenarios compuestos (simulación de build_carta_resumen)
# ---------------------------------------------------------------------------

def test_carta_vendor_scope_no_duplica():
    """
    Tres integrantes del mismo vendedor:
    - int 101 y 102 visitan CLI_A el mismo día
    - int 103 visita CLI_B el mismo día
    → 2 visitas lógicas (CLI_A + CLI_B)
    """
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00"),
        make_row(id_int=102, cliente_pdv="CLI_A", timestamp="2026-05-10T12:00:00"),
        make_row(id_int=103, cliente_pdv="CLI_B", timestamp="2026-05-10T11:00:00"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 2, (
        f"Esperado 2 (CLI_A + CLI_B), got {counts['total_logicas']}"
    )


def test_multiples_integrantes_multiples_clientes():
    """
    4 integrantes, 3 clientes distintos, algunos comparten cliente+día:
    - CLI_A: int 1 y int 2 mismo día → 1 lógica
    - CLI_B: int 1 y int 3 mismo día → 1 lógica
    - CLI_C: int 4 único → 1 lógica
    Total: 3 lógicas
    """
    rows = [
        make_row(id_int=1, cliente_pdv="CLI_A", timestamp="2026-05-10T09:00:00"),
        make_row(id_int=2, cliente_pdv="CLI_A", timestamp="2026-05-10T13:00:00"),
        make_row(id_int=1, cliente_pdv="CLI_B", timestamp="2026-05-10T10:00:00"),
        make_row(id_int=3, cliente_pdv="CLI_B", timestamp="2026-05-10T11:00:00"),
        make_row(id_int=4, cliente_pdv="CLI_C", timestamp="2026-05-10T14:00:00"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 3


def test_mismo_cliente_multiples_dias_cuenta_por_dia():
    """CLI_A visitado 5 días distintos = 5 visitas lógicas."""
    rows = [
        make_row(id_int=101, cliente_pdv="CLI_A", timestamp=f"2026-05-{d:02d}T10:00:00")
        for d in range(1, 6)
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 5


# ---------------------------------------------------------------------------
# Conteos por estado
# ---------------------------------------------------------------------------

def test_conteos_estados_separados():
    rows = [
        make_row(id_int=1, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00",
                 estado="Aprobado"),
        make_row(id_int=1, cliente_pdv="CLI_B", timestamp="2026-05-10T10:00:00",
                 estado="Destacado"),
        make_row(id_int=1, cliente_pdv="CLI_C", timestamp="2026-05-10T10:00:00",
                 estado="Rechazado"),
        make_row(id_int=1, cliente_pdv="CLI_D", timestamp="2026-05-10T10:00:00",
                 estado="Pendiente"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 4
    assert counts["aprobadas"] == 1
    assert counts["destacadas"] == 1
    assert counts["rechazadas"] == 1
    assert counts["pendientes"] == 1


def test_puntos_aprobada_mas_1_destacada_mas_2():
    rows = [
        make_row(id_int=1, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00",
                 estado="Aprobado"),    # +1 punto
        make_row(id_int=1, cliente_pdv="CLI_B", timestamp="2026-05-10T10:00:00",
                 estado="Destacado"),   # +2 puntos
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["puntos"] == 3


def test_rechazada_y_pendiente_no_suman_puntos():
    rows = [
        make_row(id_int=1, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00",
                 estado="Rechazado"),
        make_row(id_int=1, cliente_pdv="CLI_B", timestamp="2026-05-10T10:00:00",
                 estado="Pendiente"),
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["puntos"] == 0
    assert counts["total_logicas"] == 2


# ---------------------------------------------------------------------------
# Casos borde
# ---------------------------------------------------------------------------

def test_lista_vacia():
    counts = aggregate_exhibicion_counts_vendor_scope([])
    assert counts["total_logicas"] == 0
    assert counts["puntos"] == 0


def test_una_sola_fila():
    rows = [make_row(id_int=1, cliente_pdv="CLI_A", timestamp="2026-05-10T10:00:00")]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1


def test_cliente_clave_via_id_cliente_fallback():
    """Cuando id_cliente_pdv es None, usa id_cliente como client_key."""
    rows = [
        {
            "id_exhibicion": "ex_1",
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T10:00:00",
            "id_cliente_pdv": None,
            "id_cliente": 999,
            "cliente_sombra_codigo": None,
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        },
        {
            "id_exhibicion": "ex_2",
            "id_integrante": 2,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T14:00:00",
            "id_cliente_pdv": None,
            "id_cliente": 999,  # misma clave
            "cliente_sombra_codigo": None,
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        },
    ]
    counts = aggregate_exhibicion_counts_vendor_scope(rows)
    assert counts["total_logicas"] == 1


def test_count_pdvs_exhibidos_mapea_id_cliente_pdv():
    from core.exhibicion_aggregate import (
        build_client_key_to_erp_map,
        count_exhibited_clientes_in_cartera,
    )

    pdv_rows = [{"id_cliente_erp": "11413", "id_cliente": 55201}]
    key_map = build_client_key_to_erp_map(pdv_rows)
    ex_rows = [make_row(1, 55201, "2026-05-10T10:00:00")]
    assert count_exhibited_clientes_in_cartera(ex_rows, key_map, {"11413"}) == 1
    assert count_exhibited_clientes_in_cartera(ex_rows, key_map, {"99999"}) == 0


def test_count_pdvs_exhibidos_mapea_sombra_con_ceros():
    from core.exhibicion_aggregate import (
        build_client_key_to_erp_map,
        count_exhibited_clientes_in_cartera,
    )

    pdv_rows = [{"id_cliente_erp": "11413", "cliente_sombra_codigo": "011413"}]
    key_map = build_client_key_to_erp_map(pdv_rows)
    ex_rows = [
        {
            "id_exhibicion": "ex_sombra",
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T10:00:00",
            "id_cliente_pdv": None,
            "id_cliente": None,
            "cliente_sombra_codigo": "11413",
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        }
    ]
    assert count_exhibited_clientes_in_cartera(ex_rows, key_map, {"11413"}) == 1


def test_count_pdvs_exhibidos_fallback_campo_si_id_cliente_pdv_stale():
    from core.exhibicion_aggregate import (
        build_client_key_to_erp_map,
        count_exhibited_clientes_in_cartera,
    )

    pdv_rows = [{"id_cliente_erp": "11413", "id_cliente": 55201, "cliente_sombra_codigo": "011413"}]
    key_map = build_client_key_to_erp_map(pdv_rows)
    ex_rows = [
        {
            "id_exhibicion": "ex_stale_pdv",
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T10:00:00",
            "id_cliente_pdv": 99999999,
            "id_cliente": None,
            "cliente_sombra_codigo": "011413",
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        }
    ]
    assert count_exhibited_clientes_in_cartera(ex_rows, key_map, {"11413"}) == 1


def test_exhibiciones_por_vendedor_cuenta_pdvs_exhibidos_con_id_cliente_pdv():
    from core.exhibicion_aggregate import build_client_key_to_erp_map
    from services.estadisticas_service import _exhibiciones_por_vendedor

    pdv_rows = [{"id_cliente_erp": "11413", "id_cliente": 55201, "id_cliente_pdv": 55201}]
    key_map = build_client_key_to_erp_map(pdv_rows)
    iid_to_erp = {1: "IVAN SOTO"}
    erp_to_vid = {"IVAN SOTO": 10}
    pdvs_by_vend = {10: {"11413"}}
    ex_rows = [
        {
            "id_exhibicion": "ex1",
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T10:00:00",
            "id_cliente_pdv": 55201,
            "id_cliente": None,
            "cliente_sombra_codigo": None,
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        },
        {
            "id_exhibicion": "ex2",
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-11T10:00:00",
            "id_cliente_pdv": 55201,
            "id_cliente": None,
            "cliente_sombra_codigo": None,
            "url_foto_drive": None,
            "telegram_msg_id": None,
            "telegram_chat_id": None,
        },
    ]
    logicas, unique = _exhibiciones_por_vendedor(
        ex_rows, iid_to_erp, erp_to_vid, key_map, pdvs_by_vend
    )
    assert logicas[10] == 2
    assert unique[10] == 1
