import os
import requests
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

def list_tables():
    print(f"Fetching OpenAPI spec from {url}/rest/v1/")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
    try:
        res = requests.get(f"{url}/rest/v1/", headers=headers)
        if res.status_code == 200:
            spec = res.json()
            definitions = spec.get("definitions", {})
            print(f"Found {len(definitions)} Tables/Views:")
            for table in sorted(definitions.keys()):
                print(f"  {table}")
        else:
            print(f"Error {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    list_tables()
