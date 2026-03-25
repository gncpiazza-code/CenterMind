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
    
    print(f"Applying SQL from {sql_file} via RPC...")
    try:
        # We use 'exec_sql' which is a common helper RPC in this project
        res = sb.rpc("exec_sql", {"p_sql": sql}).execute() # Check if it's p_sql or sql
        print("✅ SUCCESS: SQL applied via RPC!")
    except Exception as e:
        # Try 'sql' instead of 'p_sql' if it fails
        try:
            res = sb.rpc("exec_sql", {"sql": sql}).execute()
            print("✅ SUCCESS: SQL applied via RPC (with 'sql' param)!")
        except Exception as e2:
            print(f"❌ Error applying SQL via RPC: {e2}")

if __name__ == "__main__":
    apply_sql()
