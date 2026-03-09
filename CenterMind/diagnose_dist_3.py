import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def diagnose_dist_3():
    print("🔍 Diagnosing Dist ID 3 (Real Distribucion)...")
    
    # Check total counts by state
    res = supabase.table("exhibiciones").select("*").limit(1).execute()
    if res.data:
        print(f"📋 Columns in 'exhibiciones': {list(res.data[0].keys())}")
    
    res = supabase.table("exhibiciones").select("estado").eq("id_distribuidor", 3).execute()
    data = res.data
    
    counts = {}
    for r in data:
        s = r['estado']
        counts[s] = counts.get(s, 0) + 1
        
    print(f"📊 Counts by state for Dist ID 3:")
    for s, c in counts.items():
        print(f"  - {s}: {c}")

    # Check for pending items specifically
    pending_res = supabase.table("exhibiciones").select("*").eq("id_distribuidor", 3).eq("estado", "Pendiente").execute()
    print(f"❓ Found {len(pending_res.data)} rows with state 'Pendiente' for Dist ID 3.")

    # Check for VALIDACION items
    val_res = supabase.table("exhibiciones").select("*").eq("id_distribuidor", 3).eq("estado", "VALIDACION").execute()
    print(f"⚠️ Found {len(val_res.data)} rows with state 'VALIDACION' for Dist ID 3.")
    
    if len(pending_res.data) > 0:
        print("💡 Samples of pending rows:")
        for r in pending_res.data[:2]:
            print(f"    - ID: {r['id_exhibicion']}, Vendor ID: {r.get('id_integrante')}, Client ID: {r.get('id_cliente')}")

if __name__ == "__main__":
    diagnose_dist_3()
