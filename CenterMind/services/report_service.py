# -*- coding: utf-8 -*-
"""
ExcelReportService — Motor de análisis Excel multi-tenant.

Integra la lógica de DH-1 (procesar_datos) y DH-2 (generar_pdf) para
producir informes PDF a partir de archivos Excel de ventas.
"""
from __future__ import annotations

import io
import json
import logging
import os
import tempfile
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger("ShelfyAPI")


# ─── Procesamiento de datos (DH-1) ────────────────────────────────────────────

def _load_reporte(file_bytes: bytes, config: dict) -> pd.DataFrame:
    col_map = config.get("column_mapping", {})
    sku_map = config.get("sku_map", {})
    subcanal_alias = config.get("subcanal_alias", {})
    prefijos_sin_vendedor = config.get("prefijos_sin_vendedor", ["SUPER"])
    subcanales_config = config.get("subcanales_interes", [
        ("MAYORISTA A", "MAY_A"), ("MAYORISTA B", "MAY_B"),
        ("KIOSCO A", "KA"), ("KIOSCO B", "KB"),
        ("KIOSCO C", "KC"), ("KIOSCO CADENA", "KCA"),
    ])
    grupos = config.get("agrupacion_canales", {
        "MAY_TOT": ["MAY_A", "MAY_B"],
        "MIN_TOT": ["KA", "KB", "KC", "KCA"],
    })

    def get_sku(art: Any) -> str:
        art_up = str(art).upper()
        for clave, sku in sku_map.items():
            if clave.upper() in art_up:
                return sku
        return str(art)

    def es_sin_vendedor(nombre: Any) -> bool:
        if pd.isna(nombre):
            return True
        n_up = str(nombre).upper()
        return any(n_up.startswith(p.upper()) for p in prefijos_sin_vendedor)

    df = pd.read_excel(io.BytesIO(file_bytes), header=0)

    col_anulado = col_map.get("anulado", "Anulado")
    if col_anulado in df.columns:
        df = df[df[col_anulado].astype(str).str.upper() == "NO"].copy()

    df["VENDEDOR"] = df[col_map.get("vendedor", "Descripcion Vendedor")].apply(
        lambda x: "Sin Vendedor" if es_sin_vendedor(x) else str(x).strip()
    )
    df["SUC"] = df[col_map.get("sucursal", "Descripcion Sucursal")].str.strip().str.upper()
    df["CANAL"] = df[col_map.get("canal", "Descripcion Canal MKT")].str.upper().str.strip()
    df["SUBCANAL"] = df[col_map.get("subcanal", "Descripcion Subcanal MKT")].str.upper().str.strip()
    df["CLIENTE"] = df[col_map.get("cliente", "Cliente")]
    df["FECHA"] = pd.to_datetime(df[col_map.get("fecha", "Fecha Comprobante")], errors="coerce")
    df["DIA"] = df["FECHA"].dt.day
    df["BULTOS"] = pd.to_numeric(df[col_map.get("bultos", "Bultos Total")], errors="coerce").fillna(0)
    df["SKU"] = df[col_map.get("articulo", "Descripcion de Articulo")].apply(get_sku)

    df["SUBCANAL"] = df["SUBCANAL"].replace(subcanal_alias)

    for sc_name, sc_code in subcanales_config:
        df[sc_code] = df["BULTOS"].where(df["SUBCANAL"] == sc_name, 0)

    for total_col, sub_cols in grupos.items():
        valid_cols = [c for c in sub_cols if c in df.columns]
        df[total_col] = df[valid_cols].sum(axis=1)

    total_cols = [c for c in grupos.keys() if c in df.columns]
    df["TOTAL"] = df[total_cols].sum(axis=1)
    return df


def procesar_datos_tenant(config: dict, archivos_bytes: list[bytes]) -> pd.DataFrame | None:
    """Procesa múltiples archivos Excel y los consolida en un único DataFrame."""
    frames = [_load_reporte(b, config) for b in archivos_bytes]
    if not frames:
        return None

    df_all = pd.concat(frames, ignore_index=True)

    reclasificaciones = config.get("reclasificaciones", [])
    grupos = config.get("agrupacion_canales", {
        "MAY_TOT": ["MAY_A", "MAY_B"],
        "MIN_TOT": ["KA", "KB", "KC", "KCA"],
    })

    for r in reclasificaciones:
        mask = (
            (df_all["SUC"] == r["suc"])
            & (df_all["DIA"] >= r["desde_dia"])
            & (df_all["CANAL"] == r["canal"])
        )
        destino = r["destino"]
        if destino in df_all.columns:
            sources = config.get("columnas_minoristas", ["KA", "KB", "KC", "KCA"])
            df_all.loc[mask, destino] = df_all.loc[mask, [s for s in sources if s in df_all.columns]].sum(axis=1)
            for s in sources:
                if s != destino and s in df_all.columns:
                    df_all.loc[mask, s] = 0

    for total_col, sub_cols in grupos.items():
        valid_cols = [c for c in sub_cols if c in df_all.columns]
        df_all[total_col] = df_all[valid_cols].sum(axis=1)

    total_cols = [c for c in grupos.keys() if c in df_all.columns]
    df_all["TOTAL"] = df_all[total_cols].sum(axis=1)
    return df_all


def inferir_configuracion(file_bytes: bytes) -> dict:
    """
    MODO DESCUBRIMIENTO: analiza un Excel y devuelve un borrador de config JSON.
    El Superadmin lo refina antes de guardar en tenant_report_configs.
    """
    df = pd.read_excel(io.BytesIO(file_bytes), header=0, nrows=1000)
    cols = df.columns.tolist()

    keywords = {
        "vendedor": ["vend", "vendedor", "nombre vendedor", "ejecutivo"],
        "sucursal": ["suc", "sucursal", "branch"],
        "canal": ["canal", "mkt", "tipo"],
        "subcanal": ["subcanal", "segmento"],
        "cliente": ["cliente", "razon social", "pdv"],
        "fecha": ["fecha", "comprobante", "dia"],
        "bultos": ["bultos", "cantidad", "unidades"],
        "articulo": ["articulo", "descripcion", "item"],
        "anulado": ["anulado", "estado", "valid"],
    }

    detected_cols: dict[str, str] = {}
    for key, kw_list in keywords.items():
        found = next(
            (c for c in cols if any(kw.upper() in c.upper() for kw in kw_list)), None
        )
        if found:
            detected_cols[key] = found

    suc_col = detected_cols.get("sucursal")
    sucs = sorted(df[suc_col].astype(str).unique().tolist()) if suc_col else []

    art_col = detected_cols.get("articulo")
    frecuentes: list[str] = []
    if art_col:
        frecuentes = df[art_col].value_counts().head(20).index.tolist()

    return {
        "empresa": "NOMBRE DEL TENANT (COMPLETAR)",
        "mes_reporte": "MES AÑO (COMPLETAR)",
        "branding": {"primary": "#1A3A5C", "secondary": "#2E6DA4", "accent_green": "#1D9E75"},
        "column_mapping": detected_cols,
        "sku_map": {art: str(art).split()[-1] for art in frecuentes},
        "sucs_orden": sucs,
        "colores_sucursales": {s: "#1A3A5C" for s in sucs},
        "subcanal_alias": {},
        "subcanales_interes": [["MAYORISTA A", "MAY_A"], ["KIOSCO A", "KA"]],
        "agrupacion_canales": {"MAY_TOT": ["MAY_A"], "MIN_TOT": ["KA"]},
        "prefijos_sin_vendedor": ["SUPER"],
        "reclasificaciones": [],
    }


# ─── Generación de PDF (DH-2) ─────────────────────────────────────────────────

def generar_pdf_tenant(df_all: pd.DataFrame, config: dict) -> bytes:
    """
    Genera el PDF usando la configuración del tenant.
    Devuelve los bytes del PDF generado.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        raise RuntimeError(
            "reportlab no está instalado. Ejecuta: pip install reportlab"
        ) from exc

    empresa_name = config.get("empresa", "SISTEMA SHELFY")
    mes_label = config.get("mes_reporte", "Reporte")
    colores_suc = config.get("colores_sucursales", {})
    sucs_orden = config.get("sucs_orden", sorted(df_all["SUC"].unique()))

    branding = config.get("branding", {})
    primary_color = colors.HexColor(branding.get("primary", "#1A3A5C"))
    secondary_color = colors.HexColor(branding.get("secondary", "#2E6DA4"))

    GRIS_OSC = colors.HexColor("#444444")
    GRIS_MED = colors.HexColor("#888888")
    GRIS_CLR = colors.HexColor("#F4F4F4")
    GRIS_BRD = colors.HexColor("#DDDDDD")
    BLANCO = colors.white

    PW, _ = landscape(A4)
    CONT_W = PW - 30 * mm

    def mk(name: str, **kw: Any) -> ParagraphStyle:
        d: dict[str, Any] = dict(fontName="Helvetica", textColor=GRIS_OSC, leading=12, fontSize=9)
        d.update(kw)
        return ParagraphStyle(name, **d)

    ST = {
        "titulo": mk("ti", fontName="Helvetica-Bold", fontSize=20, textColor=BLANCO, leading=26, alignment=TA_CENTER),
        "subtit": mk("su", fontSize=11, textColor=BLANCO, leading=15, alignment=TA_CENTER),
        "h2": mk("h2", fontName="Helvetica-Bold", fontSize=10, textColor=secondary_color, leading=14, spaceBefore=5, spaceAfter=2),
        "th": mk("th", fontName="Helvetica-Bold", fontSize=7.5, textColor=BLANCO, alignment=TA_CENTER, leading=9),
        "td": mk("td", fontSize=7.5, alignment=TA_LEFT, leading=9),
        "td_r": mk("tdr", fontSize=7.5, alignment=TA_RIGHT, leading=9),
        "td_c": mk("tdc", fontSize=7.5, alignment=TA_CENTER, leading=9),
        "td_b": mk("tdb", fontName="Helvetica-Bold", fontSize=7.5, alignment=TA_LEFT, leading=9),
        "td_br": mk("tdbr", fontName="Helvetica-Bold", fontSize=7.5, alignment=TA_RIGHT, leading=9),
        "nota": mk("nt", fontName="Helvetica-Oblique", fontSize=7, textColor=GRIS_MED),
    }

    def P(txt: Any, sty: str = "td") -> Paragraph:
        return Paragraph(str(txt), ST[sty])

    def fmt(v: Any) -> str:
        return "—" if (v == 0 or pd.isna(v)) else f"{v:,.0f}"

    def pct(v: Any, t: Any) -> str:
        return "—" if not t else f"{v / t * 100:.1f}%"

    def banner(titulo: str, col: Any) -> Table:
        t = Table([[P(titulo, "titulo")]], colWidths=[CONT_W])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), col)]))
        return t

    def std_tbl(rows: list, cws: list, hcol: Any = None) -> Table:
        if hcol is None:
            hcol = primary_color
        t = Table(rows, colWidths=cws, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), hcol),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, GRIS_CLR]),
            ("GRID", (0, 0), (-1, -1), 0.3, GRIS_BRD),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        return t

    story = []

    # Portada
    story.append(Spacer(1, 20 * mm))
    story.append(banner(empresa_name, primary_color))
    story.append(Spacer(1, 10 * mm))
    story.append(banner(f"INFORME DE GESTION — {mes_label}", secondary_color))
    story.append(PageBreak())

    # KPI global
    total_general = df_all["TOTAL"].sum()
    total_clientes = df_all["CLIENTE"].nunique()
    total_vendedores = df_all[df_all["VENDEDOR"] != "Sin Vendedor"]["VENDEDOR"].nunique()

    story.append(P("Resumen Ejecutivo", "h2"))
    kpi_rows = [
        [P("Métrica", "th"), P("Valor", "th")],
        [P("Total Bultos"), P(fmt(total_general), "td_r")],
        [P("Clientes Únicos"), P(str(total_clientes), "td_r")],
        [P("Vendedores Activos"), P(str(total_vendedores), "td_r")],
        [P("Sucursales"), P(str(df_all["SUC"].nunique()), "td_r")],
    ]
    story.append(std_tbl(kpi_rows, [CONT_W * 0.6, CONT_W * 0.4]))
    story.append(PageBreak())

    # Página por sucursal
    for suc in sucs_orden:
        d = df_all[df_all["SUC"] == suc]
        if len(d) == 0:
            continue

        suc_hex = colores_suc.get(suc, branding.get("primary", "#1A3A5C"))
        suc_col = colors.HexColor(suc_hex)
        story.append(banner(f"SUCURSAL: {suc}", suc_col))

        deq = d[d["VENDEDOR"] != "Sin Vendedor"]
        vends = sorted(deq["VENDEDOR"].unique())
        eq_tot = deq["TOTAL"].sum()

        hdr = [P(c, "th") for c in ["Vendedor", "Total Bultos", "% Participación", "Clientes"]]
        rows = [hdr]
        for v in vends:
            dv = deq[deq["VENDEDOR"] == v]
            vt = dv["TOTAL"].sum()
            rows.append([
                P(v, "td_b"),
                P(fmt(vt), "td_r"),
                P(pct(vt, eq_tot), "td_c"),
                P(str(dv["CLIENTE"].nunique()), "td_c"),
            ])

        # Fila total
        rows.append([
            P("TOTAL", "td_b"),
            P(fmt(eq_tot), "td_br"),
            P("100%", "td_c"),
            P(str(deq["CLIENTE"].nunique()), "td_c"),
        ])

        story.append(Spacer(1, 5 * mm))
        story.append(P("Resumen de ventas por equipo de ruta", "h2"))
        col_widths = [CONT_W * 0.4, CONT_W * 0.2, CONT_W * 0.2, CONT_W * 0.2]
        story.append(std_tbl(rows, col_widths, suc_col))
        story.append(PageBreak())

    # Generar a bytes
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
    doc.build(story)
    buf.seek(0)
    return buf.read()


# ─── Fachada pública ──────────────────────────────────────────────────────────

class ExcelReportService:
    """Fachada pública del motor de informes. Instanciar una vez al inicio."""

    def process_and_generate(self, files_bytes: list[bytes], config: dict) -> bytes:
        """Procesa los Excels y genera el PDF. Devuelve bytes del PDF."""
        df = procesar_datos_tenant(config, files_bytes)
        if df is None or df.empty:
            raise ValueError("No se encontraron datos válidos en los archivos proporcionados.")
        return generar_pdf_tenant(df, config)

    def infer_config(self, file_bytes: bytes) -> dict:
        """Analiza un Excel y devuelve un borrador de configuración."""
        return inferir_configuracion(file_bytes)


report_service = ExcelReportService()
