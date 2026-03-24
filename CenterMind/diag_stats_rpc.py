import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def test_rpc(name, params):
    print(f"Testing {name} with {params}...")
    try:
        res = sb.rpc(name, params).execute()
        print("✅ Success!")
        print(f"Data: {res.data}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    dist_id = 3
    # Buscamos un integrante real para probar stats
    try:
        res = sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", dist_id).limit(1).execute()
        if res.data:
            user_id_pk = res.data[0]["id_integrante"]
            test_rpc("fn_bot_stats_vendedor", {"p_distribuidor_id": dist_id, "p_vendedor_id": user_id_pk})
        else:
            print("No se encontró integrante en dist 3")
    except Exception as e:
        print(f"Error buscando integrante: {e}")
