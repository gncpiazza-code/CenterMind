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

def inspect_vendors():
    print("--- MAESTRO JERARQUIA (IDs) ---")
    res = requests.get(f"{url}/rest/v1/maestro_jerarquia?select=ID_VENDEDOR,Vendedor&limit=10", headers=headers, verify=False)
    print(res.json())

    print("\n--- INTEGRANTES GRUPO (IDs) ---")
    res = requests.get(f"{url}/rest/v1/integrantes_grupo?select=id_vendedor_erp,nombre_integrante&limit=10", headers=headers, verify=False)
    print(res.json())

if __name__ == "__main__":
    inspect_vendors()
