import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("vendedores_v2").select("id_vendedor, nombre_erp").eq("id_distribuidor", 3).execute()
for v in res.data:
    print(v)
