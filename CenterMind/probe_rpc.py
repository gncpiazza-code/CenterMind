import os
from supabase import create_client, Client
from dotenv import load_dotenv
import json

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def probe():
    dist_id = 1 # Assuming dist 1 exists
    periodo = "mes"
    
    print(f"Probing fn_dashboard_ranking for dist {dist_id}, periodo {periodo}...")
    try:
        res = sb.rpc("fn_dashboard_ranking", {"p_dist_id": dist_id, "p_periodo": periodo, "p_top": 10}).execute()
        print("Response data:")
        print(json.dumps(res.data, indent=2))
        
        periodo_hist = "2026-03"
        print(f"\nProbing fn_dashboard_ranking for dist {dist_id}, periodo {periodo_hist}...")
        res_hist = sb.rpc("fn_dashboard_ranking", {"p_dist_id": dist_id, "p_periodo": periodo_hist, "p_top": 10}).execute()
        print("Response data (historical):")
        print(json.dumps(res_hist.data, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    probe()
