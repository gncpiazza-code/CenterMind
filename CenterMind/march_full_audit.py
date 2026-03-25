import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def full_march_audit():
    dist_id = 3
    start_date = "2026-03-01T00:00:00-03:00"
    end_date = "2026-04-01T00:00:00-03:00"
    
    print(f"Auditing March for Dist {dist_id}...")
    
    # 1. Fetch all exhibitions for March
    exhibiciones = []
    offset = 0
    while True:
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start_date)\
            .lt("timestamp_subida", end_date)\
            .order("timestamp_subida")\
            .range(offset, offset + 999)\
            .execute()
        batch = res.data or []
        exhibiciones.extend(batch)
        if len(batch) < 1000: break
        offset += 1000
    
    print(f"Total exhibitions in March: {len(exhibiciones)}")

    # 2. Fetch Integrantes
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante")\
        .eq("id_distribuidor", dist_id).execute()
    int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or [] if i.get("telegram_user_id")}
    user_names = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or [] if i.get("telegram_user_id")}

    # 3. Analyze for duplicates
    # Case A: Same telegram_msg_id and chat
    msg_tracker = defaultdict(list)
    # Case B: Same user, same client, same approximate time (within 1 min)
    near_dupes = []
    seen_near = {}

    stats = defaultdict(lambda: {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0, "duplicates": 0})
    
    for e in exhibiciones:
        t_id = e["id_exhibicion"]
        iid = e["id_integrante"]
        tuid = int_to_user.get(iid)
        if not tuid: continue
        
        # Track by message id
        msg_key = (e["telegram_chat_id"], e["telegram_msg_id"])
        if e["telegram_msg_id"]:
            msg_tracker[msg_key].append(t_id)
        
        # Track near duplicates
        # Round time to 1 minute
        try:
             ts = datetime.fromisoformat(e["timestamp_subida"].replace('Z', '+00:00'))
             time_key = ts.strftime("%Y-%m-%d %H:%M")
             near_key = (tuid, e["id_cliente_pdv"], time_key)
             if near_key in seen_near:
                 near_dupes.append(t_id)
                 stats[tuid]["duplicates"] += 1
             else:
                 seen_near[near_key] = t_id
        except:
             pass

        est = (e["estado"] or "").lower()
        if t_id not in near_dupes: # Only count unique
            if est in ('aprobado', 'aprobada'):
                stats[tuid]["aprobadas"] += 1
                stats[tuid]["puntos"] += 1
            elif est in ('destacado', 'destacada'):
                stats[tuid]["destacadas"] += 1
                stats[tuid]["aprobadas"] += 1
                stats[tuid]["puntos"] += 2
            elif est in ('rechazado', 'rechazada'):
                stats[tuid]["rechazadas"] += 1

    # Print Report
    print("\nDUPLICATE FINDINGS:")
    msg_dupes = {k: v for k, v in msg_tracker.items() if len(v) > 1}
    print(f"  Exact Message ID duplicates: {len(msg_dupes)} groups")
    print(f"  Approximate (same user/client/min) duplicates: {len(near_dupes)}")

    print("\nRECOUNTING RANKING (Clean):")
    ranking = []
    for tuid, s in stats.items():
        ranking.append({
            "name": user_names.get(tuid, f"User {tuid}"),
            "uid": tuid,
            "puntos": s["puntos"],
            "aprob": s["aprobadas"],
            "dest": s["destacadas"],
            "rech": s["rechazadas"],
            "dupes": s["duplicates"]
        })
    
    ranking.sort(key=lambda x: x["puntos"], reverse=True)
    for i, r in enumerate(ranking[:15], 1):
        print(f"  {i}. {r['name']} ({r['uid']}): {r['puntos']} pts | Dupes detected: {r['dupes']}")

    # Specific check for Romina Romina
    print("\nFOCUS ON ROMINAs:")
    for r in ranking:
        if "Romina" in r["name"]:
            print(f"  - {r['name']} ({r['uid']}): {r['puntos']} pts | A:{r['aprob']} D:{r['dest']} R:{r['rech']} | Dupes:{r['dupes']}")

if __name__ == "__main__":
    full_march_audit()
