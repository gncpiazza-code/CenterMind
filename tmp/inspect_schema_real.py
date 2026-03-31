import os
import psycopg2
from urllib.parse import quote_plus

project_ref = "xjwadmzuuzctxbrvgopx"
password = "*7#qyZ5btqW2&br"
user = f"postgres.{project_ref}"
host = "aws-0-sa-east-1.pooler.supabase.com"
port = 6543 # Transaction pooler

conn_str = f"postgresql://{user}:{quote_plus(password)}@{host}:{port}/postgres?options=endpoint%3D{project_ref}"

def inspect():
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        
        print("--- Exhibiciones Columns ---")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'exhibiciones';")
        for row in cur.fetchall():
            print(f"  {row[0]} ({row[1]})")
            
        print("\n--- Clientes PDV Columns ---")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clientes_pdv';")
        for row in cur.fetchall():
            print(f"  {row[0]} ({row[1]})")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()
