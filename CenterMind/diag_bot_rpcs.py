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
        # print(res.data)
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    dist_id = 3
    user_id_pk = 53 # Un ID de integrante aproximado para pruebas si existe
    
    # 1. Test Ranking (3 params)
    test_rpc("fn_dashboard_ranking", {"p_dist_id": dist_id, "p_periodo": "mes", "p_top": 10})
    
    # 2. Test Stats Vendedor
    # Nota: el bot usa telegram_user_id para buscar el PK, pero el RPC usa el PK.
    # Vamos a probar con un ID que sepamos que existe o algo genérico.
    test_rpc("fn_bot_stats_vendedor", {"p_distribuidor_id": dist_id, "p_vendedor_id": 1}) 
    
    # 3. Test KPIs (por si acaso)
    test_rpc("fn_dashboard_kpis", {"p_dist_id": dist_id, "p_periodo": "mes"})
