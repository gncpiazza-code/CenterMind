
import os
import psycopg2
from dotenv import load_dotenv

# Load from CenterMind/.env
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

def inspect_schema():
    try:
        # PGBouncer/Pooler often requires no ssl or specific params
        # But we'll try the direct connection with PG_PASS
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres.xjwadmzuuzctxbrvgopx",
            password=os.environ.get("PG_PASS"),
            host="aws-0-sa-east-1.pooler.supabase.com",
            port="6543"
        )
        cur = conn.cursor()
        
        tables = ['erp_sucursales', 'erp_fuerza_ventas', 'maestro_jerarquia', 'erp_clientes_raw']
        
        for table in tables:
            print(f"\n--- Schema for {table} ---")
            cur.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{table}' 
                ORDER BY ordinal_position
            """)
            for col in cur.fetchall():
                print(f"{col[0]}: {col[1]}")
            
            # Get a sample
            print(f"\nSample data for {table} (1 row):")
            try:
                cur.execute(f"SELECT * FROM {table} LIMIT 1")
                row = cur.fetchone()
                if row:
                    colnames = [desc[0] for desc in cur.description]
                    print(dict(zip(colnames, row)))
                else:
                    print("No data.")
            except Exception as e:
                print(f"Error fetching sample: {e}")
                conn.rollback() # reset transaction
                cur = conn.cursor()

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_schema()
