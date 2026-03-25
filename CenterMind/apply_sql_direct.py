import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

# Credentials
project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")

# EXACT format from root apply_sql.py
conn_str = f"postgresql://postgres.{project_ref}:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=endpoint%3D{project_ref}"

sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\fix_ranking_final.sql"

print(f"Applying SQL from {sql_file}...")
try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()
        
    cur.execute(sql)
    print("✅ SUCCESS: Migration applied successfully!")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
