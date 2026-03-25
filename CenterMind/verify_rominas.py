import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def verify_rominas():
    print("Verifying Rominas Mapping...")
    uids = [7975564079, 7626448715]
    try:
        res = sb.table("integrantes_grupo").select("telegram_user_id, nombre_integrante, id_vendedor_erp, id_sucursal_erp")\
            .in_("telegram_user_id", uids).execute()
        for r in res.data:
            print(f"UID: {r['telegram_user_id']} | Name: {r['nombre_integrante']} | ERP Vendedor: {r['id_vendedor_erp']} | Sucursal: {r['id_sucursal_erp']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_rominas()
