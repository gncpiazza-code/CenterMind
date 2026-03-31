import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Add parent dir to sys.path for local imports if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def load_db() -> Client:
    # Load .env relative to this script
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY missing in .env")
        sys.exit(1)
    return create_client(url, key)

def get_all_rows(sb: Client, table_name: str, select_cols: str):
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

def backfill():
    sb = load_db()
    print("--- BACKFILL EXHIBICIONES: LINKING TO CLIENTES_PDV_V2 ---")
    
    # 1. Load mapping: ERP_CODE -> NEW_CLIENT_ID (from clientes_pdv_v2)
    # Note: the user codebase sometimes refers to 'clientes_pdv_v2' and sometimes 'clientes_pdv'.
    # In api.py it's 'clientes_pdv_v2'.
    print("Loading clientes_pdv_v2...")
    new_clients = get_all_rows(sb, 'clientes_pdv_v2', 'id_cliente, id_cliente_erp, id_distribuidor')
    # Use tuple (dist_id, erp_id) to avoid collisions between tenants
    erp_to_new_id = {}
    for c in new_clients:
        dist_id = c['id_distribuidor']
        erp_id = str(c['id_cliente_erp']).strip() if c['id_cliente_erp'] else None
        if erp_id:
            erp_to_new_id[(dist_id, erp_id)] = c['id_cliente']

    # 2. Load Mapping: LEGACY_CLIENT_ID -> ERP_CODE (from legacy 'clientes' table)
    print("Loading legacy clients mapping...")
    legacy_clients = get_all_rows(sb, 'clientes', 'id_cliente, numero_cliente_local, id_distribuidor')
    legacy_to_erp = {}
    for c in legacy_clients:
        old_id = str(c['id_cliente'])
        erp_id = str(c['numero_cliente_local']).strip() if c['numero_cliente_local'] else None
        if erp_id:
            legacy_to_erp[old_id] = erp_id

    # 3. Load exhibiciones that are missing id_cliente_pdv
    print("Loading unlinked exhibitions...")
    # Process matches:
    # Match A: via id_cliente (legacy) -> legacy_to_erp -> erp_to_new_id
    # Match B: via cliente_sombra_codigo -> erp_to_new_id
    
    exhibitions = get_all_rows(sb, 'exhibiciones', 'id_exhibicion, id_distribuidor, id_cliente, cliente_sombra_codigo, id_cliente_pdv')
    
    unlinked = [ex for ex in exhibitions if ex.get('id_cliente_pdv') is None]
    print(f"Total exhibitions: {len(exhibitions)}")
    print(f"Unlinked exhibitions: {len(unlinked)}")
    
    linked_count = 0
    updates = [] # (id_ex, payload)

    for ex in unlinked:
        dist_id = ex['id_distribuidor']
        old_id = str(ex['id_cliente']) if ex['id_cliente'] else None
        sombra = str(ex['cliente_sombra_codigo']).strip() if ex['cliente_sombra_codigo'] else None
        
        target_new_id = None
        
        # Priority 1: Shadow code (usually current ERP code)
        if sombra:
            target_new_id = erp_to_new_id.get((dist_id, sombra))
        
        # Priority 2: Legacy ID mapping
        if not target_new_id and old_id:
            erp_id = legacy_to_erp.get(old_id)
            if erp_id:
                target_new_id = erp_to_new_id.get((dist_id, erp_id))
        
        if target_new_id:
            updates.append({'id_exhibicion': ex['id_exhibicion'], 'id_cliente_pdv': target_new_id})
            linked_count += 1

    print(f"Found {linked_count} exhibitions to link.")
    
    if updates:
        print("Applying updates in batches...")
        batch_size = 50
        for i in range(0, len(updates), batch_size):
            batch = updates[i:i+batch_size]
            # Supabase doesn't support bulk updates with multiple WHERE conditions easily via .update() 
            # for different values in a single call. We'll do it sequentially or via RPC if needed.
            # But here we'll just do it sequentially for safety, or use upsert if we had all columns.
            # Actually, let's use sequential update calls or a transaction.
            for item in batch:
                sb.table('exhibiciones').update({'id_cliente_pdv': item['id_cliente_pdv']}).eq('id_exhibicion', item['id_exhibicion']).execute()
            
            print(f"Progress: {min(i + batch_size, len(updates))}/{len(updates)} done.")
    
    print("Done!")

if __name__ == "__main__":
    backfill()
