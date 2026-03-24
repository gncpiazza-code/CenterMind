
import os
import requests
import urllib3

# Disable SSL warnings for debug
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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
    try:
        res = requests.post(f"{url}/rest/v1/rpc/{name}", headers=headers, json={}, verify=False)
        if res.status_code == 200:
            data = res.json()
            print(f"✅ SUCCESS: {name} returned {len(data)} rows")
            if len(data) > 0:
                print(f"Sample row: {data[0]}")
        else:
            print(f"❌ ERROR {res.status_code}: {res.text}")
    except Exception as e:
        print(f"❌ FETCH ERROR: {e}")

if __name__ == "__main__":
    test_rpc("fn_admin_global_monitoring")
