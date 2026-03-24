"""Check existing ERP data - write to file."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

project_ref = "xjwadmzuuzctxbrvgopx"
password = os.environ.get("PG_PASS", "").strip('"').strip("'")

out = r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\erp_data_report.txt"

with open(out, 'w', encoding='utf-8') as f:
    try:
        conn = psycopg2.connect(
            dbname="postgres", user="postgres", password=password,
            host=f"db.{project_ref}.supabase.co", port=5432, sslmode="require", connect_timeout=10
        )
        cur = conn.cursor()

        # --- erp_clientes_raw ---
        f.write("erp_clientes_raw\n" + "="*60 + "\n")
        cur.execute("SELECT count(*) FROM erp_clientes_raw")
        f.write(f"Total rows: {cur.fetchone()[0]}\n")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='erp_clientes_raw' ORDER BY ordinal_position")
        cols_info = cur.fetchall()
        f.write(f"Columns:\n")
        for c in cols_info:
            f.write(f"  {c[0]} ({c[1]})\n")
        cur.execute("SELECT id_distribuidor, count(*) FROM erp_clientes_raw GROUP BY 1 ORDER BY 1")
        f.write(f"By distribuidor: {cur.fetchall()}\n")
        
        # Sample
        cur.execute("SELECT * FROM erp_clientes_raw LIMIT 1")
        cols = [desc[0] for desc in cur.description]
        row = cur.fetchone()
        f.write(f"\nSample row:\n")
        for c, v in zip(cols, row):
            f.write(f"  {c}: {v}\n")

        # Check for ruta data
        cur.execute("SELECT DISTINCT ruta_erp FROM erp_clientes_raw WHERE ruta_erp IS NOT NULL LIMIT 10")
        ruta_samples = cur.fetchall()
        f.write(f"\nSample ruta_erp values: {ruta_samples}\n")

        # Check for vendedor data
        cur.execute("SELECT DISTINCT vendedor_erp FROM erp_clientes_raw WHERE vendedor_erp IS NOT NULL LIMIT 5")
        vend_samples = cur.fetchall()
        f.write(f"Sample vendedor_erp values: {vend_samples}\n")

        # Check for sucursal data
        cur.execute("SELECT DISTINCT sucursal_erp FROM erp_clientes_raw WHERE sucursal_erp IS NOT NULL LIMIT 10")
        suc_samples = cur.fetchall()
        f.write(f"Sample sucursal_erp values: {suc_samples}\n")

        # Check if id_sucursal_erp exists  
        try:
            cur.execute("SELECT DISTINCT id_sucursal_erp FROM erp_clientes_raw LIMIT 5")
            f.write(f"id_sucursal_erp values: {cur.fetchall()}\n")
        except:
            conn.rollback()
            f.write("id_sucursal_erp column DOES NOT EXIST\n")

        # --- erp_sucursales ---
        f.write("\n\nerp_sucursales\n" + "="*60 + "\n")
        cur.execute("SELECT count(*) FROM erp_sucursales")
        f.write(f"Total rows: {cur.fetchone()[0]}\n")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='erp_sucursales' ORDER BY ordinal_position")
        f.write(f"Columns:\n")
        for c in cur.fetchall():
            f.write(f"  {c[0]} ({c[1]})\n")
        cur.execute("SELECT * FROM erp_sucursales LIMIT 10")
        cols = [desc[0] for desc in cur.description]
        f.write(f"\nAll rows (up to 10):\n")
        for r in cur.fetchall():
            f.write(f"  {dict(zip(cols, r))}\n")

        # --- erp_fuerza_ventas ---
        f.write("\n\nerp_fuerza_ventas\n" + "="*60 + "\n")
        cur.execute("SELECT count(*) FROM erp_fuerza_ventas")
        f.write(f"Total rows: {cur.fetchone()[0]}\n")
        cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='erp_fuerza_ventas' ORDER BY ordinal_position")
        f.write(f"Columns:\n")
        for c in cur.fetchall():
            f.write(f"  {c[0]} ({c[1]})\n")
        cur.execute("SELECT * FROM erp_fuerza_ventas LIMIT 10")
        cols = [desc[0] for desc in cur.description]
        f.write(f"\nSample rows (up to 10):\n")
        for r in cur.fetchall():
            f.write(f"  {dict(zip(cols, r))}\n")

        cur.close()
        conn.close()
    except Exception as e:
        f.write(f"Error: {e}\n")
        import traceback; traceback.print_exc(file=f)

print(f"Written to {out}")
