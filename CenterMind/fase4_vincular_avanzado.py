import sys
sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
from dotenv import load_dotenv
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb

def migrate_historical_links():
    print("--- INICIANDO VINCULACIÓN HISTÓRICA AVANZADA ---")
    
    # 1. Obtener mapeo: id_cliente (viejo) -> numero_cliente_local (ERP)
    print("Obteniendo mapeo de clientes viejos...")
    legacy_clients = sb.table('clientes').select('id_cliente, numero_cliente_local').execute().data
    # Usamos string para el numero_cliente_local para machear con id_cliente_erp
    old_to_erp = {c['id_cliente']: str(c['numero_cliente_local']).strip() for c in legacy_clients if c['numero_cliente_local']}
    print(f"Mapeos encontrados en tabla 'clientes': {len(old_to_erp)}")

    # 2. Obtener mapeo: id_cliente_erp (ERP) -> id_cliente (nuevo en clientes_pdv)
    print("Obteniendo mapeo de clientes nuevos (clientes_pdv)...")
    new_clients = sb.table('clientes_pdv').select('id_cliente, id_cliente_erp').execute().data
    erp_to_new = {str(c['id_cliente_erp']).strip(): c['id_cliente'] for c in new_clients}
    print(f"Mapeos encontrados en tabla 'clientes_pdv': {len(erp_to_new)}")

    # 3. Obtener exhibiciones que tienen id_cliente pero no id_cliente_pdv
    print("Buscando exhibiciones para vincular...")
    exhibitions = sb.table('exhibiciones').select('id_exhibicion, id_cliente, cliente_sombra_codigo')\
        .is_('id_cliente_pdv', 'null').execute().data
    print(f"Exhibiciones pendientes de vínculo: {len(exhibitions)}")

    linked_count = 0
    errors = 0

    for ex in exhibitions:
        try:
            target_new_id = None
            
            # Intento A: Por cliente_sombra_codigo (lo que hacía el SQL original)
            if ex['cliente_sombra_codigo'] and str(ex['cliente_sombra_codigo']).strip() in erp_to_new:
                target_new_id = erp_to_new[str(ex['cliente_sombra_codigo']).strip()]
            
            # Intento B: Por id_cliente (viejo) -> numero_local -> id_cliente_erp (nuevo)
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
            if errors < 5: print(f"Error vinculando id_exhibicion {ex['id_exhibicion']}: {e}")

    print(f"\n--- RESUMEN ---")
    print(f"Total procesadas: {len(exhibitions)}")
    print(f"Vínculos creados: {linked_count}")
    print(f"Errores:          {errors}")

if __name__ == "__main__":
    migrate_historical_links()
