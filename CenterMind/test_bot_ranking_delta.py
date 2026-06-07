"""
Tests para bot_ranking_delta.ranking_with_deltas.

Verifica que los deltas se calculen correctamente sin tocar Supabase real.
"""
import sys
import pytest
from unittest.mock import MagicMock, patch

# Inyectar mocks de módulos que requieren Supabase real ANTES de importar nada de core
if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()
if "supabase" not in sys.modules:
    sys.modules["supabase"] = MagicMock()

# Importar el módulo aquí para que el patch lo encuentre correctamente
import core.bot_ranking_delta as _brd_module


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _make_row(iid: int, cliente: str, dia: str, estado: str = "Aprobado") -> dict:
    return {
        "id_exhibicion": f"{iid}_{cliente}_{dia}",
        "id_integrante": iid,
        "estado": estado,
        "timestamp_subida": f"{dia}T10:00:00",
        "id_cliente_pdv": cliente,
        "id_cliente": None,
        "cliente_sombra_codigo": None,
        "url_foto_drive": None,
        "telegram_msg_id": None,
        "telegram_chat_id": None,
    }


# Mapa integrante → nombre ERP
# Usar clientes distintos por vendedor para evitar "battle" en aggregate_ranking_by_vendor
# (la función deduplica por cliente+día a nivel global, no por vendedor)
IID_TO_ERP = {1: "JUAN PEREZ", 2: "MARIA GOMEZ", 3: "CARLOS RUIZ"}

# Filas del mes actual (incluye hoy: 2026-06-07)
# Clientes JUAN: J001, J002, J001_hoy → todos únicos → 3 puntos
# Clientes MARIA: M001, M002 → 2 puntos
# Clientes CARLOS: K001 → 1 punto
ROWS_NOW = [
    _make_row(1, "J001", "2026-06-01"),
    _make_row(1, "J002", "2026-06-02"),
    _make_row(1, "J001", "2026-06-07"),   # hoy — nueva visita a J001 → JUAN sube
    _make_row(2, "M001", "2026-06-01"),
    _make_row(2, "M002", "2026-06-02"),
    _make_row(3, "K001", "2026-06-01"),
]

# Filas hasta ayer (corte 00:00 AR de 2026-06-07)
# MARIA tenía 3 puntos (M001, M002, M003)
# JUAN tenía 2 puntos (J001, J002)
# CARLOS tenía 1 punto (K001)
# → MARIA #1, JUAN #2, CARLOS #3
# Con hoy: JUAN tiene 3 (J001_jun1, J002_jun2, J001_jun7) → sube de #2 a #1
ROWS_PREV = [
    _make_row(1, "J001", "2026-06-01"),
    _make_row(1, "J002", "2026-06-02"),
    _make_row(2, "M001", "2026-06-01"),
    _make_row(2, "M002", "2026-06-02"),
    _make_row(2, "M003", "2026-06-03"),   # MARIA tiene 3 puntos ayer
    _make_row(3, "K001", "2026-06-01"),
]


def _mock_fetch(rows_now, rows_prev):
    """Retorna un mock de _fetch_exhibiciones_rango que devuelve rows_now o rows_prev."""
    def _side_effect(sb, dist_id, since_iso, end_iso=None):
        if end_iso is None:
            return rows_now
        return rows_prev
    return _side_effect


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_delta_sube():
    """JUAN PEREZ cargó una exhibición hoy → debe tener delta=1 (subió)."""
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch(ROWS_NOW, ROWS_PREV)),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value=IID_TO_ERP),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset()),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    # JUAN PEREZ tiene 3 exhibiciones únicas (C001+C002 en junio + C001_hoy = 3)
    juan = next((r for r in result if r["vendedor"] == "JUAN PEREZ"), None)
    assert juan is not None, "JUAN PEREZ debe estar en el ranking"
    assert juan["delta"] == 1, f"JUAN PEREZ debería haber subido (delta=1), got delta={juan['delta']}"


def test_delta_igual():
    """CARLOS RUIZ sin cambios entre ayer y hoy → delta=0."""
    # Filas iguales en prev y now para CARLOS
    rows_estable_prev = [_make_row(3, "C001", "2026-06-01")]
    rows_estable_now  = [_make_row(3, "C001", "2026-06-01")]
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch(rows_estable_now, rows_estable_prev)),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value={3: "CARLOS RUIZ"}),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset()),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    carlos = next((r for r in result if r["vendedor"] == "CARLOS RUIZ"), None)
    assert carlos is not None, "CARLOS RUIZ debe estar en el ranking"
    assert carlos["delta"] == 0, f"CARLOS no debería haber cambiado (delta=0), got delta={carlos['delta']}"


def test_delta_nuevo():
    """Vendedor que no estaba en ranking_prev → delta=0 (nuevo)."""
    iid_to_erp = {**IID_TO_ERP, 4: "VENDEDOR NUEVO"}
    rows_now_extra = ROWS_NOW + [_make_row(4, "C010", "2026-06-07")]
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch(rows_now_extra, ROWS_PREV)),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value=iid_to_erp),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset()),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    nuevo = next((r for r in result if r["vendedor"] == "VENDEDOR NUEVO"), None)
    assert nuevo is not None, "VENDEDOR NUEVO debe estar en el ranking"
    assert nuevo["delta"] == 0, f"Vendedor nuevo debería tener delta=0, got delta={nuevo['delta']}"


def test_ranking_vacio():
    """Sin exhibiciones → lista vacía."""
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch([], [])),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value={}),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset()),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    assert result == []


def test_qa_ids_excluidos():
    """Integrantes de QA son excluidos del ranking."""
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch(ROWS_NOW, ROWS_PREV)),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value=IID_TO_ERP),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset({1, 2, 3})),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    assert result == [], "Todos los integrantes son QA → ranking vacío"


def test_dedup_vendor_scope():
    """Dos integrantes del mismo vendedor ERP no duplican puntos."""
    # iid 5 y 6 son ambos "MULTI VENDEDOR"
    iid_to_erp = {5: "MULTI VENDEDOR", 6: "MULTI VENDEDOR"}
    rows = [
        _make_row(5, "C001", "2026-06-01"),  # vendedor5, C001, día1
        _make_row(6, "C001", "2026-06-01"),  # vendedor6, mismo cliente y día → dedup
    ]
    sb_mock = MagicMock()

    with (
        patch.object(_brd_module, "_fetch_exhibiciones_rango", side_effect=_mock_fetch(rows, rows)),
        patch.object(_brd_module, "build_integrante_to_erp_name", return_value=iid_to_erp),
        patch.object(_brd_module, "build_qa_exhibicion_integrante_ids", return_value=frozenset()),
    ):
        result = _brd_module.ranking_with_deltas(sb_mock, dist_id=1)

    multi = next((r for r in result if r["vendedor"] == "MULTI VENDEDOR"), None)
    assert multi is not None
    assert multi["puntos"] == 1, (
        f"Dos integrantes mismo cliente+día deben contar como 1 punto, got {multi['puntos']}"
    )
