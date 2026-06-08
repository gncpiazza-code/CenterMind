import os
import psycopg2
from urllib.parse import quote_plus

# Credentials
project_ref = "xjwadmzuuzctxbrvgopx"
password = "*7#qyZ5btqW2&br"
user = f"postgres.{project_ref}"
host = "aws-0-sa-east-1.pooler.supabase.com"
port = 6543

# Connection string
conn_str = f"postgresql://{user}:{quote_plus(password)}@{host}:{port}/postgres?options=endpoint%3D{project_ref}"

def test_rpc():
    print("Testing fn_pendientes(3)...")
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        
        # Test the function directly
        cur.execute("SELECT * FROM public.fn_pendientes(3) LIMIT 1;")
        row = cur.fetchone()
        if row:
            colnames = [desc[0] for desc in cur.description]
            print(f"✅ Success! Columns: {colnames}")
            print(f"Sample data: {row}")
        else:
            print("✅ Success! No pending data found (empty result).")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Error calling fn_pendientes: {e}")

if __name__ == "__main__":
    test_rpc()
