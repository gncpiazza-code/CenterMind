import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

def test_conn():
    password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
    password = password.strip('"').strip("'")
    project_ref = "xjwadmzuuzctxbrvgopx"
    
    conn_str = f"postgresql://postgres.{project_ref}:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=endpoint%3D{project_ref}"
    
    print(f"Testing connection with endpoint option...")
    try:
        conn = psycopg2.connect(conn_str)
        print("SUCCESS!")
        conn.close()
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_conn()
