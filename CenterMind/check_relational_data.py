
import os
import sys
from dotenv import load_dotenv

# Load .env BEFORE importing db.py
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

# Add the current directory to path so we can import db
sys.path.append(os.path.abspath(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind"))

from db import sb

def check_tables():
    dist_id = 3
    print(f"Checking data for dist_id: {dist_id}\n")
    
    # Check erp_sucursales
    print("--- erp_sucursales ---")
    try:
        res = sb.table("erp_sucursales").select("*").eq("id_distribuidor", dist_id).execute()
        print(f"Count: {len(res.data or [])}")
        if res.data:
            print(f"Sample: {res.data[0]}")
    except Exception as e:
        print(f"Error: {e}")

    # Check erp_fuerza_ventas
    print("\n--- erp_fuerza_ventas ---")
    try:
        res = sb.table("erp_fuerza_ventas").select("*").eq("id_distribuidor", dist_id).execute()
        print(f"Count: {len(res.data or [])}")
        if res.data:
            print(f"Sample: {res.data[0]}")
    except Exception as e:
        print(f"Error: {e}")

    # Check maestro_jerarquia
    print("\n--- maestro_jerarquia ---")
    try:
        res = sb.table("maestro_jerarquia").select("*").eq("ID_DIST", dist_id).execute()
        print(f"Count: {len(res.data or [])}")
        if res.data:
            print(f"Sample: {res.data[0]}")
    except Exception as e:
        print(f"Error: {e}")

    # Check erp_clientes_raw
    print("\n--- erp_clientes_raw (First 5 sucursal/vendedor combinations) ---")
    try:
        res = sb.table("erp_clientes_raw").select("id_sucursal_erp, sucursal_erp, vendedor_erp").eq("id_distribuidor", dist_id).limit(50).execute()
        combos = set()
        for row in (res.data or []):
            combos.add((row.get("id_sucursal_erp"), row.get("sucursal_erp"), row.get("vendedor_erp")))
        for c in sorted(list(combos))[:10]:
            print(c)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_tables()
