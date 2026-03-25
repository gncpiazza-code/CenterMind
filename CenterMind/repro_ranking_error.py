import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Path to .env
env_path = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env"
load_dotenv(env_path)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def test_ranking(dist_id, periodo):
    print(f"\n--- Testing fn_dashboard_ranking ---")
    print(f"Params: dist_id={dist_id}, periodo={periodo}")
    try:
        # Try with 3 params
        res = sb.rpc("fn_dashboard_ranking", {
            "p_dist_id": dist_id,
            "p_periodo": periodo,
            "p_top": 5
        }).execute()
        print("✅ Success (3 params)!")
        if res.data:
            print(f"First row keys: {list(res.data[0].keys())}")
            print(f"First row sample: {res.data[0]}")
        else:
            print("No data returned.")
    except Exception as e:
        print(f"❌ Error (3 params): {e}")

    try:
        # Try with 4 params (checking if p_sucursal_id exists)
        res = sb.rpc("fn_dashboard_ranking", {
            "p_dist_id": dist_id,
            "p_periodo": periodo,
            "p_top": 5,
            "p_sucursal_id": None
        }).execute()
        print("✅ Success (4 params)!")
    except Exception as e:
        print(f"❌ Error (4 params): {e}")

if __name__ == "__main__":
    # Test current month
    test_ranking(3, "mes")
    # Test previous month (format used by bot)
    test_ranking(3, "2026-02")
