import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def final_audit_unified():
    dist_id = 3
    start = "2026-03-01T00:00:00-03:00"
    end = "2026-04-01T00:00:00-03:00"
    
    # 1. Fetch data
    exs = []
    offset = 0
    while True:
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start)\
            .lt("timestamp_subida", end)\
            .order("timestamp_subida")\
            .range(offset, offset + 999).execute()
        batch = res.data or []
        exs.extend(batch)
        if len(batch) < 1000: break
        offset += 1000

    # 2. Map of UIDs to Unified Label/Entity
    # Based on User Feedback
    WUTHRICH_UIDS = [8415774841, 9001156, 9000666]
    JORGE_UIDS = [9001055, 6258637035]
    
    # Integrantes map
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante")\
        .eq("id_distribuidor", dist_id).execute()
    int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or []}
    
    def get_unified_identity(tuid):
        if tuid in WUTHRICH_UIDS: return "Ivan (RESISTENCIA)"
        if tuid in JORGE_UIDS: return "Jorge Coronel"
        if tuid == 5466310928: return "Monchi Ayala"
        if tuid == 7626448715: return "Romina Soru (CORRIENTES)"
        if tuid == 7975564079: return "Romina Perez (CORDOBA)"
        # Default name
        return None

    user_names = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or []}

    # 3. Process
    stats = defaultdict(lambda: {"puntos": 0, "aprob": 0, "dest": 0})
    seen_urls = set()
    seen_msgs = set()

    for e in exs:
        uid = int_to_user.get(e["id_integrante"])
        if not uid: continue
        
        # Identity
        identity = get_unified_identity(uid) or user_names.get(uid, f"User {uid}")
        
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
                stats[identity]["puntos"] += 1
                stats[identity]["aprob"] += 1
            elif est in ('destacado', 'destacada'):
                stats[identity]["puntos"] += 2
                stats[identity]["dest"] += 1

    # 4. Final Ranking
    ranking = []
    for name, s in stats.items():
        ranking.append({
            "name": name,
            "pts": s["puntos"],
            "a": s["aprob"],
            "d": s["dest"]
        })
    
    ranking.sort(key=lambda x: x["pts"], reverse=True)
    print("UNIFIED MARCH AUDIT REPORT:")
    for i, r in enumerate(ranking[:15], 1):
        print(f"  {i}. {r['name']}: {r['pts']} pts (A:{r['a']}, D:{r['d']})")

if __name__ == "__main__":
    final_audit_unified()
