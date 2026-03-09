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

def check_usage():
    # Final check of all dist 2 names to be sure
    url = f"{SUPABASE_URL}/rest/v1/integrantes_grupo?id_distribuidor=eq.2&select=id_integrante,nombre_integrante"
    res = requests.get(url, headers=headers, verify=False)
    all_data = res.json()
    
    usage = {}
    for row in all_data:
        iid = row['id_integrante']
        name = row['nombre_integrante']
        
        url_c = f"{SUPABASE_URL}/rest/v1/exhibiciones?id_integrante=eq.{iid}&select=count"
        res_c = requests.get(url_c, headers=headers, verify=False)
        count = res_c.json()[0]['count'] if res_c.status_code == 200 else 0
        
        usage[iid] = {"name": name, "count": count}
            
    print("Full usage report for Dist 2:")
    for iid, info in usage.items():
        print(f"  - {info['name']} (ID {iid}): {info['count']} records")

if __name__ == "__main__":
    check_usage()
