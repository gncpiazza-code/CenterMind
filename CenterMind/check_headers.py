import os
import requests
import certifi
from dotenv import load_dotenv

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

load_dotenv("CenterMind/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found")
    exit(1)

api_url = f"{url}/rest/v1/distribuidores?select=count&limit=1"
headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}'
}

print(f"Checking {api_url}...")
try:
    r = requests.get(api_url, headers=headers)
    print("Status:", r.status_code)
    for k, v in r.headers.items():
        print(f"  {k}: {v}")
except Exception as e:
    print("Error:", e)
