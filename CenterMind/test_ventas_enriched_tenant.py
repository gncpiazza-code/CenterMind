"""Aislamiento estricto ventas_enriched_v2 por tenant."""
from core.ventas_enriched_tenant import (
    apply_ventas_tenant_filters,
    build_ventas_read_context,
    filter_ventas_rows_for_tenant,
)


def test_standard_tenant_uses_own_table_and_tenant_id():
    ctx = build_ventas_read_context(4)
    assert ctx["request_dist"] == 4
    assert ctx["table_dist"] == 4
    assert ctx["filter_dist"] == 4
    assert ctx["table_name"] == "ventas_enriched_v2_d4"
    assert ctx["data_tenant_id"] == "aloma"
    assert ctx["is_franchise"] is False
    assert ctx["codigos"] is None


def test_franchise_scoped_to_real_and_codigos():
    rows = [{"id_vendedor_erp": "7702"}, {"id_vendedor_erp": "7715"}]
    ctx = build_ventas_read_context(7, rows)
    assert ctx["request_dist"] == 7
    assert ctx["table_dist"] == 2
    assert ctx["table_name"] == "ventas_enriched_v2_d2"
    assert ctx["data_tenant_id"] == "real"
    assert ctx["is_franchise"] is True
    assert set(ctx["codigos"]) == {"7702", "7715"}


def test_filter_keeps_rows_when_scope_cols_not_in_select():
    """Post-filter no debe vaciar filas si id_distribuidor/tenant_id no vienen en el SELECT."""
    ctx = build_ventas_read_context(4)
    rows = [
        {"codigo_vendedor": "1007", "bultos_total": 5},
        {"codigo_vendedor": "1006", "bultos_total": 2},
    ]
    out = filter_ventas_rows_for_tenant(rows, ctx)
    assert len(out) == 2


def test_filter_drops_wrong_tenant_id():
    ctx = build_ventas_read_context(4)
    rows = [
        {"id_distribuidor": 4, "tenant_id": "aloma", "codigo_vendedor": "1007", "bultos_total": 1},
        {"id_distribuidor": 4, "tenant_id": "liver", "codigo_vendedor": "1007", "bultos_total": 9},
        {"id_distribuidor": 5, "tenant_id": "liver", "codigo_vendedor": "1007", "bultos_total": 9},
    ]
    out = filter_ventas_rows_for_tenant(rows, ctx)
    assert len(out) == 1
    assert out[0]["bultos_total"] == 1


def test_filter_franchise_drops_other_vendor_codes():
    ctx = build_ventas_read_context(7, [{"id_vendedor_erp": "7702"}])
    rows = [
        {"id_distribuidor": 2, "tenant_id": "real", "codigo_vendedor": "7702", "bultos_total": 3},
        {"id_distribuidor": 2, "tenant_id": "real", "codigo_vendedor": "9999", "bultos_total": 50},
    ]
    out = filter_ventas_rows_for_tenant(rows, ctx)
    assert len(out) == 1
    assert out[0]["bultos_total"] == 3


class _FakeQuery:
    def __init__(self):
        self.filters: list[tuple] = []

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, vals))
        return self


def test_apply_filters_standard_includes_tenant_id():
    ctx = build_ventas_read_context(4)
    q = apply_ventas_tenant_filters(_FakeQuery(), ctx)
    assert ("eq", "id_distribuidor", 4) in q.filters
    assert ("eq", "tenant_id", "aloma") in q.filters
