import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def fix_all_dist1():
    # Set a dummy id_vendedor_erp for all vendors in Dist 1 that don't have one
    print("Fixing all vendors in Dist 1...")
    res = sb.table("integrantes_grupo").update({"id_vendedor_erp": "DUMMY_MACO"}).eq("id_distribuidor", 1).is_("id_vendedor_erp", "null").execute()
    print("Update result:", len(res.data), "vendors updated.")

if __name__ == "__main__":
    fix_all_dist1()
