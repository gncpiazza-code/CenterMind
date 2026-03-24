import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load from CenterMind/.env
env_path = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env"
load_dotenv(env_path)

# Credentials
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")
project_ref = "xjwadmzuuzctxbrvgopx"

host = "db.xjwadmzuuzctxbrvgopx.supabase.co"
port = 6543
user = "postgres.xjwadmzuuzctxbrvgopx"

print(f"Connecting to {host} on port {port}...")
try:
    conn = psycopg2.connect(
        dbname="postgres",
        user=user,
        password=password,
        host=host,
        port=port,
        sslmode="require"
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\reporting_rpc_updates.sql"
    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()
        
    print(f"Executing {sql_file}...")
    cur.execute(sql)
    print("✅ SUCCESS: Reporting updates applied successfully!")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error applying SQL: {e}")
