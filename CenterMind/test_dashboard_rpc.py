import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def test_rpc():
    dist_id = 3
    periodo = "mes"
    print(f"Testing fn_dashboard_por_ciudad for dist_id={dist_id}, periodo={periodo}...")
    try:
        res = sb.rpc("fn_dashboard_por_ciudad", {"p_dist_id": dist_id, "p_periodo": periodo}).execute()
        print("Success!")
        print(res.data)
    except Exception as e:
        print(f"❌ Error during RPC execution: {e}")

if __name__ == "__main__":
    test_rpc()
