import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def find_wuthrich_erp():
    print("Searching for ERP ID 2002 (Matias Wuthrich) in 'integrantes_grupo'...")
    try:
        # Search by id_vendedor_erp string or other fields
        res = sb.table("integrantes_grupo").select("telegram_user_id, nombre_integrante, id_vendedor_erp, id_sucursal_erp")\
            .eq("id_distribuidor", 3)\
            .execute()
        
        found = False
        for r in res.data:
            if "2002" in str(r.get("id_vendedor_erp", "")) or "MATIAS" in str(r.get("id_vendedor_erp", "")):
                print(f"UID: {r['telegram_user_id']} | Name: {r['nombre_integrante']} | ERP: {r['id_vendedor_erp']} | Sucursal: {r['id_sucursal_erp']}")
                found = True
        
        if not found:
            print("No matching ERP mapping found in integrantes_grupo.")

        # Search for anyone in sucursal 4 or similar (Resistencia)
        print("\nChecking everyone in 'sucursales' for Resistencia ID...")
        res_s = sb.table("sucursales").select("*").eq("id_distribuidor", 3).ilike("nombre_erp", "%Resistencia%").execute()
        for s in res_s.data:
             print(f"Sucursal: {s['nombre_erp']} | ID ERP: {s['id_sucursal_erp']}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_wuthrich_erp()
