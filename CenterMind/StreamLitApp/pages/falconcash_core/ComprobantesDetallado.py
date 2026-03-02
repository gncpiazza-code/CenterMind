# file: ComprobantesDetallado.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import sys
import datetime as dt
from typing import Dict, List, Tuple
import unicodedata

import numpy as np
import pandas as pd
import xlsxwriter

# ============================== IMPORTS ROBUSTOS ==============================
def _load_utils_helpers():
    try:
        from utils import leer_excel as _leer_excel, parse_fecha_robusta as _parse_fecha_robusta
        return _leer_excel, _parse_fecha_robusta
    except Exception:
        pass
    import pandas as pd
    return pd.read_excel, pd.to_datetime

leer_excel, parse_fecha_robusta = _load_utils_helpers()

SUCURSALES_MAP = {}  # Inyectado desde Shelfy

# ============================== CONSTANTES ==============================

CANONICAL: Dict[str, List[str]] = {
    "numero": ["numero", "número", "nro comprobante", "nro"],
    "desc_comprobante": ["descripcion comprobante", "descripción comprobante", "tipo comprobante", "comprobante"],
    "fecha_comprobante": ["fecha comprobante", "fecha"],
    "anulado": ["anulado", "estado", "anul"],
    "desc_sucursal": ["descripcion sucursal", "sucursal"],
    "desc_vendedor": ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "proveedor": ["descripcion proveedor", "descripción proveedor", "proveedor", "proovedor", "desc proveedor", "prov"],
    "cliente": ["cliente", "codigo cliente", "cod cliente", "nro cliente"],
    "razon_social": ["razon social", "razón social", "nombre cliente", "nombre"],
    "desc_canal_mkt": ["descripcion canal mkt", "canal mkt", "canal", "descripcion c subcanal"],
    "desc_subcanal_mkt": ["descripcion subcanal mkt", "subcanal mkt", "subcanal"],
    "codigo_articulo": ["codigo articulo", "cod art", "articulo", "codigo de articulo", "Codigo de Articulo"],
    "desc_articulo": ["descripcion articulo", "desc art", "descripción artículo", "descripcion de articulo", "Descripcion de Articulo"],
    "bultos_cargo": ["bultos total", "total bultos", "bultos con cargo", "bultos", "bultos cargo"],
    "subtotal_final": ["subtotal final", "importe", "total"],
}

# ============================== UTILS ==============================
def _strip_accents(text: str) -> str:
    if not isinstance(text, str): return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))

def _norm(s: str) -> str:
    s = _strip_accents(str(s)).lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s)

def _first_match(cols: List[str], patterns: List[str]) -> str | None:
    normcols = [(c, _norm(c)) for c in cols]
    pats = [_norm(p) for p in patterns]
    for p in pats:
        for c, nc in normcols:
            if nc == p: return c
    for p in pats:
        for c, nc in normcols:
            if p in nc: return c
    return None

def _map_columns(df: pd.DataFrame) -> Dict[str, str | None]:
    mapping: Dict[str, str | None] = {}
    cols = list(df.columns)
    for k, pats in CANONICAL.items():
        mapping[k] = _first_match(cols, pats)
    return mapping

def _xl_cell(row: int, col: int) -> str:
    letters = ""
    col += 1
    while col:
        col, rem = divmod(col - 1, 26)
        letters = chr(65 + rem) + letters
    return f"{letters}{row + 1}"

def _parse_bultos(series: pd.Series) -> pd.Series:
    def to_float(x) -> float:
        if pd.isna(x): return 0.0
        s = str(x).strip().replace(",", ".")
        if s == "" or s.lower() in {"nan", "none"}: return 0.0
        if s.startswith("-."): s = "-0" + s[1:]
        elif s.startswith("."): s = "0" + s
        try: return abs(float(s))
        except Exception: return 0.0
    return series.map(to_float).astype(float)

# ============================== FUNCIONES DE BÚSQUEDA INTELIGENTE ==============================

def _parse_fecha_robusta_fallback(s: pd.Series) -> pd.Series:
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    num = pd.to_numeric(s, errors="coerce")
    mask_num = num.notna() & num.between(1, 120000)
    if mask_num.any():
        out.loc[mask_num] = pd.to_datetime(num[mask_num], unit="D", origin="1899-12-30", errors="coerce")
    mask_dt = s.apply(lambda x: isinstance(x, (pd.Timestamp, dt.datetime, dt.date)))
    if mask_dt.any():
        out.loc[mask_dt] = pd.to_datetime(s[mask_dt], errors="coerce")
    mask_str = s.apply(lambda x: isinstance(x, str))
    if mask_str.any():
        st = s[mask_str].str.strip().str.replace(r"[.\- ]", "/", regex=True)
        p1 = pd.to_datetime(st, errors="coerce", dayfirst=True)
        miss = p1.isna() & st.ne("")
        if miss.any():
            p2 = pd.to_datetime(st[miss], errors="coerce", dayfirst=False)
            p1.loc[miss] = p2
        out.loc[mask_str] = out.loc[mask_str].fillna(p1)
    return out

def _find_date_column(df_raw: pd.DataFrame) -> str:
    if "Fecha Comprobante" in df_raw.columns: return "Fecha Comprobante"
    candidates = [c for c in df_raw.columns if "fecha" in _norm(str(c))]
    if not candidates: 
        candidates = list(df_raw.columns)
    
    sample = df_raw.head(400)
    parser = parse_fecha_robusta or _parse_fecha_robusta_fallback
    best_col, best_ratio = None, 0.0
    
    for c in candidates:
        try:
            parsed = parser(sample[c])
            ratio = parsed.notna().mean()
            if ratio > best_ratio: 
                best_ratio, best_col = ratio, c
        except:
            continue
            
    if best_col and best_ratio >= 0.6:
        return best_col
    return "Fecha Comprobante" if "Fecha Comprobante" in df_raw.columns else df_raw.columns[0]

def _find_proveedor_column(df_raw: pd.DataFrame) -> str:
    cols = list(df_raw.columns)
    candidates = [c for c in cols if ("provee" in _norm(c)) or (_norm(c).startswith("prov"))]
    
    if not candidates:
        candidates = cols

    best_col = None
    best_score = (-1.0, -1.0, -1.0)
    
    for c in candidates:
        s = df_raw[c].astype(str)
        n = s.apply(_norm)
        
        brand = (n.str.contains(r"\breal\b", na=False) & n.str.contains(r"\btabacalera\b", na=False)).mean()
        alpha = s.str.contains(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]", regex=True, na=False).mean()
        avg_len = s.str.len().fillna(0).mean()
        
        score = (brand, alpha, avg_len)
        if score > best_score:
            best_score, best_col = score, c

    if best_col is None:
        return candidates[0] if candidates else cols[0]
        
    return best_col

# ============================== PREPARACIÓN (LÓGICA FLEXIBLE) ==============================
def _preparar_detallado(df_raw: pd.DataFrame):
    mapping = _map_columns(df_raw)
    df = df_raw.copy()
    
    # Renombrar columnas mapeadas
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)

    for k in CANONICAL.keys():
        if k not in df.columns: df[k] = np.nan

    if "desc_sucursal" in df.columns:
        df["desc_sucursal"] = df["desc_sucursal"].astype(str).str.strip()
        if SUCURSALES_MAP:
             df["desc_sucursal"] = df["desc_sucursal"].map(SUCURSALES_MAP).fillna(df["desc_sucursal"])

    sucursal = str(df["desc_sucursal"].dropna().iloc[0]) if not df["desc_sucursal"].dropna().empty else "Sucursal"

    # Lógica heurística para fecha
    fecha_col = _find_date_column(df_raw)
    parser = parse_fecha_robusta or _parse_fecha_robusta_fallback
    df["fecha"] = parser(df_raw[fecha_col])
    
    df = df[df["fecha"].notna()].copy()
    df["fecha_dia"] = df["fecha"].dt.date

    if df["fecha_dia"].dropna().empty:
        fmin = fmax = dt.date.today(); semanas = 1
    else:
        fmin = df["fecha_dia"].min(); fmax = df["fecha_dia"].max()
        semanas = max(1, ((fmax - fmin).days // 7) + 1)

    # Lógica heurística para proveedor
    prov_col = _find_proveedor_column(df_raw)
    df["proveedor"] = df_raw[prov_col]

    df["norm_comprobante"] = df["desc_comprobante"].astype(str).apply(_norm)
    df["norm_anulado"] = df["anulado"].astype(str).apply(_norm)
    df["norm_proveedor"] = df["proveedor"].astype(str).apply(_norm)
    
    # Bultos: Aseguramos limpieza numérica
    df["bultos_cargo"] = _parse_bultos(df["bultos_cargo"])

    # --- FILTROS ESTRICTOS / FLEXIBLES ---
    
    # 1. Proveedor: Flexibilidad
    # Intento buscar explícitamente "Real Tabacalera"
    mask_proveedor_strict = (
        df["norm_proveedor"].str.contains("real tabacalera", na=False) |
        (df["norm_proveedor"].str.contains(r"\breal\b", na=False) &
         df["norm_proveedor"].str.contains(r"\btabacalera\b", na=False))
    )

    # Si hay coincidencias, filtramos por ellas. Si NO hay coincidencias, permitimos todo (Todo True).
    if mask_proveedor_strict.any():
        mask_final_proveedor = mask_proveedor_strict
        print("INFO: Se detectó 'Real Tabacalera'. Filtrando datos específicos.")
    else:
        mask_final_proveedor = pd.Series(True, index=df.index)
        print("INFO: NO se detectó 'Real Tabacalera'. Analizando TODOS los proveedores disponibles.")

    # 2. Comprobante: Debe contener "factura"
    mask_comprobante = (
        df["norm_comprobante"].str.contains(r"\bfactura\b", na=False) |
        df["norm_comprobante"].str.contains(r"\bfactura presupuesto\b", na=False)
    )

    # 3. Anulado: No debe estar anulado
    es_anulado = df["norm_anulado"].isin({"si", "anulado", "true", "1"})
    mask_anulado = ~es_anulado
    
    # 4. Bultos: Debe tener bultos > 0
    mask_bultos = df["bultos_cargo"] != 0

    # Aplicamos filtros
    df_filtrado = df[mask_final_proveedor & mask_comprobante & mask_anulado & mask_bultos].copy()

    # Rellenos finales
    df_filtrado["desc_vendedor"] = df_filtrado["desc_vendedor"].fillna("SIN VENDEDOR")
    df_filtrado["desc_canal_mkt"] = df_filtrado["desc_canal_mkt"].fillna("SIN CANAL")
    df_filtrado["desc_subcanal_mkt"] = df_filtrado["desc_subcanal_mkt"].fillna("SIN SUBCANAL")

    desc = df_filtrado["desc_articulo"].astype(str).str.strip().replace(["", "nan", "None"], "")
    cod = df_filtrado["codigo_articulo"].astype(str).str.strip().replace(["", "nan", "None"], "")
    df_filtrado["desc_articulo"] = (np.where(cod != "", "[" + cod + "] ", "") + desc).str.strip().replace("", "SIN ARTICULO")

    cli_num = df_filtrado["cliente"].astype(str).str.strip().replace(["", "nan", "None"], "")
    cli_rs = df_filtrado["razon_social"].astype(str).str.strip().replace(["", "nan", "None"], "")
    df_filtrado["cliente_final"] = (np.where(cli_num != "", "[" + cli_num + "] ", "") + cli_rs).str.strip().replace("", "SIN CLIENTE")

    global_cols_df = df_filtrado[["desc_canal_mkt", "desc_subcanal_mkt"]].drop_duplicates().sort_values(by=["desc_canal_mkt", "desc_subcanal_mkt"])
    global_cols_tuples = list(global_cols_df.itertuples(index=False, name=None))

    return df_filtrado, sucursal, fmin, fmax, semanas, global_cols_tuples

# ============================== FORMATOS EXCEL ==============================
class _Fmt:
    def __init__(self, book):
        self.title   = book.add_format({"bold": True, "font_size": 14})
        self.bold    = book.add_format({"bold": True})
        self.red     = book.add_format({"bg_color": "#FFC7CE", "font_color": "#9C0006"})
        self.number  = book.add_format({"num_format": "#,##0.00"})
        self.number_bold = book.add_format({"num_format": "#,##0.00", "bold": True})
        self.small   = book.add_format({"font_size": 9, "italic": True, "font_color": "#595959"})
        self.estim_title = book.add_format({"bold": True, "font_size": 12, "align": "center", "fg_color": "#4472C4", "font_color": "FFFFFF"})
        self.estim_header = book.add_format({"bold": True, "border": 1, "align": "center", "valign": "vcenter", "bg_color": "#70AD47", "font_color": "FFFFFF"})
        self.estim_text = book.add_format({"border": 1})
        self.estim_number_total = book.add_format({"num_format": "#,##0.00", "bg_color": "#F0F0F0", "border": 1})
        self.estim_number_prom = book.add_format({"num_format": "#,##0.00", "bold": True, "bg_color": "#E2EFDA", "border": 1})
        self.cli_title = book.add_format({"bold": True, "font_size": 12, "align": "center", "fg_color": "#ED7D31", "font_color": "FFFFFF"})
        self.cli_header = book.add_format({"bold": True, "border": 1, "align": "center", "valign": "vcenter", "bg_color": "#F4B084", "font_color": "000000"})
        self.cli_text = book.add_format({"border": 1})
        self.cli_num = book.add_format({"num_format": "#,##0.00", "border": 1})
        minor_bg, mayor_bg = "#FFF2CC", "#DDEBF7"
        self.pdv_text_minorista = book.add_format({"border": 1, "bg_color": minor_bg})
        self.pdv_num_minorista  = book.add_format({"num_format": "#,##0.00", "border": 1, "bg_color": minor_bg})
        self.pdv_prom_minorista = book.add_format({"num_format": "#,##0.00", "bold": True, "border": 1, "bg_color": minor_bg})
        self.pdv_text_mayorista = book.add_format({"border": 1, "bg_color": mayor_bg})
        self.pdv_num_mayorista  = book.add_format({"num_format": "#,##0.00", "border": 1, "bg_color": mayor_bg})
        self.pdv_prom_mayorista = book.add_format({"num_format": "#,##0.00", "bold": True, "border": 1, "bg_color": mayor_bg})

# ============================== HOJA BULTOS ==============================
def _generar_reporte_bultos(writer, df, fmin, fmax, semanas, global_cols_tuples):
    ws = writer.book.add_worksheet("Reporte por Bultos")
    f = _Fmt(writer.book)
    row_cursor = 0

    ws.write(row_cursor, 0, "Reporte de Bultos por Vendedor, Canal y Subcanal", f.title); row_cursor += 1
    ws.write(row_cursor, 0, f"Período: {fmin.strftime('%d-%m-%Y')} a {fmax.strftime('%d-%m-%Y')}", f.bold); row_cursor += 1
    ws.write(row_cursor, 0, f"Semanas detectadas: {semanas}", f.bold); row_cursor += 2

    vendedores = sorted([v for v in df["desc_vendedor"].unique() if v != "SIN VENDEDOR"]) + ["SIN VENDEDOR"]
    df_pivote = df[df["bultos_cargo"] != 0]
    
    if df_pivote.empty:
        ws.write(row_cursor, 0, "No hay datos de bultos (Post-filtros).", f.red)
        return

    max_art_len = max(10, df_pivote["desc_articulo"].map(str).map(len).max()) if not df_pivote.empty else 10
    AUTOFIT_ART_WIDTH = max(max_art_len + 2, 30)

    if not global_cols_tuples:
        global_multiindex = pd.MultiIndex.from_arrays([[], []], names=["desc_canal_mkt", "desc_subcanal_mkt"])
    else:
        global_multiindex = pd.MultiIndex.from_tuples(global_cols_tuples, names=["desc_canal_mkt", "desc_subcanal_mkt"])
    
    all_cols_count = len(global_multiindex)
    GLOBAL_ESTIM_START_COL_IDX = (1 + all_cols_count + 1) + 2

    pivot_table_cols_def = [{"header": "Artículo", "total_string": "Total General"}]
    for _, subcanal in global_cols_tuples:
        pivot_table_cols_def.append({"header": subcanal, "total_function": "sum"})
    pivot_table_cols_def.append({"header": "Total General", "total_function": "sum"})

    vendor_grand_total_cells = {}

    for vendedor in vendedores:
        df_vend = df_pivote[df_pivote["desc_vendedor"] == vendedor]
        if df_vend.empty: continue

        vendor_start_row = row_cursor
        ws.write(vendor_start_row, 0, f"Vendedor: {vendedor}", f.title)

        explain_row = vendor_start_row + 2
        canal_header_row = explain_row + 1
        table_start_row = canal_header_row + 1

        ws.merge_range(explain_row, 0, explain_row, all_cols_count + 1, "Tabla 1: Suma de bultos por artículo y canal.", f.small)

        pivot_data = df_vend.pivot_table(index="desc_articulo", columns=["desc_canal_mkt", "desc_subcanal_mkt"], values="bultos_cargo", aggfunc="sum", fill_value=0)
        pivot = pivot_data.reindex(columns=global_multiindex, fill_value=0).sort_index()

        col_start = 1
        for canal_val, group_cols in pivot.columns.groupby(pivot.columns.get_level_values(0)).items():
            num_subs = len(group_cols)
            if num_subs > 1:
                ws.merge_range(canal_header_row, col_start, canal_header_row, col_start + num_subs - 1, canal_val, f.estim_header)
            else:
                ws.write(canal_header_row, col_start, canal_val, f.estim_header)
            col_start += num_subs

        ws.write(table_start_row, 0, "Artículo", f.estim_header)
        col_idx = 1
        for _, subcanal in global_cols_tuples:
            ws.write(table_start_row, col_idx, subcanal, f.estim_header)
            col_idx += 1
        ws.write(canal_header_row, all_cols_count + 1, "Total General", f.estim_header)
        ws.write(table_start_row, all_cols_count + 1, "Total General", f.estim_header)

        articulos = pivot.index.tolist()
        num_articulos = len(articulos)
        start_data_row_pivot = table_start_row + 1

        if num_articulos > 0:
            flat_values = pivot.values
            for i in range(num_articulos):
                current_row = start_data_row_pivot + i
                ws.write(current_row, 0, articulos[i], None)
                for j, val in enumerate(flat_values[i]):
                    ws.write(current_row, j + 1, float(val), f.number)
                start_cell = _xl_cell(current_row, 1)
                end_cell = _xl_cell(current_row, all_cols_count)
                ws.write_formula(current_row, all_cols_count + 1, f"=SUM({start_cell}:{end_cell})", f.number_bold)

            total_row_excel = start_data_row_pivot + num_articulos
            ws.add_table(table_start_row, 0, total_row_excel, all_cols_count + 1, {
                "columns": pivot_table_cols_def, "total_row": True, "style": "TableStyleMedium9"
            })
            vendor_grand_total_cells[vendedor] = _xl_cell(total_row_excel, all_cols_count + 1)

        estim_start_col = GLOBAL_ESTIM_START_COL_IDX
        ws.merge_range(explain_row, estim_start_col, explain_row, estim_start_col + 2, "Tabla 2: Ranking de artículos", f.small)

        df_agg = df_vend.groupby("desc_articulo").agg(total_bultos=("bultos_cargo", "sum")).reset_index()
        df_agg["promedio_semanal"] = df_agg["total_bultos"] / max(1, semanas)
        df_agg = df_agg[df_agg["total_bultos"] > 0].sort_values(by="promedio_semanal", ascending=False)
        
        num_articulos_estim = 0
        if not df_agg.empty:
            num_articulos_estim = len(df_agg)
            ws.merge_range(canal_header_row, estim_start_col, canal_header_row, estim_start_col + 2, "Estimación (Promedio)", f.estim_title)
            for j, h in enumerate(["Artículo", "Total Bultos", "Prom Semanal"]):
                ws.write(table_start_row, estim_start_col + j, h, f.estim_header)
            
            estim_start_data = table_start_row + 1
            for i, r in enumerate(df_agg.itertuples()):
                ws.write(estim_start_data + i, estim_start_col + 0, r.desc_articulo, f.estim_text)
                ws.write(estim_start_data + i, estim_start_col + 1, r.total_bultos, f.estim_number_total)
                ws.write(estim_start_data + i, estim_start_col + 2, r.promedio_semanal, f.estim_number_prom)

        max_top_row = max(start_data_row_pivot + num_articulos + 1, start_data_row_pivot + num_articulos_estim)
        cli_title_row = max_top_row + 3
        cli_header_row = cli_title_row + 1
        cli_start_data = cli_header_row + 1
        cli_start_col = 0

        ws.merge_range(cli_title_row - 1, cli_start_col, cli_title_row - 1, cli_start_col + 5, "Tabla 3: Listado de Clientes", f.small)
        
        df_cli = df_vend.groupby(["cliente", "razon_social", "desc_canal_mkt", "desc_subcanal_mkt"]).agg(total_bultos=("bultos_cargo", "sum")).reset_index()
        df_cli["promedio_semanal"] = df_cli["total_bultos"] / max(1, semanas)
        df_cli = df_cli.sort_values(by="promedio_semanal", ascending=False)

        if not df_cli.empty:
            num_cli = len(df_cli)
            ws.merge_range(cli_title_row, cli_start_col, cli_title_row, cli_start_col + 5, "Análisis Clientes (Promedio)", f.cli_title)
            for j, h in enumerate(["Cliente", "Razón Social", "Canal", "Subcanal", "Prom Semanal", "Venta Total"]):
                ws.write(cli_header_row, cli_start_col + j, h, f.cli_header)
            
            for i, r in enumerate(df_cli.itertuples()):
                c_idx = cli_start_data + i
                ws.write(c_idx, cli_start_col + 0, r.cliente, f.cli_text)
                ws.write(c_idx, cli_start_col + 1, r.razon_social, f.cli_text)
                ws.write(c_idx, cli_start_col + 2, r.desc_canal_mkt, f.cli_text)
                ws.write(c_idx, cli_start_col + 3, r.desc_subcanal_mkt, f.cli_text)
                ws.write(c_idx, cli_start_col + 4, r.promedio_semanal, f.cli_num)
                ws.write(c_idx, cli_start_col + 5, r.total_bultos, f.cli_num)
            row_cursor = cli_start_data + num_cli + 4
        else:
            row_cursor = cli_start_data + 4
    
    row_cursor += 1
    ws.write(row_cursor, 0, "RESUMEN TOTALES", f.title); row_cursor += 2
    if vendor_grand_total_cells:
        t_start = row_cursor
        v_sorted = sorted(vendor_grand_total_cells.keys())
        for i, vend in enumerate(v_sorted):
            ws.write(t_start + 1 + i, 0, vend, None)
            ws.write_formula(t_start + 1 + i, 1, f"={vendor_grand_total_cells[vend]}", f.number)
        
        ws.add_table(t_start, 0, t_start + len(v_sorted) + 1, 1, {
            "columns": [{"header": "Vendedor", "total_string": "TOTAL"}, {"header": "Total Bultos", "total_function": "sum"}],
            "total_row": True, "style": "TableStyleMedium9"
        })

    ws.set_column("A:A", max(30, AUTOFIT_ART_WIDTH))
    if all_cols_count > 0: ws.set_column(1, all_cols_count, 15)
    ws.set_column(all_cols_count+1, all_cols_count+1, 18)
    est_base = GLOBAL_ESTIM_START_COL_IDX
    ws.set_column(est_base, est_base, max(30, AUTOFIT_ART_WIDTH))
    ws.set_column(est_base + 1, est_base + 2, 15)

# ============================== HOJA PDV +2.5 ==============================
def _generar_pdv_mayor_25(writer, df, fmin, fmax, semanas):
    ws = writer.book.add_worksheet("PDV +2.5")
    f = _Fmt(writer.book)
    row = 0

    ws.write(row, 0, "Clientes con Promedio Semanal > 2.5 Cajas", f.title); row += 1
    ws.write(row, 0, f"Período: {fmin.strftime('%d-%m-%Y')} a {fmax.strftime('%d-%m-%Y')}", f.bold); row += 1
    ws.write(row, 0, f"Semanas detectadas: {semanas} | Umbral: > 2.5", f.small); row += 2
    
    ws.write(row, 0, "Leyenda:", f.bold)
    ws.write(row, 1, "MINORISTA", f.pdv_text_minorista)
    ws.write(row, 2, "MAYORISTA", f.pdv_text_mayorista); row += 2

    agg = df.groupby(["cliente", "razon_social", "desc_vendedor", "desc_canal_mkt", "desc_subcanal_mkt"], dropna=False).agg(total_bultos=("bultos_cargo", "sum")).reset_index()
    agg["promedio_semanal"] = agg["total_bultos"] / max(1, semanas)
    sel = agg[agg["promedio_semanal"] > 2.5].copy()
    sel = sel.sort_values(by=["desc_vendedor", "promedio_semanal"], ascending=[True, False])

    headers = ["Cliente", "Razón Social", "Vendedor", "Canal", "Subcanal", "Prom Semanal", "Venta Total en Periodo"]

    if sel.empty:
        ws.write(row, 0, "No se encontraron clientes por encima del umbral.", f.red)
        return

    for j, h in enumerate(headers):
        ws.write(row, j, h, f.cli_header)
    row_data = row + 1

    for i, r in enumerate(sel.itertuples(index=False)):
        canal_n = _norm(getattr(r, "desc_canal_mkt"))
        is_minorista, is_mayorista = "minorista" in canal_n, "mayorista" in canal_n
        
        t_fmt, n_fmt, p_fmt = f.cli_text, f.cli_num, f.cli_num
        if is_minorista: t_fmt, n_fmt, p_fmt = f.pdv_text_minorista, f.pdv_num_minorista, f.pdv_prom_minorista
        elif is_mayorista: t_fmt, n_fmt, p_fmt = f.pdv_text_mayorista, f.pdv_num_mayorista, f.pdv_prom_mayorista

        ws.write(row_data + i, 0, getattr(r, "cliente"), t_fmt)
        ws.write(row_data + i, 1, getattr(r, "razon_social"), t_fmt)
        ws.write(row_data + i, 2, getattr(r, "desc_vendedor"), t_fmt)
        ws.write(row_data + i, 3, getattr(r, "desc_canal_mkt"), t_fmt)
        ws.write(row_data + i, 4, getattr(r, "desc_subcanal_mkt"), t_fmt)
        ws.write(row_data + i, 5, float(getattr(r, "promedio_semanal")), p_fmt)
        ws.write(row_data + i, 6, float(getattr(r, "total_bultos")), n_fmt)

    last = row_data + len(sel) - 1
    ws.add_table(row, 0, last, len(headers) - 1, {
        "columns": ([{"header": h} for h in headers[:-1]] + [{"header": "Venta Total en Periodo", "total_function": "sum"}]),
        "total_row": True, "style": "TableStyleMedium9",
    })
    ws.set_column("A:A", 12); ws.set_column("B:B", 32); ws.set_column("C:C", 18); ws.set_column("D:E", 16); ws.set_column("F:G", 20)

# ============================== API ==============================

def generar_reporte_detallado(input_path: str, output_dir: str, nombre_sucursal: str = 'Sucursal') -> str:
    subfolder_path = os.path.join(output_dir, "Reporte Bultos")
    os.makedirs(subfolder_path, exist_ok=True)
    
    df_raw = leer_excel(input_path)
    df, sucursal, fmin, fmax, semanas, global_cols_tuples = _preparar_detallado(df_raw)
    sucursal = nombre_sucursal  # <--- Inyectado

    f_txt = f"{fmin.strftime('%d-%m')} al {fmax.strftime('%d-%m')}"
    base_name = f"Reporte Bultos - {sucursal} - {f_txt}"
    out_path = os.path.join(subfolder_path, f"{base_name}.xlsx")
    
    idx = 1
    while os.path.exists(out_path):
        out_path = os.path.join(subfolder_path, f"{base_name} ({idx}).xlsx")
        idx += 1

    with pd.ExcelWriter(out_path, engine="xlsxwriter") as writer:
        _generar_reporte_bultos(writer, df, fmin, fmax, semanas, global_cols_tuples)
        _generar_pdv_mayor_25(writer, df, fmin, fmax, semanas)

    return out_path