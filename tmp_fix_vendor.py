import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def fix_vendor():
    # Set a dummy id_vendedor_erp for Nacho in Dist 1
    # This should bypass the PENDIENTE_MAPEO check in the RPC (which I assume looks for presence of mapping)
    print("Updating Nacho in Dist 1 with dummy mapping...")
    res = sb.table("integrantes_grupo").update({"id_vendedor_erp": "DUMMY_MACO"}).eq("id_distribuidor", 1).eq("telegram_user_id", 2037005531).execute()
    print("Update result:", res.data)

if __name__ == "__main__":
    fix_vendor()
