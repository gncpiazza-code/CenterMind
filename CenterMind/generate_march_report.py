import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime
import json

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def generate_daily_report():
    dist_id = 3
    start_date = "2026-03-01T00:00:00-03:00"
    end_date = "2026-04-01T00:00:00-03:00"
    
    # 1. Fetch data
    exhibiciones = []
    offset = 0
    while True:
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start_date)\
            .lt("timestamp_subida", end_date)\
            .order("timestamp_subida")\
            .range(offset, offset + 999).execute()
        batch = res.data or []
        exhibiciones.extend(batch)
        if len(batch) < 1000: break
        offset += 1000
    
    # 2. Fetch Integrantes for names
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante")\
        .eq("id_distribuidor", dist_id).execute()
    int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or []}
    user_names = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or []}

    # 3. Deduplicate and Group by Date/User
    # Exact dupe: (t_chat, t_msg)
    # Technical dupe: (user, client, minute)
    
    daily_stats = defaultdict(lambda: defaultdict(lambda: {"clean_count": 0, "points": 0}))
    seen_exact = set()
    seen_approx = set()
    incident_7_march = 0
    
    for e in exhibiciones:
        iid = e["id_integrante"]
        tuid = int_to_user.get(iid)
        if not tuid: continue
        
        # Cleanup timestamp for grouping
        ts_str = e["timestamp_subida"].replace('Z', '+00:00')
        ts = datetime.fromisoformat(ts_str)
        day = ts.strftime("%Y-%m-%d")
        minute = ts.strftime("%Y-%m-%d %H:%M")
        
        # Incident 7 March: 151 records at same time
        if day == "2026-03-07" and ts.strftime("%H:%M") == "21:00":
             incident_7_march += 1
             if incident_7_march > 1: continue # Skip all but the first in this specific suspicious block
        
        # Exact dupe check
        msg_key = (e["telegram_chat_id"], e["telegram_msg_id"])
        if e["telegram_msg_id"] and msg_key in seen_exact:
            continue
        seen_exact.add(msg_key)

        # Approx dupe check
        approx_key = (tuid, e["id_cliente_pdv"], minute)
        if approx_key in seen_approx:
            continue
        seen_approx.add(approx_key)
        
        # Points Logic
        est = (e["estado"] or "").lower()
        if est in ('aprobado', 'aprobada', 'destacado', 'destacada'):
            pts = 2 if 'destacad' in est else 1
            daily_stats[tuid][day]["clean_count"] += 1
            daily_stats[tuid][day]["points"] += pts

    # 4. Format Report
    report = []
    total_by_user = defaultdict(int)
    
    all_days = sorted(list(set([d for u in daily_stats.values() for d in u.keys()])))
    unique_users = sorted(list(daily_stats.keys()), key=lambda u: user_names.get(u, ""))

    for tuid in unique_users:
        name = user_names.get(tuid, f"User {tuid}")
        user_rows = []
        for day in all_days:
            s = daily_stats[tuid].get(day, {"clean_count": 0, "points": 0})
            if s["clean_count"] > 0:
                user_rows.append(f"  - {day}: {s['clean_count']} fotos | {s['points']} pts")
                total_by_user[tuid] += s["points"]
        
        if total_by_user[tuid] > 0:
             report.append({
                 "name": name,
                 "uid": tuid,
                 "daily": user_rows,
                 "total": total_by_user[tuid]
             })

    # Sort final report by total points
    report.sort(key=lambda x: x["total"], reverse=True)
    
    # Write to a JSON for easier formatting in next step
    with open("march_audit_raw.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"Generated data for {len(report)} vendors with activity.")

if __name__ == "__main__":
    generate_daily_report()
