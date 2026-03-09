import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv("CenterMind/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

sb: Client = create_client(url, key)

try:
    print("--- Exhibiciones ---")
    res = sb.table("exhibiciones").select("*").limit(1).execute()
    if res.data:
        print(f"Columns: {list(res.data[0].keys())}")
        print(f"Sample data: {res.data[0]}")
    else:
        print("No data in exhibiciones")
except Exception as e:
    print(f"Error: {e}")
