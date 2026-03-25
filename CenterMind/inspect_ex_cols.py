import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_exhibiciones():
    print("Inspecting 'exhibiciones'...")
    try:
        res = sb.table("exhibiciones").select("*").limit(1).execute()
        if res.data:
            print("Columns in 'exhibiciones':", list(res.data[0].keys()))
        else:
            print("No data in 'exhibiciones'")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_exhibiciones()
