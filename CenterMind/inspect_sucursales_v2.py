import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def inspect_sucursales():
    print("Inspecting 'sucursales'...")
    try:
        res = sb.table("sucursales").select("*").limit(1).execute()
        if res.data: print("sucursales:", list(res.data[0].keys()))
    except Exception as e: print("sucursales error:", e)

    print("Inspecting 'erp_sucursales'...")
    try:
        res = sb.table("erp_sucursales").select("*").limit(1).execute()
        if res.data: print("erp_sucursales:", list(res.data[0].keys()))
    except Exception as e: print("erp_sucursales error:", e)

if __name__ == "__main__":
    inspect_sucursales()
