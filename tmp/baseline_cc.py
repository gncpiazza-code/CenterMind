import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

# Get last 2 snapshots for each dist to compare
# Dist IDs: 3 (tabaco), 4 (aloma), 5 (liver), 2 (real)
dist_ids = [3, 4, 5, 2]
baseline = {}

for d_id in dist_ids:
    res = sb.table("cuentas_corrientes_data")\
        .select("id_distribuidor, tenant_id, fecha, data")\
        .eq("id_distribuidor", d_id)\
        .order("fecha", desc=True)\
        .limit(2)\
        .execute()
    
    if res.data:
        # data[0] is the latest one (e.g. 2026-04-02 or 2026-04-01 before today's run)
        baseline[d_id] = res.data

print(json.dumps(baseline, indent=2, default=str))
