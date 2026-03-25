import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure we can import from the current directory
sys.path.append(str(Path(__file__).resolve().parent))

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

from bot_worker import Database

def verify_fix():
    print("Verifying Ranking Fix in bot_worker.Database...")
    db = Database()
    dist_id = 3
    periodo = "mes"
    
    try:
        ranking = db.get_ranking_periodo(dist_id, periodo)
        print(f"✅ Received {len(ranking)} ranking entries.")
        if ranking:
            print("Top 3:")
            for i, r in enumerate(ranking[:3], 1):
                print(f"  {i}. {r['vendedor']} ({r['sucursal']}): {r['puntos']} pts (A:{r['aprobadas']}, D:{r['destacadas']})")
        else:
            print("⚠️ Ranking is empty (maybe no data for this month?)")
            
        # Test specific month
        periodo_old = "2026-03"
        ranking_old = db.get_ranking_periodo(dist_id, periodo_old)
        print(f"✅ Received {len(ranking_old)} entries for {periodo_old}.")

    except Exception as e:
        print(f"❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_fix()
