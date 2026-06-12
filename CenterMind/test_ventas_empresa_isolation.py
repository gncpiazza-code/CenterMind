"""IdEmpresa isolation — parse, ingest filter, contamination detection."""
import pytest

from core.ventas_empresa_isolation import (
    filter_parsed_rows_for_tenant,
    is_contaminated_ventas_row,
)


def test_filter_keeps_matching_id_empresa():
    rows = [
        {"id_empresa": "3559", "nombre_empresa": "SILVINA RIBERO", "bultos_total": 1},
        {"id_empresa": "3154", "nombre_empresa": "Tabaco", "bultos_total": 9},
    ]
    kept, stats = filter_parsed_rows_for_tenant(rows, "beltrocco")
    assert stats["kept"] == 1
    assert stats["dropped"] == 1
    assert kept[0]["id_empresa"] == "3559"


def test_filter_drops_by_nombre_when_id_missing():
    row = {"id_empresa": "", "nombre_empresa": "Real Tabacalera de Santiago S.A."}
    assert is_contaminated_ventas_row(row, dist_id=11) is True


def test_filter_keeps_own_nombre_without_id():
    row = {"id_empresa": "", "nombre_empresa": "SILVINA RIBERO"}
    assert is_contaminated_ventas_row(row, dist_id=11) is False


def test_db_row_contamination_via_raw_json():
    row = {
        "id_distribuidor": 11,
        "raw_json": {"id_empresa": "3154", "nombre_empresa": "Tabaco"},
    }
    assert is_contaminated_ventas_row(row, dist_id=11) is True


def test_accept_would_reject_all_foreign(monkeypatch):
    """Simula archivo 100% ajeno al tenant."""
    from services import ventas_enriched_ingestion_service as svc

    rows = [{"id_empresa": "3154", "nombre_empresa": "Tabaco"}] * 5
    monkeypatch.setattr(svc, "parse_informe_ventas_enriched", lambda _b: rows)
    monkeypatch.setattr(svc, "_start_run", lambda _d: 1)

    with pytest.raises(ValueError, match="Informe sin filas del tenant"):
        svc.accept_enriched_upload("beltrocco", b"fake-xlsx")
