import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def test_conn():
    project_ref = "xjwadmzuuzctxbrvgopx"
    password = (os.getenv("PG_PASS") or os.getenv("SUPABASE_DB_PASSWORD", "")).strip('"')
    
    # Combinations to test
    configs = [
        {"host": "aws-0-us-east-1.pooler.supabase.com", "port": 6543, "user": f"postgres.{project_ref}"},
        {"host": "aws-0-sa-east-1.pooler.supabase.com", "port": 6543, "user": f"postgres.{project_ref}"},
    ]
    
    for cfg in configs:
        host = cfg["host"]
        port = cfg["port"]
        user = cfg["user"]
        print(f"Testing {host}:{port} with user {user} and RAW password...")
        try:
            conn = psycopg2.connect(
                dbname="postgres",
                user=user,
                password=password, # RAW password
                host=host,
                port=port,
                connect_timeout=10,
                sslmode="require"
            )
            print(f"SUCCESS with {host}:{port} and user {user}!")
            conn.close()
            return
        except Exception as e:
            print(f"FAILED: {e}")

if __name__ == "__main__":
    test_conn()
