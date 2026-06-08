import os
import psycopg2
from urllib.parse import quote_plus

project_ref = "xjwadmzuuzctxbrvgopx"
password = "*7#qyZ5btqW2&br"

# Try different connection parameters based on what worked in migration scripts
conns = [
    # South America Pooler (Port 6543)
    {
        "host": "aws-0-sa-east-1.pooler.supabase.com",
        "port": 6543,
        "user": f"postgres.{project_ref}",
        "password": password,
        "dbname": "postgres",
        "options": f"endpoint={project_ref}"
    },
    # South America Pooler (Port 5432)
    {
        "host": "aws-0-sa-east-1.pooler.supabase.com",
        "port": 5432,
        "user": f"postgres.{project_ref}",
        "password": password,
        "dbname": "postgres",
        "options": f"endpoint={project_ref}"
    },
    # Direct Host (Port 5432)
    {
        "host": f"db.{project_ref}.supabase.co",
        "port": 5432,
        "user": f"postgres.{project_ref}",
        "password": password,
        "dbname": "postgres"
    }
]

def apply_fix():
    sql_file = "/Users/ignaciopiazza/Desktop/CenterMind/CenterMind/fix_fn_pendientes.sql"
    with open(sql_file, "r") as f:
        sql = f.read()

    for params in conns:
        label = f"Host {params['host']}, Port {params['port']}"
        print(f"Trying {label}...")
        try:
            conn = psycopg2.connect(**params, connect_timeout=5)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(sql)
            print(f"✅ SUCCESS: fn_pendientes updated via {label}!")
            cur.close()
            conn.close()
            return
        except Exception as e:
            print(f"  ❌ Failed: {e}")

if __name__ == "__main__":
    apply_fix()
