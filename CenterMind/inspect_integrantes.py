import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_integrantes():
    print("Inspecting 'integrantes_grupo'...")
    try:
        res = sb.table("integrantes_grupo").select("*").limit(1).execute()
        if res.data:
            print("Columns in 'integrantes_grupo':", list(res.data[0].keys()))
        else:
            print("No data in 'integrantes_grupo'")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_integrantes()
