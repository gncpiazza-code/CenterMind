import os
import psycopg2
from dotenv import load_dotenv

# Reutilizamos la lógica de conexión ya existente en el proyecto
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")
else:
    print("❌ PG_PASS not found")
    exit(1)

# Usando conexión directa
host = f"db.{project_ref}.supabase.co"
port = 5432
user = "postgres"
dbname = "postgres"

sql_file = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\fase1_migracion.sql"

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
    print(f"Executing {sql_file} Phase 1 SQL...")
    cur.execute(sql)
    conn.commit()
    
    # Verify the results
    print("\n✅ SUCCESS: SQL executed. Verifying rows...")
    cur.execute("SELECT id_distribuidor, id_erp, nombre_display FROM distribuidores ORDER BY id_distribuidor;")
    rows = cur.fetchall()
    print("-" * 50)
    print("ID  | ID_ERP | NOMBRE_DISPLAY")
    print("-" * 50)
    for row in rows:
        print(f"{row[0]:<3} | {str(row[1]):<6} | {str(row[2])}")
    print("-" * 50)
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error applying SQL: {e}")
