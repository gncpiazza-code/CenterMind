import pandas as pd
import glob
import os
import json
from db import sb

# First, get the mapping of dsempresa to dist_id from the DB
res_dist = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
dist_map = {row["nombre_erp"]: row["id_distribuidor"] for row in (res_dist.data or [])}

path = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\*.xlsx"
files = glob.glob(path)

# Extract unique vendors per distributor
excel_vendors = {} # dist_id -> set of vendors
for f in files:
    try:
        df = pd.read_excel(f, usecols=["dsempresa", "dssucur", "d_vendedor"])
        if df.empty: continue
        dsempresa = df.iloc[0]["dsempresa"]
        
        # Mapeos conocidos o intentar matchear
        dist_id = dist_map.get(dsempresa)
        if not dist_id:
            print(f"Alerta: Empresa '{dsempresa}' en {os.path.basename(f)} no tiene mapeo directo en DB.")
            continue
            
        if dist_id not in excel_vendors:
            excel_vendors[dist_id] = set()
            
        vendors = df["d_vendedor"].dropna().unique()
        for v in vendors:
            excel_vendors[dist_id].add(v)
            
    except Exception as e:
        print(f"Error procesando {f}: {e}")

# Fetch Telegram integrants
res_int = sb.table("integrantes_grupo").select("id_distribuidor, id_integrante, nombre_integrante, id_sucursal_erp, id_vendedor_erp").execute()
integrantes = res_int.data or []

print("\n=== REPORTE DE MATCHING ERP vs TELEGRAM ===")

for dist_id, vendors in excel_vendors.items():
    print(f"\n--- DISTRIBUIDOR ID: {dist_id} ---")
    
    dist_integrantes = [i for i in integrantes if i["id_distribuidor"] == dist_id]
    
    # Simple matching logic similar to fixing script
    matched = []
    unmatched_telegram = []
    unmatched_erp = list(vendors)
    
    for ig in dist_integrantes:
        ig_name = ig["nombre_integrante"].strip().upper()
        # Intentamos un match directo
        match_found = None
        for v in unmatched_erp:
            v_clean = str(v).strip().upper()
            if ig_name == v_clean or ig_name in v_clean or v_clean in ig_name:
                match_found = v
                break
            
            # Prueba invirtiendo nombre (APELLIDO NOMBRE <-> NOMBRE APELLIDO)
            parts = ig_name.split()
            if len(parts) == 2:
                inv = f"{parts[1]} {parts[0]}"
                if inv == v_clean or inv in v_clean or v_clean in inv:
                    match_found = v
                    break
                    
        if match_found:
            unmatched_erp.remove(match_found)
            matched.append((ig["nombre_integrante"], match_found))
        else:
            unmatched_telegram.append(ig["nombre_integrante"])
            
    print(f"✅ Matcheados ({len(matched)}):")
    # limit to 5 just to show
    for m in matched[:5]:
        print(f"  - {m[0]} -> {m[1]}")
    if len(matched) > 5: print(f"  ... y {len(matched)-5} mas.")
        
    print(f"\n❌ Telegram SIN match en ERP ({len(unmatched_telegram)}):")
    for u in unmatched_telegram:
        print(f"  - {u}")
        
    print(f"\n⚠️ Vendedores ERP huérfanos ({len(unmatched_erp)}):")
    for u in list(unmatched_erp)[:10]:
        print(f"  - {u}")
    if len(unmatched_erp) > 10: print(f"  ... y {len(unmatched_erp)-10} mas.")
