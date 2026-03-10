import os
import requests
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
}

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def migrate_sucursales():
    # 1. Fetch maestro_jerarquia mapping (Vendedor Name -> id suc)
    res_maestro = requests.get(f"{url}/rest/v1/maestro_jerarquia?select=Vendedor,\"id suc\"", headers=headers, verify=False)
    maestro = res_maestro.json()
    if not isinstance(maestro, list):
        print(f"Error fetching maestro_jerarquia: {maestro}")
        return
    
    # Map Vendor Name (normalized) -> Sucursal ID (erp)
    # We remove prefix like '02-' for easier matching if needed, or just normalize
    name_to_suc_map = {}
    for m in maestro:
        v_name = str(m['Vendedor']).strip().upper()
        if not v_name: continue
        name_to_suc_map[v_name] = m['id suc']
        
        # Also map without common prefix like '02-'
        if '-' in v_name:
            parts = v_name.split('-', 1)
            name_to_suc_map[parts[1].strip()] = m['id suc']

    # 2. Fetch integrantes_grupo with id_vendedor_erp
    res_int = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_integrante,id_vendedor_erp", headers=headers, verify=False)
    integrantes = res_int.json()
    if not isinstance(integrantes, list):
        print(f"Error fetching integrantes_grupo: {integrantes}")
        return

    # 3. Perform updates
    updates = 0
    for i in integrantes:
        v_id_val = i.get('id_vendedor_erp')
        if not v_id_val: continue
        
        v_name_search = str(v_id_val).strip().upper()
        id_erp_suc = name_to_suc_map.get(v_name_search)
        
        if id_erp_suc:
            # Update via PATCH
            patch_res = requests.patch(
                f"{url}/rest/v1/integrantes_grupo?id_integrante=eq.{i['id_integrante']}",
                json={"id_sucursal_erp": id_erp_suc},
                headers=headers,
                verify=False
            )
            if patch_res.status_code in (200, 201, 204):
                updates += 1
            else:
                print(f"Failed to update {i['id_integrante']}: {patch_res.text}")

    print(f"Migration completed. {updates} records updated.")

if __name__ == "__main__":
    migrate_sucursales()
