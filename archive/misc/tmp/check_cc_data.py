import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("cuentas_corrientes_data").select("tenant_id, fecha, id_distribuidor").order("fecha", desc=True).limit(10).execute()
for r in res.data:
    print(r)
