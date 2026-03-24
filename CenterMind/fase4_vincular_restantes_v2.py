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

def migrate_restantes_batched():
    print("--- INICIANDO VINCULACIÓN BATCH DE RESTANTES ---")
    
    # 1. Maestro de clientes
    print("Obteniendo maestros...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {str(c['id_cliente']): str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    
    new_clients = get_all_rows('clientes_pdv', 'id_cliente, id_cliente_erp')
    erp_to_new = {str(c['id_cliente_erp']).strip(): c['id_cliente'] for c in new_clients if c['id_cliente_erp']}
    
    # 2. Pendientes
    print("Buscando exhibiciones sin vínculo...")
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    pending = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    
    print(f"Total sin vínculo inicial: {len(pending)}")
    
    # Agrupar por target_new_id
    updates_map = {} # target_new_id -> list of id_exhibicion
    
    orphans = 0
    for ex in pending:
        target_new_id = None
        old_id_str = str(ex['id_cliente']) if ex['id_cliente'] else None
        sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
        
        if sombra and sombra in erp_to_new:
            target_new_id = erp_to_new[sombra]
        elif old_id_str and old_id_str in old_to_erp:
            erp_code = old_to_erp[old_id_str]
            if erp_code in erp_to_new:
                target_new_id = erp_to_new[erp_code]
        
        if target_new_id:
            if target_new_id not in updates_map:
                updates_map[target_new_id] = []
            updates_map[target_new_id].append(ex['id_exhibicion'])
        else:
            orphans += 1

    print(f"Vinculables encontrados: {sum(len(v) for v in updates_map.values())}")
    print(f"No vinculables (huérfanos/faltantes): {orphans}")
    
    # Ejecutar updates batched por cliente
    linked_count = 0
    total_groups = len(updates_map)
    current_group = 0
    
    for tid, ids in updates_map.items():
        current_group += 1
        retries = 3
        while retries > 0:
            try:
                # Actualizar todos los IDs que pertenecen a este cliente de una vez
                sb.table('exhibiciones').update({'id_cliente_pdv': tid})\
                    .in_('id_exhibicion', ids).execute()
                linked_count += len(ids)
                break
            except Exception as e:
                retries -= 1
                print(f"Error en batch (tid={tid}): {e}. Retries left: {retries}")
                time.sleep(2)
        
        if current_group % 20 == 0:
            print(f"  Progreso: {current_group}/{total_groups} grupos procesados. Vinculados: {linked_count}")

    print(f"\n--- RESUMEN FINAL ---")
    print(f"Vínculos creados: {linked_count}")
    print(f"Pendientes remanentes: {orphans}")

if __name__ == "__main__":
    migrate_restantes_batched()
