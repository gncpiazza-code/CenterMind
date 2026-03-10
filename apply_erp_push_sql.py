import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(dotenv_path="CenterMind/.env")

password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")
project_ref = "xjwadmzuuzctxbrvgopx"

conn_str = f"postgresql://postgres.{project_ref}:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=endpoint%3D{project_ref}"

print("Connecting to Supabase PostgreSQL...")
try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    sql_path = r"CenterMind/sql_history/supabase_erp_push_v1.sql"
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
        
    print(f"Executing SQL script from {sql_path}...")
    cur.execute(sql)
    print("Success: SQL script applied.")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
