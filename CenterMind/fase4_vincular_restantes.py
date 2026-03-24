import time
from db import sb

def get_all_rows(table_name, select_cols):
    all_data = []
    page_size = 1000
    start = 0
    while True:
        retries = 3
        while retries > 0:
            try:
                res = sb.table(table_name).select(select_cols).range(start, start + page_size - 1).execute()
                if not res.data:
                    return all_data
                all_data.extend(res.data)
                if len(res.data) < page_size:
                    return all_data
                start += page_size
                break
            except Exception as e:
                retries -= 1
                print(f"Error fetching {table_name} (retries left: {retries}): {e}")
                time.sleep(2)
        if retries == 0:
            raise Exception(f"Failed to fetch {table_name} after 3 retries")
    return all_data

def migrate_restantes():
    print("--- INICIANDO VINCULACIÓN DE RESTANTES (740+) ---")
    
    # 1. Obtener maestros
    print("Obteniendo maestros...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {str(c['id_cliente']): str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    
    new_clients = get_all_rows('clientes_pdv', 'id_cliente, id_cliente_erp')
    erp_to_new = {str(c['id_cliente_erp']).strip(): c['id_cliente'] for c in new_clients if c['id_cliente_erp']}
    
    # 2. Obtener exhibiciones pendientes
    print("Buscando exhibiciones sin vínculo...")
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    pending = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"Total sin vínculo: {len(pending)}")
    
    linked_count = 0
    errors = 0
    
    print("Procesando...")
    for ex in pending:
        try:
            target_new_id = None
            old_id_str = str(ex['id_cliente']) if ex['id_cliente'] else None
            sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
            
            # Intento A: Por cliente_sombra_codigo
            if sombra and sombra in erp_to_new:
                target_new_id = erp_to_new[sombra]
            
            # Intento B: Por id_cliente (viejo)
            elif old_id_str and old_id_str in old_to_erp:
                erp_code = old_to_erp[old_id_str]
                if erp_code in erp_to_new:
                    target_new_id = erp_to_new[erp_code]
            
            if target_new_id:
                # Update con retry
                u_retries = 2
                while u_retries > 0:
                    try:
                        sb.table('exhibiciones').update({'id_cliente_pdv': target_new_id})\
                            .eq('id_exhibicion', ex['id_exhibicion']).execute()
                        linked_count += 1
                        if linked_count % 50 == 0:
                            print(f"  Vínculos creados: {linked_count}...")
                        break
                    except Exception as ue:
                        u_retries -= 1
                        time.sleep(1)
                if u_retries == 0:
                    errors += 1
                    
        except Exception as e:
            errors += 1
            if errors < 10: print(f"Error procesando id_exhibicion {ex['id_exhibicion']}: {e}")

    print(f"\n--- RESUMEN FINAL ---")
    print(f"Total procesadas: {len(pending)}")
    print(f"Vínculos exitosos: {linked_count}")
    print(f"Errores:          {errors}")

if __name__ == "__main__":
    migrate_restantes()
