import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")
password = os.getenv("PG_PASS")
# Usamos conexión directa al host de la DB (puerto 5432)
conn_str = f"postgresql://postgres:{password}@db.xjwadmzuuzctxbrvgopx.supabase.co:5432/postgres"

print("Connecting to DB...")
with psycopg2.connect(conn_str) as conn:
    with conn.cursor() as cur:
        # Tables with identities
        tables = [
            ("distribuidores", "id_distribuidor"),
            ("locations", "location_id"),
            ("clientes", "id_cliente"),
            ("integrantes_grupo", "id_integrante"),
            ("exhibiciones", "id_exhibicion"),
            ("usuarios_portal", "id_usuario"),
            ("bonos_config", "id_config"),
            ("bonos_ranking", "id_ranking"),
            ("events", "event_id"),
            ("sesiones_bot", "id")
        ]
        
        for table, pk in tables:
            try:
                cur.execute(f"SELECT COALESCE(MAX({pk}), 0) FROM {table};")
                max_id = cur.fetchone()[0]
                
                if max_id > 0:
                    cur.execute(f"SELECT pg_get_serial_sequence('{table}', '{pk}');")
                    seq_name = cur.fetchone()[0]
                    
                    if seq_name:
                        cur.execute(f"SELECT setval('{seq_name}', {max_id});")
                        print(f"✅ Reset sequence {seq_name} to {max_id}")
                    else:
                        print(f"⚠️ No sequence found for {table}.{pk}")
                else:
                    print(f"⚠️ Table {table} is empty. Leaving sequence as is.")
            except Exception as e:
                print(f"❌ Failed to process table {table}: {e}")
                conn.rollback()
        conn.commit()

print("Sequences synchronized successfully!")
