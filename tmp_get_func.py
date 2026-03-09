import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

# Use common DB connection logic
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")
project_ref = "xjwadmzuuzctxbrvgopx"
conn_str = f"postgresql://postgres.{project_ref}:{quote_plus(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

def get_function_def():
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        
        query = """
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'fn_bot_pendientes_sync';
        """
        cur.execute(query)
        res = cur.fetchone()
        if res:
            print(res[0])
        else:
            print("Function not found.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_function_def()
