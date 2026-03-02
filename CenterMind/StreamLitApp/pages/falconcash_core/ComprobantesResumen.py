# file: python/ComprobantesResumen.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import sys
import datetime as dt
import unicodedata
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import xlsxwriter
from xlsxwriter.utility import xl_rowcol_to_cell

# --- RUTAS LIMPIADAS PARA SHELFY ---

# Importación robusta
def _load_utils_helpers():
    """
    Carga 'leer_excel' y 'parse_fecha_robusta' de utils.py de forma robusta.

    Por qué: en algunos entornos el sys.path no incluye la carpeta del script y
    falla el import estándar, disparando el lector básico (que rompe con .xls raros).
    """
    try:
        from utils import leer_excel as _leer_excel, parse_fecha_robusta as _parse_fecha_robusta

        return _leer_excel, _parse_fecha_robusta
    except Exception:
        pass

    # Intento 2: cargar utils.py desde el mismo directorio del script (o su padre)
    try:
        import importlib.util

        here = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(here, "utils.py"),
            os.path.join(here, "..", "utils.py"),
            os.path.join(here, "..", "CONFIG_GLOBAL", "utils.py"),
        ]
        for cand in candidates:
            cand = os.path.abspath(cand)
            if os.path.exists(cand):
                spec = importlib.util.spec_from_file_location("local_utils", cand)
                if spec and spec.loader:
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    if hasattr(mod, "leer_excel") and hasattr(mod, "parse_fecha_robusta"):
                        return mod.leer_excel, mod.parse_fecha_robusta
    except Exception:
        pass

    # Fallback final: lector robusto inline (no rompe con .xls falsos/TSV/CSV)
    import pandas as pd
    from pathlib import Path
    from xlrd import XLRDError

    def _leer_excel(path):
        p = Path(path)
        ext = p.suffix.lower()

        if ext in {".xlsx", ".xlsm"}:
            return pd.read_excel(p, engine="openpyxl", dtype=str)

        if ext == ".xls":
            # .xls real -> xlrd; si falla, probamos openpyxl y luego TSV/CSV.
            try:
                return pd.read_excel(p, engine="xlrd", dtype=str)
            except Exception as e_xlrd:
                print(f"Advertencia: '{p.name}' falló con xlrd. Probando openpyxl. Detalle: {e_xlrd}")
                try:
                    return pd.read_excel(p, engine="openpyxl", dtype=str)
                except Exception as e_openpyxl:
                    print(f"Advertencia: '{p.name}' falló con openpyxl. Probando TSV/CSV. Detalle: {e_openpyxl}")
                    for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                        try:
                            return pd.read_csv(p, sep="	", engine="python", dtype=str, encoding=enc)
                        except (UnicodeDecodeError, LookupError):
                            continue
                        except Exception:
                            break
                    for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                        try:
                            return pd.read_csv(p, sep=None, engine="python", dtype=str, encoding=enc)
                        except Exception:
                            continue
                    raise ValueError(f"No se pudo leer '{p.name}' como XLS/XLSX ni TSV/CSV.")

        if ext in {".csv", ".txt"}:
            for sep in ("	", None):
                for enc in (None, "latin1", "cp1252", "utf-8", "utf-8-sig"):
                    try:
                        return pd.read_csv(p, sep=sep, engine="python", dtype=str, encoding=enc)
                    except TypeError:
                        # encoding=None no es válido en algunas versiones
                        continue
                    except Exception:
                        continue
            raise ValueError(f"No se pudo leer '{p.name}' como CSV/TXT.")

        # Último intento
        return pd.read_excel(p, engine="openpyxl", dtype=str)

    def _parse_fecha_robusta(series):
        return pd.to_datetime(series, dayfirst=True, errors="coerce")

    return _leer_excel, _parse_fecha_robusta


leer_excel, parse_fecha_robusta = _load_utils_helpers()


SUCURSALES_MAP = {}  # Inyectado desde Shelfy
if ConfigManager:
    try:
        cfg = ConfigManager()
        branches = cfg.get_branches()
        if isinstance(branches, list):
            for b in branches:
                SUCURSALES_MAP[str(b.get("id", ""))] = b.get("nombre", "")
    except: pass

CANONICAL = {
    "desc_comprobante": ["descripcion comprobante"],
    "numero": ["numero", "nro"],
    "anulado": ["anulado", "estado"],
    "desc_sucursal": ["descripcion sucursal", "sucursal"],
    "desc_vendedor": ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "razon_social": ["razon social", "nombre", "nombre cliente"],
    "cliente": ["cliente", "codigo cliente", "cod cliente", "nro cliente"],
    "desc_cond_pago": ["descripcion condicion de pago", "condicion de pago", "cond pago"],
    "desc_canal_mkt": ["descripcion canal mkt", "canal marketing", "canal"],
    "desc_subcanal_mkt": ["descripcion subcanal mkt", "subcanal marketing", "subcanal"],
    "subtotal": ["subtotal"],
    "subtotal_final": ["subtotal final", "importe", "total"],
}

def _preparar(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, str, dt.date, dt.date]:
    cols = list(df_raw.columns)
    mapping = {}
    for k, pats in CANONICAL.items():
        mapping[k] = _first_match(cols, pats)
    
    df = df_raw.copy()
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)

    for k in CANONICAL.keys():
        if k not in df.columns: df[k] = np.nan

    if "desc_sucursal" in df.columns:
        df["desc_sucursal"] = df["desc_sucursal"].astype(str).str.strip()
        if SUCURSALES_MAP:
            df["desc_sucursal"] = df["desc_sucursal"].map(SUCURSALES_MAP).fillna(df["desc_sucursal"])

    fecha_col = "Fecha Comprobante"
    if fecha_col not in df_raw.columns:
        candidates = [c for c in df_raw.columns if "fecha" in _norm(str(c))]
        if candidates:
            best_col = max(candidates, key=lambda c: parse_fecha_robusta(df_raw[c]).notna().sum())
            fecha_col = best_col
        else:
            return df, "ErrorFecha", dt.date.today(), dt.date.today()

    df["fecha"] = parse_fecha_robusta(df_raw[fecha_col])
    
    df = df.dropna(subset=["fecha"]).copy()
    df["fecha_dia"] = df["fecha"].dt.date
    
    if df.empty:
        return df, "SinDatos", dt.date.today(), dt.date.today()

    fmin, fmax = df["fecha_dia"].min(), df["fecha_dia"].max()

    df["subtotal"] = pd.to_numeric(df["subtotal"], errors="coerce").fillna(0.0)
    df["subtotal_final"] = pd.to_numeric(df["subtotal_final"], errors="coerce").fillna(0.0)

    df["norm_comprobante"] = df["desc_comprobante"].astype(str).apply(_norm)
    
    cond_raw = df["desc_cond_pago"].replace({"nan": None, "NaN": None, "": None})
    cond_raw = cond_raw.astype(str).replace({"0": "CONTADO", "0.0": "CONTADO", "1": "CTA CTE", "1.0": "CTA CTE"})
    df["desc_cond_pago"] = cond_raw
    df["norm_cond_pago"] = df["desc_cond_pago"].apply(_norm)
    
    df["cond_pago_mostrar"] = df["norm_cond_pago"].map({"contado": "CONTADO", "cta cte": "CTA CTE"}).fillna(df["desc_cond_pago"])
    
    df["cliente_clean"] = df["cliente"].fillna("").astype(str).str.replace(".0", "", regex=False)
    df["razon_social"] = df["razon_social"].fillna("").astype(str)
    df["cliente_mostrar"] = df["razon_social"] 
    
    df["desc_canal_mkt"] = df["desc_canal_mkt"].fillna("SIN CANAL")
    df["subcanal_mostrar"] = df["desc_subcanal_mkt"].fillna("SIN SUBCANAL")

    anulado_norm = df["anulado"].astype(str).apply(_norm)
    df["es_anulado"] = anulado_norm.isin({"si", "anulado", "true", "1"})
    df["es_devolucion"] = df["norm_comprobante"].str.contains("devolucion", na=False)
    df["excluida"] = df["es_anulado"] | df["es_devolucion"]

    es_recibo = (~df["excluida"]) & (df["norm_comprobante"] == "recibo")
    es_contado = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "contado")
    es_ctacte = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "cta cte")

    df["estado_tx"] = np.select(
        [df["excluida"], es_recibo, es_contado, es_ctacte],
        ["EXCLUIDA", "RECIBO", "CONTADO", "CTA CTE"],
        default="OTRO"
    )

    df["importe_base"] = df["subtotal_final"]
    df["monto_recibo"] = np.where(es_recibo, df["importe_base"], 0.0)
    df["monto_contado"] = np.where(es_contado, df["importe_base"], 0.0)
    df["monto_ctacte"] = np.where(es_ctacte, df["importe_base"], 0.0)
    df["monto_recaudado"] = df["monto_contado"] + df["monto_recibo"]

    df.loc[es_recibo, "cond_pago_mostrar"] = ""
    
    sucursal = "General"
    if "desc_sucursal" in df.columns:
        moda = df["desc_sucursal"].dropna().mode()
        if not moda.empty: sucursal = str(moda.iloc[0])

    return df, sucursal, fmin, fmax

# ----------------------------- FORMATOS EXCEL -----------------------------

class _Fmt:
    def __init__(self, book):
        self.book = book
        self.bold = book.add_format({"bold": True})
        self.center = book.add_format({"align": "center", "valign": "vcenter"})
        
        self.main_title = book.add_format({
            'bold': True, 'font_size': 18, 'font_color': '#2C3E50', 
            'align': 'center', 'valign': 'vcenter', 'bottom': 2, 'bottom_color': '#2C3E50'
        })
        self.subtitle = book.add_format({
            'font_size': 12, 'italic': True, 'font_color': '#7F8C8D', 
            'align': 'center', 'valign': 'vcenter'
        })
        self.sheet_title = book.add_format({"bold": True, "font_size": 14, "font_color": "#2980B9"})
        
        # --- Estilos de Cabeceras ---
        self.th = book.add_format({
            'bold': True, 'font_color': 'white', 'bg_color': '#2C3E50', 
            'align': 'center', 'valign': 'vcenter', 'border': 1
        })
        # Cabecera gruesa para el "encuadre"
        self.th_thick = book.add_format({
            'bold': True, 'font_color': 'white', 'bg_color': '#2C3E50', 
            'align': 'center', 'valign': 'vcenter', 'border': 1,
            'top': 2, 'left': 2, 'right': 2 # Bordes gruesos arriba y costados
        })
        
        self.th_gray = book.add_format({
            'bold': True, 'font_color': 'white', 'bg_color': '#7F8C8D', 
            'align': 'center', 'valign': 'vcenter', 'border': 1
        })
        
        # --- Dinero y Números ---
        self.money = book.add_format({"num_format": "$#,##0.00"})
        self.money_bold = book.add_format({"num_format": "$#,##0.00", "bold": True})
        self.money_border = book.add_format({"num_format": "$#,##0.00", "border": 1})
        self.money_bold_border = book.add_format({"num_format": "$#,##0.00", "bold": True, "border": 1})
        self.int_border = book.add_format({"num_format": "0", "border": 1, "align": "center"})
        self.percent = book.add_format({"num_format": "0.0%"})
        self.percent_border = book.add_format({"num_format": "0.0%", "border": 1, "align": "center"})
        
        # --- Colores TX ---
        self.money_cont = book.add_format({"num_format": "$#,##0.00", "bg_color": "#E8F5E9"}) 
        self.money_cta = book.add_format({"num_format": "$#,##0.00", "bg_color": "#E3F2FD"})  
        self.money_rec = book.add_format({"num_format": "$#,##0.00", "bg_color": "#FFF3E0"})  
        
        self.date_border = book.add_format({"num_format": "dd/mm/yyyy", "border": 1, "align": "center"})
        self.text_border = book.add_format({"border": 1})
        self.link = book.add_format({'font_color': 'blue', 'underline': True, 'border': 1})
        self.day_title = book.add_format({"bold": True, "bg_color": "#F2F2F2", "border": 1, "align": "left", "valign": "vcenter", "top": 2, "left": 2, "right": 2})
        self.label_bg = book.add_format({"bold": True, "bg_color": "#F2F2F2", "border": 1, "align": "left"})


        
        # --- Estilos Especiales Solicitados ---
        self.black_white_large = book.add_format({
            'bold': True, 'bg_color': 'black', 'font_color': 'white', 
            'font_size': 12, 'num_format': "$#,##0.00", 'align': 'center'
        })
        
        # Rojo para desfasaje
        self.red_alert = book.add_format({
            'bold': True, 'bg_color': '#C0392B', 'font_color': 'white', 'align': 'center'
        })
        # Verde para OK
        self.green_ok = book.add_format({
            'bold': True, 'bg_color': '#27AE60', 'font_color': 'white', 'align': 'center'
        })
        
        # --- Glosario ---
        self.glos_header = book.add_format({'bold': True, 'font_size': 12, 'underline': True, 'font_color': '#2C3E50'})
        self.glos_term = book.add_format({'bold': True, 'bg_color': '#ECF0F1', 'border': 1})
        self.glos_desc = book.add_format({'italic': True, 'text_wrap': True, 'border': 1})
        
        # --- Dashboard ---
        self.card_title = book.add_format({
            'bold': True, 'font_size': 10, 'font_color': 'white', 
            'bg_color': '#2C3E50', 'align': 'center', 'border': 1
        })
        self.card_value = book.add_format({
            'bold': True, 'font_size': 16, 'font_color': '#2C3E50', 
            'align': 'center', 'valign': 'vcenter', 'left': 1, 'right': 1, 
            'num_format': '$ #,##0'
        })

    def get_border_fmt(self, base_props, is_bottom=False, is_left=False, is_right=False):
        """Genera formato dinámico para bordes gruesos"""
        props = base_props.copy()
        if is_bottom: props['bottom'] = 2
        if is_left: props['left'] = 2
        if is_right: props['right'] = 2
        return self.book.add_format(props)

def _safe_sheet_name(name: str) -> str:
    s = re.sub(r"[\\/*?:\[\]]", "", str(name)).strip()
    return (s[:30] if s else "Hoja")[:30]

# ----------------------------- DASHBOARD GERENCIAL -----------------------------

def _generar_dashboard(writer, df, fmin, fmax):
    wb = writer.book
    ws = wb.add_worksheet("RESUMEN GERENCIAL")
    ws.hide_gridlines(2)
    f = _Fmt(wb)
    
    ws_data = wb.add_worksheet("DATA")
    ws_data.hide()
    
    df_valid = df[~df["excluida"]].copy()
    
    # 1. ENCABEZADO
    ws.merge_range('B2:N2', "PANEL DE CONTROL DE FACTURACIÓN Y VENTAS", f.main_title)
    ws.merge_range('B3:N3', f"Periodo Analizado: {fmin.strftime('%d/%m/%Y')} al {fmax.strftime('%d/%m/%Y')}", f.subtitle)

    # PREPARACIÓN DE DATOS
    df_valid["desc_vendedor"] = df_valid["desc_vendedor"].fillna("SIN VENDEDOR")
    ranking = df_valid.groupby("desc_vendedor").agg({
        "subtotal_final": "sum",
        "monto_contado": "sum",
        "monto_ctacte": "sum",
        "monto_recibo": "sum",
        "numero": "count"
    }).reset_index().rename(columns={"subtotal_final": "venta", "numero": "ops"})
    ranking = ranking.sort_values("venta", ascending=False)
    
    ranking_real = ranking[ranking["desc_vendedor"] != "SIN VENDEDOR"].copy()
    ranking_sin = ranking[ranking["desc_vendedor"] == "SIN VENDEDOR"].copy()
    df_reales = df_valid[df_valid["desc_vendedor"] != "SIN VENDEDOR"].copy()

    # 2. KPIS
    total_venta = df_reales["subtotal_final"].sum()
    total_contado = df_reales["monto_contado"].sum()
    total_ctacte = df_reales["monto_ctacte"].sum()
    total_recibos = df_reales["monto_recibo"].sum()
    ops_totales = len(df_reales)
    ticket_promedio = total_venta / ops_totales if ops_totales > 0 else 0
    
    row_kpi = 5
    def draw_card(c_start, title, value, is_money=True):
        ws.merge_range(row_kpi, c_start, row_kpi, c_start+1, title, f.card_title)
        fmt_val = f.card_value
        if not is_money:
            fmt_val = wb.add_format({'bold': True, 'font_size': 16, 'font_color': '#2C3E50', 'align': 'center', 'valign': 'vcenter', 'left': 1, 'right': 1})
        ws.merge_range(row_kpi+1, c_start, row_kpi+2, c_start+1, value, fmt_val)

    draw_card(1, "FACTURACIÓN", total_venta)
    draw_card(4, "CONTADO", total_contado)
    draw_card(7, "CTA CTE", total_ctacte)
    draw_card(10, "RECIBOS IMPUTADOS", total_recibos)
    draw_card(13, "TICKET PROMEDIO", ticket_promedio)

    # 4. DATOS GRÁFICOS
    ws_data.write_row(0, 0, ["Vendedor", "Venta", "Fecha", "Diario"])
    for i, r in enumerate(ranking_real.head(10).itertuples(), 1):
        ws_data.write(i, 0, r.desc_vendedor)
        ws_data.write(i, 1, r.venta)
    len_rank = min(len(ranking_real), 10)

    diario = df_reales.groupby("fecha_dia")["subtotal_final"].sum().reset_index()
    diario = diario.sort_values("fecha_dia")
    for i, r in enumerate(diario.itertuples(), 1):
        ws_data.write_datetime(i, 2, dt.datetime.combine(r.fecha_dia, dt.time()), f.date_border)
        ws_data.write(i, 3, r.subtotal_final)
    len_day = len(diario)

    # 5. GRÁFICOS
    if len_rank > 0:
        chart_bar = wb.add_chart({'type': 'bar'})
        chart_bar.add_series({
            'name': 'Ventas', 'categories': ['DATA', 1, 0, len_rank, 0],
            'values': ['DATA', 1, 1, len_rank, 1], 'fill': {'color': '#3498DB'},
            'data_labels': {'value': True, 'num_format': '$ #,##0'},
        })
        chart_bar.set_title({'name': 'Ranking Vendedores'})
        chart_bar.set_legend({'none': True})
        chart_bar.show_hidden_data() 
        ws.insert_chart('B10', chart_bar, {'x_scale': 2.0, 'y_scale': 1.4})

    if len_day > 0:
        chart_line = wb.add_chart({'type': 'area'})
        chart_line.add_series({
            'name': 'Venta Diaria', 'categories': ['DATA', 1, 2, len_day, 2],
            'values': ['DATA', 1, 3, len_day, 3], 'fill': {'color': '#2ECC71', 'transparency': 50},
            'line': {'color': '#27AE60'},
        })
        chart_line.set_title({'name': 'Tendencia Diaria'})
        chart_line.set_legend({'none': True})
        chart_line.show_hidden_data() 
        ws.insert_chart('J10', chart_line, {'x_scale': 2.0, 'y_scale': 1.4})

    # 6. TABLA DETALLE
    row_table = 29
    col_table = 1
    ws.merge_range(row_table-2, col_table, row_table-2, col_table+7, "RANKING DE VENDEDORES", f.main_title)
    
    headers = ["#", "Vendedor", "Venta Total", "Share %", "$ Contado", "$ Cta Cte", "Ops", "Ticket Prom"]
    for i, h in enumerate(headers):
        ws.write(row_table, col_table + i, h, f.th)
    row_table += 1
    
    for i, (_, r) in enumerate(ranking_real.iterrows(), 1):
        vend_name = str(r["desc_vendedor"])
        safe_sheet = _safe_sheet_name(vend_name)
        ws.write(row_table, col_table, i, f.int_border)
        try:
            ws.write_url(row_table, col_table + 1, f"internal:'{safe_sheet}'!A1", string=vend_name, cell_format=f.link)
        except:
            ws.write(row_table, col_table + 1, vend_name, f.text_border)
        
        ws.write(row_table, col_table + 2, r["venta"], f.money_border)
        share = r["venta"] / total_venta if total_venta else 0
        ws.write(row_table, col_table + 3, share, f.percent_border)
        ws.write(row_table, col_table + 4, r["monto_contado"], f.money_border)
        ws.write(row_table, col_table + 5, r["monto_ctacte"], f.money_border)
        ws.write(row_table, col_table + 6, r["ops"], f.int_border)
        ticket = r["venta"] / r["ops"] if r["ops"] else 0
        ws.write(row_table, col_table + 7, ticket, f.money_border)
        row_table += 1
    
    ws.write(row_table, col_table+1, "TOTALES FUERZA VENTA", f.th)
    ws.write(row_table, col_table+2, total_venta, f.money_bold_border)
    ws.write(row_table, col_table+3, "100%", f.percent_border)
    ws.write(row_table, col_table+4, total_contado, f.money_bold_border)
    ws.write(row_table, col_table+5, total_ctacte, f.money_bold_border)
    ws.write(row_table, col_table+6, ops_totales, f.int_border)
    
    if not ranking_sin.empty:
        row_table += 3
        ws.merge_range(row_table, col_table, row_table, col_table+7, "OPERACIONES INTERNAS (SIN VENDEDOR)", f.th_gray)
        row_table += 1
        for _, r in ranking_sin.iterrows():
            ws.write(row_table, col_table, "-", f.int_border)
            ws.write(row_table, col_table + 1, str(r["desc_vendedor"]), f.text_border)
            ws.write(row_table, col_table + 2, r["venta"], f.money_border)
            ws.write(row_table, col_table + 3, "-", f.percent_border)
            ws.write(row_table, col_table + 4, r["monto_contado"], f.money_border)
            ws.write(row_table, col_table + 5, r["monto_ctacte"], f.money_border)
            ws.write(row_table, col_table + 6, r["ops"], f.int_border)
            ws.write(row_table, col_table + 7, r["venta"] / r["ops"] if r["ops"] else 0, f.money_border)
            row_table += 1

    # GLOSARIO
    row_glos = row_table + 4
    ws.write(row_glos, col_table, "GLOSARIO DE MÉTRICAS", f.glos_header)
    row_glos += 2
    glosario = [
        ("Facturación", "Total de ventas generadas por la fuerza de venta activa (excluye operaciones internas)."),
        ("Contado", "Ventas registradas con condición de pago 'Contado' o efectivo inmediato."),
        ("Cta Cte", "Ventas registradas a crédito (Cuenta Corriente)."),
        ("Recibos Imputados", "Total de dinero ingresado mediante recibos de cobranza."),
        ("Ticket Promedio", "Facturación Total / Cantidad de Operaciones."),
        ("Ops Internas", "Ventas sin vendedor asignado. Se muestran aparte.")
    ]
    for term, desc in glosario:
        ws.write(row_glos, col_table, term, f.glos_term)
        ws.merge_range(row_glos, col_table+1, row_glos, col_table+7, desc, f.glos_desc)
        row_glos += 1

    ws.set_column(0, 0, 2)
    ws.set_column(1, 1, 5)
    ws.set_column(2, 2, 35)
    ws.set_column(3, 14, 16)

# ----------------------------- HOJAS VENDEDOR -----------------------------

def _sheet_vendor(writer, df_v, vendedor, fmin, fmax):
    ws = writer.book.add_worksheet(_safe_sheet_name(vendedor))
    f = _Fmt(writer.book)
    row = 0

    ws.write(row, 0, f"Vendedor: {vendedor}", f.sheet_title)
    row += 1
    ws.write(row, 0, f"Período: {fmin.strftime('%d-%m-%Y')} a {fmax.strftime('%d-%m-%Y')}", f.bold)
    row += 2

    dias = sorted(df_v["fecha_dia"].unique())
    metrics = []

    # --- ITERACIÓN POR DÍA ---
    for d in dias:
        day = df_v[df_v["fecha_dia"] == d]
        
        # Formato fecha español: "Lunes 08 febrero 2026"
        nombre_dia = DIAS_ESP[d.weekday()]
        nombre_mes = MESES_ESP[d.month]
        fecha_str = f"{nombre_dia} {d.day:02d} {nombre_mes} {d.year}"
        
        ws.merge_range(row, 0, row, 8, fecha_str, f.day_title)
        row += 1
        
        headers = ["Cliente", "Razón Social", "Número", "Comprobante", "Cond. Pago", "Canal MKT", "SubCanal MKT", "Importe", "Anulado"]
        # Escribir cabeceras con bordes de encuadre
        for j, h in enumerate(headers):
            # Lógica para bordes gruesos en esquinas superiores
            fmt = f.th
            is_left = (j == 0)
            is_right = (j == len(headers) - 1)
            
            # Usar formato base o formato grueso si es borde
            props = {'bold': True, 'font_color': 'white', 'bg_color': '#2C3E50', 'align': 'center', 'valign': 'vcenter', 'border': 1}
            props['top'] = 1 # Top siempre grueso en cabecera
            if is_left: props['left'] = 2
            if is_right: props['right'] = 2
            
            # Crear formato al vuelo para esta celda
            curr_fmt = writer.book.add_format(props)
            ws.write(row, j, h, curr_fmt)
            
        row += 1

        total_rows_day = len(day)
        for idx_row, (_, r) in enumerate(day.iterrows()):
            is_last_row = (idx_row == total_rows_day - 1)
            
            # Determinar color de fondo y letra por datos
            bg_color = None
            font_color = None
            if bool(r.get("es_anulado", False)):
                bg_color = "#FFC7CE"
                font_color = "#9C0006"
            elif bool(r.get("es_devolucion", False)):
                bg_color = "#FFEB9C"
                font_color = "#9C5700"
                
            estado = str(r.get("estado_tx", ""))
            
            # Función auxiliar para combinar estilo base con bordes
            def write_cell(col_idx, value, num_fmt=None, is_money=False):
                props = {'border': 1, 'align': 'left', 'bg_color': '#F2F2F2'}
                if is_money: 
                    props['num_format'] = "$#,##0.00"
                    props['align'] = 'right'
                
                # Color de estado (solo si no es anulado/devolución)
                if not bg_color and is_money:
                    if estado == "CONTADO": props['bg_color'] = "#E8F5E9"
                    elif estado == "CTA CTE": props['bg_color'] = "#E3F2FD"
                    elif estado == "RECIBO": props['bg_color'] = "#FFF3E0"
                
                # Override si es anulado/devolución
                if bg_color: props['bg_color'] = bg_color
                if font_color: props['font_color'] = font_color
                
                # Bordes Gruesos del Encuadre
                if col_idx == 0: props['left'] = 2
                if col_idx == 8: props['right'] = 2
                if is_last_row: props['bottom'] = 2
                
                cell_fmt = writer.book.add_format(props)
                ws.write(row, col_idx, value, cell_fmt)

            # Escribir celdas
            cid = str(r.get("cliente", "") or "")
            if cid.endswith(".0"): cid = cid[:-2]
            
            write_cell(0, cid)
            write_cell(1, r.get("razon_social", ""))
            write_cell(2, r.get("numero", ""))
            write_cell(3, r.get("desc_comprobante", ""))
            write_cell(4, r.get("cond_pago_mostrar", ""))
            write_cell(5, r.get("desc_canal_mkt", ""))
            write_cell(6, r.get("subcanal_mostrar", ""))
            write_cell(7, float(r.get("importe_base", 0.0)), is_money=True)
            write_cell(8, "SI" if bool(r.get("es_anulado", False)) else "")
            
            row += 1

        # Métricas del día (debajo de la tabla)
        valid = day[~day["excluida"]]

        total_contado_dia = valid["monto_contado"].sum()
        total_ctacte_dia = valid["monto_ctacte"].sum()
        total_recibos_dia = valid["monto_recibo"].sum()
        recaudado = valid["monto_recaudado"].sum()

        metrics.append({
            "fecha": d,
            "contado": total_contado_dia,
            "ctacte": total_ctacte_dia,
            "recibo": total_recibos_dia,
            "recaudado": recaudado
        })

        # Mostrar desglose ANTES de "RECAUDADO DÍA" (con mismos colores que el desglose)
        ws.write(row, 7, "TOTAL CTA CTE:", f.label_bg)
        ws.write(row, 8, total_ctacte_dia, f.money_cta)
        row += 1

        ws.write(row, 7, "TOTAL CONTADO:", f.label_bg)
        ws.write(row, 8, total_contado_dia, f.money_cont)
        row += 1

        ws.write(row, 7, "TOTAL RECIBOS:", f.label_bg)
        ws.write(row, 8, total_recibos_dia, f.money_rec)
        row += 1

        # Recaudado total del día destacado (se mantiene cálculo actual)
        ws.write(row, 7, "RECAUDADO DÍA:", f.black_white_large)
        ws.write(row, 8, recaudado, f.black_white_large)
        row += 4
# --- TOTALES Y TABLAS FINALES ---
    right_col = 10
    top_row = 2
    
    # Totales generales
    valid_all = df_v[~df_v["excluida"]]
    t_cont = valid_all["monto_contado"].sum()
    t_cta = valid_all["monto_ctacte"].sum()
    t_rec = valid_all["monto_recibo"].sum()
    t_recau = valid_all["monto_recaudado"].sum()

    ws.merge_range(top_row, right_col, top_row, right_col+3, "Totales del Período", f.th)
    top_row += 1
    labels = ["Total Cta. Cte.:", "Total Contado:", "Total Recibos:", "Total Recaudado:"]
    vals = [t_cta, t_cont, t_rec, t_recau]
    fmts = [f.money_cta, f.money_cont, f.money_rec, f.money_bold]
    
    for l, v, fm in zip(labels, vals, fmts):
        ws.write(top_row, right_col, l, f.bold)
        ws.write(top_row, right_col+1, v, fm)
        top_row += 1
    top_row += 2

    # Top Clientes
    for col_dato, titulo in [("monto_contado", "Top 10 Clientes (Contado)"), ("monto_ctacte", "Top 10 Clientes (Cta Cte)")]:
        ws.merge_range(top_row, right_col, top_row, right_col+2, titulo, f.th)
        top_row += 1
        ws.write(top_row, right_col, "Cliente", f.bold)
        ws.write(top_row, right_col+1, "Monto", f.bold)
        top_row += 1
        top_data = valid_all.groupby("cliente_mostrar", as_index=False)[col_dato].sum().sort_values(col_dato, ascending=False).head(10)
        for _, r in top_data.iterrows():
            if r[col_dato] > 0:
                ws.write(top_row, right_col, r["cliente_mostrar"])
                ws.write(top_row, right_col+1, r[col_dato], f.money)
                top_row += 1
        top_row += 2

    # --- TABLA RECAUDACIÓN (ACTUALIZADA) ---
    row = max(row, top_row) + 2
    ws.write(row, 0, "Control de Recaudación", f.sheet_title)
    row += 1

    # Cambios:
    # - "Entrega Efectivo" -> "Entregas"
    # - Saldo final = Entregas Totales - Recaudación Total (debe dar 0)
    headers_saldo = ["Fecha", "Contado", "Cta. Cte.", "Recibos", "Recaudación Total", "Entregas", "Diferencia"]
    for j, h in enumerate(headers_saldo):
        ws.write(row, j, h, f.th)
    row += 1

    start_row_rec = row
    for i, m in enumerate(metrics):
        current_r = start_row_rec + i
        ws.write_datetime(current_r, 0, dt.datetime.combine(m["fecha"], dt.time()), f.date_border)
        ws.write(current_r, 1, m["contado"], f.money_cont)
        ws.write(current_r, 2, m["ctacte"], f.money_cta)
        ws.write(current_r, 3, m["recibo"], f.money_rec)
        ws.write(current_r, 4, m["recaudado"], f.money_bold)
        ws.write(current_r, 5, 0, f.money)  # Entregas (input manual)

        cell_recaudado = xl_rowcol_to_cell(current_r, 4)
        cell_entregas = xl_rowcol_to_cell(current_r, 5)
        ws.write_formula(current_r, 6, f"={cell_entregas}-{cell_recaudado}", f.money_bold)

    last_data_row = start_row_rec + len(metrics) - 1

    # Totales
    row_totales = last_data_row + 1
    ws.write(row_totales, 0, "TOTALES", f.th)

    for col_idx in range(1, 6):
        col_letter = xl_rowcol_to_cell(0, col_idx)[:1]
        start_cell = f"{col_letter}{start_row_rec+1}"
        end_cell = f"{col_letter}{last_data_row+1}"
        ws.write_formula(row_totales, col_idx, f"=SUM({start_cell}:{end_cell})", f.money_bold_border)

    cell_total_rec = xl_rowcol_to_cell(row_totales, 4)
    cell_total_ent = xl_rowcol_to_cell(row_totales, 5)
    ws.write_formula(row_totales, 6, f"={cell_total_ent}-{cell_total_rec}", f.money_bold_border)

    # Saldo Final
    final_row_block = row_totales + 2
    ws.write(final_row_block, 5, "Saldo Final:", f.black_white_large)
    cell_diff_total = xl_rowcol_to_cell(row_totales, 6)
    ws.write_formula(final_row_block, 6, f"={cell_diff_total}", f.black_white_large)

    # Estado y monto (positivo = sobrante, negativo = desfasaje)
    row_estado = final_row_block + 1
    cell_saldo_ref = xl_rowcol_to_cell(final_row_block, 6)

    ws.write(row_estado, 5, "Estado:", f.black_white_large)
    ws.write_formula(
        row_estado,
        6,
        f'=IF({cell_saldo_ref}=0,"✅ SIN DIFERENCIA",IF({cell_saldo_ref}<0,"❌ DESFASAJE (FALTANTE)","⚠️ SOBRANTE (ENTREGÓ DE MÁS)"))',
        f.text_border
    )

    ws.write(row_estado, 7, "Monto:", f.black_white_large)
    ws.write_formula(row_estado, 8, f'=IF({cell_saldo_ref}=0,0,ABS({cell_saldo_ref}))', f.money_bold_border)

    ws.conditional_format(row_estado, 6, row_estado, 6, {
        "type": "formula",
        "criteria": f"={cell_saldo_ref}<0",
        "format": f.red_alert
    })
    ws.conditional_format(row_estado, 6, row_estado, 6, {
        "type": "formula",
        "criteria": f"={cell_saldo_ref}=0",
        "format": f.green_ok
    })
    ws.conditional_format(row_estado, 6, row_estado, 6, {
        "type": "formula",
        "criteria": f"={cell_saldo_ref}>0",
        "format": writer.book.add_format({"bold": True, "bg_color": "#F39C12", "font_color": "white", "align": "center"})
    })

    ws.set_column("A:A", 30)
    ws.set_column("B:G", 18)
    ws.set_column("H:I", 18)
    ws.set_column("K:P", 18)
    # ws.freeze_panes(4, 0) # ELIMINADO

# ----------------------------- PROCESO PRINCIPAL -----------------------------

def generar_reporte_resumen_comprobantes(input_path: str, output_dir: str, nombre_sucursal: str = 'Sucursal') -> str:
    # 1. Leer con utils (Robusto)
    df_raw = leer_excel(input_path)
    
    # 2. Preparar (Devuelve 4 valores)
    df, sucursal, fmin, fmax = _preparar(df_raw)
    sucursal = nombre_sucursal  # <--- Inyectado
    
    # 3. Nombre
    f_txt = f"{fmin.strftime('%d-%m')} al {fmax.strftime('%d-%m')}"
    base_name = f"Reporte Ventas Resumen - {sucursal} - {f_txt}"
    if not os.path.exists(output_dir): os.makedirs(output_dir)
    out_path = os.path.join(output_dir, f"{base_name}.xlsx")
    idx = 1
    while os.path.exists(out_path):
        out_path = os.path.join(output_dir, f"{base_name} ({idx}).xlsx")
        idx += 1

    # 4. Generar
    df["desc_vendedor"] = df["desc_vendedor"].fillna("SIN VENDEDOR")
    vendedores = sorted(df["desc_vendedor"].unique().tolist())

    with pd.ExcelWriter(out_path, engine="xlsxwriter") as writer:
        _generar_dashboard(writer, df, fmin, fmax)
        for vend in vendedores:
            sub = df[df["desc_vendedor"] == vend].copy()
            if not sub.empty:
                _sheet_vendor(writer, sub, vend, fmin, fmax)

    return out_path

def procesar_resumen_comprobantes(input_path, output_dir):
    try:
        return generar_reporte_resumen_comprobantes(input_path, output_dir)
    except Exception as e:
        print(f"Error procesando resumen: {e}")
        raise e