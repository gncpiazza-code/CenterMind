import os
import requests
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")

import certifi
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

load_dotenv(env_path)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

def check_table(table_name):
    api_url = f"{url}/rest/v1/{table_name}?select=*"
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Range': '0-0'
    }
    r = requests.get(api_url, headers=headers)
    print(f"Checking '{table_name}': {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text}")
    else:
        data = r.json()
        if data:
            print(f"  Columns: {list(data[0].keys())}")
        else:
            print(f"  Empty table.")

if __name__ == "__main__":
    if not url or not key:
        print("Missing URL or KEY")
        exit(1)
        
    tables = ['exhibiciones', 'clientes', 'distribuidores', 'integrantes_grupo']
    for t in tables:
        check_table(t)
