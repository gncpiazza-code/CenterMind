import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_vendedores_tg():
    print("Inspecting 'vendedores' for telegram info...")
    try:
        res = sb.table("vendedores").select("*").limit(1).execute()
        if res.data:
            print("Columns in 'vendedores':", list(res.data[0].keys()))
            # Common names: telegram_id, tgid, user_id, etc.
        else:
            print("No data in 'vendedores'")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_vendedores_tg()
