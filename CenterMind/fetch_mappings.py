import os
import json
import requests
import certifi
from dotenv import load_dotenv

# Load env from the same directory as the script
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

def fetch_mappings():
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}'
    }
    
    print("Fetching distributors...")
    r_dists = requests.get(f"{url}/rest/v1/distribuidores?select=id_distribuidor,nombre_empresa", headers=headers)
    if r_dists.status_code != 200:
        print(f"Error fetching dists: {r_dists.text}")
        return

    print("Fetching integrants...")
    r_ints = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_integrante,nombre_integrante,id_distribuidor,telegram_user_id", headers=headers)
    if r_ints.status_code != 200:
        print(f"Error fetching integrants: {r_ints.text}")
        return
    
    mapping = {
        "distribuidores": r_dists.json(),
        "integrantes": r_ints.json()
    }
    
    with open(os.path.join(os.path.dirname(__file__), "sync_mappings.json"), "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Mapping saved with {len(mapping['distribuidores'])} dists and {len(mapping['integrantes'])} integrants.")

if __name__ == "__main__":
    fetch_mappings()
