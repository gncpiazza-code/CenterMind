import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def apply_sql_fix():
    # Credentials from .env
    project_ref = "xjwadmzuuzctxbrvgopx"
    password = os.environ.get("PG_PASS")
    if password:
        password = password.strip('"').strip("'")
    
    host = "aws-0-sa-east-1.pooler.supabase.com"
    port = 6543
    user = f"postgres.{project_ref}"
    dbname = "postgres"

    sql_file = "sql_history/fix_live_map_timezone.sql"
    
    if not os.path.exists(sql_file):
        print(f"Error: {sql_file} not found")
        return

    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()

    print(f"Connecting to {host}...")
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
        print("Executing SQL fix...")
        cur.execute(sql)
        conn.commit()
        cur.close()
        conn.close()
        print("✅ SQL fix applied successfully!")
    except Exception as e:
        print(f"❌ Error applying SQL: {e}")

if __name__ == "__main__":
    apply_sql_fix()
