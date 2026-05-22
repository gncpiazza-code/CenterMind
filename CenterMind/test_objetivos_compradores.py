# -*- coding: utf-8 -*-
"""
test_objetivos_compradores.py
==============================
Tests de regresión para el módulo core/objetivos_compradores.py.

Escenarios clave:
1. Mismo PDV con dos ventas en período → cuenta como 1 comprador.
2. Fallback padrón (sin ventas_enriched) funciona.
3. Retroactividad compañía: desde día 1 del mes_referencia.
4. Tipo activación no afectado (no importa lo que haga compradores).
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest


# ──────────────────────────────────────────────────────────────────────────────
# Helpers de fixtures
# ──────────────────────────────────────────────────────────────────────────────

def _make_ventas_row(erp: str, fecha: str, importe: float = 100.0) -> dict:
    return {"id_cliente_erp": erp, "fecha_factura": fecha, "importe_final": importe}


def _make_client_row(id_cliente: int, erp: str, fuc: str | None = None) -> dict:
    return {"id_cliente": id_cliente, "id_cliente_erp": erp, "fecha_ultima_compra": fuc}


def _mock_sb_for_ventas(ventas_rows: list[dict]):
    """Mock de sb.table().select()...execute() que retorna ventas_rows."""
    mock_sb = MagicMock()
    mock_execute = MagicMock()
    mock_execute.data = ventas_rows
    # Primera página devuelve todas las filas; páginas siguientes, nada.
    call_count = {"n": 0}

    def fake_execute():
        call_count["n"] += 1
        if call_count["n"] == 1:
            mock_execute.data = ventas_rows
        else:
            mock_execute.data = []
        return mock_execute

    chain = MagicMock()
    chain.execute = fake_execute
    chain.select = MagicMock(return_value=chain)
    chain.eq = MagicMock(return_value=chain)
    chain.gte = MagicMock(return_value=chain)
    chain.lte = MagicMock(return_value=chain)
    chain.range = MagicMock(return_value=chain)
    mock_sb.table = MagicMock(return_value=chain)
    return mock_sb


# ──────────────────────────────────────────────────────────────────────────────
# Tests para compradores_en_periodo_for_clients
# ──────────────────────────────────────────────────────────────────────────────

class TestCompradoresEnPeriodoForClients:
    """Prueba la función core con client_by_id explícito."""

    def _run(self, dist_id, client_by_id, desde, hasta, ventas_rows):
        mock_sb = _mock_sb_for_ventas(ventas_rows)
        with (
            patch("core.objetivos_compradores.sb", mock_sb),
            patch("core.objetivos_compradores.tenant_table_name", return_value="ventas_enriched_v2_d1"),
        ):
            from core.objetivos_compradores import compradores_en_periodo_for_clients
            return compradores_en_periodo_for_clients(dist_id, client_by_id, desde, hasta)

    def test_mismo_pdv_dos_ventas_cuenta_uno(self):
        """Mismo ERP con dos facturas en el período → 1 comprador."""
        client_by_id = {1: _make_client_row(1, "ABC")}
        ventas = [
            _make_ventas_row("ABC", "2026-05-05"),
            _make_ventas_row("ABC", "2026-05-15"),
        ]
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == {1}, f"Esperado {{1}}, got {result}"

    def test_dos_pdvs_distintos_cuentan_dos(self):
        client_by_id = {
            1: _make_client_row(1, "ABC"),
            2: _make_client_row(2, "XYZ"),
        }
        ventas = [
            _make_ventas_row("ABC", "2026-05-05"),
            _make_ventas_row("XYZ", "2026-05-10"),
        ]
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == {1, 2}

    def test_venta_fuera_de_periodo_no_cuenta(self):
        client_by_id = {1: _make_client_row(1, "ABC")}
        ventas = [_make_ventas_row("ABC", "2026-04-30")]  # fuera del período
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == set()

    def test_importe_negativo_no_cuenta(self):
        client_by_id = {1: _make_client_row(1, "ABC")}
        ventas = [_make_ventas_row("ABC", "2026-05-10", importe=-50.0)]
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == set()

    def test_fallback_padron_sin_ventas(self):
        """Sin ventas_enriched (vacío), usa fecha_ultima_compra del padrón."""
        client_by_id = {1: _make_client_row(1, "ABC", fuc="2026-05-10")}
        ventas: list = []
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == {1}

    def test_fallback_padron_fuera_periodo_no_cuenta(self):
        client_by_id = {1: _make_client_row(1, "ABC", fuc="2026-04-15")}
        ventas: list = []
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == set()

    def test_client_by_id_vacio_retorna_set_vacio(self):
        result = self._run(1, {}, "2026-05-01", "2026-05-31", [])
        assert result == set()


# ──────────────────────────────────────────────────────────────────────────────
# Tests para periodo_desde_hasta_objetivo
# ──────────────────────────────────────────────────────────────────────────────

class TestPeriodoDesdeHastaObjetivo:

    def _run(self, obj: dict):
        from core.objetivos_compradores import periodo_desde_hasta_objetivo
        return periodo_desde_hasta_objetivo(obj)

    def test_compania_retro_dia_1_del_mes(self):
        obj = {
            "origen": "compania",
            "mes_referencia": "2026-05-15",
            "created_at": "2026-05-15T12:00:00",
        }
        desde, hasta = self._run(obj)
        assert desde == "2026-05-01", f"desde={desde}"
        assert hasta == "2026-05-31", f"hasta={hasta}"

    def test_compania_usa_mes_referencia_no_created_at(self):
        obj = {
            "origen": "compania",
            "mes_referencia": "2026-04-01",
            "created_at": "2026-05-01T00:00:00",
        }
        desde, hasta = self._run(obj)
        assert desde == "2026-04-01"
        assert hasta == "2026-04-30"

    def test_distribuidora_usa_created_at_como_desde(self):
        obj = {
            "origen": "distribuidora",
            "created_at": "2026-05-10T00:00:00",
            "fecha_objetivo": "2026-05-31",
        }
        desde, hasta = self._run(obj)
        assert desde == "2026-05-10"
        assert hasta == "2026-05-31"

    def test_distribuidora_sin_fecha_objetivo_usa_hoy(self):
        obj = {
            "origen": "distribuidora",
            "created_at": "2026-05-01T00:00:00",
            "fecha_objetivo": None,
        }
        desde, hasta = self._run(obj)
        assert desde == "2026-05-01"
        assert hasta == date.today().isoformat()


# ──────────────────────────────────────────────────────────────────────────────
# Test de regresión: activación no afectada
# ──────────────────────────────────────────────────────────────────────────────

def test_activacion_sin_impacto():
    """
    Asegurar que el módulo objetivos_compradores no toca ni importa
    nada de la lógica de activación (_diff_activacion / conversion_estado).
    """
    import core.objetivos_compradores as mod
    source = open(mod.__file__).read()
    assert "conversion_estado" not in source, "El módulo compradores no debe referenciar conversion_estado"
    assert "_diff_activacion" not in source, "El módulo compradores no debe referenciar _diff_activacion"
    assert "thirty_days" not in source, "El módulo compradores no debe tener lógica de 30 días de inactividad"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
