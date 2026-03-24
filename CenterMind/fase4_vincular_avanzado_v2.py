import sys
sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
from dotenv import load_dotenv
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb

def get_all_rows(table_name, select_cols):
    """Auxiliar para obtener todas las filas sorteando el límite de 1000."""
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

def migrate_historical_links():
    print("--- INICIANDO VINCULACIÓN HISTÓRICA AVANZADA (V2) ---")
    
    # 1. Obtener mapeo: id_cliente (viejo) -> numero_cliente_local (ERP)
    print("Obteniendo todos los clientes viejos...")
    legacy_clients = get_all_rows('clientes', 'id_cliente, numero_cliente_local')
    old_to_erp = {c['id_cliente']: str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    print(f"Mapeos encontrados en tabla 'clientes': {len(old_to_erp)}")

    # 2. Obtener mapeo: id_cliente_erp (ERP) -> id_cliente (nuevo en clientes_pdv)
    print("Obteniendo todos los clientes nuevos (clientes_pdv)...")
    new_clients = get_all_rows('clientes_pdv', 'id_cliente, id_cliente_erp')
    erp_to_new = {str(c['id_cliente_erp']).strip(): c['id_cliente'] for c in new_clients}
    print(f"Mapeos encontrados en tabla 'clientes_pdv': {len(erp_to_new)}")

    # 3. Obtener exhibiciones pendientes
    print("Buscando exhibiciones para vincular...")
    # No usamos get_all_rows aquí para poder iterar por lotes si es necesario, 
    # pero para el update necesitamos ir filtrando.
    exhibitions = get_all_rows('exhibiciones', 'id_exhibicion, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    pending = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    print(f"Exhibiciones totales: {len(exhibitions)}")
    print(f"Exhibiciones sin vínculo: {len(pending)}")

    linked_count = 0
    errors = 0
    
    # Debug de los primeros 5 pendientes
    print("\nEjemplo de los primeros 5 pendientes:")
    for ex in pending[:5]:
        old_id = ex['id_cliente']
        erp_code = old_to_erp.get(old_id, "NO_ENCONTRADO")
        exists_in_new = erp_code in erp_to_new
        print(f"  Exhibicion {ex['id_exhibicion']}: old_id={old_id} -> ERP={erp_code} -> En Nuevo? {exists_in_new}")

    print("\nProcesando...")

    for ex in pending:
        try:
            target_new_id = None
            
            # Intento A: Por cliente_sombra_codigo
            sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
            if sombra and sombra in erp_to_new:
                target_new_id = erp_to_new[sombra]
            
            # Intento B: Por id_cliente (viejo)
            elif ex['id_cliente'] in old_to_erp:
                erp_code = old_to_erp[ex['id_cliente']]
                if erp_code in erp_to_new:
                    target_new_id = erp_to_new[erp_code]
            
            if target_new_id:
                sb.table('exhibiciones').update({'id_cliente_pdv': target_new_id})\
                    .eq('id_exhibicion', ex['id_exhibicion']).execute()
                linked_count += 1
                
        except Exception as e:
            errors += 1
            if errors < 10: print(f"Error vinculando id_exhibicion {ex['id_exhibicion']}: {e}")

    print(f"\n--- RESUMEN FINAL ---")
    print(f"Total procesadas: {len(pending)}")
    print(f"Vínculos creados: {linked_count}")
    print(f"Errores:          {errors}")

if __name__ == "__main__":
    migrate_historical_links()
