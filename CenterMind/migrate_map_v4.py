import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Relative path to .env
env_path = Path("CenterMind/.env")

def load_env(path):
    if not path.exists():
        print(f"Error: {path} not found")
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, value = line.strip().split("=", 1)
                os.environ[key] = value.strip('"').strip("'")

load_env(env_path)

def run_migration():
    project_ref = "xjwadmzuuzctxbrvgopx"
    password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
    host = "aws-0-sa-east-1.pooler.supabase.com"
    port = 6543
    user = f"postgres.{project_ref}"

    sql_file = Path("sql_history/update_live_map_v4_date.sql")
    if not sql_file.exists():
        print(f"Error: {sql_file} not found")
        return

    with open(sql_file, "r") as f:
        migration_sql = f.read()

    print(f"Executing migration v4 (Date support) on {host}...")
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user=user,
            password=password,
            host=host,
            port=port,
            sslmode="require",
            connect_timeout=10
        )
        cur = conn.cursor()
        cur.execute(migration_sql)
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Migration successful (v4)!")
    except Exception as e:
        print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    run_migration()
