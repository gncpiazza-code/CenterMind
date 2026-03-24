"""Check which migration phases have been applied to the database."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS")
if password:
    password = password.strip('"').strip("'")
else:
    # Try alternate env var
    password = os.environ.get("SUPABASE_PASS", "").strip('"').strip("'")

host = f"db.{project_ref}.supabase.co"

try:
    conn = psycopg2.connect(
        dbname="postgres", user="postgres", password=password,
        host=host, port=5432, sslmode="require", connect_timeout=10
    )
    cur = conn.cursor()

    # --- Fase 1: Check distribuidores has id_erp and nombre_display ---
    print("=" * 60)
    print("FASE 1: distribuidores (id_erp, nombre_display)")
    print("=" * 60)
    try:
        cur.execute("SELECT id_distribuidor, nombre_empresa, id_erp, nombre_display FROM distribuidores ORDER BY id_distribuidor")
        rows = cur.fetchall()
        for r in rows:
            print(f"  id={r[0]}, nombre={r[1]}, id_erp={r[2]}, nombre_display={r[3]}")
        fase1_done = any(r[2] is not None for r in rows)
        print(f"  -> Fase 1 {'DONE' if fase1_done else 'NOT DONE'}")
    except Exception as e:
        print(f"  ERROR: {e}")
        conn.rollback()
        fase1_done = False

    # --- Fase 2: Check if tables sucursales, vendedores, rutas exist ---
    print("\n" + "=" * 60)
    print("FASE 2: tablas sucursales, vendedores, rutas")
    print("=" * 60)
    fase2_done = True
    for t in ['sucursales', 'vendedores', 'rutas']:
        try:
            cur.execute(f"SELECT count(*) FROM {t}")
            count = cur.fetchone()[0]
            print(f"  {t}: EXISTS, {count} rows")
        except Exception as e:
            print(f"  {t}: DOES NOT EXIST ({e})")
            conn.rollback()
            fase2_done = False
    print(f"  -> Fase 2 {'DONE' if fase2_done else 'NOT DONE'}")

    # --- Fase 3: Check if clientes_pdv exists ---
    print("\n" + "=" * 60)
    print("FASE 3: tabla clientes_pdv")
    print("=" * 60)
    try:
        cur.execute("SELECT count(*) FROM clientes_pdv")
        count = cur.fetchone()[0]
        print(f"  clientes_pdv: EXISTS, {count} rows")
        fase3_done = True
    except Exception as e:
        print(f"  clientes_pdv: DOES NOT EXIST ({e})")
        conn.rollback()
        fase3_done = False
    print(f"  -> Fase 3 {'DONE' if fase3_done else 'NOT DONE'}")

    # --- Fase 4: Check if exhibiciones has id_cliente_pdv ---
    print("\n" + "=" * 60)
    print("FASE 4: exhibiciones.id_cliente_pdv")
    print("=" * 60)
    try:
        cur.execute("SELECT count(*) FROM exhibiciones")
        total = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM exhibiciones WHERE id_cliente_pdv IS NOT NULL")
        linked = cur.fetchone()[0]
        print(f"  exhibiciones total: {total}")
        print(f"  exhibiciones con id_cliente_pdv: {linked}")
        fase4_done = True
    except Exception as e:
        print(f"  ERROR checking exhibiciones.id_cliente_pdv: {e}")
        conn.rollback()
        fase4_done = False
    print(f"  -> Fase 4 {'DONE' if fase4_done else 'NOT DONE'}")

    cur.close()
    conn.close()
except Exception as e:
    print(f"Connection error: {e}")
