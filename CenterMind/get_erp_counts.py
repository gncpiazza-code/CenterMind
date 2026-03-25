import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def get_counts():
    print("Record counts for ERP tables:")
    tables = ["erp_clientes_raw", "erp_sucursales", "vendedores", "clientes_pdv"]
    for table in tables:
        try:
            res = sb.table(table).select("*", count="exact").limit(0).execute()
            print(f"  {table}: {res.count} records")
        except:
             try:
                 # Try with _raw suffix if needed
                 res = sb.table(table+"_raw").select("*", count="exact").limit(0).execute()
                 print(f"  {table}_raw: {res.count} records")
             except Exception as e:
                 print(f"  {table}: Error {e}")

if __name__ == "__main__":
    get_counts()
