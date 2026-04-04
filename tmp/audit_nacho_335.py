import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

# Nacho 335
res = sb.table("exhibiciones").select("id_exhibicion, estado, timestamp_subida").eq("id_integrante", 335).gte("timestamp_subida", "2026-04-01").lte("timestamp_subida", "2026-04-01T23:59:59").execute()
print(f"Nacho 335 exhibitions: {len(res.data)}")
