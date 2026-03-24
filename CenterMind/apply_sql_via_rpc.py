import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def apply_sql():
    sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\reporting_rpc_updates.sql"
    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()
    
    print(f"Applying SQL from {sql_file} via RPC...")
    try:
        # We might need to split by statements if exec_sql only handles one, 
        # but usually it handles a block.
        res = sb.rpc("exec_sql", {"sql": sql}).execute()
        print("✅ SUCCESS: SQL applied via RPC!")
        print(res.data)
    except Exception as e:
        print(f"❌ Error applying SQL via RPC: {e}")

if __name__ == "__main__":
    apply_sql()
