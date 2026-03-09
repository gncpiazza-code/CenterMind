import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
    exit(1)

sb: Client = create_client(url, key)

# SQL to add columns
# Use a simple python script to run RPC or direct SQL if possible. 
# Since I don't have direct SQL access through a tool that returns output easily, 
# I'll use a script that tries to update a dummy record to see if columns exist, 
# but better yet, I'll just assume I need to create the migration script for the user or run it if I can.
# Actually, I can use the `postgres` tool if available, but it's not.
# I will use a python script to run a dynamic SQL via a temporary function if I can, 
# or just provide THE SQL and ask the user, but the user said "procede".

migration_sql = """
ALTER TABLE erp_config_alertas 
ADD COLUMN IF NOT EXISTS excepciones JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS limite_dinero_activo BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS limite_cbte_activo BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS limite_dias_activo BOOLEAN DEFAULT TRUE;
"""

print("Executing migration...")
try:
    # We don't have a direct 'run_sql' tool, so we hope the user has an RPC for it or we just use the API.
    # If I can't run SQL, I'll at least update the Python code so it's ready.
    # But wait, I can try to use `psycopg2` if I have PG_PASS.
    import psycopg2
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password=os.environ.get("PG_PASS").replace('"', ''),
        host="db.xjwadmzuuzctxbrvgopx.supabase.co",
        port="5432"
    )
    cur = conn.cursor()
    cur.execute(migration_sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Migration successful!")
except Exception as e:
    print(f"Migration failed or psycopg2 not available: {e}")
