import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")
else:
    print("❌ PG_PASS not found")
    exit(1)

host = f"db.{project_ref}.supabase.co"
port = 5432
user = "postgres"
dbname = "postgres"

sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\fase4_migracion.sql"

if not os.path.exists(sql_file):
    print(f"Error: {sql_file} not found")
    exit(1)

with open(sql_file, "r", encoding="utf-8") as f:
    sql = f.read()

print(f"Connecting to {host} as {user} on port {port}...")
try:
    conn = psycopg2.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port,
        sslmode="require",
        connect_timeout=10
    )
    cur = conn.cursor()
    print(f"Executing {sql_file} Phase 4 SQL...")
    cur.execute(sql)
    conn.commit()
    
    print("\n✅ SUCCESS: Column id_cliente_pdv added to exhibiciones and historical data migrated.")
    
    cur.execute("SELECT count(*) FROM exhibiciones WHERE id_cliente_pdv IS NOT NULL")
    linked_count = cur.fetchone()[0]
    
    cur.execute("SELECT count(*) FROM exhibiciones")
    total_count = cur.fetchone()[0]
    
    print("-" * 50)
    print(f"Exhibiciones Históricas Enlazadas a ERP Exitosamente: {linked_count} de {total_count} ({(linked_count/total_count*100) if total_count else 0:.1f}%)")
    print("-" * 50)
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error applying SQL: {e}")
