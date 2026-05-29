# -*- coding: utf-8 -*-
"""
Parser enriquecido para reporteador genérico: "Informe de Ventas".

Objetivo:
- Parsear XLSX de Consolido/Reporteador con métricas monetarias y de volumen.
- Devolver un contrato canónico estable para alimentar una futura ingesta v2.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, asdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd

from core.ventas_bultos_rules import bultos_efectivos


def _s(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in {"nan", "none"}:
        return ""
    return s


def _num(v: Any) -> float:
    s = _s(v).replace(" ", "")
    if not s:
        return 0.0
    # Normaliza separadores decimales/miles sin destruir decimales válidos.
    # Casos soportados:
    # - 1234.56
    # - 1,234.56
    # - 1234,56
    # - 1.234,56
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            # Formato tipo 1.234,56
            s = s.replace(".", "").replace(",", ".")
        else:
            # Formato tipo 1,234.56
            s = s.replace(",", "")
    elif "," in s:
        # Formato tipo 1234,56
        s = s.replace(",", ".")
    try:
        return float(Decimal(s))
    except (InvalidOperation, ValueError):
        return 0.0


def _date_ymd(v: Any) -> str | None:
    s = _s(v)
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    dt = pd.to_datetime(s, errors="coerce", dayfirst=True)
    if pd.isna(dt):
        return None
    return dt.strftime("%Y-%m-%d")


def _yn_to_bool(v: Any) -> bool:
    s = _s(v).upper()
    return s in {"SI", "S", "YES", "Y", "TRUE", "1", "ANULADO"}


def _normalize_bultos_by_business_rule(row: "VentaEnrichedRow") -> None:
    """
    Encendedores → bulto crudo Excel.
    Cigarrillos / papelillos / mix exhibidores → conversión desde unidades.
    """
    row.bultos_total = bultos_efectivos(
        row.agrupacion_art_2,
        row.descripcion_articulo,
        row.descripcion_articulo_comp,
        row.unidades_total,
        row.bultos_total,
    )


@dataclass(slots=True)
class VentaEnrichedRow:
    # llaves de contexto
    id_empresa: str
    nombre_empresa: str
    id_sucursal: str
    nombre_sucursal: str
    id_fuerza_ventas: str
    nombre_fuerza_ventas: str
    codigo_vendedor: str
    nombre_vendedor: str
    codigo_supervisor: str
    nombre_supervisor: str
    codigo_gerente: str
    nombre_gerente: str
    ruta: str

    # comprobante
    fecha_pedido: str | None
    fecha_factura: str | None
    anulado: bool
    tipo_documento: str
    serie: str
    numero_documento: str

    # cliente / segmentación
    id_cliente_erp: str
    nombre_cliente: str
    domicilio: str
    localidad: str
    canal_id: str
    canal: str
    subcanal_id: str
    subcanal: str
    subcanal_mkt_id: str
    subcanal_mkt: str

    # producto
    cod_articulo: str
    cod_art_comp: str
    cod_art_alfa: str
    descripcion_articulo: str
    descripcion_articulo_comp: str
    agrupacion_art_1: str
    agrupacion_art_2: str

    # volumen
    bultos_con_cargo: float
    bultos_sin_cargo: float
    bultos_total: float
    bultos_total_cia: float
    um_con_cargo: float
    um_sin_cargo: float
    um_total: float
    um_total_cia: float
    unidades_total: float

    # dinero
    bonificacion: float
    iva: float
    impuesto_212: float
    importe_final: float
    neto_iva: float
    importe_neto: float
    importe_bruto: float
    importe_bonificado: float


def parse_informe_ventas_enriched(file_bytes: bytes) -> list[dict[str, Any]]:
    """
    Devuelve filas canónicas listas para persistir/transformar.
    """
    df = pd.read_excel(io.BytesIO(file_bytes), dtype=object, sheet_name=0)
    rows: list[dict[str, Any]] = []

    for _, r in df.iterrows():
        row = VentaEnrichedRow(
            id_empresa=_s(r.get("IdEmpresa")),
            nombre_empresa=_s(r.get("dsempresa")),
            id_sucursal=_s(r.get("idsucur")),
            nombre_sucursal=_s(r.get("dssucur")),
            id_fuerza_ventas=_s(r.get("idfuerzaventas")),
            nombre_fuerza_ventas=_s(r.get("dsfuerzaventas")),
            codigo_vendedor=_s(r.get("c_perso")),
            nombre_vendedor=_s(r.get("dsvendedor")),
            codigo_supervisor=_s(r.get("c_supervisor")),
            nombre_supervisor=_s(r.get("dssupervisor")),
            codigo_gerente=_s(r.get("c_gerente")),
            nombre_gerente=_s(r.get("dsgerente")),
            ruta=_s(r.get("ruta")),
            fecha_pedido=_date_ymd(r.get("fecha_pedido")),
            fecha_factura=_date_ymd(r.get("fecha_factura")),
            anulado=_yn_to_bool(r.get("anulado")),
            tipo_documento=_s(r.get("cod_tipo_docs")),
            serie=_s(r.get("serie")),
            numero_documento=_s(r.get("nro_documento")),
            id_cliente_erp=_s(r.get("codi_cliente")),
            nombre_cliente=_s(r.get("nomcli")),
            domicilio=_s(r.get("domicli")),
            localidad=_s(r.get("descloca")),
            canal_id=_s(r.get("idcanal")),
            canal=_s(r.get("descanal")),
            subcanal_id=_s(r.get("idsubcanal")),
            subcanal=_s(r.get("dessubcanal")),
            subcanal_mkt_id=_s(r.get("idsubcanalmkt")),
            subcanal_mkt=_s(r.get("dssubcanalmkt")),
            cod_articulo=_s(r.get("cod_articulo")),
            cod_art_comp=_s(r.get("codartComp")),
            cod_art_alfa=_s(r.get("codartalfa")),
            descripcion_articulo=_s(r.get("descrip")),
            descripcion_articulo_comp=_s(r.get("descrip_comp")),
            agrupacion_art_1=_s(r.get("FormaAgrupacionArt1")),
            agrupacion_art_2=_s(r.get("FormaAgrupacionArt2")),
            bultos_con_cargo=_num(r.get("cantidad_con_cargo_bultos")),
            bultos_sin_cargo=_num(r.get("cantidad_sin_cargo_bultos")),
            bultos_total=_num(r.get("cantidad_total_bultos")),
            bultos_total_cia=_num(r.get("cantidad_total_bultos_cia")),
            um_con_cargo=_num(r.get("cantidad_con_cargo_UM")),
            um_sin_cargo=_num(r.get("cantidad_sin_cargo_UM")),
            um_total=_num(r.get("cantidad_total_UM")),
            um_total_cia=_num(r.get("cantidad_total_UM_cia")),
            unidades_total=_num(r.get("cantidad_total_unidades")),
            bonificacion=_num(r.get("bonificacion")),
            iva=_num(r.get("iva1")),
            impuesto_212=_num(r.get("impuesto_212")),
            importe_final=_num(r.get("importe_final")),
            neto_iva=_num(r.get("neto_iva")),
            importe_neto=_num(r.get("importe_neto")),
            importe_bruto=_num(r.get("importe_bruto")),
            importe_bonificado=_num(r.get("importe_bonificado")),
        )
        _normalize_bultos_by_business_rule(row)
        rows.append(asdict(row))

    return rows
