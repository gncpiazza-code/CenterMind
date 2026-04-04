import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("vendedores_v2").select("*").ilike("nombre_erp", "%Monchi%").execute()
print("Monchi ERP:", res.data)
res = sb.table("vendedores_v2").select("*").ilike("nombre_erp", "%Jorge%").execute()
print("Jorge ERP:", res.data)
res = sb.table("vendedores_v2").select("*").ilike("nombre_erp", "%Coronel%").execute()
print("Coronel ERP:", res.data)
