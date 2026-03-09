import requests, os, json
import certifi
from dotenv import load_dotenv
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

load_dotenv(os.path.join(os.getcwd(), 'CenterMind', '.env'))
url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_KEY')

if not url or not key:
    print("Missing URL or KEY")
    exit(1)

api_url = f"{url}/rest/v1/erp_clientes_raw?id_distribuidor=eq.3&limit=1"
headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}'
}
r = requests.get(api_url, headers=headers)
print("--- erp_clientes_raw Dist 3 sample ---")
if r.status_code == 200 and r.json():
    print(json.dumps(r.json()[0], indent=2))
else:
    print(f"Error {r.status_code}: {r.text}")
