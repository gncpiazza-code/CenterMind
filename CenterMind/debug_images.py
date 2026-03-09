import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv("CenterMind/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

sb: Client = create_client(url, key)

try:
    print("--- Recent Exhibiciones with Images ---")
    res = sb.table("exhibiciones").select("id_exhibicion, drive_link, timestamp_subida").not.is_("drive_link", "null").order("timestamp_subida", desc=True).limit(10).execute()
    if res.data:
        for row in res.data:
            print(f"ID: {row['id_exhibicion']}, Link: {row['drive_link']}, Date: {row['timestamp_subida']}")
    else:
        print("No recent exhibiciones with images found.")
except Exception as e:
    print(f"Error: {e}")
