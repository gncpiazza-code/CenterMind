import os
import requests
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
}

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def inspect_data():
    print("--- LOCATIONS ---")
    res = requests.get(f"{url}/rest/v1/locations?select=location_id,label&limit=5", headers=headers, verify=False)
    print(res.json())

    print("\n--- MAESTRO JERARQUIA ---")
    res = requests.get(f"{url}/rest/v1/maestro_jerarquia?select=SUCURSAL,\"id suc\"&limit=5", headers=headers, verify=False)
    print(res.json())

    print("\n--- INTEGRANTES GRUPO ---")
    res = requests.get(f"{url}/rest/v1/integrantes_grupo?select=location_id&limit=5", headers=headers, verify=False)
    print(res.json())

if __name__ == "__main__":
    inspect_data()
