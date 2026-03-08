import os
import psycopg2
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

# Use direct connection instead of pooler if possible
password = os.environ.get("PG_PASS", "*7#qyZ5btqW2&br")
password = password.strip('"').strip("'")
project_ref = "xjwadmzuuzctxbrvgopx"
# Direct connection
conn_str = f"postgresql://postgres:{quote_plus(password)}@db.{project_ref}.supabase.co:5432/postgres"

def find_string_in_functions(search_str):
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        
        query = """
        SELECT n.nspname, p.proname, pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE pg_get_functiondef(p.oid) ILIKE %s;
        """
        cur.execute(query, (f'%{search_str}%',))
        results = cur.fetchall()
        
        if results:
            for nsp, name, definition in results:
                print(f"--- {nsp}.{name} ---")
                print(definition)
                print("\n" + "="*50 + "\n")
        else:
            print(f"No functions found containing '{search_str}'.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_string_in_functions("PENDIENTE_MAPEO")
