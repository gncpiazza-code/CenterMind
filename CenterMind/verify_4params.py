import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

params = {
    'p_dist_id': 3, 
    'p_periodo': 'mes', 
    'p_top': 10, 
    'p_sucursal_id': None
}

print(f"Testing fn_dashboard_ranking with 4 params: {params}")
try:
    res = sb.rpc('fn_dashboard_ranking', params).execute()
    print("✅ Success!")
    print(res.data[:2])
except Exception as e:
    print(f"❌ Error: {e}")
