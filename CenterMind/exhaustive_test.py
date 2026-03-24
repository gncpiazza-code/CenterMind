import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS", "").strip('"').strip("'")

tests = [
    {"host": "aws-0-sa-east-1.pooler.supabase.com", "port": 6543, "user": f"postgres.{project_ref}"},
    {"host": "aws-0-sa-east-1.pooler.supabase.com", "port": 5432, "user": f"postgres.{project_ref}"},
    {"host": "db.xjwadmzuuzctxbrvgopx.supabase.co", "port": 5432, "user": "postgres"},
    {"host": "xjwadmzuuzctxbrvgopx.supabase.co", "port": 5432, "user": "postgres"},
    {"host": "aws-0-sa-east-1.pooler.supabase.com", "port": 6543, "user": "postgres", "options": f"-c endpoint={project_ref}"},
]

for t in tests:
    print(f"Testing {t['host']}:{t['port']} as {t['user']}...")
    try:
        params = {
            "dbname": "postgres",
            "user": t['user'],
            "password": password,
            "host": t['host'],
            "port": t['port'],
            "sslmode": "require",
            "connect_timeout": 5
        }
        if 'options' in t:
            params['options'] = t['options']
            
        conn = psycopg2.connect(**params)
        print("✅ SUCCESS!")
        conn.close()
        break
    except Exception as e:
        print(f"  ❌ {e}")

if __name__ == "__main__":
    pass
