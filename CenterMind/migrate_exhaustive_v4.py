import os
import psycopg2
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

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
host = "aws-0-sa-east-1.pooler.supabase.com"

sql_file = Path("sql_history/update_live_map_v4_date.sql")
with open(sql_file, "r") as f:
    sql = f.read()

# Combinations to try
users = [f"postgres.{project_ref}", "postgres"]
option_sets = [f"-c endpoint={project_ref}", f"endpoint={project_ref}", ""]
ports = [6543, 5432]

conns = []
for u in users:
    for opt in option_sets:
        for p in ports:
            conns.append((f"User {u}, Port {p}, Opt {opt}", {
                "host": host, "port": p, "user": u, "password": password, 
                "dbname": "postgres", "sslmode": "require", "options": opt,
                "connect_timeout": 5
            }))

applied = False
for label, params in conns:
    print(f"Trying {label}...")
    try:
        conn = psycopg2.connect(**params)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql)
        print(f"✅ Success via {label}")
        cur.close()
        conn.close()
        applied = True
        break
    except Exception as e:
        print(f"❌ {label}: {str(e).strip()}")

if not applied:
    print("FATAL: Could not apply SQL fix to any endpoint.")
