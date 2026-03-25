import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import Counter

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def monchi_final_solve():
    monchi_uid = 5466310928
    print(f"Solving Monchi Puzzle...")
    try:
        res_int = sb.table("integrantes_grupo").select("id_integrante").eq("telegram_user_id", monchi_uid).execute()
        ids = [i["id_integrante"] for i in res_int.data]
        
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", 3)\
            .in_("id_integrante", ids)\
            .gte("timestamp_subida", "2026-03-01")\
            .execute()
        
        exs = res.data or []
        print(f"Total records found: {len(exs)}")
        
        # 1. Analize by Message ID
        msg_counts = Counter([e["telegram_msg_id"] for e in exs])
        print(f"Unique Message IDs: {len(msg_counts)}")
        
        # 2. Analize by URL
        url_counts = Counter([e["url_foto_drive"] for e in exs])
        print(f"Unique URLs: {len(url_counts)}")
        
        # 3. Analize March 7th specifically
        m7 = [e for e in exs if "2026-03-07" in e["timestamp_subida"]]
        print(f"March 7th records: {len(m7)}")
        m7_urls = Counter([e["url_foto_drive"] for e in m7])
        print(f"March 7th unique URLs: {len(m7_urls)}")
        print(f"March 7th URLs details: {m7_urls}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    monchi_final_solve()
