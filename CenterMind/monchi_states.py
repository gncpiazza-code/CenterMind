import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import Counter

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_monchi_states():
    monchi_uid = 5466310928
    try:
        res_int = sb.table("integrantes_grupo").select("id_integrante").eq("telegram_user_id", monchi_uid).execute()
        ids = [i["id_integrante"] for i in res_int.data]
        
        res = sb.table("exhibiciones").select("estado")\
            .eq("id_distribuidor", 3)\
            .in_("id_integrante", ids)\
            .gte("timestamp_subida", "2026-03-01")\
            .execute()
        
        states = [str(r["estado"]) for r in res.data or []]
        print(f"States count for Monchi in March:")
        for s, count in Counter(states).items():
            print(f"  - {s}: {count}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_monchi_states()
