"""
=============================================================================
DH-1 — PROCESAR DATOS (VERSIÓN DES-HARDCODEADA)
=============================================================================

QUE HACE:
  Versión genérica del procesador de datos. Lee la configuración desde un
  diccionario o archivo JSON para permitir multi-tenancy.

USO:
  1. Definir la CONFIGURACIÓN (puede venir de una DB o JSON)
  2. Ejecutar: python DH-1_procesar_datos.py
=============================================================================
"""

import pandas as pd
import numpy as np
import pickle
import os
import json

def procesar_datos_tenant(config, archivos_input):
    """
    Función principal que procesa los datos basándose en una configuración dinámica.
    """
    
    sku_map = config.get('sku_map', {})
    col_map = config.get('column_mapping', {})
    subcanal_alias = config.get('subcanal_alias', {})
    prefijos_sin_vendedor = config.get('prefijos_sin_vendedor', ['SUPER'])
    sucs_orden = config.get('sucs_orden', [])
    reclasificaciones = config.get('reclasificaciones', [])

    def get_sku(art):
        art_up = str(art).upper()
        for clave, sku in sku_map.items():
            if clave.upper() in art_up:
                return sku
        return art

    def es_sin_vendedor(nombre):
        if pd.isna(nombre): return True
        n_up = str(nombre).upper()
        return any(n_up.startswith(p.upper()) for p in prefijos_sin_vendedor)

    def load_reporte(path):
        print(f"  Leyendo: {path}")
        df = pd.read_excel(path, header=0)
        
        # Filtrar anulados si existe la columna
        col_anulado = col_map.get('anulado', 'Anulado')
        if col_anulado in df.columns:
            df = df[df[col_anulado].astype(str).str.upper() == 'NO'].copy()

        # Mapeo de columnas dinámico
        df['VENDEDOR'] = df[col_map.get('vendedor', 'Descripcion Vendedor')].apply(
            lambda x: 'Sin Vendedor' if es_sin_vendedor(x) else str(x).strip()
        )
        df['SUC']      = df[col_map.get('sucursal', 'Descripcion Sucursal')].str.strip().str.upper()
        df['CANAL']    = df[col_map.get('canal', 'Descripcion Canal MKT')].str.upper().str.strip()
        df['SUBCANAL'] = df[col_map.get('subcanal', 'Descripcion Subcanal MKT')].str.upper().str.strip()
        df['CLIENTE']  = df[col_map.get('cliente', 'Cliente')]
        
        col_fecha = col_map.get('fecha', 'Fecha Comprobante')
        df['FECHA']    = pd.to_datetime(df[col_fecha], errors='coerce')
        df['DIA']      = df['FECHA'].dt.day
        
        col_bultos = col_map.get('bultos', 'Bultos Total')
        df['BULTOS']   = pd.to_numeric(df[col_bultos], errors='coerce').fillna(0)
        
        col_articulo = col_map.get('articulo', 'Descripcion de Articulo')
        df['SKU']      = df[col_articulo].apply(get_sku)

        # Unificar alias de subcanal
        df['SUBCANAL'] = df['SUBCANAL'].replace(subcanal_alias)

        # Columnas por subcanal dinámicas (según config)
        subcanales_config = config.get('subcanales_interes', [
            ('MAYORISTA A','MAY_A'), ('MAYORISTA B','MAY_B'),
            ('KIOSCO A','KA'), ('KIOSCO B','KB'),
            ('KIOSCO C','KC'), ('KIOSCO CADENA','KCA')
        ])
        
        for sc_name, sc_code in subcanales_config:
            df[sc_code] = df['BULTOS'].where(df['SUBCANAL'] == sc_name, 0)

        # Totales agrupados (Configurables)
        grupos = config.get('agrupacion_canales', {
            'MAY_TOT': ['MAY_A', 'MAY_B'],
            'MIN_TOT': ['KA', 'KB', 'KC', 'KCA']
        })
        
        for total_col, sub_cols in grupos.items():
            df[total_col] = df[sub_cols].sum(axis=1)
            
        df['TOTAL'] = df[list(grupos.keys())].sum(axis=1)
        return df

    # --- Ejecución ---
    frames = []
    for path in archivos_input:
        if os.path.exists(path):
            frames.append(load_reporte(path))
    
    if not frames: return None
    
    df_all = pd.concat(frames, ignore_index=True)

    # Reclasificaciones dinámicas
    for r in reclasificaciones:
        mask = (df_all['SUC'] == r['suc']) & (df_all['DIA'] >= r['desde_dia']) & (df_all['CANAL'] == r['canal'])
        if r['destino'] in df_all.columns:
            sources = [c for c in config.get('columnas_minoristas', ['KA','KB','KC','KCA'])]
            df_all.loc[mask, r['destino']] = df_all.loc[mask, sources].sum(axis=1)
            for s in sources:
                if s != r['destino']: df_all.loc[mask, s] = 0
    
    # Recalcular totales tras reclasificación
    grupos = config.get('agrupacion_canales', {'MAY_TOT':['MAY_A','MAY_B'], 'MIN_TOT':['KA','KB','KC','KCA']})
    for total_col, sub_cols in grupos.items():
        df_all[total_col] = df_all[sub_cols].sum(axis=1)
    df_all['TOTAL'] = df_all[list(grupos.keys())].sum(axis=1)

    return df_all


def inferir_configuracion(path_excel):
    """
    MODO DESCUBRIMIENTO: Analiza un Excel desconocido y genera un borrador de 
    configuración (JSON) para que el Superadmin lo refine.
    """
    print(f"\n--- INFERENCIA DE CONFIGURACIÓN: {os.path.basename(path_excel)} ---")
    df = pd.read_excel(path_excel, header=0, nrows=1000) # solo las primeras 1000 para rapidez
    
    cols = df.columns.tolist()
    
    # Intentar detectar columnas clave por similitud de nombres
    detected_cols = {}
    keywords = {
        'vendedor': ['vend', 'vendedor', 'nombre vendedor', 'ejecutivo'],
        'sucursal': ['suc', 'sucursal', 'branch', 'direccion'],
        'canal': ['canal', 'mkt', 'tipo'],
        'subcanal': ['subcanal', 'segmento'],
        'cliente': ['cliente', 'razon social', 'pdv'],
        'fecha': ['fecha', 'comprobante', 'dia'],
        'bultos': ['bultos', 'cantidad', 'unidades', 'total bultos'],
        'articulo': ['articulo', 'descripcion', 'item', 'nombre producto'],
        'anulado': ['anulado', 'estado', 'valid']
    }
    
    for key, kw_list in keywords.items():
        found = next((c for c in cols if any(kw.upper() in c.upper() for kw in kw_list)), None)
        if found: detected_cols[key] = found

    # Extraer valores únicos de Sucursales (si se detectó la columna)
    suc_col = detected_cols.get('sucursal')
    sucs_encontradas = sorted(df[suc_col].astype(str).unique().tolist()) if suc_col else []

    # Extraer SKUs más frecuentes (para sugerir mapeo)
    art_col = detected_cols.get('articulo')
    frecuentes = []
    if art_col:
        frecuentes = df[art_col].value_counts().head(20).index.tolist()

    # Construir el JSON de Sugerencia
    config_sugerida = {
        "empresa": "NOMBRE DEL TENANT (DETERMINAR)",
        "mes_reporte": "MES Y AÑO (AUTODETECCION)",
        "branding": {
            "primary": "#1A3A5C",
            "secondary": "#2E6DA4",
            "accent_green": "#1D9E75"
        },
        "column_mapping": detected_cols,
        "sku_map": {art: art.split()[-1] for art in frecuentes}, # Sugerencia tonta: usar última palabra
        "sucs_orden": sucs_encontradas,
        "colores_sucursales": {suc: "#1A3A5C" for suc in sucs_encontradas},
        "subcanal_alias": {},
        "subcanales_interes": [
            ["MAYORISTA A", "MAY_A"],
            ["KIOSCO A", "KA"]
        ],
        "agrupacion_canales": {
            "MAY_TOT": ["MAY_A"],
            "MIN_TOT": ["KA"]
        },
        "prefijos_sin_vendedor": ["SUPER"],
        "reclasificaciones": []
    }
    
    return config_sugerida


if __name__ == '__main__':
    import sys
    
    # Si se pasa un archivo por argumento, intentar inferir configuración
    if len(sys.argv) > 1 and sys.argv[1].endswith('.xlsx'):
        path = sys.argv[1]
        config_borrador = inferir_configuracion(path)
        
        output_name = f"config_borrador_{os.path.basename(path)}.json"
        with open(output_name, 'w') as f:
            json.dump(config_borrador, f, indent=2)
            
        print(f"\n[OK] Se ha generado un borrador de configuración en: {output_name}")
        print("El Superadmin debe revisar y completar este archivo antes de procesar datos.")
    else:
        # MODO NORMAL: Usar config_ejemplo.json
        config_path = 'config_ejemplo.json'
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config_db = json.load(f)
            
            # Buscamos Excels en la carpeta input/
            os.makedirs('input', exist_ok=True)
            archivos = [os.path.join('input', f) for f in os.listdir('input') if f.endswith('.xlsx')]
            
            if not archivos:
                print("No se encontraron archivos .xlsx en la carpeta 'input/'.")
                print("Para inferir una nueva configuración, arrastrá un archivo:")
                print("Uso: python DH-1_procesar_datos.py mi_archivo_excel.xlsx")
            else:
                df_resultado = procesar_datos_tenant(config_db, archivos)
                if df_resultado is not None:
                    os.makedirs('output', exist_ok=True)
                    with open('output/datos_procesados_DH.pkl', 'wb') as f:
                        pickle.dump({'df': df_resultado, 'config': config_db}, f)
                    print("\n[OK] Procesamiento DH completado.")
        else:
            print("Error: No se encontró 'config_ejemplo.json'.")
