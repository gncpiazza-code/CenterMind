import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def full_ranking_with_ids():
    dist_id = 3
    start = "2026-03-01T00:00:00-03:00"
    end = "2026-04-01T00:00:00-03:00"
    
    # 1. Fetch data
    exs = []
    offset = 0
    while True:
        res = sb.table("exhibiciones").select("id_integrante, telegram_chat_id, telegram_msg_id, url_foto_drive, estado")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start)\
            .lt("timestamp_subida", end)\
            .range(offset, offset + 999).execute()
        batch = res.data or []
        exs.extend(batch)
        if len(batch) < 1000: break
        offset += 1000

    # 2. Fetch all integrantes including names and UIDs
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante")\
        .eq("id_distribuidor", dist_id).execute()
    int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or []}
    user_names = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or []}

    # 3. Process
    stats = defaultdict(lambda: {"puntos": 0, "aprob": 0, "dest": 0})
    seen_urls = set()
    seen_msgs = set()

    for e in exs:
        uid = int_to_user.get(e["id_integrante"])
        if not uid: continue
        
        is_dupe = False
        if e["url_foto_drive"]:
            if e["url_foto_drive"] in seen_urls: is_dupe = True
            else: seen_urls.add(e["url_foto_drive"])
        elif e["telegram_msg_id"]:
            msg_key = (uid, e["telegram_chat_id"], e["telegram_msg_id"])
            if msg_key in seen_msgs: is_dupe = True
            else: seen_msgs.add(msg_key)

        if not is_dupe:
            est = (e["estado"] or "").lower()
            if est in ('aprobado', 'aprobada'):
                stats[uid]["puntos"] += 1
                stats[uid]["aprob"] += 1
            elif est in ('destacado', 'destacada'):
                stats[uid]["puntos"] += 2
                stats[uid]["dest"] += 1

    # 4. Final list
    ranking = []
    for uid, s in stats.items():
        ranking.append({
            "uid": uid,
            "name": user_names.get(uid, f"User {uid}"),
            "pts": s["puntos"],
            "a": s["aprob"],
            "d": s["dest"]
        })
    
    ranking.sort(key=lambda x: x["pts"], reverse=True)
    for i, r in enumerate(ranking, 1):
        print(f"{i}. {r['name']} ({r['uid']}): {r['pts']} pts (A:{r['a']} D:{r['d']})")

if __name__ == "__main__":
    full_ranking_with_ids()
