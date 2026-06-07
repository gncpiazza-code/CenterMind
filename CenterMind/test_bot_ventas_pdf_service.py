# -*- coding: utf-8 -*-
from services.bot_ventas_pdf_service import _build_top_compradores_por_articulo


def _venta_row(
    *,
    fecha: str = "2026-06-05",
    erp: str = "100",
    cliente: str = "Kiosco A",
    articulo: str = "Marlboro Box",
    cod: str = "M1",
    bultos: float = 10.0,
    tipo: str = "FAC",
    importe: float = 1000.0,
    agrupacion: str = "BEBIDAS",
):
    return {
        "fecha_factura": fecha,
        "id_cliente_erp": erp,
        "nombre_cliente": cliente,
        "descripcion_articulo": articulo,
        "cod_articulo": cod,
        "bultos_total": bultos,
        "tipo_documento": tipo,
        "importe_final": importe,
        "agrupacion_art_2": agrupacion,
    }


def test_top_compradores_agrupa_y_ordena():
    rows = [
        _venta_row(erp="1", cliente="Cliente Chico", articulo="Art A", cod="A1", bultos=5),
        _venta_row(erp="2", cliente="Cliente Grande", articulo="Art B", cod="B1", bultos=20),
        _venta_row(erp="2", cliente="Cliente Grande", articulo="Art C", cod="C1", bultos=8),
    ]
    top = _build_top_compradores_por_articulo(rows, {"2026-06"}, limit=15)

    assert len(top) == 2
    assert top[0]["nombre_cliente"] == "Cliente Grande"
    assert top[0]["total_bultos_raw"] == 28.0
    assert top[0]["articulos"][0]["articulo"] == "Art B"
    assert top[0]["articulos"][0]["bultos_raw"] == 20.0
    assert top[1]["nombre_cliente"] == "Cliente Chico"


def test_top_compradores_limit_15():
    rows = [
        _venta_row(erp=str(i), cliente=f"C{i}", bultos=float(i))
        for i in range(1, 20)
    ]
    top = _build_top_compradores_por_articulo(rows, {"2026-06"}, limit=15)
    assert len(top) == 15
    assert top[0]["id_cliente_erp"] == "19"


def test_top_compradores_excluye_devoluciones():
    rows = [
        _venta_row(erp="1", cliente="Comprador", bultos=10, tipo="DEV", importe=-100),
        _venta_row(erp="1", cliente="Comprador", bultos=4),
    ]
    top = _build_top_compradores_por_articulo(rows, {"2026-06"}, limit=15)
    assert len(top) == 1
    assert top[0]["total_bultos_raw"] == 4.0


def test_top_compradores_cigarrillos_desglose_bultos_unidades():
    rows = [
        _venta_row(
            erp="1",
            cliente="Comprador",
            articulo="Marlboro Box",
            bultos=42.37,
            agrupacion="CIGARRILLOS",
        ),
    ]
    top = _build_top_compradores_por_articulo(rows, {"2026-06"}, limit=15)
    art = top[0]["articulos"][0]
    assert art["bultos_enteros"] == 42
    assert art["unidades_resto"] == 92
