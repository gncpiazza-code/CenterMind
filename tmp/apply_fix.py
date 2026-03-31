import os
import psycopg2
from urllib.parse import quote_plus

# Credentials
project_ref = "xjwadmzuuzctxbrvgopx"
password = "*7#qyZ5btqW2&br"
user = f"postgres.{project_ref}"
# Direct Host Connection
host = "db.xjwadmzuuzctxbrvgopx.supabase.co"
port = 5432
conn_str = f"postgresql://{user}:{quote_plus(password)}@{host}:{port}/postgres"

def apply_fix():
    sql_file = "/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/fix_fn_pendientes.sql"
    with open(sql_file, "r") as f:
        sql = f.read()
    
    print(f"Applying fix from {sql_file}...")
    try:
        conn = psycopg2.connect(conn_str)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql)
        print("✅ SUCCESS: fn_pendientes updated!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    apply_fix()
