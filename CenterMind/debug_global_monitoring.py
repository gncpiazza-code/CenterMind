
import os
import requests
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

def test_rpc(name):
    print(f"Testing RPC: {name}")
    res = requests.post(f"{url}/rest/v1/rpc/{name}", headers=headers, json={})
    if res.status_code == 200:
        print(f"✅ SUCCESS: {name} returned {len(res.json())} rows")
    else:
        print(f"❌ ERROR {res.status_code}: {res.text}")

if __name__ == "__main__":
    test_rpc("fn_admin_global_monitoring")
    # Also test the one that gives 404 (though it's a GET in api.py, we test the RPCs it might use)
    # The hierarchy-config uses table selects mostly
