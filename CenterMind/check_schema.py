import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print(f"Error: SUPABASE_URL ({url}) or SUPABASE_KEY ({key}) not found in .env")
    exit(1)

sb: Client = create_client(url, key)

try:
    print("--- Distribuidores ---")
    res = sb.table("distribuidores").select("*").limit(1).execute()
    if res.data:
        print(f"Columns: {list(res.data[0].keys())}")
except Exception as e:
    print(f"Error: {e}")
