import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_historico():
    print("Inspecting 'ranking_historico_manual'...")
    try:
        res = sb.table("ranking_historico_manual").select("*").limit(1).execute()
        if res.data: print("ranking_historico_manual:", list(res.data[0].keys()))
        else: print("No data in ranking_historico_manual")
    except Exception as e: print("Error:", e)

if __name__ == "__main__":
    inspect_historico()
