
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

def check():
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres.xjwadmzuuzctxbrvgopx",
            password=os.environ.get("SUPABASE_PASS"),
            host="aws-0-sa-east-1.pooler.supabase.com",
            port="6543"
        )
        cur = conn.cursor()
        
        dist_id = 3
        
        cur.execute("SELECT COUNT(*) FROM maestro_jerarquia WHERE \"ID_DIST\" = %s", (dist_id,))
        print(f"Maestro count for dist {dist_id}: {cur.fetchone()[0]}")
        
        cur.execute("SELECT sucursal_erp, COUNT(*) FROM erp_clientes_raw WHERE id_distribuidor = %s GROUP BY 1", (dist_id,))
        print("Sucursales in ERP raw (first 5):", cur.fetchall()[:5])

        cur.execute("SELECT estado, COUNT(*) FROM erp_clientes_raw WHERE id_distribuidor = %s GROUP BY 1", (dist_id,))
        print("Estados in ERP raw:", cur.fetchall())

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()
