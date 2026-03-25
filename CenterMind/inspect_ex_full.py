import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_exhibiciones_full():
    print("Inspecting 'exhibiciones' full columns...")
    try:
        res = sb.table("exhibiciones").select("*").limit(1).execute()
        if res.data:
            columns = sorted(list(res.data[0].keys()))
            print(f"Total columns: {len(columns)}")
            for col in columns:
                print(f"  - {col}")
        else:
            print("No data in 'exhibiciones'")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_exhibiciones_full()
