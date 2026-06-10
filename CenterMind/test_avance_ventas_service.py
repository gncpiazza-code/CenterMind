"""Avance de Ventas — periodos, comparativas y agregación de volumen."""
import pytest

from services.avance_ventas_service import (
    SIN_VENDEDOR_LABEL,
    aggregate_avance_lines,
    build_delta_kpi,
    resolve_periodo,
    resolve_referencias,
)


def _linea(**overrides) -> dict:
    base = {
        "fecha_factura": "2026-06-09",
        "nombre_vendedor": "JUAN PEREZ",
        "nombre_cliente": "KIOSCO LUNA",
        "id_cliente_erp": "1001",
        "tipo_documento": "FACTURA",
        "numero_documento": "A-0001",
        "cod_articulo": "SKU1",
        "descripcion_articulo": "MARLBORO BOX",
        "agrupacion_art_1": "",
        "agrupacion_art_2": "CIGARRILLOS",
        "bultos_total": 2.0,
        "unidades_total": 500.0,
        "importe_final": 1000.0,
        "ruta": "",
    }
    base.update(overrides)
    return base


# ─── Periodos ─────────────────────────────────────────────────────────────────

def test_semana_lun_sabado():
    # 2026-06-10 es miércoles → semana 8–13 jun
    p = resolve_periodo("semana", "2026-06-10")
    assert p["desde"] == "2026-06-08"
    assert p["hasta"] == "2026-06-13"
    assert "Semana 8–13 Jun 2026" == p["label"]


def test_semana_ancla_domingo_cierra_sabado_previo():
    # Domingo 2026-06-14 pertenece a la semana lun 8 – sáb 13 (lun–sáb, sin domingo)
    p = resolve_periodo("semana", "2026-06-14")
    assert p["desde"] == "2026-06-08"
    assert p["hasta"] == "2026-06-13"


def test_mes_calendario_completo():
    p = resolve_periodo("mes", "2026-02-15")
    assert p["desde"] == "2026-02-01"
    assert p["hasta"] == "2026-02-28"
    assert p["label"] == "Febrero 2026"


def test_dia_historico_no_parcial():
    p = resolve_periodo("dia", "2025-01-15")
    assert p["desde"] == p["hasta"] == "2025-01-15"
    assert p["parcial"] is False


def test_referencias_dia_wow_mismo_weekday():
    refs = resolve_referencias("dia", "2026-06-10")
    assert refs["wow"]["desde"] == "2026-06-03"  # miércoles −7d
    assert refs["mom"]["desde"] == "2026-05-10"


def test_referencias_mom_31_clampa_fin_de_mes():
    refs = resolve_referencias("dia", "2026-03-31")
    assert refs["mom"]["desde"] == "2026-02-28"  # 2026 no bisiesto


def test_referencias_semana_anterior():
    refs = resolve_referencias("semana", "2026-06-10")
    assert refs["semana_anterior"]["desde"] == "2026-06-01"
    assert refs["semana_anterior"]["hasta"] == "2026-06-06"
    assert "wow" not in refs and "mom" not in refs


def test_referencias_mes_anterior():
    refs = resolve_referencias("mes", "2026-03-15")
    assert refs["mes_anterior"]["desde"] == "2026-02-01"
    assert refs["mes_anterior"]["hasta"] == "2026-02-28"


# ─── DeltaKpi ─────────────────────────────────────────────────────────────────

def test_delta_kpi_sin_referencia_no_disponible():
    d = build_delta_kpi(100.0, None, disponible=False)
    assert d["disponible"] is False
    assert d["pct"] is None


def test_delta_kpi_referencia_cero_pct_none():
    d = build_delta_kpi(10.0, 0.0)
    assert d["disponible"] is True
    assert d["diff"] == 10.0
    assert d["pct"] is None


def test_delta_kpi_pct():
    d = build_delta_kpi(120.0, 100.0)
    assert d["pct"] == 20.0
    assert d["anterior"] == 100.0


# ─── Agregación ───────────────────────────────────────────────────────────────

def test_devolucion_resta_bultos_neto():
    lines = [
        _linea(bultos_total=5.0, unidades_total=1250.0),
        _linea(
            numero_documento="NC-1",
            tipo_documento="NOTA CREDITO",
            bultos_total=-2.0,
            unidades_total=-500.0,
            importe_final=-400.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    assert agg["total_bultos"] == pytest.approx(3.0)
    assert agg["total_unidades"] == pytest.approx(750.0)


def test_recaudacion_excluida():
    lines = [
        _linea(),
        _linea(numero_documento="R-1", tipo_documento="RECIBO", bultos_total=99.0),
    ]
    agg = aggregate_avance_lines(lines)
    assert agg["total_bultos"] == pytest.approx(2.0)
    assert agg["comprobantes"] == 1


def test_encendedor_unidades_igual_bultos_linea():
    lines = [
        _linea(
            cod_articulo="ENC1",
            descripcion_articulo="MK ENCENDEDOR CLIPPER",
            agrupacion_art_2="ENCENDEDORES",
            bultos_total=12.0,
            unidades_total=0.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    assert agg["total_unidades"] == pytest.approx(12.0)


def test_encendedor_devolucion_resta_unidades():
    lines = [
        _linea(
            cod_articulo="ENC1",
            agrupacion_art_2="ENCENDEDORES",
            descripcion_articulo="MK ENCENDEDOR",
            bultos_total=10.0,
            unidades_total=0.0,
        ),
        _linea(
            numero_documento="NC-2",
            tipo_documento="DEVOLUCION",
            cod_articulo="ENC1",
            agrupacion_art_2="ENCENDEDORES",
            descripcion_articulo="MK ENCENDEDOR",
            bultos_total=-3.0,
            unidades_total=0.0,
            importe_final=-100.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    assert agg["total_bultos"] == pytest.approx(7.0)
    assert agg["total_unidades"] == pytest.approx(7.0)


def test_no_convertido_no_suma_unidades():
    lines = [
        _linea(
            cod_articulo="BEB1",
            descripcion_articulo="COCA 2L",
            agrupacion_art_2="BEBIDAS",
            bultos_total=4.0,
            unidades_total=48.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    assert agg["total_bultos"] == pytest.approx(4.0)
    assert agg["total_unidades"] == pytest.approx(0.0)


def test_sin_vendedor_bucket():
    lines = [
        _linea(nombre_vendedor=""),
        _linea(nombre_vendedor="Sin Vendedor", numero_documento="A-0002"),
        _linea(nombre_vendedor="JUAN PEREZ", numero_documento="A-0003"),
    ]
    agg = aggregate_avance_lines(lines)
    assert SIN_VENDEDOR_LABEL in agg["por_vendedor"]
    assert agg["por_vendedor"][SIN_VENDEDOR_LABEL]["bultos"] == pytest.approx(4.0)


def test_filtro_solo_sin_vendedor():
    lines = [
        _linea(nombre_vendedor=""),
        _linea(nombre_vendedor="JUAN PEREZ", numero_documento="A-0003"),
    ]
    agg = aggregate_avance_lines(lines, vendedor_norm="__sin_vendedor__")
    assert list(agg["por_vendedor"].keys()) == [SIN_VENDEDOR_LABEL]
    assert agg["total_bultos"] == pytest.approx(2.0)


def test_filtro_vendedor_por_nombre():
    lines = [
        _linea(nombre_vendedor="JUAN PEREZ"),
        _linea(nombre_vendedor="MARIA GOMEZ", numero_documento="A-0004", bultos_total=9.0),
    ]
    agg = aggregate_avance_lines(lines, vendedor_norm="maria gomez")
    assert agg["total_bultos"] == pytest.approx(9.0)
    assert set(agg["por_vendedor"]) == {"MARIA GOMEZ"}


def test_filtro_sucursal_fallback_ruta():
    lines = [
        _linea(nombre_vendedor="OTRO", ruta="CASA CENTRAL R1"),
        _linea(nombre_vendedor="OTRO2", numero_documento="A-9", ruta="SUC NORTE", bultos_total=7.0),
    ]
    # Ningún vendedor matchea la sucursal → solo pasa la línea cuyo texto de ruta la contiene
    agg = aggregate_avance_lines(lines, sucursal_norm="casa central", vend_branch=set())
    assert agg["total_bultos"] == pytest.approx(2.0)


def test_skus_y_clientes_y_comprobantes():
    lines = [
        _linea(),
        _linea(cod_articulo="SKU2", descripcion_articulo="PHILIP", numero_documento="A-0001"),
        _linea(id_cliente_erp="2002", nombre_cliente="ALMACEN SOL", numero_documento="B-1"),
    ]
    agg = aggregate_avance_lines(lines)
    assert len(agg["por_sku"]) == 2
    assert agg["clientes"] == {"1001", "2002"}
    assert agg["comprobantes"] == 2
