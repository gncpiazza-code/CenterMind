import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def debug_integrantes():
    dist_id = 3
    print(f"Checking Dist: {dist_id}")
    
    # Check all integrantes for Dist 3
    res = sb.table("integrantes_grupo").select("nombre_integrante, telegram_user_id, id_vendedor_erp")\
        .eq("id_distribuidor", dist_id).execute()
    
    data = res.data or []
    print(f"Found {len(data)} integrantes.")
    
    # Search for top vendors from audit
    uids = [5466310928, 8415774841, 7747709461, 6823099488, 7626448715]
    print("\nTarget UID Mapping:")
    for uid in uids:
        matches = [r for r in data if r["telegram_user_id"] == uid]
        if matches:
            for m in matches:
                print(f"UID {uid} -> Name: {m['nombre_integrante']}, ERP Var: {m['id_vendedor_erp']}")
        else:
            print(f"UID {uid} -> NOT FOUND IN INTEGRANTES")

if __name__ == "__main__":
    debug_integrantes()
