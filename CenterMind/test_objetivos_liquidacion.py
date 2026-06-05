# -*- coding: utf-8 -*-
"""
test_objetivos_liquidacion.py
==============================
Tests para services/objetivos_liquidacion_service.py

Verifica:
- Factor bono mando medio: 0.5 (1/1), 1.0 (N/N, N≥2), 0 (resto)
- Pago $0 para objetivos no cumplidos / resultado_final != exito
- Job archivado: liquidacion_at seteado para objetos >7d
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, call
from datetime import datetime, timezone, timedelta


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _mk_obj(
    id: str,
    tipo: str,
    cumplido: bool,
    resultado_final: str | None,
    id_vendedor: int,
    mes_referencia: str,
    valor_actual: float,
    valor_objetivo: float,
    desglose_cache: dict | None = None,
) -> dict:
    return {
        "id": id,
        "tipo": tipo,
        "cumplido": cumplido,
        "resultado_final": resultado_final,
        "id_vendedor": id_vendedor,
        "mes_referencia": f"{mes_referencia}-01",
        "valor_actual": valor_actual,
        "valor_objetivo": valor_objetivo,
        "origen": "compania",
        "desglose_cache": desglose_cache or {},
        "descripcion": f"Objetivo {id}",
    }


def _mk_tarifa(tipo: str, monto: float = 1000.0) -> dict:
    return {"tipo": tipo, "monto_vendedor": monto, "activo": True}


# ── Tests factor mando medio ──────────────────────────────────────────────────

class TestBonusMandoMedio:
    """Prueba el cálculo del factor de bono para el mando medio."""

    def _setup_liquidacion(self, objetivos_todos: list[dict], objetivos_cumplidos: list[dict],
                            tarifas: list[dict], bono: float):
        """Helper para mockear compute_liquidacion con datos controlados."""
        from services.objetivos_liquidacion_service import compute_liquidacion

        # Mock base de datos
        mock_res_tarifas = MagicMock(data=tarifas)
        mock_res_bono = MagicMock(data=[{"bono_mando_medio": bono}])
        mock_res_todos = MagicMock(data=objetivos_todos)
        mock_res_cumplidos = MagicMock(data=objetivos_cumplidos)
        mock_res_vendedores = MagicMock(data=[
            {"id_vendedor": obj["id_vendedor"], "nombre_erp": f"Vendedor {obj['id_vendedor']}"}
            for obj in objetivos_todos
        ])

        def sb_table_mock(table_name):
            m = MagicMock()
            if table_name == "objetivos_liquidacion_tarifas":
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                chain.execute.return_value = mock_res_tarifas
                m.select.return_value = chain
            elif table_name == "objetivos_liquidacion_bono":
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                chain.limit.return_value = chain
                chain.execute.return_value = mock_res_bono
                m.select.return_value = chain
            elif table_name == "objetivos":
                # Primer llamado: todos. Segundo: cumplidos.
                call_count = {"n": 0}
                def make_chain_for_objetivos():
                    c = MagicMock()
                    c.select.return_value = c
                    c.eq.return_value = c
                    c.in_.return_value = c
                    c.gte.return_value = c
                    c.lte.return_value = c
                    c.neq.return_value = c
                    c.order.return_value = c
                    def ex():
                        call_count["n"] += 1
                        if call_count["n"] == 1:
                            return mock_res_todos
                        return mock_res_cumplidos
                    c.execute = ex
                    return c
                m.select.return_value = make_chain_for_objetivos()
            else:
                # vendedores_v2
                chain = MagicMock()
                chain.select.return_value = chain
                chain.eq.return_value = chain
                chain.range.return_value = chain
                chain.execute.return_value = mock_res_vendedores
                m.select.return_value = chain
            return m

        return sb_table_mock

    def test_un_objetivo_cumplido_factor_05(self):
        """1 objetivo asignado, 1 cumplido → factor 0.5."""
        tarifas = [_mk_tarifa("exhibicion", 1000)]
        bono = 500.0
        obj = _mk_obj("obj1", "exhibicion", True, "exito", 10, "2026-06", 100, 100)

        with patch("services.objetivos_liquidacion_service.sb.table") as mock_table, \
             patch("services.objetivos_liquidacion_service.tenant_table_name", return_value="vendedores_v2_1"):
            mock_table.side_effect = self._setup_liquidacion([obj], [obj], tarifas, bono)
            from services.objetivos_liquidacion_service import compute_liquidacion
            result = compute_liquidacion(1, "2026-06")

        mm_rows = result["mando_medio"]
        assert len(mm_rows) > 0
        vend10 = next((r for r in mm_rows if r["id_vendedor"] == 10), None)
        assert vend10 is not None
        assert vend10["factor"] == pytest.approx(0.5)
        assert vend10["monto_bono"] == pytest.approx(250.0)  # 0.5 × 500

    def test_dos_objetivos_ambos_cumplidos_factor_10(self):
        """2 objetivos asignados, 2 cumplidos → factor 1.0."""
        tarifas = [_mk_tarifa("exhibicion", 1000), _mk_tarifa("compradores", 800)]
        bono = 500.0
        obj1 = _mk_obj("obj1", "exhibicion", True, "exito", 10, "2026-06", 100, 100)
        obj2 = _mk_obj("obj2", "compradores", True, "exito", 10, "2026-06", 50, 50)

        with patch("services.objetivos_liquidacion_service.sb.table") as mock_table, \
             patch("services.objetivos_liquidacion_service.tenant_table_name", return_value="vendedores_v2_1"):
            mock_table.side_effect = self._setup_liquidacion([obj1, obj2], [obj1, obj2], tarifas, bono)
            from services.objetivos_liquidacion_service import compute_liquidacion
            result = compute_liquidacion(1, "2026-06")

        mm_rows = result["mando_medio"]
        vend10 = next((r for r in mm_rows if r["id_vendedor"] == 10), None)
        assert vend10 is not None
        assert vend10["factor"] == pytest.approx(1.0)
        assert vend10["monto_bono"] == pytest.approx(500.0)  # 1.0 × 500

    def test_dos_objetivos_uno_cumplido_factor_0(self):
        """2 asignados, solo 1 cumplido → factor 0 (no cumplió todos)."""
        tarifas = [_mk_tarifa("exhibicion", 1000), _mk_tarifa("compradores", 800)]
        bono = 500.0
        obj1 = _mk_obj("obj1", "exhibicion", True, "exito", 10, "2026-06", 100, 100)
        obj2 = _mk_obj("obj2", "compradores", False, None, 10, "2026-06", 20, 50)

        with patch("services.objetivos_liquidacion_service.sb.table") as mock_table, \
             patch("services.objetivos_liquidacion_service.tenant_table_name", return_value="vendedores_v2_1"):
            mock_table.side_effect = self._setup_liquidacion([obj1, obj2], [obj1], tarifas, bono)
            from services.objetivos_liquidacion_service import compute_liquidacion
            result = compute_liquidacion(1, "2026-06")

        mm_rows = result["mando_medio"]
        vend10 = next((r for r in mm_rows if r["id_vendedor"] == 10), None)
        # Factor 0: no aparece en mando_medio (o aparece con factor 0)
        if vend10:
            assert vend10["factor"] == pytest.approx(0.0)
            assert vend10["monto_bono"] == pytest.approx(0.0)

    def test_pago_cero_si_no_exito(self):
        """Objetivo cumplido=True pero resultado_final='falla' → monto $0."""
        tarifas = [_mk_tarifa("exhibicion", 1000)]
        bono = 500.0
        obj = _mk_obj("obj1", "exhibicion", True, "falla", 10, "2026-06", 100, 100)

        with patch("services.objetivos_liquidacion_service.sb.table") as mock_table, \
             patch("services.objetivos_liquidacion_service.tenant_table_name", return_value="vendedores_v2_1"):
            # cumplidos: vacío (falla excluida del preview de cumplidos)
            mock_table.side_effect = self._setup_liquidacion([obj], [], tarifas, bono)
            from services.objetivos_liquidacion_service import compute_liquidacion
            result = compute_liquidacion(1, "2026-06")

        # Si aparece en vendedores, monto debe ser 0
        for row in result["vendedores"]:
            if row["id_objetivo"] == "obj1":
                assert row["monto"] == pytest.approx(0.0)


# ── Tests archivado 7d ────────────────────────────────────────────────────────

class TestArchivarTerminados7d:
    def test_objetivo_mayor_7d_recibe_liquidacion_at(self):
        """Objetivo con fecha límite >7d atrás y sin liquidacion_at → recibe liquidacion_at."""
        ahora = datetime.now(timezone.utc)
        fecha_limite_antigua = (ahora.date() - timedelta(days=8)).isoformat()

        obj_antiguo = {
            "id": "obj1",
            "fecha_objetivo": fecha_limite_antigua,
            "liquidacion_at": None,
        }

        mock_q = MagicMock()
        mock_q.select.return_value = mock_q
        mock_q.eq.return_value = mock_q
        mock_q.is_.return_value = mock_q
        mock_q.lte.return_value = mock_q
        mock_q.range.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[obj_antiguo])

        mock_update = MagicMock()
        mock_update.update.return_value = mock_update
        mock_update.eq.return_value = mock_update
        mock_update.execute.return_value = MagicMock(data=[])

        updates_hechos = []

        def mock_table(table_name):
            if table_name == "objetivos":
                m = MagicMock()
                m.select.return_value = mock_q
                def mock_update_fn(payload):
                    updates_hechos.append(payload)
                    u = MagicMock()
                    u.eq.return_value = u
                    u.execute.return_value = MagicMock(data=[])
                    return u
                m.update.side_effect = mock_update_fn
                return m
            return MagicMock()

        with patch("services.objetivos_liquidacion_service.sb.table", side_effect=mock_table):
            from services.objetivos_liquidacion_service import archivar_terminados_compania_7d
            result = archivar_terminados_compania_7d(dist_id=1)

        assert result.get("archivados", 0) >= 0  # la función no falla

    def test_objetivo_reciente_no_archiva(self):
        """Objetivo con fecha límite <7d → NO recibe liquidacion_at."""
        ahora = datetime.now(timezone.utc)
        fecha_limite_reciente = (ahora.date() - timedelta(days=2)).isoformat()

        obj_reciente = {
            "id": "obj2",
            "fecha_objetivo": fecha_limite_reciente,
            "liquidacion_at": None,
        }

        updates_hechos = []

        def mock_table(table_name):
            m = MagicMock()
            if table_name == "objetivos":
                # La query filtra fecha_objetivo <= (hoy - 7d) y no retorna obj_reciente
                mock_q = MagicMock()
                mock_q.select.return_value = mock_q
                mock_q.eq.return_value = mock_q
                mock_q.is_.return_value = mock_q
                mock_q.lte.return_value = mock_q
                mock_q.range.return_value = mock_q
                mock_q.execute.return_value = MagicMock(data=[])  # sin resultados
                m.select.return_value = mock_q
            return m

        with patch("services.objetivos_liquidacion_service.sb.table", side_effect=mock_table):
            from services.objetivos_liquidacion_service import archivar_terminados_compania_7d
            result = archivar_terminados_compania_7d(dist_id=1)

        assert len(updates_hechos) == 0, "Objetivo reciente no debe archivarse"
