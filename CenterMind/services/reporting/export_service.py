# -*- coding: utf-8 -*-
"""
Export service para snapshots de reportería.
Genera XLSX por source (sigo / comprobantes / bultos) desde el snapshot en memoria.
"""
from __future__ import annotations

import io
import logging
from typing import Any

logger = logging.getLogger("ShelfyAPI")


def _wb():
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        return openpyxl, Font, PatternFill, Alignment
    except ImportError:
        raise RuntimeError("openpyxl no instalado — no se puede generar XLSX")


def _header_row(ws, row: list[str], openpyxl_mods):
    _, Font, PatternFill, Alignment = openpyxl_mods
    violet = "7C3AED"
    for col_idx, val in enumerate(row, 1):
        cell = ws.cell(row=1, column=col_idx, value=val)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill(fill_type="solid", fgColor=violet)
        cell.alignment = Alignment(horizontal="center")


def _autofit(ws, max_width: int = 50):
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, max_width)


def export_xlsx(snapshot: dict[str, Any]) -> bytes:
    """Genera XLSX desde el snapshot. Soporta sigo, comprobantes, bultos."""
    source = snapshot.get("source", "")
    mods = _wb()
    openpyxl = mods[0]

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # type: ignore

    # ── Hoja KPIs ─────────────────────────────────────────────────────────────
    ws_kpi = wb.create_sheet("KPIs")
    _header_row(ws_kpi, ["Indicador", "Valor", "Unidad"], mods)
    for kpi in snapshot.get("kpis") or []:
        ws_kpi.append([kpi.get("label"), kpi.get("value"), kpi.get("unit", "")])
    _autofit(ws_kpi)

    # ── Sheets por source ─────────────────────────────────────────────────────
    if source == "sigo":
        _export_sigo(wb, snapshot, mods)
    elif source == "comprobantes":
        _export_comprobantes(wb, snapshot, mods)
    elif source == "bultos":
        _export_bultos(wb, snapshot, mods)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _export_sigo(wb, snapshot: dict, mods):
    # Hoja por_vendedor_y_dia
    ws = wb.create_sheet("Vendedor × Día")
    cols = ["Vendedor", "Fecha", "Planeadas", "Ejecutadas", "Sin Visita",
            "Con Venta", "Motivo No Venta", "Sin Info",
            "H. Primera Visita", "H. Primera Venta", "T. Prom. Venta (min)"]
    _header_row(ws, cols, mods)
    for r in snapshot.get("por_vendedor_y_dia") or []:
        ws.append([
            r.get("vendedor"), r.get("fecha"),
            r.get("planeadas"), r.get("ejecutadas"), r.get("sin_visita"),
            r.get("con_venta"), r.get("motivo_no_venta"), r.get("sin_info"),
            r.get("hora_primera_visita"), r.get("hora_primera_venta"),
            r.get("tiempo_promedio_venta_min"),
        ])
    _autofit(ws)

    # Hoja ranking vendedores
    ws2 = wb.create_sheet("Ranking Vendedores")
    _header_row(ws2, ["Vendedor", "Cobertura %", "Visitados / Total", "Efectividad %", "Ventas"], mods)
    for r in snapshot.get("top_clientes") or []:
        ws2.append([
            r.get("nombre_cliente"),
            r.get("importe_total"),
            r.get("vendedor_nombre"),
            r.get("sucursal_nombre"),
            r.get("cantidad_facturas"),
        ])
    _autofit(ws2)


def _export_comprobantes(wb, snapshot: dict, mods):
    # Hoja top clientes
    ws = wb.create_sheet("Top Clientes")
    _header_row(ws, ["Cliente", "Vendedor", "Sucursal", "Facturas", "Importe Total"], mods)
    for r in snapshot.get("top_clientes") or []:
        ws.append([
            r.get("nombre_cliente"), r.get("vendedor_nombre"), r.get("sucursal_nombre"),
            r.get("cantidad_facturas"), r.get("importe_total"),
        ])
    _autofit(ws)

    # Hoja ranking vendedores
    ws2 = wb.create_sheet("Ranking Vendedores")
    _header_row(ws2, ["Vendedor", "Importe Total"], mods)
    for r in snapshot.get("top_vendedores") or []:
        ws2.append([r.get("nombre"), r.get("valor")])
    _autofit(ws2)


def _export_bultos(wb, snapshot: dict, mods):
    # Hoja top PDVs
    ws = wb.create_sheet("Top PDVs")
    _header_row(ws, ["PDV / Cliente", "Vendedor", "Sucursal", "Bultos Totales", "Prom/Sem"], mods)
    for r in snapshot.get("top_clientes") or []:
        ws.append([
            r.get("nombre_cliente"), r.get("vendedor_nombre"), r.get("sucursal_nombre"),
            r.get("cantidad_facturas"), r.get("importe_total"),
        ])
    _autofit(ws)

    # Hoja top artículos
    ws2 = wb.create_sheet("Top Artículos")
    _header_row(ws2, ["Artículo", "Bultos Totales"], mods)
    for r in snapshot.get("top_vendedores") or []:
        ws2.append([r.get("nombre"), r.get("valor")])
    _autofit(ws2)
