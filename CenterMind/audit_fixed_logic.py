import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def audit_fixed_logic():
    dist_id = 3
    start_date = "2026-03-01T00:00:00-03:00"
    end_date = "2026-04-01T00:00:00-03:00"
    
    # Fetch Data
    exhibiciones = []
    offset = 0
    while True:
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start_date)\
            .lt("timestamp_subida", end_date)\
            .range(offset, offset + 999).execute()
        batch = res.data or []
        exhibiciones.extend(batch)
        if len(batch) < 1000: break
        offset += 1000
    
    # Fetch Integrantes
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante")\
        .eq("id_distribuidor", dist_id).execute()
    int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or []}
    user_names = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or []}

    # Tracking
    stats = defaultdict(lambda: {"aprobadas": 0, "destacadas": 0, "puntos": 0})
    seen_msg = set()
    seen_url = set()

    for e in exhibiciones:
        uid = int_to_user.get(e["id_integrante"])
        if not uid: continue
        
        # 1. Exact Telegram redundancy (double capture of same event)
        if e["telegram_msg_id"]:
            msg_key = (e["telegram_chat_id"], e["telegram_msg_id"])
            if msg_key in seen_msg: continue
            seen_msg.add(msg_key)
        
        # 2. Duplicate Content (same photo sent/uploaded twice)
        if e["url_foto_drive"]:
            url_key = e["url_foto_drive"]
            if url_key in seen_url: continue
            seen_url.add(url_key)
        
        # 3. Only count Approved/Featured
        est = (e["estado"] or "").lower()
        if est in ('aprobado', 'aprobada'):
            stats[uid]["aprobadas"] += 1
            stats[uid]["puntos"] += 1
        elif est in ('destacado', 'destacada'):
            stats[uid]["destacadas"] += 1
            stats[uid]["aprobadas"] += 1
            stats[uid]["puntos"] += 2

    # Result
    ranking = []
    for uid, s in stats.items():
        ranking.append({
            "name": user_names.get(uid, f"User {uid}"),
            "puntos": s["puntos"],
            "aprob": s["aprobadas"],
            "dest": s["destacadas"]
        })
    
    ranking.sort(key=lambda x: x["puntos"], reverse=True)
    print("FIXED RANKING (MARCH):")
    for i, r in enumerate(ranking[:10], 1):
        print(f"  {i}. {r['name']}: {r['puntos']} pts (A:{r['aprob']}, D:{r['dest']})")

if __name__ == "__main__":
    audit_fixed_logic()
