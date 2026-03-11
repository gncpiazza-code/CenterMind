import os
import requests
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
}

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# We can check one row to see columns
res = requests.get(f"{url}/rest/v1/integrantes_grupo?limit=1", headers=headers, verify=False)
if res.status_code == 200:
    data = res.json()
    if data:
        print(f"Columns: {list(data[0].keys())}")
    else:
        print("Table is empty")
else:
    print(f"Error: {res.status_code} - {res.text}")
