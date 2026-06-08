import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, id_vendedor_v2").eq("id_distribuidor", 3).execute()
for r in res.data:
    print(r)
