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


def _ventas_uc_map(
    client_by_id: dict,
    ventas_rows: list[dict],
    *,
    desde: str,
    hasta: str,
) -> dict[int, dict]:
    """Simula ultima_compra_en_periodo_por_cliente desde filas de venta mock."""
    from core.objetivos_compradores import _norm_erp

    desde_d, hasta_d = desde[:10], hasta[:10]
    erp_to_cid: dict[str, int] = {}
    for cid, row in client_by_id.items():
        n = _norm_erp(row.get("id_cliente_erp"))
        if n:
            erp_to_cid[n] = int(cid)

    best: dict[int, dict] = {}
    for row in ventas_rows:
        if float(row.get("importe_final") or 0) <= 0:
            continue
        f = str(row.get("fecha_factura") or "")[:10]
        if len(f) < 10 or f < desde_d or f > hasta_d:
            continue
        n = _norm_erp(row.get("id_cliente_erp"))
        cid = erp_to_cid.get(n) if n else None
        if cid is None:
            continue
        prev = str((best.get(cid) or {}).get("fecha") or "")
        if f > prev:
            best[cid] = {"fecha": f, "comprobante": None}
    return best


# ──────────────────────────────────────────────────────────────────────────────
# Tests para compradores_en_periodo_for_clients
# ──────────────────────────────────────────────────────────────────────────────

class TestCompradoresEnPeriodoForClients:
    """Prueba la función core con client_by_id explícito."""

    def _run(self, dist_id, client_by_id, desde, hasta, ventas_rows):
        ventas_uc = _ventas_uc_map(client_by_id, ventas_rows, desde=desde, hasta=hasta)
        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value=ventas_uc,
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

    def test_padron_no_duplica_si_ventas_ya_cuentan(self):
        """Con venta en el mes, no sumar por fecha_ultima_compra histórica fuera del mes."""
        client_by_id = {1: _make_client_row(1, "ABC", fuc="2026-06-15")}
        ventas = [_make_ventas_row("ABC", "2026-05-10")]
        result = self._run(1, client_by_id, "2026-05-01", "2026-05-31", ventas)
        assert result == {1}

    def test_padron_total_no_cuenta_si_desde_vacio(self):
        from core.objetivos_compradores import compradores_en_periodo_for_clients

        client_by_id = {1: _make_client_row(1, "ABC", fuc="2026-05-10")}
        with pytest.raises(ValueError, match="periodo compradores inválido"):
            compradores_en_periodo_for_clients(1, client_by_id, "", "2026-05-31")

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


def _primera_venta_map(
    client_by_id: dict,
    ventas_rows: list[dict],
    *,
    desde: str,
    hasta: str,
) -> dict[int, str]:
    """Simula _primera_compra_fecha_* (mínima fecha en período)."""
    from core.objetivos_compradores import _norm_erp

    desde_d, hasta_d = desde[:10], hasta[:10]
    erp_to_cid: dict[str, int] = {}
    for cid, row in client_by_id.items():
        n = _norm_erp(row.get("id_cliente_erp"))
        if n:
            erp_to_cid[n] = int(cid)

    primera: dict[int, str] = {}
    for row in ventas_rows:
        if float(row.get("importe_final") or 0) <= 0:
            continue
        f = str(row.get("fecha_factura") or "")[:10]
        if len(f) < 10 or f < desde_d or f > hasta_d:
            continue
        n = _norm_erp(row.get("id_cliente_erp"))
        cid = erp_to_cid.get(n) if n else None
        if cid is None:
            continue
        prev = primera.get(cid)
        if prev is None or f < prev:
            primera[cid] = f
    return primera


class TestCompradoresProgresoDiario:
    def test_agrupa_por_primera_compra_no_ultima(self):
        client_by_id = {
            1: _make_client_row(1, "A"),
            2: _make_client_row(2, "B"),
            3: _make_client_row(3, "C"),
        }
        ventas = [
            _make_ventas_row("A", "2026-06-01"),
            _make_ventas_row("A", "2026-06-20"),
            _make_ventas_row("B", "2026-06-02"),
            _make_ventas_row("C", "2026-06-03"),
        ]
        ventas_uc = _ventas_uc_map(
            client_by_id, ventas, desde="2026-06-01", hasta="2026-06-30"
        )
        primera = _primera_venta_map(
            client_by_id, ventas, desde="2026-06-01", hasta="2026-06-30"
        )
        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value=ventas_uc,
        ), patch(
            "core.objetivos_compradores._primera_compra_fecha_vendedor",
            return_value=primera,
        ), patch(
            "core.objetivos_compradores._comprador_ids_desde_ventas_vendedor",
            return_value={1, 2, 3},
        ):
            from core.objetivos_compradores import compradores_progreso_diario_for_clients

            progreso = compradores_progreso_diario_for_clients(
                1,
                client_by_id,
                "2026-06-01",
                "2026-06-30",
                id_vendedor=7,
            )
        assert progreso == {"2026-06-01": 1, "2026-06-02": 1, "2026-06-03": 1}
        assert sum(progreso.values()) == 3

    def test_padron_fallback_asigna_dia_fuc(self):
        client_by_id = {1: _make_client_row(1, "X", fuc="2026-06-05")}
        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value={},
        ), patch(
            "core.objetivos_compradores._primera_compra_fecha_vendedor",
            return_value={},
        ), patch(
            "core.objetivos_compradores._comprador_ids_desde_ventas_vendedor",
            return_value=set(),
        ):
            from core.objetivos_compradores import compradores_progreso_diario_for_clients

            progreso = compradores_progreso_diario_for_clients(
                1,
                client_by_id,
                "2026-06-01",
                "2026-06-30",
                id_vendedor=7,
            )
        assert progreso == {"2026-06-05": 1}


class TestCompradoresSnapshotBatch:
    """Batch estadísticas (snapshot) debe coincidir con compradores_en_periodo_for_clients."""

    def test_snapshot_igual_a_for_clients_con_vendedor(self):
        from core.objetivos_compradores import (
            compradores_cids_by_vend_from_snapshot,
            compradores_en_periodo_for_clients,
        )

        client_by_id = {
            1: _make_client_row(1, "100", fuc="2026-04-01"),
            2: _make_client_row(2, "200", fuc="2026-05-20"),
        }
        ventas = [
            {
                "fecha_factura": "2026-05-10",
                "importe_final": 80,
                "anulado": False,
                "id_cliente_erp": "100",
                "codigo_vendedor": "10",
                "nombre_vendedor": "V1",
            },
        ]
        vend_row = {"id_vendedor": 7, "id_vendedor_erp": "10", "nombre_erp": "V1"}
        match_indexes = {
            "codigo_to_vid": {"10": 7},
            "nombre_to_vid": {},
            "integrante_to_vid": {},
            "vid_to_nombre": {7: "V1"},
        }
        with patch(
            "core.objetivos_compradores._comprador_ids_desde_ventas_vendedor",
            return_value={1},
        ):
            canon = compradores_en_periodo_for_clients(
                1, client_by_id, "2026-05-01", "2026-05-31", id_vendedor=7
            )
        batch = compradores_cids_by_vend_from_snapshot(
            1,
            {7: client_by_id},
            ventas,
            "2026-05-01",
            "2026-05-31",
            vend_row_by_id={7: vend_row},
            match_indexes=match_indexes,
            meses_yyyy_mm={"2026-05"},
        )
        assert batch[7] == canon
        assert canon == {1, 2}


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


# ──────────────────────────────────────────────────────────────────────────────
# Tests ORDEN 3 — _venta_cuenta_como_compra: importe_final == 0 no cuenta
# ──────────────────────────────────────────────────────────────────────────────

def test_importe_cero_no_cuenta_como_compra():
    """importe_final == 0 no debe contar como compra (cambio >= 0 → > 0)."""
    from core.ultima_compra import _venta_cuenta_como_compra

    row_cero = {"importe_final": 0, "anulado": False}
    row_negativo = {"importe_final": -5.0, "anulado": False}
    row_valida = {"importe_final": 1.0, "anulado": False}
    row_none = {"importe_final": None, "anulado": False}

    assert not _venta_cuenta_como_compra(row_cero), "importe 0 debe retornar False"
    assert not _venta_cuenta_como_compra(row_negativo), "importe negativo debe retornar False"
    assert _venta_cuenta_como_compra(row_valida), "importe positivo debe retornar True"
    assert not _venta_cuenta_como_compra(row_none), "importe None (→ 0) debe retornar False"


def test_importe_cero_anulado_no_cuenta():
    """Filas anuladas tampoco cuentan, independientemente del importe."""
    from core.ultima_compra import _venta_cuenta_como_compra

    row_anulado = {"importe_final": 100.0, "anulado": True}
    assert not _venta_cuenta_como_compra(row_anulado)


# ──────────────────────────────────────────────────────────────────────────────
# Tests ORDEN 3b — FUC gated: no usar FUC si ERP tiene ventas en ventas_enriched
# ──────────────────────────────────────────────────────────────────────────────

class TestFucGating:
    """FUC no se aplica a PDVs cuyos ERPs aparecen en ventas_enriched del período."""

    def test_fuc_no_aplica_si_erp_en_ventas_enriched(self):
        """
        PDV sin match de vendedor pero con ERP en ventas_enriched → no debe usar FUC.
        """
        client_by_id = {
            1: _make_client_row(1, "ABC", fuc="2026-05-10"),
        }
        # ventas_uc vacío: el vendedor específico no tuvo match
        ventas_uc: dict = {}

        # _erps_con_ventas_en_periodo retorna "ABC" normalizado → ERP en ventas
        from core.objetivos_compradores import _norm_erp
        abc_norm = _norm_erp("ABC")

        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value=ventas_uc,
        ), patch(
            "core.objetivos_compradores._erps_con_ventas_en_periodo",
            return_value={abc_norm},
        ):
            from core.objetivos_compradores import compradores_en_periodo_for_clients
            result = compradores_en_periodo_for_clients(
                1, client_by_id, "2026-05-01", "2026-05-31"
            )
        # FUC gateado: no debe contar el PDV porque su ERP existe en ventas_enriched
        assert result == set(), f"Esperado set() (FUC gateado), got {result}"

    def test_fuc_aplica_si_erp_ausente_de_ventas_enriched(self):
        """
        PDV sin match de vendedor y sin ERP en ventas_enriched → usar FUC si cae en período.
        """
        client_by_id = {
            1: _make_client_row(1, "XYZ", fuc="2026-05-10"),
        }
        ventas_uc: dict = {}

        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value=ventas_uc,
        ), patch(
            "core.objetivos_compradores._erps_con_ventas_en_periodo",
            return_value=set(),  # ERP ausente de ventas_enriched
        ):
            from core.objetivos_compradores import compradores_en_periodo_for_clients
            result = compradores_en_periodo_for_clients(
                1, client_by_id, "2026-05-01", "2026-05-31"
            )
        # FUC debe aplicar: PDV sin ERP en ventas_enriched y con FUC en período
        assert result == {1}, f"Esperado {{1}} (FUC aplica), got {result}"


# ──────────────────────────────────────────────────────────────────────────────
# Tests ORDEN 3b — invariante progreso_diario
# ──────────────────────────────────────────────────────────────────────────────

class TestInvarianteProgresoDiario:
    """sum(progreso_diario.values()) == len(comprador_ids)."""

    def test_invariante_suma_igual_compradores(self):
        """Todos los compradores deben aparecer exactamente 1 vez en el progreso diario."""
        client_by_id = {
            1: _make_client_row(1, "A"),
            2: _make_client_row(2, "B"),
            3: _make_client_row(3, "C"),
        }
        ventas = [
            _make_ventas_row("A", "2026-06-01"),
            _make_ventas_row("B", "2026-06-05"),
            _make_ventas_row("C", "2026-06-10"),
        ]
        ventas_uc = _ventas_uc_map(
            client_by_id, ventas, desde="2026-06-01", hasta="2026-06-30"
        )
        primera = _primera_venta_map(
            client_by_id, ventas, desde="2026-06-01", hasta="2026-06-30"
        )
        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value=ventas_uc,
        ), patch(
            "core.objetivos_compradores._primera_compra_fecha_vendedor",
            return_value=primera,
        ), patch(
            "core.objetivos_compradores._comprador_ids_desde_ventas_vendedor",
            return_value={1, 2, 3},
        ):
            from core.objetivos_compradores import compradores_progreso_diario_for_clients

            progreso = compradores_progreso_diario_for_clients(
                1,
                client_by_id,
                "2026-06-01",
                "2026-06-30",
                id_vendedor=7,
            )

        assert sum(progreso.values()) == 3, (
            f"Invariante violada: sum={sum(progreso.values())} != 3 compradores"
        )
        assert progreso == {"2026-06-01": 1, "2026-06-05": 1, "2026-06-10": 1}

    def test_invariante_con_fuc_fallback(self):
        """Comprador vía FUC también debe aparecer exactamente 1 vez."""
        client_by_id = {
            1: _make_client_row(1, "Z", fuc="2026-06-07"),
        }
        with patch(
            "core.ultima_compra.ultima_compra_en_periodo_por_cliente",
            return_value={},
        ), patch(
            "core.objetivos_compradores._primera_compra_fecha_vendedor",
            return_value={},
        ), patch(
            "core.objetivos_compradores._comprador_ids_desde_ventas_vendedor",
            return_value=set(),
        ):
            from core.objetivos_compradores import compradores_progreso_diario_for_clients

            progreso = compradores_progreso_diario_for_clients(
                1,
                client_by_id,
                "2026-06-01",
                "2026-06-30",
                id_vendedor=7,
            )
        # comprador_ids tiene 1 (vía FUC), sum debe ser 1
        assert sum(progreso.values()) == 1
        assert "2026-06-07" in progreso


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
