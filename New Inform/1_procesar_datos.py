"""
=============================================================================
SCRIPT 1 — PROCESAR DATOS
Tabaco & Hnos — Real Distribucion
=============================================================================

QUE HACE:
  Lee uno o mas archivos de reporte de comprobantes detallados,
  los unifica, clasifica por SKU, canal y subcanal, y guarda
  el DataFrame listo para el script de generacion del PDF.

USO:
  1. Poner los archivos .xlsx en la carpeta 'input/'
  2. Configurar la seccion CONFIG mas abajo
  3. Ejecutar: python 1_procesar_datos.py
  4. Se genera 'output/datos_procesados.pkl' para usar en el script 2

DEPENDENCIAS:
  pip install pandas openpyxl

=============================================================================
"""

import pandas as pd
import numpy as np
import pickle
import os

# =============================================================================
# CONFIG — editar aqui
# =============================================================================

ARCHIVOS_INPUT = [
    'input/reporte_4sucursales.xlsx',   # archivo con Reconquista, Resistencia, Saenz Peña, Cordoba
    'input/reporte_corrientes.xlsx',     # archivo con Corrientes
]

OUTPUT_PKL = 'output/datos_procesados.pkl'

# Sucursales a incluir (en el orden en que aparecerán en el PDF)
SUCS_ORDEN = ['RECONQUISTA', 'RESISTENCIA', 'SAENZ PEÑA', 'CORRIENTES', 'CORDOBA']

# Reclasificaciones: sucursal, a partir de qué día, canal afectado, subcanal destino
# Ejemplo: en Córdoba desde el día 16, todo MINORISTA pasa a KIOSCO C
RECLASIFICACIONES = [
    {'suc': 'CORDOBA', 'desde_dia': 16, 'canal': 'MINORISTA', 'destino': 'KC'},
]

# Supervisores → Sin Vendedor (prefijos, case insensitive)
PREFIJOS_SIN_VENDEDOR = ['SUPER', 'SUPERVIC']

# =============================================================================
# MAPPING DE SKUs — agregar variantes si aparecen nombres nuevos
# =============================================================================

SKU_MAP = {
    # Liverpool Red
    'LIVERPOOL SPECIAL RED':    'L. Red',
    'LIVERPOOL SP RED':         'L. Red',
    # Liverpool Green
    'LIVERPOOL SPECIAL GREEN':  'L. Green',
    'LIVERPOOL SP GREEN':       'L. Green',
    # Liverpool Blue
    'LIVERPOOL SPECIAL BLUE':   'L. Blue',
    'LIVERPOOL SP BLUE':        'L. Blue',
    # Liverpool Blue Pop
    'LIVERPOOL BLUE POP':       'L. Blue Pop',
    # Pier
    'PIER ORIGINAL':            'Pier Original',
    'PIER GREEN':               'Pier Green',
    'PIER CAPS':                'Pier Caps',
    # Dolchester
    'DOLCHESTER GOLDEN':        'Dolch. Golden',
    'DOLCHESTER SILVER':        'Dolch. Silver',
    # Corona
    'CORONA':                   'Corona',
    # Papelillos — varias grafías
    'PIER AND ROLL NATURAL':    'Paper Natural',
    'PIER & ROLL NATURAL':      'Paper Natural',
    'PIER AND ROLL CLASSIC':    'Paper Clasico',
    'PIER AND ROLL CLÁSICO':    'Paper Clasico',
    'PIER & ROLL CLÁSICO':      'Paper Clasico',
    'PIER & ROLL CLASICO':      'Paper Clasico',
    'PAPEL DE FUMAR PIER':      'Paper Natural',
    # MIX
    'CIGARRILLOS MIX':          'MIX',
    'MIX X10':                  'MIX',
    'MIX':                      'MIX',
}

# Subcanales equivalentes (se unifican antes de asignar columnas)
SUBCANAL_ALIAS = {
    'MAYORISTAS':  'MAYORISTA A',
    'ALMACEN':     'KIOSCO C',
}

# =============================================================================
# FUNCIONES
# =============================================================================

def get_sku(art):
    """Mapea descripción de artículo al SKU corto estandarizado."""
    art = str(art).upper()
    for clave, sku in SKU_MAP.items():
        if clave in art:
            return sku
    return art  # si no coincide, devuelve el nombre original (aparecerá en "otros")


def es_sin_vendedor(nombre):
    """Determina si un vendedor debe considerarse Sin Vendedor (mostrador)."""
    if pd.isna(nombre):
        return True
    nombre_up = str(nombre).upper()
    return any(nombre_up.startswith(p.upper()) for p in PREFIJOS_SIN_VENDEDOR)


def load_reporte(path):
    """
    Lee un archivo de reporte de comprobantes detallado.
    Retorna DataFrame con columnas estandarizadas.
    """
    print(f"  Leyendo: {path}")
    df = pd.read_excel(path, header=0)

    # Filtrar anulados
    df = df[df['Anulado'] == 'NO'].copy()
    print(f"    Filas tras filtrar anulados: {len(df):,}")

    # Vendedor
    df['VENDEDOR'] = df['Descripcion Vendedor'].apply(
        lambda x: 'Sin Vendedor' if es_sin_vendedor(x) else str(x).strip()
    )

    # Campos base
    df['SUC']     = df['Descripcion Sucursal'].str.strip().str.upper()
    df['CANAL']   = df['Descripcion Canal MKT'].str.upper().str.strip()
    df['SUBCANAL']= df['Descripcion Subcanal MKT'].str.upper().str.strip()
    df['CLIENTE'] = df['Cliente']
    df['FECHA']   = pd.to_datetime(df['Fecha Comprobante'], errors='coerce')
    df['DIA']     = df['FECHA'].dt.day
    df['BULTOS']  = pd.to_numeric(df['Bultos Total'], errors='coerce').fillna(0)
    df['SKU']     = df['Descripcion de Articulo'].apply(get_sku)

    # Unificar alias de subcanal
    df['SUBCANAL'] = df['SUBCANAL'].replace(SUBCANAL_ALIAS)

    # Columnas por subcanal (una columna por subcanal, valor = bultos si corresponde, 0 si no)
    for sc, col in [('MAYORISTA A','MAY_A'), ('MAYORISTA B','MAY_B'),
                    ('KIOSCO A','KA'),        ('KIOSCO B','KB'),
                    ('KIOSCO C','KC'),         ('KIOSCO CADENA','KCA')]:
        df[col] = df['BULTOS'].where(df['SUBCANAL'] == sc, 0)

    df['MAY_TOT'] = df['MAY_A'] + df['MAY_B']
    df['MIN_TOT'] = df['KA'] + df['KB'] + df['KC'] + df['KCA']
    df['TOTAL']   = df['MAY_TOT'] + df['MIN_TOT']

    return df


def aplicar_reclasificacion(df, suc, desde_dia, canal, destino):
    """
    Reclasifica ventas de un canal a un subcanal destino
    para una sucursal a partir de un día del mes.
    Ejemplo: Córdoba desde día 16, todo MINORISTA → KC
    """
    mask = (df['SUC'] == suc) & (df['DIA'] >= desde_dia) & (df['CANAL'] == canal)
    cols_origen = [c for c in ['KA','KB','KC','KCA'] if c != destino]

    if destino == 'KC':
        df.loc[mask, 'KC'] = df.loc[mask, ['KA','KB','KC','KCA']].sum(axis=1)
        df.loc[mask, ['KA','KB','KCA']] = 0
    elif destino == 'KA':
        df.loc[mask, 'KA'] = df.loc[mask, ['KA','KB','KC','KCA']].sum(axis=1)
        df.loc[mask, ['KB','KC','KCA']] = 0

    # Recalcular totales
    df['MAY_TOT'] = df['MAY_A'] + df['MAY_B']
    df['MIN_TOT'] = df['KA'] + df['KB'] + df['KC'] + df['KCA']
    df['TOTAL']   = df['MAY_TOT'] + df['MIN_TOT']
    return df


# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    os.makedirs('output', exist_ok=True)

    print("=== PASO 1: Lectura de archivos ===")
    frames = []
    for path in ARCHIVOS_INPUT:
        if not os.path.exists(path):
            print(f"  ADVERTENCIA: no se encontró {path}")
            continue
        frames.append(load_reporte(path))

    if not frames:
        raise FileNotFoundError("No se encontró ningún archivo de input.")

    df_all = pd.concat(frames, ignore_index=True)
    print(f"\nTotal filas unificadas: {len(df_all):,}")

    print("\n=== PASO 2: Reclasificaciones ===")
    for r in RECLASIFICACIONES:
        print(f"  {r['suc']} desde día {r['desde_dia']}: {r['canal']} → {r['destino']}")
        df_all = aplicar_reclasificacion(df_all, r['suc'], r['desde_dia'], r['canal'], r['destino'])

    print("\n=== PASO 3: Resumen por sucursal ===")
    for suc in SUCS_ORDEN:
        d   = df_all[df_all['SUC'] == suc]
        deq = d[d['VENDEDOR'] != 'Sin Vendedor']
        dsv = d[d['VENDEDOR'] == 'Sin Vendedor']
        if len(d) == 0:
            print(f"  {suc}: SIN DATOS")
            continue
        print(f"\n  {suc}:")
        print(f"    Vendedores activos: {sorted(deq['VENDEDOR'].unique())}")
        print(f"    Clientes únicos: {deq['CLIENTE'].nunique():,}")
        print(f"    Equipo — Total: {deq['TOTAL'].sum():.1f} cajas "
              f"| May: {deq['MAY_TOT'].sum():.1f} | Min: {deq['MIN_TOT'].sum():.1f}")
        print(f"    Sin Vendedor: {dsv['TOTAL'].sum():.1f} cajas")
        # SKUs no reconocidos (quedaron con nombre largo)
        skus_cig = ['L. Red','L. Green','L. Blue','L. Blue Pop','Pier Original',
                    'Pier Green','Pier Caps','Dolch. Golden','Dolch. Silver','Corona']
        skus_pap = ['Paper Natural','Paper Clasico']
        skus_conocidos = skus_cig + skus_pap + ['MIX']
        desconocidos = [s for s in deq['SKU'].unique() if s not in skus_conocidos]
        if desconocidos:
            print(f"    ⚠ SKUs no mapeados (irán a 'otros'): {desconocidos}")

    print(f"\n=== PASO 4: Guardando datos procesados ===")
    with open(OUTPUT_PKL, 'wb') as f:
        pickle.dump({'df': df_all, 'sucs': SUCS_ORDEN}, f)
    print(f"  Guardado en: {OUTPUT_PKL}")
    print("\nListo. Ejecutá ahora: python 2_generar_pdf.py")
