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
    # 1. Fetch locations mapping (ID -> Name)
    res_loc = requests.get(f"{url}/rest/v1/locations?select=location_id,label", headers=headers, verify=False)
    locations = res_loc.json()
    if not isinstance(locations, list):
        print(f"Error fetching locations: {locations}")
        return
    loc_map = {l['location_id']: l['label'] for l in locations if l['label']}
    
    # 2. Fetch maestro_jerarquia mapping (Name -> ID ERP)
    res_maestro = requests.get(f"{url}/rest/v1/maestro_jerarquia?select=SUCURSAL,\"id suc\"", headers=headers, verify=False)
    maestro = res_maestro.json()
    if not isinstance(maestro, list):
        print(f"Error fetching maestro_jerarquia: {maestro}")
        return
    maestro_map = {m['SUCURSAL'].strip().upper(): m['id suc'] for m in maestro if m['SUCURSAL']}

    # 3. Fetch integrantes_grupo with location_id
    res_int = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_integrante,location_id", headers=headers, verify=False)
    integrantes = res_int.json()
    if not isinstance(integrantes, list):
        print(f"Error fetching integrantes_grupo: {integrantes}")
        return

    # 4. Perform updates
    updates = 0
    for i in integrantes:
        loc_id = i.get('location_id')
        if not loc_id: continue
        
        name = loc_map.get(loc_id)
        if not name: continue
        
        id_erp = maestro_map.get(name.strip().upper())
        if id_erp:
            # Update via PATCH
            patch_res = requests.patch(
                f"{url}/rest/v1/integrantes_grupo?id_integrante=eq.{i['id_integrante']}",
                json={"id_sucursal_erp": id_erp},
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
