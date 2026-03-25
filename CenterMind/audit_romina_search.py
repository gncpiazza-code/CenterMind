import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def audit_romina():
    print("Searching for Romina Soru in 'integrantes_grupo'...")
    try:
        res = sb.table("integrantes_grupo").select("*")\
            .eq("id_distribuidor", 3)\
            .ilike("nombre_integrante", "%Romina%Soru%")\
            .execute()
        
        if res.data:
            print(f"Found {len(res.data)} matching records:")
            for r in res.data:
                print(f"  - {r['nombre_integrante']} | UID: {r['telegram_user_id']} | Group: {r['telegram_group_id']} | ID_Int: {r['id_integrante']}")
        else:
            print("No record found for Romina Soru in Dist 3")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    audit_romina()
