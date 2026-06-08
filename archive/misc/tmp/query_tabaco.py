import json
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

res = sb.rpc("fn_exhibiciones_filtradas_v2", {
    "p_dist_id": 3,
    "p_fecha_desde": "2026-04-01T00:00:00",
    "p_fecha_hasta": "2026-04-01T23:59:59",
}).execute()

for r in (res.data or []):
    if r.get("id_integrante") == 454:  # Nacho
        print("Nacho's exhibicion:", r.get("vendedor"), r.get("id_exhibicion"))

