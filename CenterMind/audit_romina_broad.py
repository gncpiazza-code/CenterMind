import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def audit_romina_broad():
    print("Broad search for 'Romina' in 'integrantes_grupo'...")
    try:
        res = sb.table("integrantes_grupo").select("nombre_integrante, telegram_user_id, id_integrante")\
            .eq("id_distribuidor", 3)\
            .ilike("nombre_integrante", "%Romina%")\
            .execute()
        
        if res.data:
            print(f"Found {len(res.data)} records:")
            for r in res.data:
                print(f"  - {r['nombre_integrante']} | UID: {r['telegram_user_id']} | ID_Int: {r['id_integrante']}")
        else:
            print("No 'Romina' found in integrantes_grupo.")
            
        print("\nSearching in 'vendedores'...")
        res_v = sb.table("vendedores").select("*")\
            .ilike("nombre_erp", "%Romina%")\
            .execute()
        for r in res_v.data or []:
            print(f"  - {r['nombre_erp']} | ID Vendedor: {r['id_vendedor']} | ERP Code: {r['id_vendedor_erp']}")

        print("\nSearching in 'maestro_jerarquia'...")
        res_m = sb.table("maestro_jerarquia").select("*")\
            .eq("ID_DIST", 3)\
            .ilike("Vendedor", "%Romina%")\
            .execute()
        for r in res_m.data or []:
            print(f"  - {r['Vendedor']} | Sucursal: {r['SUCURSAL']} | ID: {r['ID_VENDEDOR']}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    audit_romina_broad()
