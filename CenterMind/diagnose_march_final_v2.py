import os
import time
from db import sb

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

def diagnose_march_real():
    print("--- DIAGNÓSTICO FINAL (REAL): MARZO 2026 ---")
    
    # 1. Cargar exhibiciones
    print("Cargando exhibiciones...")
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, id_cliente_pdv, timestamp_subida')
    
    march_exhibitions = []
    for ex in exhibitions:
        ts = ex.get('timestamp_subida') or ""
        if ts.startswith('2026-03'):
            march_exhibitions.append(ex)
            
    total_march = len(march_exhibitions)
    unlinked_march = [ex for ex in march_exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"\nTotal Exhibiciones Marzo: {total_march}")
    print(f"No vinculadas en Marzo: {len(unlinked_march)}")
    
    if not unlinked_march:
        print("\n🎉 ¡TODAS LAS EXHIBICIONES DE MARZO ESTÁN 100% VINCULADAS! 🎉")
    else:
        print(f"\nQuedan {len(unlinked_march)} sin vincular en Marzo.")
        print("Ejemplos:")
        for ex in unlinked_march[:5]:
            print(f"  ID {ex['id_exhibicion']} (Cliente Legacy: {ex['id_cliente']})")

if __name__ == "__main__":
    diagnose_march_real()
