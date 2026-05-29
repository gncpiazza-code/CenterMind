# -*- coding: utf-8 -*-
"""Tests unitarios para la heurística de matcheo deuda CC ↔ comprobantes."""

import pytest
from datetime import date, timedelta
from core.cc_deuda_match import match_deuda_comprobantes


def _make_venta(num: str, fecha: str, importe: float, tipo: str = "FACTURA"):
    return {
        "numero_documento": num,
        "fecha_factura": fecha,
        "tipo_documento": tipo,
        "importe_final": importe,
        "anulado": False,
        "cod_articulo": "ART001",
        "descripcion_articulo": "Producto Test",
        "bultos_total": 2.0,
    }


HOY = date.today().isoformat()
AYER = (date.today() - timedelta(days=1)).isoformat()
HACE_20 = (date.today() - timedelta(days=20)).isoformat()
HACE_35 = (date.today() - timedelta(days=35)).isoformat()


class TestMatched:
    """Suma de ventas candidatas dentro de ±15% de la deuda → estado 'matched'."""

    def test_match_exacto(self):
        cc = {"deuda_total": 10000.0, "cantidad_comprobantes": 2, "antiguedad_dias": 30}
        ventas = [
            _make_venta("F001", HACE_20, 6000.0),
            _make_venta("F002", HACE_35, 4000.0),
        ]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "matched"
        assert result["confianza"] == "alta"
        assert len(result["comprobantes"]) == 2
        assert result["total_deuda"] == 10000.0

    def test_match_dentro_tolerancia(self):
        cc = {"deuda_total": 10000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 20}
        ventas = [_make_venta("F001", HACE_20, 9600.0)]  # -4% → dentro de ±15%
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "matched"

    def test_total_siempre_autoritativo(self):
        cc = {"deuda_total": 50000.0, "cantidad_comprobantes": 2, "antiguedad_dias": 20}
        ventas = [
            _make_venta("F001", HACE_20, 10000.0),
            _make_venta("F002", AYER, 5000.0),
        ]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["total_deuda"] == 50000.0  # siempre autoritativo

    def test_sin_fecha_obj_eliminado_del_resultado(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        ventas = [_make_venta("F001", AYER, 5000.0)]
        result = match_deuda_comprobantes(cc, ventas)
        for cbte in result["comprobantes"]:
            assert "_fecha_obj" not in cbte


class TestPartial:
    """Suma fuera de ±15% → estado 'partial', confianza baja."""

    def test_partial_por_monto(self):
        cc = {"deuda_total": 10000.0, "cantidad_comprobantes": 2, "antiguedad_dias": 30}
        ventas = [
            _make_venta("F001", HACE_20, 3000.0),
            _make_venta("F002", HACE_35, 2000.0),  # suma=5000 → -50% de 10000
        ]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "partial"
        assert result["confianza"] == "baja"
        for cbte in result["comprobantes"]:
            assert cbte["match_status"] == "estimado"

    def test_total_sigue_siendo_autoritativo_en_partial(self):
        cc = {"deuda_total": 10000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 5}
        ventas = [_make_venta("F001", AYER, 1000.0)]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["total_deuda"] == 10000.0


class TestSinComprobantes:
    """Sin ventas, sin ERP o N=0 → estado 'sin_comprobantes'."""

    def test_sin_ventas(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 2, "antiguedad_dias": 20}
        result = match_deuda_comprobantes(cc, [])
        assert result["estado"] == "sin_comprobantes"
        assert result["comprobantes"] == []
        assert result["total_deuda"] == 5000.0

    def test_cantidad_comprobantes_cero(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 0, "antiguedad_dias": 20}
        ventas = [_make_venta("F001", AYER, 5000.0)]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "sin_comprobantes"

    def test_recibos_se_excluyen(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        ventas = [_make_venta("R001", AYER, 5000.0, tipo="RECIBO")]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "sin_comprobantes"

    def test_devoluciones_se_excluyen(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        ventas = [_make_venta("ND001", AYER, 5000.0, tipo="NOTA DE CREDITO")]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "sin_comprobantes"

    def test_importe_negativo_se_excluye(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        ventas = [_make_venta("F001", AYER, -5000.0)]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "sin_comprobantes"

    def test_anulados_se_excluyen(self):
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        venta = _make_venta("F001", AYER, 5000.0)
        venta["anulado"] = True
        result = match_deuda_comprobantes(cc, [venta])
        assert result["estado"] == "sin_comprobantes"

    def test_ventas_fuera_de_ventana_temporal(self):
        # Antigüedad = 5 días → ventana = [hoy - (5+35), hoy] = hoy-40. Venta de 200 días atrás queda afuera.
        hace_200 = (date.today() - timedelta(days=200)).isoformat()
        cc = {"deuda_total": 5000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 5}
        ventas = [_make_venta("F001", hace_200, 5000.0)]
        result = match_deuda_comprobantes(cc, ventas)
        assert result["estado"] == "sin_comprobantes"


class TestArticulos:
    """Los artículos se anidan correctamente dentro de cada comprobante."""

    def test_articulos_agrupados_por_comprobante(self):
        cc = {"deuda_total": 8000.0, "cantidad_comprobantes": 1, "antiguedad_dias": 10}
        ventas = [
            {**_make_venta("F001", AYER, 3000.0), "cod_articulo": "A1", "descripcion_articulo": "Art 1"},
            {**_make_venta("F001", AYER, 5000.0), "cod_articulo": "A2", "descripcion_articulo": "Art 2"},
        ]
        result = match_deuda_comprobantes(cc, ventas)
        cbtes = result["comprobantes"]
        assert len(cbtes) == 1
        assert cbtes[0]["numero"] == "F001"
        assert abs(cbtes[0]["importe_total"] - 8000.0) < 0.01
        assert len(cbtes[0]["articulos"]) == 2
