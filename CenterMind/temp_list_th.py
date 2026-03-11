import pandas as pd
from db import sb

dist_id = 3
TH_FILE = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\REAL DISTRIBUCION-T&H.xlsx'

# Get ERP Vendors
df = pd.read_excel(TH_FILE, usecols=['d_vendedor'])
erp_vendors = set(df['d_vendedor'].dropna().unique())

# Get Telegram users for T&H that are NOT mapped
res_int = sb.table("integrantes_grupo").select("nombre_integrante, rol_telegram, id_vendedor_erp").eq("id_distribuidor", dist_id).execute()
unmapped_telegram = []

for ig in res_int.data:
    if ig["id_vendedor_erp"] is None and ig["rol_telegram"] == "vendedor":
        unmapped_telegram.append(ig["nombre_integrante"])

# Auto-match strategy inside python just to be sure we only list genuinely unmapped
matched_erp = set()
really_unmapped_telegram = []

for name in unmapped_telegram:
    ig_name = name.strip().upper()
    match_found = None
    for v in erp_vendors:
        v_clean = str(v).strip().upper()
        if ig_name == v_clean or ig_name in v_clean or v_clean in ig_name:
            match_found = v
            break
        # inverted
        parts = ig_name.split()
        if len(parts) == 2:
            inv = f"{parts[1]} {parts[0]}"
            if inv == v_clean or inv in v_clean or v_clean in inv:
                match_found = v
                break
    if match_found:
        matched_erp.add(match_found)
    else:
        really_unmapped_telegram.append(name)

unmatched_erp = erp_vendors - matched_erp

print("--- TELEGRAM SIN MAPEAR (T&H) ---")
for u in sorted(really_unmapped_telegram):
    print(f"- {u}")

print("\n--- VENDEDORES ERP LIBRES (T&H) ---")
for v in sorted(unmatched_erp):
    print(f"- {v}")
