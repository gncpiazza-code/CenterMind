import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

# We construct the connection string using the known Supabase project ref
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
# The password might be in quotes in .env, so we strip them
password = password.strip('"').strip("'")

# url is https://xjwadmzuuzctxbrvgopx.supabase.co
# project ref is xjwadmzuuzctxbrvgopx
project_ref = "xjwadmzuuzctxbrvgopx"

# We use the pooler connection string for Supabase
conn_str = f"postgresql://postgres.{project_ref}:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=endpoint%3D{project_ref}"

print("Connecting to Supabase PostgreSQL...")
try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    with open(r"sql_history/fix_rpc_optional_mapping.sql", "r", encoding="utf-8") as f:
        sql = f.read()
        
    print("Executing SQL script...")
    cur.execute(sql)
    print("Success: SQL script applied.")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
