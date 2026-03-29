import pandas as pd
import numpy as np
import unicodedata
import re
import json

# El mapeo de códigos numéricos de sucursal a nombres se resuelve server-side
# desde sucursales_v2 en _enrich_and_store_cc. No hardcodear aquí.

def _strip_accents(text: str) -> str:
    if not isinstance(text, str): return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))

def _norm(s: str) -> str:
    s = _strip_accents(str(s)).lower().strip()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s)

def _first_match(colnames, patterns):
    norm_map = {c: _norm(c) for c in colnames}
    norm_patterns = [_norm(p) for p in patterns]
    for c, nc in norm_map.items():
        if any(p in nc for p in norm_patterns):
            return c
    return None

CANONICAL = {
    "sucursal": ["sucursal", "desc_sucursal", "descripcion sucursal"],
    "vendedor": ["vendedor", "desc_vendedor", "descripcion vendedor"],
    "cliente": ["cliente", "razon social", "nombre"],
    "cod_cliente": ["cod cliente", "codigo cliente", "nro cliente", "id cliente", "codcli", "nrocli"],
    "antiguedad": ["antiguedad deuda", "antiguedad", "antigüedad"],
    "cant_cbte": ["cant cbte", "cantidad comprobantes"],
    "saldo_total": ["saldo total", "saldo"],
}

def _map_columns(df: pd.DataFrame):
    cols = list(df.columns)
    mapping = {}
    for key, patterns in CANONICAL.items():
        found = _first_match(cols, patterns)
        mapping[key] = found
    return mapping

def leer_excel_robusto(file_path: str) -> pd.DataFrame:
    try:
        return pd.read_excel(file_path)
    except Exception as e_excel:
        import os
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".xls":
            for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                try:
                    return pd.read_csv(file_path, sep="\t", engine="python", encoding=enc)
                except Exception:
                    continue
            for enc in ("latin1", "cp1252", "utf-8", "utf-8-sig"):
                try:
                    return pd.read_csv(file_path, sep=None, engine="python", encoding=enc)
                except Exception:
                    continue
        raise ValueError(f"No se pudo leer el archivo de Cuentas: {e_excel}")

def procesar_excel_cuentas(file_path: str) -> dict:
    """
    Parsea el archivo de Cuentas Corrientes, tipificando los rangos de antigüedad
    y marcando mediante banderas (flags) a los clientes con deuda activa.
    """
    df_raw = leer_excel_robusto(file_path)
    mapping = _map_columns(df_raw)
    
    df = df_raw.copy()
    df.rename(columns={v: k for k, v in mapping.items() if v is not None}, inplace=True)
    
    for k in CANONICAL.keys():
        if k not in df.columns: df[k] = np.nan

    # Conservar el valor crudo de sucursal (código numérico o texto).
    # La resolución al nombre real se hace server-side via sucursales_v2.
    if "sucursal" in df.columns:
        df["sucursal"] = df["sucursal"].astype(str).str.strip()

    df["vendedor"] = df["vendedor"].fillna("SIN VENDEDOR").astype(str).str.strip()
    df["cliente"] = df["cliente"].fillna("Desconocido").astype(str).str.strip()
    if "cod_cliente" not in df.columns: df["cod_cliente"] = np.nan
    df["cod_cliente"] = df["cod_cliente"].apply(lambda x: str(int(x)) if pd.notna(x) and x != "" else None)
    
    for col in ["cant_cbte", "saldo_total", "antiguedad"]:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # Creación de Etiquetas (Flags) en lugar de borrar
    df["tiene_vendedor"] = ~df["vendedor"].str.contains("SIN VENDEDOR", case=False, na=False)
    df["tiene_deuda"] = df["saldo_total"] > 0
    df["es_valido"] = df["tiene_vendedor"] & df["tiene_deuda"]

    # Determinar Rango de Antigüedad para los deudores
    bins = [-1, 7, 15, 21, 30, float('inf')]
    labels = ['1-7 Días', '8-15 Días', '16-21 Días', '22-30 Días', '+30 Días']
    df["rango_antiguedad"] = pd.cut(df["antiguedad"], bins=bins, labels=labels, right=True)
    # Convert categorical to string and replace nan
    df["rango_antiguedad"] = df["rango_antiguedad"].astype(str).replace("nan", "Sin Deuda")

    # Detalles
    cols_detalle = [
        "sucursal", "vendedor", "cliente", "cod_cliente", "cant_cbte", "saldo_total",
        "antiguedad", "rango_antiguedad", "es_valido"
    ]
    renames = {
        "cant_cbte": "cantidad_comprobantes",
        "saldo_total": "deuda_total"
    }
    
    # Manejar bool a nativo python (json)
    df["es_valido"] = df["es_valido"].astype(bool)

    # Ordenar por vendedor (A-Z) y luego por antigüedad (Mayor a menor)
    df = df.sort_values(by=["vendedor", "antiguedad"], ascending=[True, False])

    df_out = df[cols_detalle].rename(columns=renames).replace({np.nan: None})
    
    # Solo para metadatos calcular sobre los válidos
    df_filtrado = df[df["es_valido"]]
    
    return {
        "metadatos": {
            "total_deuda": float(df_filtrado["saldo_total"].sum()),
            "clientes_deudores": int(df_filtrado["cliente"].nunique()),
            "promedio_dias_retraso": float(df_filtrado["antiguedad"].mean()) if not df_filtrado.empty else 0.0
        },
        "detalle_cuentas": df_out.to_dict(orient="records")
    }

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        path = sys.argv[1]
        data = procesar_excel_cuentas(path)
        print("======== METADATOS ========")
        print(json.dumps(data["metadatos"], indent=2, ensure_ascii=False))
        print(f"\n======== DETALLES ({len(data['detalle_cuentas'])}) ========")
        print(json.dumps(data["detalle_cuentas"][:2], indent=2, ensure_ascii=False))
