import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print(f"Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
    exit(1)

sb: Client = create_client(url, key)

def check_table(name):
    print(f"\n--- {name} ---")
    try:
        res = sb.table(name).select("*").limit(1).execute()
        if res.data:
            print(f"Columns: {list(res.data[0].keys())}")
        else:
            print("Table empty or not found")
    except Exception as e:
        print(f"Error checking {name}: {e}")

check_table("distribuidores")
check_table("usuarios_portal")
check_table("integrantes")
check_table("sucursales")
check_table("vendedores")
check_table("roles_permisos") # Check if this exists
