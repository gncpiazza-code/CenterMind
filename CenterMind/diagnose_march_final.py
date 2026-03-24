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

def diagnose_march():
    print("--- DIAGNÓSTICO FINAL: MARZO 2026 ---")
    
    # 1. Cargar maestros
    print("Cargando maestros...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {str(c['id_cliente']): str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    
    new_clients = get_all_rows('clientes_pdv', 'id_cliente_erp')
    erp_in_new = {str(c['id_cliente_erp']).strip() for c in new_clients if c['id_cliente_erp']}
    
    # 2. Cargar exhibiciones
    print("Cargando exhibiciones...")
    # Usamos timestamp_subida o fecha_exhibicion. 
    # Generalmente timestamp_subida es el mas confiable para 'hoy/ayer'
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv, timestamp_subida, fecha_exhibicion')
    
    march_exhibitions = []
    for ex in exhibitions:
        # Check both columns
        ts = ex.get('timestamp_subida') or ""
        fe = ex.get('fecha_exhibicion') or ""
        if (ts and ts.startswith('2026-03')) or (fe and fe.startswith('2026-03')):
            march_exhibitions.append(ex)
            
    total_march = len(march_exhibitions)
    unlinked_march = [ex for ex in march_exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"\nTotal Exhibiciones Marzo: {total_march}")
    print(f"No vinculadas en Marzo: {len(unlinked_march)}")
    
    if not unlinked_march:
        print("🎉 ¡TODO MARZO ESTÁ 100% VINCULADO! 🎉")
        return

    print("\nDesglose de pendientes de MARZO:")
    for ex in unlinked_march[:10]:
        print(f"  ID {ex['id_exhibicion']}: old_id={ex['id_cliente']}, sombra={ex['cliente_sombra_codigo']}")

if __name__ == "__main__":
    diagnose_march()
