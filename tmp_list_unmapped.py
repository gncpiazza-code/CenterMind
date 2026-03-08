import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def check_all_vendors():
    res = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, telegram_user_id, id_vendedor_erp").eq("id_distribuidor", 1).is_("id_vendedor_erp", "null").execute()
    print(f"Found {len(res.data)} vendors missing mapping in Dist 1.")
    for v in res.data:
        print(f"- {v['nombre_integrante']} ({v['telegram_user_id']})")

if __name__ == "__main__":
    check_all_vendors()
