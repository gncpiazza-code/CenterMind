"""Tests unitarios: dedup ranking/stats a nivel vendedor ERP."""
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts,
    aggregate_exhibicion_counts_vendor_scope,
    aggregate_ranking_by_vendor,
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
