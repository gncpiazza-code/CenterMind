import os
import httpx
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"CenterMind/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}

with httpx.Client() as client:
    print("--- Exhibiciones ---")
    r_ex = client.get(f"{url}/rest/v1/exhibiciones?limit=1", headers=headers)
    if r_ex.status_code == 200 and r_ex.json():
        print(f"Columns: {list(r_ex.json()[0].keys())}")
        print(f"Sample: {r_ex.json()[0]}")
    else:
        print(f"Error ex: {r_ex.status_code} - {r_ex.text}")

    print("\n--- Clientes PDV ---")
    r_pdv = client.get(f"{url}/rest/v1/clientes_pdv?limit=1", headers=headers)
    if r_pdv.status_code == 200 and r_pdv.json():
        print(f"Columns: {list(r_pdv.json()[0].keys())}")
        print(f"Sample: {r_pdv.json()[0]}")
    else:
        print(f"Error pdv: {r_pdv.status_code} - {r_pdv.text}")
