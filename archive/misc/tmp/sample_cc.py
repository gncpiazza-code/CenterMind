import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("cuentas_corrientes_data").select("data").eq("tenant_id", "tabaco").order("fecha", desc=True).limit(1).execute()
if res.data:
    # Just show keys to avoid huge output
    data = res.data[0]["data"]
    print("Keys in top level:", data.keys())
    if "metadatos" in data:
        print("Metadatos:", data["metadatos"])
