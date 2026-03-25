import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime
import pytz

AR_TZ = pytz.timezone('America/Argentina/Buenos_Aires')
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def test_unified_stats_logic(uid):
    print(f"Testing stats for UID: {uid}")
    WUTHRICH_UIDS = [8415774841, 9001156, 9000666]
    related_uids = WUTHRICH_UIDS if uid in WUTHRICH_UIDS else [uid]
    
    # 1. Get id_integrante
    res_int = sb.table("integrantes_grupo").select("id_integrante").in_("telegram_user_id", related_uids).execute()
    iids = [r["id_integrante"] for r in res_int.data or []]
    
    # 2. Get current month ex
    now = datetime.now(AR_TZ)
    start_mes = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    res_ex = sb.table("exhibiciones").select("*")\
        .eq("id_distribuidor", 3)\
        .in_("id_integrante", iids)\
        .gte("timestamp_subida", start_mes.isoformat())\
        .execute()
    
    # 3. Calc
    seen_urls = set()
    seen_msgs = set()
    counts = {"p": 0, "ap": 0, "d": 0, "r": 0, "pen": 0}
    
    for e in (res_ex.data or []):
        is_dupe = False
        url = e.get("url_foto_drive")
        msg_id = e.get("telegram_msg_id")
        if url:
            if url in seen_urls: is_dupe = True
            else: seen_urls.add(url)
        elif msg_id:
            msg_key = (e.get("id_integrante"), e.get("telegram_chat_id"), msg_id)
            if msg_key in seen_msgs: is_dupe = True
            else: seen_msgs.add(msg_key)
        
        if not is_dupe:
            est = (e.get("estado") or "").lower()
            if est in ('aprobado', 'aprobada'):
                counts["ap"] += 1
                counts["p"] += 1
            elif est in ('destacado', 'destacada'):
                counts["d"] += 1
                counts["p"] += 2
            elif est in ('rechazado', 'rechazada'):
                counts["r"] += 1
            else:
                counts["pen"] += 1

    print(f"Results: {counts}")

if __name__ == "__main__":
    test_unified_stats_logic(8415774841) # Ivan Soto
    test_unified_stats_logic(9001156)   # Ivan (2nd account)
