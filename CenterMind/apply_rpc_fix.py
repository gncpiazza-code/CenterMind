import os
import psycopg2
from urllib.parse import quote_plus
from pathlib import Path

# Relative path to .env
env_path = Path(__file__).resolve().parent / ".env"

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

# South America pooler
host = "aws-0-sa-east-1.pooler.supabase.com"

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

sql_applied = False
for label, params in conns:
    print(f"Trying {label}...")
    try:
        conn = psycopg2.connect(**params)
        conn.autocommit = True
        cur = conn.cursor()
        
        sql_file = Path(__file__).resolve().parent / "fix_bot_rpc_schema.sql"
        with open(sql_file, "r", encoding="utf-8") as f:
            sql = f.read()
            
        cur.execute(sql)
        print(f"✅ Success via {label}")
        cur.close()
        conn.close()
        sql_applied = True
        break
    except Exception as e:
        msg = str(e).strip()
        if "Tenant or user not found" in msg:
             print(f"❌ {label}: Tenant not found.")
        elif "password authentication failed" in msg:
             print(f"❌ {label}: Auth failed.")
        else:
             print(f"❌ {label}: {msg}")

if not sql_applied:
    print("FATAL: Could not apply SQL fix to any endpoint.")

if not sql_applied:
    print("FATAL: Could not apply SQL fix to any endpoint.")

if not sql_applied:
    print("FATAL: Could not apply SQL fix to any endpoint.")
