import os
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

def diagnose():
    print("--- DIAGNÓSTICO REFINADO DE EXHIBICIONES NO VINCULADAS ---")
    
    # 1. Obtener datos necesarios
    print("Cargando datos de clientes (legacy)...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    # Guardamos id_cliente como string para consistencia
    old_to_erp = {str(c['id_cliente']): str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    legacy_ids = {str(c['id_cliente']) for c in legacy_clients}
    
    print("Cargando datos de clientes_pdv (nuevos)...")
    new_clients = get_all_rows('clientes_pdv', 'id_cliente_erp')
    erp_in_new = {str(c['id_cliente_erp']).strip() for c in new_clients if c['id_cliente_erp']}
    
    print("Cargando exhibiciones...")
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    
    total = len(exhibitions)
    unlinked = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"\nTotal Exhibiciones: {total}")
    print(f"No vinculadas: {len(unlinked)} ({len(unlinked)/total*100:.2f}%)")
    
    reasons = {
        "sin_ningun_dato": 0,                    # id_cliente is null AND sombra is null
        "id_cliente_no_en_legacy": 0,           # id_cliente exists but not in 'clientes' table
        "id_cliente_sin_erp_en_legacy": 0,      # id_cliente in 'clientes' but numero_cliente_local is null
        "erp_no_en_pdv": 0,                     # derived ERP code from id_cliente or sombra not in 'clientes_pdv'
        "podria_vincularse": 0                  # logic says it could be linked
    }
    
    could_link_ids = []

    for ex in unlinked:
        old_id = str(ex['id_cliente']) if ex['id_cliente'] else None
        sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
        
        target_erp = None
        
        # Lógica de vinculación (simulada)
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
                could_link_ids.append(ex['id_exhibicion'])
            else:
                reasons["erp_no_en_pdv"] += 1

    print("\nDesglose de razones:")
    for r, count in reasons.items():
        print(f"  - {r}: {count}")
    
    if could_link_ids:
        print(f"\nEjemplos de IDs que podrían vincularse ({len(could_link_ids)} total):")
        print(f"  {could_link_ids[:10]}...")

if __name__ == "__main__":
    diagnose()
