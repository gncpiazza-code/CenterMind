import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def find_wuthrich():
    print("Searching for 'Wuthrich'...")
    try:
        res = sb.table("integrantes_grupo").select("telegram_user_id, nombre_integrante, id_distribuidor")\
            .ilike("nombre_integrante", "%Wuthrich%")\
            .execute()
        for r in res.data:
            print(f"UID: {r['telegram_user_id']} | Name: {r['nombre_integrante']} | Dist: {r['id_distribuidor']}")
            
        print("\nSearching in 'maestro_jerarquia'...")
        res_m = sb.table("maestro_jerarquia").select("Vendedor, ID_VENDEDOR, SUCURSAL")\
            .ilike("Vendedor", "%Wuthrich%")\
            .execute()
        for r in res_m.data:
            print(f"Name: {r['Vendedor']} | ID: {r['ID_VENDEDOR']} | Suc: {r['SUCURSAL']}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_wuthrich()
