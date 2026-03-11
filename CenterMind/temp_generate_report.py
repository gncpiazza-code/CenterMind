import pandas as pd
import glob
import os
import json
from db import sb

res_dist = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
dist_map = {row["nombre_erp"]: row["id_distribuidor"] for row in (res_dist.data or [])}

path = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\*.xlsx"
files = glob.glob(path)

excel_vendors = {} # dist_id -> set of vendors
for f in files:
    try:
        df = pd.read_excel(f, usecols=["dsempresa", "dssucur", "d_vendedor"])
        if df.empty: continue
        dsempresa = df.iloc[0]["dsempresa"]
        dist_id = dist_map.get(dsempresa)
        if not dist_id: continue
        if dist_id not in excel_vendors: excel_vendors[dist_id] = set()
        for v in df["d_vendedor"].dropna().unique():
            excel_vendors[dist_id].add(v)
    except: pass

res_int = sb.table("integrantes_grupo").select("id_distribuidor, id_integrante, nombre_integrante, id_sucursal_erp, id_vendedor_erp").execute()
integrantes = res_int.data or []

out = ["# Vendors to Map Manually\n", "The following Telegram users could not be automatically linked to an ERP vendor name because the names differ significantly (e.g. nicknames, missing last names).\n"]

for dist_id, vendors in excel_vendors.items():
    dist_integrantes = [i for i in integrantes if i["id_distribuidor"] == dist_id]
    unmatched_telegram = []
    unmatched_erp = list(vendors)
    
    for ig in dist_integrantes:
        ig_name = ig["nombre_integrante"].strip().upper()
        match_found = None
        for v in unmatched_erp:
            v_clean = str(v).strip().upper()
            if ig_name == v_clean or ig_name in v_clean or v_clean in ig_name:
                match_found = v
                break
            parts = ig_name.split()
            if len(parts) == 2:
                inv = f"{parts[1]} {parts[0]}"
                if inv == v_clean or inv in v_clean or v_clean in inv:
                    match_found = v
                    break
        if match_found:
            unmatched_erp.remove(match_found)
        else:
            unmatched_telegram.append(ig["nombre_integrante"])
            
    out.append(f"\n## Distribuidor ID: {dist_id}\n")
    out.append("### Telegram Users (Need ERP Vendor)\n")
    for u in sorted(set(unmatched_telegram)):
        out.append(f"- {u}\n")
    out.append("\n### Available ERP Vendors\n")
    for u in sorted(set(unmatched_erp)):
        out.append(f"- {u}\n")

with open(r"C:\Users\cigar\.gemini\antigravity\brain\569c334d-c64e-4b06-8699-266920148e07\unmapped_vendors.md", "w", encoding="utf-8") as f:
    f.writelines(out)
