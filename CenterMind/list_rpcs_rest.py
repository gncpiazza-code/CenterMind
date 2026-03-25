import os
import requests
import json
from dotenv import load_dotenv

try:
    import certifi
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
    os.environ["SSL_CERT_FILE"]      = certifi.where()
except ImportError:
    pass

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

def list_rpcs():
    print(f"Fetching OpenAPI spec from {url}/rest/v1/")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
    try:
        # PostgREST exposes the OpenAPI spec at the root with a simple GET
        res = requests.get(f"{url}/rest/v1/", headers=headers)
        if res.status_code == 200:
            spec = res.json()
            paths = spec.get("paths", {})
            rpcs = [p for p in paths if p.startswith("/rpc/")]
            print(f"Found {len(rpcs)} RPCs:")
            for rpc in sorted(rpcs):
                print(f"  {rpc}")
                # Print parameters
                params = paths[rpc].get("post", {}).get("parameters", [])
                for p in params:
                    print(f"    - {p.get('name')}: {p.get('format') or p.get('schema', {}).get('type')}")
        else:
            print(f"Error {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    list_rpcs()
