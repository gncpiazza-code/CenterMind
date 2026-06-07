# -*- coding: utf-8 -*-
from datetime import date
from unittest.mock import MagicMock, patch

from services.bot_cartera_pdf_service import (
    _es_proximo_a_caer,
    _format_fecha_compra_label,
    _norm_dia,
    _pdv_display_name,
    _sort_rutas_semana,
    build_cartera_pdf,
)


def test_norm_dia_accent_insensitive():
    assert _norm_dia("Miércoles") == _norm_dia("miercoles")


def test_sort_rutas_semana_lunes_a_sabado():
    rutas = [
        {"id_ruta": 3, "dia_semana": "Viernes"},
        {"id_ruta": 1, "dia_semana": "Lunes"},
        {"id_ruta": 2, "dia_semana": "Miércoles"},
    ]
    ordered = _sort_rutas_semana(rutas)
    assert [r["dia_semana"] for r in ordered] == ["Lunes", "Miércoles", "Viernes"]


def test_pdv_display_name_fantasia_y_razon():
    pdv = {
        "nombre_fantasia": "Kiosco Central",
        "nombre_razon_social": "DISTRIBUIDORA XYZ SA",
    }
    assert _pdv_display_name(pdv) == "Kiosco Central — DISTRIBUIDORA XYZ SA"


def test_pdv_display_name_solo_razon():
    pdv = {"nombre_fantasia": "", "nombre_razon_social": "SOLO RAZON SA"}
    assert _pdv_display_name(pdv) == "SOLO RAZON SA"


def test_format_fecha_compra_activo():
    ref = date(2026, 6, 7)
    txt = _format_fecha_compra_label("2026-05-26", ref=ref, es_activo=True, es_proximo_caer=False)
    assert txt == "26/05/2026 (Hace 12 días)"


def test_format_fecha_compra_por_caer():
    ref = date(2026, 6, 7)
    # 30 días sin compra → activo hoy, inactivo mañana
    txt = _format_fecha_compra_label("2026-05-08", ref=ref, es_activo=True, es_proximo_caer=True)
    assert txt == "08/05/2026 (Hace 30 días — por caer mañana)"


def test_es_proximo_a_caer_solo_activos_en_ventana_10d():
    ref = date(2026, 6, 7)
    fuc_activo_lejos = date(2026, 5, 20)  # 18 días → cae en 13
    fuc_por_caer = date(2026, 5, 8)       # 30 días → cae en 1
    fuc_inactivo = date(2026, 5, 1)       # 37 días → ya inactivo

    assert _es_proximo_a_caer(fuc_por_caer, ref, True) is True
    assert _es_proximo_a_caer(fuc_activo_lejos, ref, True) is False
    assert _es_proximo_a_caer(fuc_inactivo, ref, False) is False


def test_format_fecha_compra_sin_registro():
    ref = date(2026, 6, 7)
    assert _format_fecha_compra_label(None, ref=ref, es_activo=False, es_proximo_caer=False) == "Sin compra registrada"


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
                    "nombre_razon_social": "TEST SA",
                    "nombre_fantasia": "Kiosco Test",
                    "fecha_ultima_compra": "2026-06-01",
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
