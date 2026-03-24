import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def probe_exec_sql():
    print("Probing if 'exec_sql' RPC exists...")
    try:
        # Try a simple query
        res = sb.rpc("exec_sql", {"sql": "SELECT 1"}).execute()
        print("Success! 'exec_sql' exists.")
        print(res.data)
    except Exception as e:
        print(f"Error or Not Found: {e}")

if __name__ == "__main__":
    probe_exec_sql()
