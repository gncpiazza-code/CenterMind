import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def get_ranking_python(dist_id: int, periodo: str, top: int = 15):
    print(f"Calculating ranking in Python for dist {dist_id}, period {periodo}...")
    
    # 1. Determine date range
    now = datetime.now(AR_TZ)
    if periodo == 'hoy':
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif periodo == 'mes':
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif periodo == 'semana':
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif len(periodo) == 7 and '-' in periodo: # YYYY-MM
        start_date = f"{periodo}-01T00:00:00-03:00"
        # End date would be end of month, but for simplicity we can just filter by start_date for now if we want "since then"
        # However, for specific month ranking, we need a range.
        y, m = map(int, periodo.split('-'))
        if m == 12:
            next_y, next_m = y + 1, 1
        else:
            next_y, next_m = y, m + 1
        end_date = f"{next_y:04d}-{next_m:02d}-01T00:00:00-03:00"
    else:
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        end_date = None

    # 2. Fetch Exhibitions (with pagination for > 1000 records)
    exhibiciones = []
    offset = 0
    while True:
        query = sb.table("exhibiciones").select("id_integrante, estado")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", start_date)\
            .order("timestamp_subida")\
            .range(offset, offset + 999)
        
        if 'end_date' in locals() and end_date:
            query = query.lt("timestamp_subida", end_date)
            
        res_ex = query.execute()
        batch = res_ex.data or []
        exhibiciones.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
        
    print(f"Fetched {len(exhibiciones)} exhibitions in total.")

    # 3. Fetch Integrantes (for names and branch)
    res_int = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, id_sucursal_erp").eq("id_distribuidor", dist_id).execute()
    int_map = {i["id_integrante"]: i for i in res_int.data or []}
    
    # 4. Fetch Branch names
    try:
        res_suc = sb.table("erp_sucursales").select("id_sucursal_erp_local, nombre_sucursal").eq("id_distribuidor", dist_id).execute()
        suc_map = {s["id_sucursal_erp_local"]: s["nombre_sucursal"] for s in res_suc.data or []}
    except:
        # Retry with erp_sucursales_raw just in case
        res_suc = sb.table("erp_sucursales_raw").select("id_sucursal_erp_local, nombre_sucursal").eq("id_distribuidor", dist_id).execute()
        suc_map = {s["id_sucursal_erp_local"]: s["nombre_sucursal"] for s in res_suc.data or []}

    # 5. Aggregate
    stats = defaultdict(lambda: {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0})
    for e in exhibiciones:
        uid = e["id_integrante"]
        est = (e["estado"] or "").lower()
        
        if est in ('aprobado', 'aprobada'):
            stats[uid]["aprobadas"] += 1
            stats[uid]["puntos"] += 1
        elif est in ('destacado', 'destacada'):
            stats[uid]["destacadas"] += 1
            stats[uid]["aprobadas"] += 1 # Aprobada is the base
            stats[uid]["puntos"] += 2
        elif est in ('rechazado', 'rechazada'):
            stats[uid]["rechazadas"] += 1

    # 6. Convert to list and enrich
    ranking = []
    for uid, s in stats.items():
        user = int_map.get(uid, {})
        suc_id = user.get("id_sucursal_erp")
        ranking.append({
            "vendedor": user.get("nombre_integrante", f"ID {uid}"),
            "sucursal": suc_map.get(suc_id, "S/D"),
            "aprobadas": s["aprobadas"],
            "destacadas": s["destacadas"],
            "rechazadas": s["rechazadas"],
            "puntos": s["puntos"]
        })

    # 7. Add Historical if applicable (optional for now, but good to have)
    # ... (omitted for the prototype)

    # 8. Sort and limit
    ranking.sort(key=lambda x: (x["puntos"], x["aprobadas"]), reverse=True)
    return ranking[:top]

if __name__ == "__main__":
    result = get_ranking_python(3, "2026-03")
    for r in result:
        print(r)
