import os
import json
import requests
import certifi
from datetime import datetime
from dotenv import load_dotenv

# Path configuration
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

# Mappings
MAPPINGS_FILE = os.path.join(os.path.dirname(__file__), "sync_mappings.json")
DATA_FILE = os.path.join(os.path.dirname(__file__), "telegram_parsed_metadata_v3.json")

def parse_date(date_str):
    # Format: 25.02.2026 15:29:09 UTC-03:00
    try:
        # Remove UTC offset for simplicity or handle it
        date_part = date_str.split(" UTC")[0]
        dt = datetime.strptime(date_part, "%d.%m.%Y %H:%M:%S")
        return dt.isoformat() + "Z"
    except Exception:
        return None

def resolve_dist(group_name):
    gn = group_name.lower()
    if "la magica" in gn:
        return 2
    if "real distribucion" in gn:
        return 3
    if "aloma" in gn:
        return 4
    return None

def sync():
    if not os.path.exists(MAPPINGS_FILE) or not os.path.exists(DATA_FILE):
        print("Required files missing.")
        return

    with open(MAPPINGS_FILE, "r", encoding="utf-8") as f:
        mappings = json.load(f)
    
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

    integrantes = mappings['integrantes']
    
    # Cache for client IDs to avoid millions of requests
    client_cache = {}

    success_count = 0
    fail_count = 0
    
    print(f"Starting sync of {len(data)} records...")

    batch = []
    
    for i, record in enumerate(data):
        dist_id = resolve_dist(record.get('group', ''))
        if not dist_id:
            continue
            
        v_name = record.get('vendedor_name', '').lower()
        integrante_id = None
        for intro in integrantes:
            if intro['id_distribuidor'] == dist_id:
                if intro['nombre_integrante'] and v_name in intro['nombre_integrante'].lower():
                    integrante_id = intro['id_integrante']
                    break
        
        if not integrante_id:
            # Try a fuzzy match or default if name is "Vendedor"
            continue

        c_nro = record.get('cliente_nro')
        if not c_nro:
            continue
            
        # Resolve Client ID
        cache_key = f"{dist_id}_{c_nro}"
        if cache_key in client_cache:
            client_id = client_cache[cache_key]
        else:
            # Query DB for client
            r_client = requests.get(f"{url}/rest/v1/clientes?select=id_cliente&id_distribuidor=eq.{dist_id}&numero_cliente_local=eq.{c_nro}", headers=headers)
            if r_client.status_code == 200 and r_client.json():
                client_id = r_client.json()[0]['id_cliente']
                client_cache[cache_key] = client_id
            else:
                client_id = None
                client_cache[cache_key] = None
        
        if not client_id:
            continue

        if not record.get("photo_filename"):
            continue

        # Build payload
        msg_id = record.get("msg_id")
        try:
            msg_id = int(msg_id) if msg_id and str(msg_id).isdigit() else None
        except:
            msg_id = None

        payload = {
            "id_distribuidor": dist_id,
            "id_integrante": integrante_id,
            "id_cliente": client_id,
            "tipo_pdv": record.get("full_text", "").split("Tipo:")[1].split("\n")[1].strip() if "Tipo:" in record.get("full_text", "") else "Comercio",
            "url_foto_drive": record.get("photo_filename"),
            "estado": record.get("estado", "Pendiente"),
            "timestamp_subida": parse_date(record.get("msg_timestamp")),
            "synced_telegram": 1,
            "telegram_msg_id": msg_id
        }
        
        batch.append(payload)
        
        if len(batch) >= 50:
            # Insert batch
            r_post = requests.post(f"{url}/rest/v1/exhibiciones", headers=headers, json=batch)
            if r_post.status_code in [200, 201]:
                success_count += len(batch)
            else:
                print(f"Batch failed: {r_post.text}")
                fail_count += len(batch)
            batch = []
            print(f"Progress: {i+1}/{len(data)} - Success: {success_count} - Failed: {fail_count}")

    # Final batch
    if batch:
        r_post = requests.post(f"{url}/rest/v1/exhibiciones", headers=headers, json=batch)
        if r_post.status_code in [200, 201]:
            success_count += len(batch)
        else:
            fail_count += len(batch)

    print(f"Sync complete. Final success: {success_count}, Final fail: {fail_count}")

if __name__ == "__main__":
    sync()
