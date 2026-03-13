import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

# Credentials
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")
project_ref = "xjwadmzuuzctxbrvgopx"

# Pooler connection string variant
conn_str = f"postgresql://postgres:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?options=endpoint%3D{project_ref}"

print("Connecting to Supabase PostgreSQL via Pooler...")
try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\sql_history\supabase_rpc_functions.sql"
    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()
        
    print(f"Executing {sql_file}...")
    cur.execute(sql)
    print("✅ SUCCESS: RPC functions updated.")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
