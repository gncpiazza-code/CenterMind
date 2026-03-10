import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def apply_migration():
    project_ref = "xjwadmzuuzctxbrvgopx"
    password = (os.getenv("PG_PASS") or os.getenv("SUPABASE_DB_PASSWORD", "")).strip('"')
    host = "aws-0-sa-east-1.pooler.supabase.com" # Probado como funcionando anteriormente
    port = 6543
    user = f"postgres.{project_ref}"

    sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\sql_history\supabase_erp_push_v2_metadata.sql"
    
    if not os.path.exists(sql_file):
        print(f"File not found: {sql_file}")
        return

    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    print(f"Applying migration from {sql_file} to {host}...")
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
        cur.execute(sql)
        print("MIGRATION APPLIED SUCCESSFULLY!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"MIGRATION FAILED: {e}")

if __name__ == "__main__":
    apply_migration()
