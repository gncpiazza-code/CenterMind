import os
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
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def cleanup():
    print("🚀 Starting cleanup for Distributor 2...")
    
    # 1. Merge Fabricio: 79 -> 344
    print("Merging Fabricio (79 -> 344)...")
    url_f = f"{SUPABASE_URL}/rest/v1/exhibiciones?id_integrante=eq.79"
    res_f = requests.patch(url_f, headers=headers, json={"id_integrante": 344}, verify=False)
    print(f"  - Patch status: {res_f.status_code}")

    # 2. Merge Rodrigo: 150 -> 351
    print("Merging Rodrigo (150 -> 351)...")
    url_r = f"{SUPABASE_URL}/rest/v1/exhibiciones?id_integrante=eq.150"
    res_r = requests.patch(url_r, headers=headers, json={"id_integrante": 351}, verify=False)
    print(f"  - Patch status: {res_r.status_code}")

    # 3. Delete duplicates
    ids_to_delete = [79, 150, 62, 65, 73, 91, 178]
    print(f"Deleting duplicate IDs: {ids_to_delete}...")
    
    # Supabase REST delete doesn't support 'in' easily via query params in some versions, 
    # but we can do it one by one or via filter
    for iid in ids_to_delete:
        url_d = f"{SUPABASE_URL}/rest/v1/integrantes_grupo?id_integrante=eq.{iid}"
        res_d = requests.delete(url_d, headers=headers, verify=False)
        print(f"  - Delete ID {iid} status: {res_d.status_code}")

    print("✅ Cleanup finished.")

if __name__ == "__main__":
    cleanup()
