import pandas as pd
import requests
import os
from dotenv import load_dotenv

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

# Mapping file name to ID_DIST
FILE_MAPPING = {
    "ALOMA-SRL.xlsx": 4,
    "LAMAGICA.xlsx": 2,
    "LIVER-SRL.xlsx": 5,
    "REAL DISTRIBUCION-T&H.xlsx": 3
}

PDV_DIR = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV"

def ingest():
    print("--- Starting Hierarchy File Ingestion (Corrected) ---")
    
    # 0. Cleanup existing data
    print("Cleaning up existing 'maestro_jerarquia' data...")
    try:
        # Standard 'delete all' hack for Supabase: filter on something always true
        del_res = requests.delete(f"{url}/rest/v1/maestro_jerarquia?id_maestro=gt.0", headers=headers)
        if del_res.status_code in [200, 204]:
            print("  Cleanup OK.")
        else:
            print(f"  Cleanup Warning: {del_res.status_code} {del_res.text}")
    except Exception as e:
        print(f"  Cleanup error: {e}")

    # 1. Fetch integrantes for mapping enrichment
    print("Fetching integrantes for mapping enrichment...")
    i_res = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_distribuidor,id_vendedor_erp,nombre_integrante,telegram_group_id", headers=headers)
    integrantes = i_res.json() if i_res.status_code == 200 else []
    
    integ_map = {}
    for i in integrantes:
        d_id = i["id_distribuidor"]
        if i["id_vendedor_erp"]:
            integ_map[(d_id, str(i["id_vendedor_erp"]).upper())] = i
        if i["nombre_integrante"]:
            integ_map[(d_id, str(i["nombre_integrante"]).upper())] = i

    all_data = []

    for file_name, dist_id in FILE_MAPPING.items():
        file_path = os.path.join(PDV_DIR, file_name)
        if not os.path.exists(file_path):
            print(f"Skipping {file_name} (not found)")
            continue
            
        print(f"Processing {file_name} (Dist {dist_id})...")
        try:
            # Load all columns
            df = pd.read_excel(file_path)
            
            # Map columns by name (flexible casing)
            col_map = {
                "dsempresa": next((c for c in df.columns if c.lower() == "dsempresa"), "dsempresa"),
                "idsucur": next((c for c in df.columns if c.lower() == "idsucur"), "idsucur"),
                "dssucur": next((c for c in df.columns if c.lower() == "dssucur"), "dssucur"),
                "vendedor": next((c for c in df.columns if c.lower() == "vendedor"), "vendedor"),
                "d_vendedor": next((c for c in df.columns if c.lower() == "d_vendedor"), "d_vendedor"),
            }
            
            # Dedup by Sucursal and VENDEDOR (the individual one)
            before = len(df)
            df = df.drop_duplicates(subset=[col_map["idsucur"], col_map["vendedor"]])
            after = len(df)
            print(f"  Found {before} total rows, {after} unique hierarchy pairs (Sucursal-Vendedor).")
            
            for _, row in df.iterrows():
                seller_id_val = row[col_map["vendedor"]]
                
                # Format Seller ID (handle floats from Excel)
                if pd.isna(seller_id_val): 
                    seller_id_str = "NAN"
                elif isinstance(seller_id_val, float):
                    seller_id_str = str(int(seller_id_val))
                else:
                    seller_id_str = str(seller_id_val).strip()
                
                seller_name_str = str(row[col_map["d_vendedor"]]).strip()
                
                # Attempt to find Group ID
                group_id = None
                match = integ_map.get((dist_id, seller_id_str.upper()))
                if not match:
                    match = integ_map.get((dist_id, seller_name_str.upper()))
                
                if match:
                    group_id = match.get("telegram_group_id")

                all_data.append({
                    "EMPRESA": str(row[col_map["dsempresa"]]),
                    "ID_DIST": dist_id,
                    "id suc": str(row[col_map["idsucur"]]),
                    "SUCURSAL": str(row[col_map["dssucur"]]),
                    "ID_VENDEDOR": seller_id_str,
                    "Vendedor": seller_name_str,
                    "Group id": group_id
                })
        except Exception as e:
            print(f"Error processing {file_name}: {e}")

    print(f"Total entries for upload: {len(all_data)}")
    
    if not all_data:
        print("No data to upload.")
        return

    # Upload in batches
    batch_size = 500
    for i in range(0, len(all_data), batch_size):
        batch = all_data[i:i+batch_size]
        print(f"Uploading batch {i//batch_size + 1}...")
        res = requests.post(f"{url}/rest/v1/maestro_jerarquia", headers=headers, json=batch)
        if res.status_code not in [200, 201, 204]:
            print(f"Error in batch: {res.status_code}: {res.text}")
        else:
            print("  Batch OK.")

if __name__ == "__main__":
    ingest()
