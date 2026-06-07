# -*- coding: utf-8 -*-
from unittest.mock import MagicMock, patch

from services.bot_cartera_pdf_service import _norm_dia, build_cartera_pdf


def test_norm_dia_accent_insensitive():
    assert _norm_dia("Miércoles") == _norm_dia("miercoles")


def test_build_cartera_pdf_rutas_sin_id_distribuidor():
    """rutas_v2_d* no debe filtrarse por id_distribuidor (columna inexistente)."""
    sb = MagicMock()
    rutas_calls: list[str] = []

    def _table_side_effect(table_name):
        tbl = MagicMock()
        q = tbl
        q.select.return_value = q
        q.eq.return_value = q
        q.in_.return_value = q
        q.range.return_value = q
        if "rutas_v2" in (table_name or ""):
            def _eq(col, val):
                rutas_calls.append(f"{col}={val}")
                return q
            q.eq = _eq
            q.execute.return_value.data = [{"id_ruta": 10, "dia_semana": "Lunes"}]
        elif "clientes_pdv_v2" in (table_name or ""):
            q.execute.return_value.data = [
                {
                    "id_ruta": 10,
                    "id_cliente_erp": "1",
                    "nombre_razon_social": "TEST",
                    "nombre_fantasia": "",
                    "fecha_ultima_compra": "2026-06-01",
                    "activo": True,
                }
            ]
        else:
            q.execute.return_value.data = []
        return tbl

    sb.table.side_effect = _table_side_effect

    with patch("services.bot_cartera_pdf_service.resolve_snapshot_label", return_value="Snapshot test"), patch(
        "services.bot_cartera_pdf_service._build_pdf", return_value=b"%PDF"
    ):
        pdf_bytes, _ = build_cartera_pdf(sb, dist_id=3, id_vendedor=42, mode="general")

    assert pdf_bytes == b"%PDF"
    assert not any("id_distribuidor" in c for c in rutas_calls)
    assert any("id_vendedor=42" in c for c in rutas_calls)
