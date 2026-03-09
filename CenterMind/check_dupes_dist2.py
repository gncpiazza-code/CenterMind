import os
import json
from dotenv import load_dotenv
import requests

# Load env from CenterMind/.env
load_dotenv(os.path.join(os.getcwd(), 'CenterMind', '.env'))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_duplicates():
    # Fetch all integrantes for dist 2
    url = f"{SUPABASE_URL}/rest/v1/integrantes_grupo?id_distribuidor=eq.2&select=id_integrante,nombre_integrante,telegram_user_id"
    res = requests.get(url, headers=headers, verify=False)
    if res.status_code != 200:
        print(f"Error fetching: {res.text}")
        return

    data = res.json()
    print(f"Total integrantes for dist 2: {len(data)}")
    
    dupes = {}
    for row in data:
        name = row['nombre_integrante']
        if name not in dupes:
            dupes[name] = []
        dupes[name].append(row['id_integrante'])
        
    found_dupes = {name: ids for name, ids in dupes.items() if len(ids) > 1}
    if found_dupes:
        print("Duplicates found by name with IDs:")
        for name, ids in found_dupes.items():
            print(f"  - {name}: {ids}")
    else:
        print("No duplicates found by name.")

if __name__ == "__main__":
    check_duplicates()
