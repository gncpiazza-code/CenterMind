import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

# Nacho is 454
res = sb.table("exhibiciones").select("id_exhibicion, estado, timestamp_subida, cliente_sombra_codigo, id_cliente_pdv").eq("id_integrante", 454).gte("timestamp_subida", "2026-04-01").lte("timestamp_subida", "2026-04-01T23:59:59").execute()
print(f"Nacho exhibitions: {len(res.data)}")
for e in res.data:
    print(e)

# Check one pdv for the "SIN VENDEDOR" text
if res.data:
    pdv_id = res.data[0].get("id_cliente_pdv")
    if pdv_id:
        pdv = sb.table("clientes_pdv_v2").select("*").eq("id", pdv_id).execute()
        print("PDV Info:", pdv.data)
