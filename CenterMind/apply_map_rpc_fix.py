import os
import psycopg2
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

# Credentials
project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")
else:
    print("❌ PG_PASS not found")
    exit(1)

host = "aws-0-sa-east-1.pooler.supabase.com"
port = 6543
user = f"postgres.{project_ref}"
dbname = "postgres"

sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\hierarchical_reports_rpcs.sql"

if not os.path.exists(sql_file):
    print(f"Error: {sql_file} not found")
    exit(1)

with open(sql_file, "r", encoding="utf-8") as f:
    sql = f.read()

print(f"Connecting to {host} as {user}...")
try:
    conn = psycopg2.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port,
        sslmode="require"
    )
    cur = conn.cursor()
    print(f"Executing {sql_file}...")
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ SUCCESS: Map RPC functions updated.")
except Exception as e:
    print(f"❌ Error applying SQL: {e}")
