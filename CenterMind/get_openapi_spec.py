import os
import requests
import json
import certifi
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

def get_spec():
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}'
    }
    r = requests.get(f"{url}/rest/v1/", headers=headers)
    if r.status_code == 200:
        spec = r.json()
        tables = list(spec.get('definitions', {}).keys())
        print("Available tables in definitions:")
        for t in sorted(tables):
            print(f"  - {t}")
        
        with open(os.path.join(os.path.dirname(__file__), "openapi_spec.json"), "w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2)
    else:
        print(f"Error fetching spec: {r.status_code} - {r.text}")

if __name__ == "__main__":
    get_spec()
