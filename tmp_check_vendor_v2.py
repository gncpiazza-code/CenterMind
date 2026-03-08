import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def check_vendor():
    res = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", 1).eq("telegram_user_id", 2037005531).execute()
    print("Vendor data:", res.data)

if __name__ == "__main__":
    check_vendor()
