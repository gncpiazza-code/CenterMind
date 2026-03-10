import os
import requests
from dotenv import load_dotenv
from collections import defaultdict

# SSL Fix
try:
    import certifi
    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def populate():
    print("--- Starting Maestro Jerarquía Population ---")
    
    # 1. Fetch Distribuidores
    print("Fetching distribuidores...")
    d_res = requests.get(f"{url}/rest/v1/distribuidores?select=id_distribuidor,nombre_empresa", headers=headers)
    dists = {d["id_distribuidor"]: d["nombre_empresa"] for d in d_res.json()}
    
    # 2. Fetch Integrantes (Map: dist_id, seller_erp_id -> name, group_id)
    print("Fetching integrantes...")
    i_res = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_distribuidor,id_vendedor_erp,nombre_integrante,telegram_group_id", headers=headers)
    integrantes = {}
    for i in i_res.json():
        if i["id_vendedor_erp"]:
            integrantes[(i["id_distribuidor"], str(i["id_vendedor_erp"]))] = i

    # 3. Fetch Distinct Hierarchy from erp_clientes_raw
    # We fetch by distributor to avoid hitting rows limit (1000)
    print("Fetching hierarchy from erp_clientes_raw...")
    hierarchy_data = []
    for d_id in dists.keys():
        print(f"  Dist {d_id}...")
        # Get distinct combinations (via select unique if possible, or just fetch all and dedup in python)
        # For simplicity, fetch all relevant columns for this distributor
        e_res = requests.get(f"{url}/rest/v1/erp_clientes_raw?id_distribuidor=eq.{d_id}&select=id_sucursal_erp,sucursal_erp,vendedor_erp", headers=headers)
        rows = e_res.json()
        
        seen = set()
        for r in rows:
            key_triple = (r["id_sucursal_erp"], r["vendedor_erp"])
            if key_triple not in seen:
                # Enrich with Integrantes data
                integ = integrantes.get((d_id, str(r["vendedor_erp"])))
                
                hierarchy_data.append({
                    "EMPRESA": dists[d_id],
                    "ID_DIST": d_id,
                    "id suc": str(r["id_sucursal_erp"]),
                    "SUCURSAL": r["sucursal_erp"],
                    "ID_VENDEDOR": str(r["vendedor_erp"]),
                    "Vendedor": integ["nombre_integrante"] if integ else None,
                    "Group id": integ["telegram_group_id"] if integ else None
                })
                seen.add(key_triple)

    print(f"Total unique hierarchy records: {len(hierarchy_data)}")

    # 4. Upsert into maestro_jerarquia
    print("Upserting into 'maestro_jerarquia'...")
    u_res = requests.post(f"{url}/rest/v1/maestro_jerarquia", headers=headers, json=hierarchy_data)
    
    if u_res.status_code in [200, 201, 204]:
        print("✅ SUCCESS: Maestro Jerarquía populated.")
    elif u_res.status_code == 404:
        print("❌ ERROR: Table 'maestro_jerarquia' NOT FOUND. Did you run the SQL migration?")
    else:
        print(f"❌ ERROR {u_res.status_code}: {u_res.text}")

if __name__ == "__main__":
    populate()
