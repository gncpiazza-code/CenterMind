import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, telegram_user_id").ilike("nombre_integrante", "%Nacho%").execute()
for r in res.data:
    print(r)
