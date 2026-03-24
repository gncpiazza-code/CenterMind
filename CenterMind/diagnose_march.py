import os
from datetime import datetime
from db import sb

def get_all_rows(table_name, select_cols):
    all_data = []
    page_size = 1000
    start = 0
    while True:
        res = sb.table(table_name).select(select_cols).range(start, start + page_size - 1).execute()
        if not res.data:
            break
        all_data.extend(res.data)
        if len(res.data) < page_size:
            break
        start += page_size
    return all_data

def diagnose_march():
    print("--- DIAGNÓSTICO ESPECÍFICO: MARZO 2026 ---")
    
    # 1. Cargar datos maestros
    print("Cargando maestros...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {str(c['id_cliente']): str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    legacy_ids = {str(c['id_cliente']) for c in legacy_clients}
    
    new_clients = get_all_rows('clientes_pdv', 'id_cliente_erp')
    erp_in_new = {str(c['id_cliente_erp']).strip() for c in new_clients if c['id_cliente_erp']}
    
    # 2. Cargar exhibiciones de Marzo
    print("Cargando exhibiciones...")
    # Buscamos por created_at o fecha_exhibicion si existe
    # Probaremos con created_at >= '2026-03-01'
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv, created_at')
    
    march_exhibitions = []
    for ex in exhibitions:
        cat = ex.get('created_at')
        if cat and cat.startswith('2026-03'):
            march_exhibitions.append(ex)
            
    total_march = len(march_exhibitions)
    unlinked_march = [ex for ex in march_exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"\nTotal Exhibiciones Marzo: {total_march}")
    print(f"No vinculadas en Marzo: {len(unlinked_march)} ({len(unlinked_march)/total_march*100 if total_march else 0:.2f}%)")
    
    if not unlinked_march:
        print("¡Todo Marzo ya está vinculado!")
        return

    reasons = {
        "sin_ningun_dato": 0,
        "erp_no_en_pdv": 0,
        "podria_vincularse": 0,
        "id_cliente_no_en_legacy": 0,
        "id_cliente_sin_erp_en_legacy": 0
    }
    
    for ex in unlinked_march:
        old_id = str(ex['id_cliente']) if ex['id_cliente'] else None
        sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
        
        target_erp = None
        if sombra:
            target_erp = sombra
        elif old_id:
            if old_id not in legacy_ids:
                reasons["id_cliente_no_en_legacy"] += 1
            elif old_id not in old_to_erp:
                reasons["id_cliente_sin_erp_en_legacy"] += 1
            else:
                target_erp = old_to_erp[old_id]
        
        if not old_id and not sombra:
            reasons["sin_ningun_dato"] += 1
        elif target_erp:
            if target_erp in erp_in_new:
                reasons["podria_vincularse"] += 1
            else:
                reasons["erp_no_en_pdv"] += 1

    print("\nDesglose de razones para MARZO:")
    for r, count in reasons.items():
        print(f"  - {r}: {count}")

if __name__ == "__main__":
    diagnose_march()
