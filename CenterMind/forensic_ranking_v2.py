import os
import json
import requests
import certifi
from datetime import datetime
from dotenv import load_dotenv

# SSL Patch
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

load_dotenv(os.path.join(os.getcwd(), 'CenterMind', '.env'))

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_KEY")

headers = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def fetch_all(table, select="*"):
    all_data = []
    page_size = 1000
    offset = 0
    while True:
        headers_page = headers.copy()
        headers_page['Range'] = f"{offset}-{offset + page_size - 1}"
        r = requests.get(f"{URL}/rest/v1/{table}?select={select}", headers=headers_page)
        if r.status_code != 200:
            break
        data = r.json()
        if not data:
            break
        all_data.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return all_data

def sync():
    # 1. Load Data
    data_path = os.path.join(os.getcwd(), 'CenterMind', 'restoration_ready_data.json')
    if not os.path.exists(data_path):
        print(f"File not found: {data_path}")
        return
        
    with open(data_path, 'r', encoding='utf-8') as f:
        records = json.load(f)

    print(f"Starting sync of {len(records)} records from restoration_ready_data.json...")

    # 2. Fetch Mappings
    print("Fetching mappings...")
    integrantes = fetch_all("integrantes_grupo")
    clientes = fetch_all("clientes", select="id_cliente,numero_cliente_local,id_distribuidor,id_vendedor")
    erp_raw = fetch_all("erp_clientes_raw", select="id_distribuidor,id_cliente_erp_local,vendedor_erp")
    
    # 3. Build Helper Mappings
    # (id_distribuidor, numero_cliente_local) -> client_id, id_vendedor
    client_map = {}
    for c in clientes:
        client_map[(c['id_distribuidor'], str(c['numero_cliente_local']))] = (c['id_cliente'], c['id_vendedor'])
    
    # erp_map: (dist_id, nro_cliente) -> vendedor_name
    erp_map = {}
    for e in erp_raw:
        erp_map[(e['id_distribuidor'], str(e['id_cliente_erp_local']))] = e['vendedor_erp']

    # (id_distribuidor, identifier) -> id_integrante
    seller_map = {}
    for i in integrantes:
        dist_id = i['id_distribuidor']
        # Try multiple fields for matching
        if i.get('id_vendedor_erp'):
            seller_map[(dist_id, str(i['id_vendedor_erp']).upper())] = i['id_integrante']
        if i.get('codigo_vendedor_erp'):
            seller_map[(dist_id, str(i['codigo_vendedor_erp']).upper())] = i['id_integrante']
        if i.get('nombre_integrante'):
            seller_map[(dist_id, str(i['nombre_integrante']).upper())] = i['id_integrante']

    print(f"Client map size: {len(client_map)}")
    print(f"Seller map size: {len(seller_map)}")
    
    # 4. Filter and Batch
    success = 0
    fail = 0
    batch = []
    
    skipped_client = 0
    skipped_integrante = 0
    
    for r in records:
        dist_id = r['id_distribuidor']
        nro_cliente = str(r['nro_cliente']) # Ensure string
        
        # Resolve client and vendor
        c_info = client_map.get((dist_id, nro_cliente))
        if not c_info:
            skipped_client += 1
            continue
            
        client_id, seller_code = c_info
        
        # Resolve integrante
        integrante_id = r.get('id_vendedor') # Try record first
        
        if not integrante_id:
            # Try via seller_code from clientes
            if seller_code:
                integrante_id = seller_map.get((dist_id, str(seller_code).upper()))
            
            # Try via erp_map (client -> vendor name)
            if not integrante_id:
                vendor_name = erp_map.get((dist_id, nro_cliente))
                if vendor_name:
                    integrante_id = seller_map.get((dist_id, str(vendor_name).upper()))
            
        if not integrante_id:
            skipped_integrante += 1
            continue
            
        # Build payload
        payload = {
            "id_distribuidor": dist_id,
            "id_integrante": integrante_id,
            "id_cliente": client_id,
            "tipo_pdv": r.get('tipo_pdv', 'Comercio con Ingreso'),
            "url_foto_drive": r['url'],
            "estado": r.get('estado', 'Aprobado'),
            "timestamp_subida": r['timestamp'],
            "synced_telegram": 1
        }
        
        batch.append(payload)
        
        if len(batch) >= 50:
            res = requests.post(f"{URL}/rest/v1/exhibiciones", headers=headers, json=batch)
            if res.status_code in [201, 200]:
                success += len(batch)
            else:
                print(f"Batch failed: {res.text}")
                fail += len(batch)
            batch = []
            print(f"Progress: {success} success, {fail} fail")

    if batch:
        res = requests.post(f"{URL}/rest/v1/exhibiciones", headers=headers, json=batch)
        if res.status_code in [201, 200]:
            success += len(batch)
        else:
            print(f"Final batch failed: {res.text}")
            fail += len(batch)

    print(f"Skipped because client not found: {skipped_client}")
    print(f"Skipped because integrante not found: {skipped_integrante}")
    print(f"Sync complete. Final success: {success}, Final fail: {fail}")

if __name__ == "__main__":
    sync()
