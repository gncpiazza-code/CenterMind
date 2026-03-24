
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Missing SUPABASE_URL or SUPABASE_KEY")
    exit(1)

sb: Client = create_client(url, key)

# Try to find a dist_id with many clients
try:
    res = sb.table("erp_clientes_raw").select("id_distribuidor", count="exact").execute()
    # Group by manually if needed, or just pick one
    counts = sb.rpc("fn_reporte_clientes_stats", {"p_dist_id": 3}).execute()
    print(f"Stats for dist 3: {counts.data}")
    
    # Test maestro RPC
    maestro = sb.rpc("fn_reporte_clientes_maestro", {
        "p_dist_id": 3,
        "p_search": "",
        "p_sucursal_id": "",
        "p_vendedor_id": "",
        "p_limit": 10
    }).execute()
    print(f"Maestro for dist 3 (first 10): {maestro.data}")
    
    if maestro.data:
        coords = [c for c in maestro.data if c.get('lat') and c.get('lon')]
        print(f"Clients with coordinates in first 10: {len(coords)}")
        print(f"Sample client: {maestro.data[0]}")
    else:
        print("No data returned for dist 3")

except Exception as e:
    print(f"Error: {e}")
