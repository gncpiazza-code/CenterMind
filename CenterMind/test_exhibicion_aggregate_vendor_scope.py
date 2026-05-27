"""Tests unitarios: dedup ranking/stats a nivel vendedor ERP."""
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts,
    aggregate_exhibicion_counts_vendor_scope,
    aggregate_ranking_by_vendor,
    count_active_vendors,
    integrante_ids_for_erp_vendors,
)


def test_integrante_ids_for_erp_vendors_expands_same_name():
    iid_to_erp = {1: "VENDEDOR A", 2: "VENDEDOR A", 3: "OTRO"}
    assert integrante_ids_for_erp_vendors([1], iid_to_erp) == [1, 2]


def test_ranking_dedup_vendor_scope_not_per_integrante():
    rows = [
        {
            "id_integrante": 1,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T12:00:00-03:00",
            "id_cliente_pdv": 100,
        },
        {
            "id_integrante": 2,
            "estado": "Aprobado",
            "timestamp_subida": "2026-05-10T15:00:00-03:00",
            "id_cliente_pdv": 100,
        },
    ]
    iid_to_erp = {1: "VENDEDOR A", 2: "VENDEDOR A"}
    per_iid = aggregate_exhibicion_counts(rows)
    vendor = aggregate_exhibicion_counts_vendor_scope(rows)
    ranking = aggregate_ranking_by_vendor(rows, iid_to_erp)
    assert per_iid["puntos"] == 2
    assert vendor["puntos"] == 1
    assert ranking["VENDEDOR A"]["puntos"] == 1


def test_count_active_vendors_same_client_day_counts_once():
    """Mismo cliente + mismo día + 3 fotos del mismo vendedor ERP → 1 vendedor activo."""
    rows = [
        {"id_integrante": 1, "estado": "Aprobado",  "timestamp_subida": "2026-05-10T10:00:00", "id_cliente_pdv": 100},
        {"id_integrante": 1, "estado": "Destacado", "timestamp_subida": "2026-05-10T12:00:00", "id_cliente_pdv": 100},
        {"id_integrante": 2, "estado": "Aprobado",  "timestamp_subida": "2026-05-10T14:00:00", "id_cliente_pdv": 100},
    ]
    iid_to_erp = {1: "VENDEDOR A", 2: "VENDEDOR A"}
    assert count_active_vendors(rows, iid_to_erp) == 1


def test_count_active_vendors_two_vendors():
    """Dos vendedores ERP distintos → 2 activos."""
    rows = [
        {"id_integrante": 1, "estado": "Aprobado", "timestamp_subida": "2026-05-10T10:00:00", "id_cliente_pdv": 100},
        {"id_integrante": 2, "estado": "Aprobado", "timestamp_subida": "2026-05-10T10:00:00", "id_cliente_pdv": 200},
    ]
    iid_to_erp = {1: "VENDEDOR A", 2: "VENDEDOR B"}
    assert count_active_vendors(rows, iid_to_erp) == 2


def test_count_active_vendors_rechazado_counts():
    """Un vendedor con solo rechazos igual cuenta como activo."""
    rows = [
        {"id_integrante": 1, "estado": "Rechazado", "timestamp_subida": "2026-05-10T10:00:00", "id_cliente_pdv": 100},
    ]
    iid_to_erp = {1: "VENDEDOR A"}
    assert count_active_vendors(rows, iid_to_erp) == 1


def test_count_active_vendors_empty():
    """Sin filas → 0."""
    assert count_active_vendors([], {}) == 0
