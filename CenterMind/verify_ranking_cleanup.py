import os
import json
from dotenv import load_dotenv
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv(os.path.join(os.getcwd(), 'CenterMind', '.env'))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def verify_ranking():
    print("Checking ranking for Dist 2 (March 2026)...")
    url = f"{SUPABASE_URL}/rest/v1/rpc/fn_dashboard_ranking"
    payload = {"p_dist_id": 2, "p_periodo": "2026-03", "p_top": 15}
    res = requests.post(url, headers=headers, json=payload, verify=False)
    
    if res.status_code == 200:
        data = res.json()
        print(f"Ranking entries: {len(data)}")
        names = [r['vendedor'] for r in data]
        counts = {}
        for n in names:
            counts[n] = counts.get(n, 0) + 1
        
        dupes = {n: c for n, c in counts.items() if c > 1}
        if dupes:
            print("❌ Duplicates STILL FOUND in ranking:")
            for n, c in dupes.items():
                print(f"  - {n}: {c}")
            for row in data:
                print(f"    - {row}")
        else:
            print("✅ No duplicates found in ranking.")
            for row in data:
                print(f"  - {row['vendedor']}: {row['puntos']} pts")
    else:
        print(f"Error fetching ranking: {res.text}")

if __name__ == "__main__":
    verify_ranking()
