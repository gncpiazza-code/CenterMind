import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def count_data():
    dist_id = 1
    periodo = "2026-03"
    print(f"Checking data for dist {dist_id} in {periodo}...")
    try:
        # Check exhibiciones
        res = sb.table("exhibiciones").select("id_exhibicion", count="exact").eq("id_distribuidor", dist_id).gte("timestamp_subida", "2026-03-01").lt("timestamp_subida", "2026-04-01").execute()
        print(f"Count of exhibiciones: {res.count}")
        
        # Check ranking_historico_manual
        res_h = sb.table("ranking_historico_manual").select("*", count="exact").eq("id_distribuidor", dist_id).eq("anio", 2026).eq("mes", 3).execute()
        print(f"Count of ranking_historico_manual: {res_h.count}")
        
        # List first 5 exhibiciones if any
        if res.count > 0:
            res_list = sb.table("exhibiciones").select("id_exhibicion, timestamp_subida, estado").eq("id_distribuidor", dist_id).gte("timestamp_subida", "2026-03-01").limit(5).execute()
            print("Recent exhibiciones:")
            for r in res_list.data:
                print(r)
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    count_data()
