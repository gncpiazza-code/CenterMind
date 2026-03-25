
import psycopg2
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus

load_dotenv()

# EXACT format from apply_sql_direct.py
# Supabase Pooler Regional SA-EAST-1
PROJECT_REF = "xjwadmzuuzctxbrvgopx"
DB_HOST = "aws-0-sa-east-1.pooler.supabase.com"
DB_NAME = "postgres"
DB_USER = f"postgres.{PROJECT_REF}"
DB_PASS = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br").strip('"').strip("'")
DB_PORT = "6543"

# Pooler connection string with encoded endpoint
conn_str = f"postgresql://{DB_USER}:{quote_plus(DB_PASS)}@{DB_HOST}:{DB_PORT}/{DB_NAME}?options=endpoint%3D{PROJECT_REF}"

try:
    print(f"Connecting to Supabase Pooler (Direct URI)...")
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    print("Executing fix_dashboard_rpcs_v3.sql...")
    with open("fix_dashboard_rpcs_v3.sql", "r", encoding="utf-8") as f:
        sql = f.read()
        cur.execute(sql)
    
    conn.commit()
    print("✅ RPCs updated successfully via psycopg2!")
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
