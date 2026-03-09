import os
import json
from dotenv import load_dotenv
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv(os.path.join(os.getcwd(), 'CenterMind', '.env'))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def exhaustive_check():
    names = ["Fabricio", "Rodrigo", "Nacho", "Mariano"]
    for name in names:
        url = f"{SUPABASE_URL}/rest/v1/integrantes_grupo?id_distribuidor=eq.2&nombre_integrante=ilike.*{name}*&select=id_integrante,nombre_integrante"
        res = requests.get(url, headers=headers, verify=False)
        if res.status_code == 200:
            data = res.json()
            print(f"IDs for '{name}':")
            for row in data:
                iid = row['id_integrante']
                n = row['nombre_integrante']
                
                # Check exhibitions in MARCH 2026
                url_c = f"{SUPABASE_URL}/rest/v1/exhibiciones?id_integrante=eq.{iid}&timestamp_subida=gte.2026-03-01&timestamp_subida=lt.2026-04-01&select=count"
                res_c = requests.get(url_c, headers=headers, verify=False)
                count = res_c.json()[0]['count'] if res_c.status_code == 200 else 0
                
                print(f"  - {n} (ID {iid}): {count} records in March 2026")
        else:
            print(f"Error for {name}: {res.text}")

if __name__ == "__main__":
    exhaustive_check()
