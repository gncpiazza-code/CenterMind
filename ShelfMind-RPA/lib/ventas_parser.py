import pandas as pd
import numpy as np
import unicodedata
import re
import json
import datetime as dt

SUCURSALES_MAP = {
    "1": "Reconquista",
    "2": "Resistencia",
    "3": "Saenz Peña",
    "4": "Corrientes",
    "5": "Cordoba",
}

def _strip_accents(text: str) -> str:
    if not isinstance(text, str):
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))

def _norm(s: str) -> str:
    s = _strip_accents(str(s)).lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s)

def _first_match(cols, patterns):
    ncols = {c: _norm(c) for c in cols}
    pats = [_norm(p) for p in patterns]
    for p in pats:
        for c, nc in ncols.items():
            if p == nc:
                return c
    for p in pats:
        for c, nc in ncols.items():
            if p in nc:
                return c
    return None

CANONICAL = {
    "desc_comprobante": ["descripcion comprobante", "comprobante"],
    "numero": ["numero", "nro"],
    "anulado": ["anulado", "estado"],
    "desc_sucursal": ["descripcion sucursal", "sucursal"],
    "desc_vendedor": ["descripcion vendedor", "descripción vendedor", "desc vendedor", "vendedor"],
    "razon_social": ["razon social", "nombre"],
    "cliente": ["cliente", "codigo cliente", "cod cliente"],
    "desc_cond_pago": ["descripcion condicion de pago", "condicion de pago", "cond pago"],
    "desc_canal_mkt": ["descripcion canal mkt", "canal marketing", "canal"],
    "desc_subcanal_mkt": ["descripcion subcanal mkt", "subcanal marketing", "subcanal"],
    "subtotal": ["subtotal"],
    "subtotal_final": ["subtotal final", "importe", "total", "monto"],
    "fecha_raw": ["fecha comprobante", "fecha cobro", "fecha"]
}

def _map_columns(df: pd.DataFrame):
    mapping = {}
    cols = list(df.columns)
    for k, pats in CANONICAL.items():
        mapping[k] = _first_match(cols, pats)
    return mapping

def procesar_excel_ventas(file_path: str) -> list:
    """
    Toma la ruta de un archivo Excel de Ventas/Recaudación recién descargado,
    lo parsea aplicando las reglas de negocio, y devuelve una lista de diccionarios
    limpia y lista para guardar en Supabase.
    """
    df_raw = pd.read_excel(file_path)
    mapping = _map_columns(df_raw)
    
    df = df_raw.copy()
    # Renombrar a nombres canónicos (los que la API/Base espera)
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)
    
    # Rellenar columnas faltantes críticas
    for k in CANONICAL.keys():
        if k not in df.columns:
            df[k] = np.nan

    # Normalizar Sucursal
    if "desc_sucursal" in df.columns:
        df["desc_sucursal"] = df["desc_sucursal"].astype(str).str.strip()
        df["desc_sucursal"] = df["desc_sucursal"].map(SUCURSALES_MAP).fillna(df["desc_sucursal"])

    # Parsear Fecha de forma robusta
    df["fecha"] = pd.to_datetime(df["fecha_raw"], errors="coerce", dayfirst=True).dt.strftime('%Y-%m-%d')
    # Quitar filas sin fecha
    df = df.dropna(subset=["fecha"])

    # Parsear Importes
    df["subtotal"] = pd.to_numeric(df["subtotal"], errors="coerce").fillna(0.0)
    df["subtotal_final"] = pd.to_numeric(df["subtotal_final"], errors="coerce").fillna(0.0)

    # Lógica de Negocio: Estados y Pagos
    df["norm_comprobante"] = df["desc_comprobante"].astype(str).apply(_norm)
    
    cond_raw = df["desc_cond_pago"].astype(object).replace({
        "nan": None, "NaN": None, "None": None, "": None, " ": None,
        "0": "CONTADO", "0.0": "CONTADO", "1": "CTA CTE", "1.0": "CTA CTE"
    })
    df["desc_cond_pago"] = cond_raw
    df["norm_cond_pago"] = df["desc_cond_pago"].astype(str).apply(_norm)
    
    df["cliente_mostrar"] = df["razon_social"].fillna(df["cliente"]).fillna("Desconocido")
    df["desc_canal_mkt"] = df["desc_canal_mkt"].fillna("SIN CANAL") 
    df["subcanal_mostrar"] = df["desc_subcanal_mkt"].fillna("SIN SUBCANAL")

    # Detección de Excluidas y Anuladas
    anulado_norm = df["anulado"].astype(str).apply(_norm)
    df["es_anulado"] = anulado_norm.isin({"si", "anulado", "true", "1"})
    df["es_devolucion"] = df["norm_comprobante"].str.contains("devolucion", na=False)
    
    # IMPORTANTE: Se considera "excluida" logicamente, pero a la DB podríamos mandarla igual con un flag.
    df["excluida"] = df["es_anulado"] | df["es_devolucion"]

    # Tipificación exacta
    es_recibo = (~df["excluida"]) & (df["norm_comprobante"] == "recibo")
    es_contado = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "contado")
    es_ctacte  = (~df["excluida"]) & (~es_recibo) & (df["norm_cond_pago"] == "cta cte")

    df["tipo_operacion"] = np.select(
        [df["excluida"], es_recibo, es_contado, es_ctacte],
        ["EXCLUIDA", "RECIBO", "CONTADO", "CTA CTE"],
        default="OTRO",
    )

    df["importe_base"] = df["subtotal_final"]
    df["monto_recibo"] = np.where(es_recibo, df["importe_base"], 0.0)
    df["monto_contado"] = np.where(es_contado, df["importe_base"], 0.0)
    df["monto_ctacte"] = np.where(es_ctacte, df["importe_base"], 0.0)
    df["monto_recaudado"] = df["monto_contado"] + df["monto_recibo"]

    # Construir JSON final
    final_cols = [
        "fecha", "desc_sucursal", "desc_vendedor", "cliente_mostrar", 
        "desc_canal_mkt", "subcanal_mostrar", "desc_comprobante", "numero",
        "tipo_operacion", "es_anulado", "es_devolucion", 
        "importe_base", "monto_contado", "monto_ctacte", "monto_recibo", "monto_recaudado"
    ]
    
    # Renombrar al dict esperado
    rename_final = {
        "desc_sucursal": "sucursal",
        "desc_vendedor": "vendedor",
        "cliente_mostrar": "cliente",
        "desc_canal_mkt": "canal",
        "subcanal_mostrar": "subcanal",
        "desc_comprobante": "comprobante",
        "importe_base": "monto_total"
    }
    
    df_out = df[final_cols].rename(columns=rename_final)
    
    # Manejar NaN/Nulos para JSON
    df_out = df_out.replace({np.nan: None})
    
    records = df_out.to_dict(orient="records")
    return records

if __name__ == "__main__":
    # Test rápido de uso local
    import sys
    if len(sys.argv) > 1:
        path = sys.argv[1]
        data = procesar_excel_ventas(path)
        print(f"Procesadas {len(data)} filas con éxito.")
        print("Registros de muestra (primeros 2):")
        print(json.dumps(data[:2], indent=2, ensure_ascii=False))
