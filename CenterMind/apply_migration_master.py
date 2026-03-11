import os
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")

# Direct host and South America pooler
hosts = [f"db.{project_ref}.supabase.co", "aws-0-sa-east-1.pooler.supabase.com"]
users = [f"postgres.{project_ref}", "postgres"]
option_sets = [f"-c endpoint={project_ref}", f"endpoint={project_ref}", ""]
ports = [5432, 6543]

conns = []
for h in hosts:
    for u in users:
        for opt in option_sets:
            for p in ports:
                conns.append({
                    "host": h, "port": p, "user": u, "password": password, 
                    "dbname": "postgres", "sslmode": "require", "options": opt,
                    "connect_timeout": 5
                })

sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\sql_history\create_master_hierarchy.sql"
with open(sql_file, "r", encoding="utf-8") as f:
    sql = f.read()

success = False
for params in conns:
    label = f"Host {params['host']}, User {params['user']}, Port {params['port']}, Opt {params['options']}"
    print(f"Trying {label}...")
    try:
        conn = psycopg2.connect(**params)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql)
        print(f"✅ SUCCESS: Migration applied via {label}")
        cur.close()
        conn.close()
        success = True
        break
    except Exception as e:
        msg = str(e).strip()
        if "Tenant or user not found" in msg:
             print(f"  ❌ Tenant/User not found.")
        elif "password authentication failed" in msg:
             print(f"  ❌ Auth failed.")
        else:
             print(f"  ❌ {msg}")

if not success:
    print("FATAL: Could not apply SQL migration to any endpoint.")
    exit(1)
