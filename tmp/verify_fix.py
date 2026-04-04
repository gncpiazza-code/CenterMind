import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

# Mock some data to check the logic
def check_erp_map(dist_id):
    # This simulates the logic inside api.py
    # Fetching name map
    ig_res = sb.table("integrantes_grupo")\
        .select("nombre_integrante, id_vendedor_v2, vendedores_v2(nombre_erp)")\
        .eq("id_distribuidor", dist_id)\
        .execute()
    
    name_map = {}
    for ig in (ig_res.data or []):
        tg_name = (ig.get("nombre_integrante") or "").strip()
        if not tg_name: continue
        
        # Test Nacho Exclusion
        if dist_id == 3 and tg_name.lower() == "nacho":
            print(f"Skipping {tg_name} (test user)")
            continue
            
        id_v_erp = ig.get("id_vendedor_v2")
        # Test Soto Exception
        if dist_id == 3 and id_v_erp == 30:
            print(f"Soto exception for {tg_name}")
            continue
            
        vend = ig.get("vendedores_v2")
        nombre_erp = None
        if isinstance(vend, dict):
            nombre_erp = vend.get("nombre_erp")
        elif isinstance(vend, list) and vend:
            nombre_erp = vend[0].get("nombre_erp")
            
        if nombre_erp:
            name_map[tg_name.lower()] = nombre_erp
    return name_map

print("Checking TABACO (Dist 3):")
m = check_erp_map(3)
print("Map keys (lower):", list(m.keys())[:10])

# Verify "Monchi Ayala" is NOT in the map (meaning it falls back to Telegram name)
if "monchi ayala" not in m:
    print("SUCCESS: Monchi Ayala not in ERP map (will use TG name)")
else:
    print("FAILURE: Monchi Ayala still mapped to", m["monchi ayala"])

# Verify "Nacho" is NOT in the map
if "nacho" not in m:
    print("SUCCESS: Nacho excluded from map")

