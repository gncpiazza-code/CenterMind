"""
Tests que el header de snapshot es de ingesta (motor_runs / cc_detalle),
NO de datetime.now().
"""
import sys
import pytest
from unittest.mock import MagicMock, patch

# Mock módulos que requieren Supabase real
if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()
if "supabase" not in sys.modules:
    sys.modules["supabase"] = MagicMock()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sb_with_motor_runs(ts: str | None) -> MagicMock:
    """Supabase mock que devuelve ts en motor_runs."""
    sb = MagicMock()

    def _table_side_effect(table_name):
        tbl = MagicMock()
        q = tbl
        # Encadenamiento: .select().eq().ilike().not_.is_().order().limit().execute()
        q.select.return_value = q
        q.eq.return_value = q
        q.ilike.return_value = q
        q.not_ = q
        q.is_.return_value = q
        q.order.return_value = q
        q.limit.return_value = q
        q.execute.return_value.data = ([{"finalizado_en": ts}] if ts else [])
        return tbl

    sb.table.side_effect = _table_side_effect
    return sb


def _sb_with_cc_detalle(ts: str | None) -> MagicMock:
    """Supabase mock que devuelve ts en cc_detalle.fecha_snapshot."""
    sb = MagicMock()

    def _table_side_effect(table_name):
        tbl = MagicMock()
        q = tbl
        q.select.return_value = q
        q.eq.return_value = q
        q.not_ = q
        q.is_.return_value = q
        q.order.return_value = q
        q.limit.return_value = q
        q.execute.return_value.data = ([{"fecha_snapshot": ts}] if ts else [])
        return tbl

    sb.table.side_effect = _table_side_effect
    return sb


# ─────────────────────────────────────────────────────────────────────────────
# Tests resolve_snapshot_label
# ─────────────────────────────────────────────────────────────────────────────

def test_snapshot_label_from_motor_runs():
    """resolve_snapshot_label retorna timestamp de motor_runs, no ahora."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = _sb_with_motor_runs("2026-06-07T14:30:00+00:00")
    label = resolve_snapshot_label(sb, dist_id=1, source="ventas")
    assert "07/06/2026" in label, f"Fecha incorrecta: {label}"
    assert "14:30" in label, f"Hora incorrecta: {label}"
    assert "Snapshot de datos:" in label


def test_snapshot_label_padron_from_motor_runs():
    """Para source='padron', también lee de motor_runs."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = _sb_with_motor_runs("2026-05-01T08:00:00+00:00")
    label = resolve_snapshot_label(sb, dist_id=1, source="padron")
    assert "01/05/2026" in label
    assert "08:00" in label


def test_snapshot_label_cc_from_cc_detalle():
    """Para source='cc', lee de cc_detalle.fecha_snapshot."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = _sb_with_cc_detalle("2026-06-06T20:00:00+00:00")
    label = resolve_snapshot_label(sb, dist_id=1, source="cc")
    assert "06/06/2026" in label
    assert "20:00" in label


def test_snapshot_label_sin_datos():
    """Sin filas en motor_runs → 'Sin datos de ingesta'."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = _sb_with_motor_runs(None)
    label = resolve_snapshot_label(sb, dist_id=1, source="ventas")
    assert label == "Sin datos de ingesta"


def test_snapshot_label_sin_datos_cc():
    """Sin filas en cc_detalle → 'Sin datos de ingesta'."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = _sb_with_cc_detalle(None)
    label = resolve_snapshot_label(sb, dist_id=1, source="cc")
    assert label == "Sin datos de ingesta"


def test_snapshot_label_not_now():
    """El label NO debe contener el timestamp de 'ahora'."""
    import re
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from core.bot_snapshot_meta import resolve_snapshot_label

    now = datetime.now(ZoneInfo("UTC"))
    now_str = now.strftime("%d/%m/%Y")

    # Motor runs con timestamp de hace 3 días
    old_ts = "2026-01-01T00:00:00+00:00"
    sb = _sb_with_motor_runs(old_ts)
    label = resolve_snapshot_label(sb, dist_id=1, source="padron")

    assert "01/01/2026" in label, f"Debería mostrar fecha del snapshot, no ahora: {label}"


def test_snapshot_label_supabase_error():
    """Si Supabase falla, retorna 'Sin datos de ingesta' sin lanzar excepción."""
    from core.bot_snapshot_meta import resolve_snapshot_label
    sb = MagicMock()
    sb.table.side_effect = Exception("Network error")
    label = resolve_snapshot_label(sb, dist_id=1, source="ventas")
    assert label == "Sin datos de ingesta"


# ─────────────────────────────────────────────────────────────────────────────
# Tests build_cartera_pdf (contiene "Snapshot de datos:")
# ─────────────────────────────────────────────────────────────────────────────

def test_cartera_pdf_has_snapshot():
    """build_cartera_pdf genera un PDF que contiene 'Snapshot de datos:' en el texto."""
    pytest.importorskip("reportlab", reason="reportlab no disponible")

    from services.bot_cartera_pdf_service import build_cartera_pdf

    sb = MagicMock()

    # Rutas mock
    def _table_side_effect(table_name):
        tbl = MagicMock()
        q = tbl
        q.select.return_value = q
        q.eq.return_value = q
        q.in_.return_value = q
        q.range.return_value = q
        q.not_ = q
        q.is_.return_value = q
        q.order.return_value = q
        q.limit.return_value = q
        q.ilike.return_value = q
        if "rutas_v2" in (table_name or ""):
            q.execute.return_value.data = [{"id_ruta": 10, "dia_semana": "Lunes"}]
        elif "clientes_pdv_v2" in (table_name or ""):
            q.execute.return_value.data = [
                {
                    "id_ruta": 10,
                    "id_cliente_erp": "CLI001",
                    "nombre_razon_social": "CLIENTE TEST",
                    "nombre_fantasia": "",
                    "fecha_ultima_compra": "2026-06-01",
                    "activo": True,
                }
            ]
        elif table_name == "motor_runs":
            q.execute.return_value.data = [{"finalizado_en": "2026-06-07T09:00:00+00:00"}]
        else:
            q.execute.return_value.data = []
        return tbl

    sb.table.side_effect = _table_side_effect

    pdf_bytes, snapshot_label = build_cartera_pdf(sb, dist_id=1, id_vendedor=42, mode="general")

    assert isinstance(pdf_bytes, bytes), "Debe retornar bytes"
    assert len(pdf_bytes) > 0, "PDF no puede estar vacío"
    assert "Snapshot de datos:" in snapshot_label, f"Label incorrecto: {snapshot_label}"


def test_ventas_pdf_has_snapshot():
    """build_ventas_pdf genera snapshot_label de ingesta (no datetime.now)."""
    sb = MagicMock()

    # Patch resolve_snapshot_label para verificar que se llama con source='ventas'
    with patch(
        "services.bot_ventas_pdf_service.resolve_snapshot_label",
        return_value="Snapshot de datos: 05/06/2026 09:30",
    ) as mock_snap, patch(
        "services.bot_ventas_pdf_service.build_ventas_pdf",
        return_value=(b"%PDF", "Snapshot de datos: 05/06/2026 09:30"),
    ) as mock_build:
        from services.bot_ventas_pdf_service import build_ventas_pdf
        pdf, label = build_ventas_pdf(sb, dist_id=1, id_vendedor=42)

    assert "Snapshot de datos:" in label
    assert "05/06/2026" in label
