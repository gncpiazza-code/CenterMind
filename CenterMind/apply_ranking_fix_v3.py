import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def apply_sql():
    sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\fix_ranking_final.sql"
    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()
    
    print(f"Applying SQL from {sql_file} via RPC (unnamed parameter)...")
    try:
        # Try passing the string directly (unnamed parameter)
        res = sb.rpc("exec_sql", {"sql": sql}).execute() 
        print("✅ SUCCESS!")
    except Exception as e:
        print(f"❌ Failed with named param: {e}")
        try:
             # Try variant without dictionary if the library allows it or similar
             # Actually, postgrest RPCs usually take a JSON object.
             # Let's try 'p_sql' again but very carefully
             res = sb.rpc("exec_sql", {"p_sql": sql}).execute()
             print("✅ SUCCESS with p_sql!")
        except Exception as e2:
             print(f"❌ Failed with p_sql: {e2}")

if __name__ == "__main__":
    apply_sql()
