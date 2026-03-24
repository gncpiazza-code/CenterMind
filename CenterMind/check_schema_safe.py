import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def run_query():
    project_ref = "xjwadmzuuzctxbrvgopx"
    password = os.environ.get("PG_PASS", "").strip('"')
    
    host = "aws-0-sa-east-1.pooler.supabase.com"
    port = 6543
    user = f"postgres.{project_ref}"
    dbname = "postgres"

    try:
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port,
            sslmode="require"
        )
        cur = conn.cursor()
        
        print("--- Table: integrantes_grupo ---")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'integrantes_grupo';")
        for row in cur.fetchall():
            print(row)
            
        print("\n--- Table: locations ---")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'locations';")
        for row in cur.fetchall():
            print(row)

        print("\n--- Table: ranking_historico_manual ---")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ranking_historico_manual';")
        for row in cur.fetchall():
            print(row)
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_query()
