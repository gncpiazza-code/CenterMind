import sys
sys.path.append(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind")
from dotenv import load_dotenv
load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
from db import sb

print("=== FINAL INGESTION STATS ===")
for t in ['sucursales', 'vendedores', 'rutas', 'clientes_pdv']:
    try:
        res = sb.table(t).select("*", count="exact").limit(0).execute()
        print(f"{t}: {res.count} rows")
    except Exception as e:
        print(f"Error checking {t}: {e}")
