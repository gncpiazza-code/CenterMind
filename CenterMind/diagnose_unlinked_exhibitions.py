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
    print("--- DIAGNÓSTICO DE EXHIBICIONES NO VINCULADAS ---")
    
    # 1. Obtener datos necesarios
    print("Cargando datos de clientes (legacy)...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {c['id_cliente']: str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    legacy_ids = {c['id_cliente'] for c in legacy_clients}
    
    print("Cargando datos de clientes_pdv (nuevos)...")
    new_clients = get_all_rows('clientes_pdv', 'id_cliente_erp')
    erp_in_new = {str(c['id_cliente_erp']).strip() for c in new_clients if c['id_cliente_erp']}
    
    print("Cargando exhibiciones...")
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    
    total = len(exhibitions)
    unlinked = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"\nTotal Exhibiciones: {total}")
    print(f"No vinculadas: {len(unlinked)} ({len(unlinked)/total*100:.2f}%)")
    
    # Razones de no vinculación
    reasons = {
        "id_cliente_no_existe_en_legacy": 0,
        "id_cliente_sin_numero_erp": 0,
        "numero_erp_no_existe_en_pdv": 0,
        "sombra_no_existe_en_pdv": 0,
        "sin_ningun_dato": 0
    }
    
    for ex in unlinked:
        old_id = ex['id_cliente']
        sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
        
        has_sombra_path = False
        if sombra:
            if sombra not in erp_in_new:
                reasons["sombra_no_existe_en_pdv"] += 1
            else:
                # Esto no debería pasar si el script anterior funcionó bien, 
                # pero tal vez falló el update
                has_sombra_path = True
        
        has_legacy_path = False
        if old_id:
            if old_id not in legacy_ids:
                reasons["id_cliente_no_existe_en_legacy"] += 1
            elif old_id not in old_to_erp:
                reasons["id_cliente_sin_numero_erp"] += 1
            else:
                erp_code = old_to_erp[old_id]
                if erp_code not in erp_in_new:
                    reasons["numero_erp_no_existe_en_pdv"] += 1
                else:
                    has_legacy_path = True
        else:
            if not sombra:
                reasons["sin_ningun_dato"] += 1

    print("\nDesglose de razones (puede haber solapamiento si se cuentan por separado, pero esto da una idea):")
    for r, count in reasons.items():
        print(f"  - {r}: {count}")

if __name__ == "__main__":
    diagnose()
