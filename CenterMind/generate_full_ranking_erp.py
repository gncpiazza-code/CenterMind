import os
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def generate_full_names_ranking():
    dist_id = 3
    start = "2026-03-01T00:00:00-03:00"
    end = "2026-04-01T00:00:00-03:00"
    
    # 1. Fetch Exhibitions
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

    # 2. Map UID -> ERP Code -> Full Name
    res_int = sb.table("integrantes_grupo").select("id_integrante, telegram_user_id, nombre_integrante, id_vendedor_erp")\
        .eq("id_distribuidor", dist_id).execute()
    uid_to_erp = {i["telegram_user_id"]: i["id_vendedor_erp"] for i in res_int.data or [] if i["telegram_user_id"]}
    uid_to_tgname = {i["telegram_user_id"]: i["nombre_integrante"] for i in res_int.data or [] if i["telegram_user_id"]}
    int_to_uid = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or []}

    # Fetch all hierarchy (since id_distribuidor is missing, we'll match by ERP ID)
    res_mj = sb.table("maestro_jerarquia").select("Vendedor, ID_VENDEDOR").execute()
    erp_to_fullname = {str(m["ID_VENDEDOR"]): m["Vendedor"] for m in res_mj.data or []}

    # 3. Process with 1/2 point logic
    stats = defaultdict(lambda: {"a": 0, "d": 0, "pts": 0})
    seen_urls = set()
    seen_msgs = set()

    for e in exs:
        uid = int_to_uid.get(e["id_integrante"])
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
                stats[uid]["a"] += 1
                stats[uid]["pts"] += 1
            elif est in ('destacado', 'destacada'):
                stats[uid]["d"] += 1
                stats[uid]["pts"] += 2

    # 4. Final Ranking with ERP Names
    ranking = []
    for uid, s in stats.items():
        erp_code = uid_to_erp.get(uid)
        # Handle decimal strings or mixed types in ERP Code
        clean_erp = str(erp_code).split('.')[0] if erp_code else None
        fullname = erp_to_fullname.get(clean_erp) if clean_erp else None
        
        # Fallback to Telegram Name if not mapped
        display_name = fullname if fullname else f"{uid_to_tgname.get(uid, 'Desconocido')}"
        
        ranking.append({
            "name": display_name,
            "pts": s["pts"],
            "a": s["a"],
            "d": s["d"]
        })
    
    ranking.sort(key=lambda x: x["pts"], reverse=True)
    
    # Generate MD Table
    md = "# Ranking Completo TABA & HNOS — Marzo 2026 (Nombres ERP)\n\n"
    md += "| Puesto | Vendedor (Nombre ERP) | Aprobadas (1pt) | Destacadas (2pts) | **Total Puntos** |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for i, r in enumerate(ranking, 1):
        md += f"| {i} | {r['name']} | {r['a']} | {r['d']} | **{r['pts']}** |\n"
        
    with open("full_ranking_erp_names.md", "w", encoding="utf-8") as f:
        f.write(md)
    print("Full ranking with ERP names generated.")

if __name__ == "__main__":
    generate_full_names_ranking()
