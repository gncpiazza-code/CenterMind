
import psycopg2
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus

load_dotenv()

PROJECT_REF = "xjwadmzuuzctxbrvgopx"
DB_PASS = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br").strip('"').strip("'")
conn_str = f"postgresql://postgres.{PROJECT_REF}:{quote_plus(DB_PASS)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=endpoint%3D{PROJECT_REF}"

try:
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT proname, prosrc FROM pg_proc JOIN pg_namespace n ON n.oid = pg_proc.pronamespace WHERE n.nspname = 'public' AND proname = 'fn_dashboard_ranking'")
    res = cur.fetchone()
    if res:
        print(f"--- SOURCE FOR {res[0]} ---")
        print(res[1])
    else:
        print("Function not found!")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
