import pandas as pd
from db import sb
import time

def get_all_rows(table_name, select_cols):
    all_data = []
    page_size = 1000
    start = 0
    while True:
        try:
            res = sb.table(table_name).select(select_cols).range(start, start + page_size - 1).execute()
            if not res.data:
                return all_data
            all_data.extend(res.data)
            if len(res.data) < page_size:
                return all_data
            start += page_size
        except Exception as e:
            print(f"Error fetching {table_name}: {e}")
            time.sleep(2)
    return all_data

def export_orphans_march():
    print("--- EXPORTANDO EXHIBICIONES HUÉRFANAS DE MARZO ---")
    
    # 1. Maestros
    print("Obteniendo distribuidores...")
    distros = get_all_rows('distribuidores', 'id_distribuidor, nombre_empresa')
    distro_map = {d['id_distribuidor']: d['nombre_empresa'] for d in distros}
    
    # 2. Exhibiciones
    print("Obteniendo exhibiciones...")
    # Traemos las que no tienen id_cliente_pdv
    # No podemos filtrar por null en .select() directamente con facilidad en algunas versiones, 
    # asi que traemos todas y filtramos en Python para segurarnos con el timestamp.
    cols = 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv, timestamp_subida, id_distribuidor, telegram_chat_id, url_foto_drive'
    all_ex = get_all_rows('exhibiciones', cols)
    
    orphans = []
    for ex in all_ex:
        ts = ex.get('timestamp_subida') or ""
        if ts.startswith('2026-03') and ex.get('id_cliente_pdv') is None:
            # Enriquecemos con nombre del distribuidor
            ex['nombre_distribuidor'] = distro_map.get(ex['id_distribuidor'], "Desconocido")
            orphans.append(ex)
            
    print(f"Total huérfanas encontradas en Marzo: {len(orphans)}")
    
    if not orphans:
        print("No hay exhibiciones huérfanas en Marzo.")
        return

    # 3. Crear DataFrame y Exportar
    df = pd.DataFrame(orphans)
    
    # Reordenar columnas para que sea amigable
    friendly_cols = [
        'id_exhibicion', 
        'timestamp_subida', 
        'nombre_distribuidor', 
        'id_cliente', 
        'cliente_sombra_codigo', 
        'telegram_chat_id', 
        'url_foto_drive'
    ]
    df = df[friendly_cols]
    
    output_file = "exhibiciones_huerfanas_marzo.xlsx"
    df.to_excel(output_file, index=False)
    print(f"🎉 Archivo creado: {output_file}")

if __name__ == "__main__":
    export_orphans_march()
