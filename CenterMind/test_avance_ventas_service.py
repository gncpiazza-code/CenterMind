"""Avance de Ventas — periodos, comparativas y agregación de volumen."""
import pytest

from core.sku_unify import build_cod_articulo_hints, unify_catalog_entries
from services.avance_ventas_service import (
    SIN_VENDEDOR_LABEL,
    _bultos_por_canon_en_agg,
    _row_canon_key,
    _sku_rows_from_agg,
    _totales_volumen_cigarrillos,
    aggregate_avance_lines,
    build_delta_kpi,
    resolve_periodo,
    resolve_referencias,
)
from core.sku_unify import SkuKeyResolver, seed_sku_resolver


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

def test_unifica_variantes_mismo_articulo():
    """CHESS: mismo producto con/sin prefijo CIGARRILLO o sin cod_articulo."""
    lines = [
        _linea(
            cod_articulo="DOL01",
            descripcion_articulo="CIGARRILLO DOLCHESTER GOLDEN EDITION",
            bultos_total=3.0,
            unidades_total=750.0,
        ),
        _linea(
            numero_documento="A-0002",
            cod_articulo="",
            descripcion_articulo="DOLCHESTER GOLDEN EDITION",
            bultos_total=2.0,
            unidades_total=500.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    assert len(agg["por_sku"]) == 1
    sku = next(iter(agg["por_sku"].values()))
    assert sku["bultos"] == 5.0
    assert sku["unidades"] == 1250.0


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


# ─── R1 — Catálogo 12m: SKUs sin venta ──────────────────────────────────────

from services.avance_ventas_service import (  # noqa: E402
    _build_auditoria_clientes,
    _catalogo_window,
    _sku_rows_from_agg,
    _sku_volumen_fields,
)


def _catalogo_demo():
    return [
        {"cod_articulo": "SKU1", "articulo": "MARLBORO BOX", "agrupacion": "CIGARRILLOS"},
        {"cod_articulo": "SKU9", "articulo": "ZETA SIN VENTA", "agrupacion": "CIGARRILLOS"},
        {"cod_articulo": "SKU8", "articulo": "ALFA SIN VENTA", "agrupacion": "ENCENDEDORES"},
    ]


def test_sku_catalogo_sin_venta_aparece_con_ceros():
    agg = aggregate_avance_lines([_linea()])
    rows = _sku_rows_from_agg(agg, cartera_count=10, catalogo=_catalogo_demo())
    sin_venta = [r for r in rows if r["sin_venta"]]
    assert {r["cod_articulo"] for r in sin_venta} == {"SKU8", "SKU9"}
    z = next(r for r in sin_venta if r["cod_articulo"] == "SKU9")
    assert z["bultos"] == 0.0 and z["unidades"] == 0.0 and z["clientes"] == 0
    assert z["intensidad"] == 0.0
    assert z["penetracion_pct"] == 0.0


def test_sin_venta_van_al_final_y_alfabetico():
    agg = aggregate_avance_lines([_linea()])
    rows = _sku_rows_from_agg(agg, cartera_count=None, catalogo=_catalogo_demo())
    assert rows[0]["cod_articulo"] == "SKU1"  # con venta primero
    assert [r["articulo"] for r in rows[1:]] == ["ALFA SIN VENTA", "ZETA SIN VENTA"]


def test_liverpool_blue_pop_prefijo_y_empaque_unifica_con_ventas():
    lines = [
        _linea(
            cod_articulo="LIV99",
            descripcion_articulo="",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=3.0,
            unidades_total=750.0,
        ),
    ]
    catalogo = [
        {
            "cod_articulo": "LIV99",
            "articulo": "LIVERPOOL BLUE POP",
            "agrupacion": "CIGARRILLOS",
        },
        {
            "cod_articulo": "LIV01",
            "articulo": "CIGARRILLO LIVERPOOL BLUE POP 20S BOX",
            "agrupacion": "CIGARRILLOS",
        },
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    catalogo = unify_catalog_entries(catalogo, hints=hints)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=5, catalogo=catalogo)
    con_venta = [r for r in rows if not r["sin_venta"]]
    assert len(con_venta) == 1
    assert con_venta[0]["bultos"] == pytest.approx(3.0)
    assert "liverpool" in con_venta[0]["articulo"].lower()
    assert len(rows) == 1


def test_liverpool_pop_cod_sin_desc_no_duplica_sin_venta():
    """CHESS: ventas solo con cod ERP; catálogo 12m trae nombre comercial."""
    lines = [
        _linea(
            cod_articulo="LIVPOP01",
            descripcion_articulo="",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=4.0,
            unidades_total=1000.0,
        ),
    ]
    catalogo = [
        {
            "cod_articulo": "LIVPOP01",
            "articulo": "LIVERPOOL POP",
            "agrupacion": "CIGARRILLOS",
        },
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=10, catalogo=catalogo)
    assert len(rows) == 1
    row = rows[0]
    assert row["sin_venta"] is False
    assert row["bultos"] == pytest.approx(4.0)
    assert "liverpool" in row["articulo"].lower()
    assert not any(r["sin_venta"] and "liverpool" in r["articulo"].lower() for r in rows)


def test_totales_volumen_cigarrillos_excluye_papelillo_y_encendedor():
    lines = [
        _linea(
            cod_articulo="CIG1",
            descripcion_articulo="MARLBORO BOX",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=2.0,
            unidades_total=500.0,
        ),
        _linea(
            cod_articulo="PAP1",
            descripcion_articulo="PIER AND ROLL NATURAL",
            agrupacion_art_2="PAPELILLO",
            bultos_total=3.0,
            unidades_total=300.0,
        ),
        _linea(
            cod_articulo="ENC1",
            descripcion_articulo="ENCENDEDOR MK",
            agrupacion_art_2="ENCENDEDORES",
            bultos_total=10.0,
            unidades_total=10.0,
        ),
    ]
    agg = aggregate_avance_lines(lines)
    t = _totales_volumen_cigarrillos(agg)
    assert t["bultos"] == pytest.approx(2.0)
    assert t["bultos_enteros"] == 2
    assert t["unidades_resto"] == 0


def test_delta_sku_misma_clave_canon_entre_periodos():
    """Semana anterior con cod sin desc; actual con nombre — delta no compara vs 0."""
    catalogo = [
        {"cod_articulo": "LIV01", "articulo": "LIVERPOOL POP", "agrupacion": "CIGARRILLOS"},
    ]
    lines_prev = [
        _linea(
            cod_articulo="LIV99",
            descripcion_articulo="",
            bultos_total=20.0,
            unidades_total=5000.0,
            fecha_factura="2026-06-02",
        ),
    ]
    lines_curr = [
        _linea(
            cod_articulo="LIV99",
            descripcion_articulo="",
            bultos_total=66.56,
            unidades_total=16000.0,
            fecha_factura="2026-06-10",
        ),
    ]
    hints = build_cod_articulo_hints(lines_prev + lines_curr, catalogo)
    agg_prev = aggregate_avance_lines(lines_prev, cod_articulo_hints=hints)
    agg_curr = aggregate_avance_lines(lines_curr, cod_articulo_hints=hints)
    ref_map = _bultos_por_canon_en_agg(agg_prev, hints=hints)
    resolver = SkuKeyResolver()
    seed_sku_resolver(resolver, list(agg_curr["por_sku"].values()), hints=hints)
    rows = _sku_rows_from_agg(agg_curr, cartera_count=10, catalogo=catalogo)
    row = next(r for r in rows if not r["sin_venta"])
    canon = _row_canon_key(row, resolver, hints)
    anterior = ref_map.get(canon, 0.0)
    delta = build_delta_kpi(row["bultos"], anterior, disponible=True)
    assert anterior == pytest.approx(20.0)
    assert delta["diff"] == pytest.approx(46.56, abs=0.01)
    assert delta["anterior"] == pytest.approx(20.0)


def test_catalogo_cod_distinto_sin_fila_sin_venta_si_hay_venta():
    """Ventas solo con código ERP; catálogo con otro código mismo nombre → sin badge."""
    lines = [
        _linea(
            cod_articulo="ERP888",
            descripcion_articulo="",
            bultos_total=5.0,
            unidades_total=1200.0,
        ),
    ]
    catalogo = [
        {
            "cod_articulo": "CAT777",
            "articulo": "CIGARRILLO DOLCHESTER SILVER 20S BOX",
            "agrupacion": "CIGARRILLOS",
        },
        {
            "cod_articulo": "ERP888",
            "articulo": "DOLCHESTER SILVER",
            "agrupacion": "CIGARRILLOS",
        },
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    catalogo = unify_catalog_entries(catalogo, hints=hints)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=5, catalogo=catalogo)
    sin_venta_dolchester = [
        r for r in rows if r["sin_venta"] and "dolchester" in (r["articulo"] or "").lower()
    ]
    assert sin_venta_dolchester == []
    assert any(not r["sin_venta"] and r["bultos"] == pytest.approx(5.0) for r in rows)


def test_liverpool_pop_distinto_cod_catalogo_unifica_por_nombre():
    """Catálogo con otro código pero mismo nombre → no fila fantasma sin venta."""
    lines = [
        _linea(
            cod_articulo="LIV99",
            descripcion_articulo="",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=2.0,
            unidades_total=500.0,
        ),
    ]
    catalogo = [
        {"cod_articulo": "LIV01", "articulo": "LIVERPOOL POP", "agrupacion": "CIGARRILLOS"},
        {"cod_articulo": "LIV99", "articulo": "LIVERPOOL POP", "agrupacion": "CIGARRILLOS"},
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=5, catalogo=catalogo)
    con_venta = [r for r in rows if not r["sin_venta"]]
    sin_venta_liverpool = [
        r for r in rows if r["sin_venta"] and "liverpool" in (r["articulo"] or "").lower()
    ]
    assert len(con_venta) == 1
    assert con_venta[0]["bultos"] == pytest.approx(2.0)
    assert sin_venta_liverpool == []


def test_catalogo_cod_weak_y_fuerte_mismo_prefijo_no_duplica_sin_venta():
    """ERP: código ventas con articulo=cod + otro código mismo producto (COR01/COR02)."""
    lines = [
        _linea(
            cod_articulo="COR01",
            descripcion_articulo="",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=1.0,
            unidades_total=250.0,
        ),
    ]
    catalogo = [
        {"cod_articulo": "COR01", "articulo": "COR01", "agrupacion": "CIGARRILLOS"},
        {"cod_articulo": "COR02", "articulo": "CIGARRILLO CORONA 20S BOX", "agrupacion": "CIGARRILLOS"},
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    catalogo = unify_catalog_entries(catalogo, hints=hints)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=5, catalogo=catalogo)
    assert len(rows) == 1
    assert rows[0]["sin_venta"] is False
    assert "corona" in rows[0]["articulo"].lower()


def test_catalogo_cod_weak_prefijo_largo_no_sin_venta_fantasma():
    """Variante LIVBP ventas + LIVBP2 catálogo con nombre comercial completo."""
    lines = [
        _linea(
            cod_articulo="LIVBP",
            descripcion_articulo="",
            agrupacion_art_2="CIGARRILLOS",
            bultos_total=2.0,
            unidades_total=500.0,
        ),
    ]
    catalogo = [
        {"cod_articulo": "LIVBP", "articulo": "LIVBP", "agrupacion": "CIGARRILLOS"},
        {
            "cod_articulo": "LIVBP2",
            "articulo": "CIGARRILLO LIVERPOOL BLUE POP 20S BOX",
            "agrupacion": "CIGARRILLOS",
        },
    ]
    hints = build_cod_articulo_hints(lines, catalogo)
    catalogo = unify_catalog_entries(catalogo, hints=hints)
    agg = aggregate_avance_lines(lines, cod_articulo_hints=hints)
    rows = _sku_rows_from_agg(agg, cartera_count=5, catalogo=catalogo)
    assert len(rows) == 1
    assert rows[0]["sin_venta"] is False
    assert "liverpool" in rows[0]["articulo"].lower()


def test_pick_best_catalog_ventas_row_prefiere_descripcion_larga():
    from services.avance_ventas_service import _pick_best_catalog_ventas_row

    rows = [
        {"cod_articulo": "X1", "descripcion_articulo": "X1", "agrupacion_art_2": "CIGARRILLOS"},
        {
            "cod_articulo": "X1",
            "descripcion_articulo": "CIGARRILLO CORONA 20S BOX",
            "agrupacion_art_2": "CIGARRILLOS",
        },
    ]
    best = _pick_best_catalog_ventas_row(rows)
    assert "CORONA" in (best.get("descripcion_articulo") or "")


def test_catalogo_window_12_meses_calendario():
    desde, hasta = _catalogo_window("2026-06-13")
    assert desde == "2025-07-01"
    assert hasta == "2026-06-13"


# ─── R2 — Desglose volumen por SKU ───────────────────────────────────────────

def test_desglose_convertido_enteros_y_resto():
    # Cigarrillos: factor 250 → 592 u = 2 enteros + 92 u (desde unidades, no bultos decimal)
    f = _sku_volumen_fields(2.368, "CIGARRILLOS", "MARLBORO BOX", unidades=592.0)
    assert f["volumen_kind"] is not None
    assert f["bultos_enteros"] == 2
    assert f["unidades_resto"] == 92


def test_desglose_convertido_prioriza_unidades_sobre_bultos_redondeados():
    # Bultos agregados redondeados ≠ unidades ERP → gana unidades
    f = _sku_volumen_fields(4.37, "CIGARRILLOS", "MARLBORO BOX", unidades=1092.0)
    assert f["bultos_enteros"] == 4
    assert f["unidades_resto"] == 92


def test_desglose_encendedor_entero():
    f = _sku_volumen_fields(12.0, "ENCENDEDORES", "CLIPPER", unidades=12.0)
    assert f["bultos_enteros"] == 12
    assert f["unidades_resto"] == 0


def test_desglose_no_convertido_sin_campos():
    f = _sku_volumen_fields(4.0, "BEBIDAS", "COCA 2L")
    assert "bultos_enteros" not in f


# ─── R8 — Auditoría cliente×SKU ──────────────────────────────────────────────

def _lineas_auditoria():
    return [
        # Cliente 1001: monoproducto fuerte (solo SKU1, mucho volumen)
        _linea(bultos_total=50.0, unidades_total=12500.0),
        _linea(bultos_total=30.0, unidades_total=7500.0, numero_documento="A-0002"),
        # Cliente 2002: mix de 2 SKUs
        _linea(id_cliente_erp="2002", nombre_cliente="ALMACEN SOL", numero_documento="B-1", bultos_total=5.0),
        _linea(
            id_cliente_erp="2002", nombre_cliente="ALMACEN SOL", numero_documento="B-2",
            cod_articulo="SKU2", descripcion_articulo="PHILIP", bultos_total=3.0,
        ),
        # Cliente 3003: mix amplio (4 SKUs) → no entra en mix_bajo
        *[
            _linea(
                id_cliente_erp="3003", nombre_cliente="SUPER RIO", numero_documento=f"C-{i}",
                cod_articulo=f"SKU{i+1}", descripcion_articulo=f"ART{i+1}", bultos_total=2.0,
            )
            for i in range(4)
        ],
    ]


def test_monoproducto_fuerte_detectado():
    agg = aggregate_avance_lines(_lineas_auditoria())
    aud = _build_auditoria_clientes(agg, cartera_count=100)
    mono = aud["monoproducto_fuerte"]
    assert len(mono) == 1
    assert mono[0]["id_cliente_erp"] == "1001"
    assert mono[0]["skus_distintos"] == 1
    assert mono[0]["bultos"] == pytest.approx(80.0)
    assert mono[0]["pct_concentracion"] == pytest.approx(100.0)


def test_mix_bajo_excluye_mono_y_amplio():
    agg = aggregate_avance_lines(_lineas_auditoria())
    aud = _build_auditoria_clientes(agg, cartera_count=None)
    assert [r["id_cliente_erp"] for r in aud["mix_bajo"]] == ["2002"]
    assert aud["mix_bajo"][0]["sku_principal"] == "MARLBORO BOX"
    assert aud["mix_bajo"][0]["pct_concentracion"] == pytest.approx(62.5)
    assert aud["clientes_con_compra"] == 3
    assert aud["resumen_total"] == 3
    assert aud["resumen_truncado"] is False


def test_suma_drill_clientes_igual_bultos_sku():
    agg = aggregate_avance_lines(_lineas_auditoria())
    for sku_key, meta in agg["por_sku"].items():
        bucket = agg["clientes_por_sku"].get(sku_key) or {}
        assert sum(c["bultos"] for c in bucket.values()) == pytest.approx(
            meta["bultos"], abs=0.01
        )


# ─── Integración build_avance_ventas (fetch/cartera/catálogo monkeypatched) ──

import services.avance_ventas_service as avs  # noqa: E402


@pytest.fixture
def patched_build(monkeypatch):
    monkeypatch.setattr(avs, "_fetch_avance_lines", lambda d, desde, hasta: [_linea()])
    monkeypatch.setattr(avs, "_fetch_catalogo_skus", lambda d, hasta: _catalogo_demo())
    monkeypatch.setattr(avs, "_cartera_scope_count", lambda *a: 10)
    monkeypatch.setattr(avs, "_get_erp_name_map", lambda d: {})
    monkeypatch.setattr(
        avs,
        "_ventas_sync_info",
        lambda d: {
            "last_updated": "2026-06-11T12:00:00",
            "last_run_ok_at": "2026-06-11T12:00:00",
            "last_attempt_at": "2026-06-11T12:30:00",
            "last_run_estado": "error",
            "has_zombie": False,
            "next_run_hint": "2026-06-11T17:00:00-03:00",
        },
    )


def test_build_incluye_sin_venta_por_default(patched_build):
    out = avs.build_avance_ventas(1, "dia", "2026-06-09")
    cods = [r["cod_articulo"] for r in out["ranking_skus"]]
    assert "SKU9" in cods and "SKU8" in cods
    assert out["metadatos"]["skus_catalogo"] == 3
    assert out["metadatos"]["skus_sin_venta"] == 2
    conv = out["series"]["convivencia_skus"]
    assert conv["disponible"] is True
    assert (conv["con_venta"], conv["sin_venta"]) == (1, 2)
    assert conv["pct_convivencia"] == pytest.approx(33.3)
    cob = out["series"]["cobertura_pdvs"]
    assert cob["disponible"] is True
    assert cob["con_compra"] == 1
    assert cob["pct_cobertura"] == pytest.approx(10.0)
    assert out["filtros"]["incluir_sin_venta"] is True
    # R3: sync expone OK + intento posterior con estado
    assert out["sync"]["last_attempt_at"] > out["sync"]["last_run_ok_at"]
    assert out["sync"]["last_run_estado"] == "error"


def test_build_incluir_sin_venta_false_excluye_ceros(patched_build):
    out = avs.build_avance_ventas(1, "dia", "2026-06-09", incluir_sin_venta=False)
    cods = [r["cod_articulo"] for r in out["ranking_skus"]]
    assert cods == ["SKU1"]
    assert out["series"]["convivencia_skus"]["sin_venta"] == 2
    assert out["auditoria_clientes"]["clientes_con_compra"] == 1


def test_build_catalogo_caido_no_rompe(patched_build, monkeypatch):
    def _boom(d, hasta):
        raise RuntimeError("catalogo down")

    monkeypatch.setattr(avs, "_fetch_catalogo_skus", _boom)
    out = avs.build_avance_ventas(1, "dia", "2026-06-09")
    assert out["series"]["convivencia_skus"]["disponible"] is False
    assert [r["cod_articulo"] for r in out["ranking_skus"]] == ["SKU1"]


def test_drill_sku_paginado_y_total(monkeypatch):
    lines = [
        _linea(id_cliente_erp=str(1000 + i), nombre_cliente=f"CLI {i}", numero_documento=f"A-{i}", bultos_total=float(i + 1))
        for i in range(7)
    ]
    monkeypatch.setattr(avs, "_fetch_avance_lines", lambda d, desde, hasta: lines)
    monkeypatch.setattr(avs, "_get_erp_name_map", lambda d: {})
    out = avs.build_avance_ventas_sku_clientes(1, "SKU1", "dia", "2026-06-09", limit=3, offset=0)
    assert out["total"] == 7
    assert len(out["clientes"]) == 3
    assert out["clientes"][0]["bultos"] == pytest.approx(7.0)  # orden desc
    page2 = avs.build_avance_ventas_sku_clientes(1, "SKU1", "dia", "2026-06-09", limit=3, offset=6)
    assert len(page2["clientes"]) == 1
    # Auditoría 100%: total de la lista = bultos del SKU
    assert out["total_bultos"] == pytest.approx(sum(float(i + 1) for i in range(7)))


def test_drill_cliente_skus(monkeypatch):
    monkeypatch.setattr(avs, "_fetch_avance_lines", lambda d, desde, hasta: _lineas_auditoria())
    monkeypatch.setattr(avs, "_get_erp_name_map", lambda d: {})
    out = avs.build_avance_ventas_cliente_skus(1, "2002", "dia", "2026-06-09")
    assert out["cliente"] == "ALMACEN SOL"
    assert [s["cod_articulo"] for s in out["skus"]] == ["SKU1", "SKU2"]
    assert out["total_bultos"] == pytest.approx(8.0)
    assert sum(s["bultos"] for s in out["skus"]) == pytest.approx(out["total_bultos"], abs=0.01)


def test_drill_cliente_inexistente_vacio(monkeypatch):
    monkeypatch.setattr(avs, "_fetch_avance_lines", lambda d, desde, hasta: _lineas_auditoria())
    monkeypatch.setattr(avs, "_get_erp_name_map", lambda d: {})
    out = avs.build_avance_ventas_cliente_skus(1, "9999", "dia", "2026-06-09")
    assert out["skus"] == []
    assert out["total_bultos"] == 0.0


# ─── R3 — _ventas_sync_info con motor_runs stub ──────────────────────────────

class _StubQuery:
    def __init__(self, rows_by_filter):
        self._rows_by_filter = rows_by_filter
        self._estado = None
        self._is_count = False

    def select(self, *a, **kw):
        self._is_count = kw.get("count") == "exact"
        return self

    def eq(self, col, val):
        if col == "estado":
            self._estado = val
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, n):
        return self

    def lt(self, *a):
        return self

    def execute(self):
        rows = self._rows_by_filter.get(self._estado, self._rows_by_filter.get(None, []))

        class R:
            data = rows
            count = len(rows)

        return R()


class _StubSb:
    def __init__(self, rows_by_filter):
        self._rows_by_filter = rows_by_filter

    def table(self, name):
        return _StubQuery(self._rows_by_filter)


def test_sync_info_error_despues_de_ok(monkeypatch):
    rows_ok = [{"finalizado_en": "2026-06-11T12:00:00", "iniciado_en": "2026-06-11T11:58:00"}]
    rows_any = [{"iniciado_en": "2026-06-11T17:01:00", "finalizado_en": None, "estado": "error"}]
    monkeypatch.setattr(
        avs, "sb", _StubSb({"ok": rows_ok, None: rows_any, "en_curso": []})
    )
    info = avs._ventas_sync_info(1)
    assert info["last_run_ok_at"] == "2026-06-11T12:00:00"
    assert info["last_attempt_at"] == "2026-06-11T17:01:00"
    assert info["last_run_ok_at"] < info["last_attempt_at"]
    assert info["last_run_estado"] == "error"
    assert info["has_zombie"] is False


def test_sync_info_zombie_detectado(monkeypatch):
    rows_ok = [{"finalizado_en": "2026-06-09T12:00:00", "iniciado_en": None}]
    zombie = [{"id_run": 1, "iniciado_en": "2026-06-09T16:00:00", "estado": "en_curso"}]
    monkeypatch.setattr(
        avs, "sb", _StubSb({"ok": rows_ok, None: zombie, "en_curso": zombie})
    )
    info = avs._ventas_sync_info(1)
    assert info["has_zombie"] is True
