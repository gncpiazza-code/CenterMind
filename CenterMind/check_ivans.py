import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_ivans():
    print("Checking 'Ivan' users in Dist 3...")
    try:
        res = sb.table("integrantes_grupo").select("telegram_user_id, nombre_integrante")\
            .eq("id_distribuidor", 3)\
            .ilike("nombre_integrante", "%Ivan%")\
            .execute()
        for r in res.data:
            print(f"UID: {r['telegram_user_id']} | Name: {r['nombre_integrante']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_ivans()
