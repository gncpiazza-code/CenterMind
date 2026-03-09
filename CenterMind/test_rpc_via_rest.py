import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("CenterMind/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

params = {
    'p_id_distribuidor': 3, 
    'p_telegram_user_id': 1234, 
    'p_telegram_group_id': 5678, 
    'p_nro_cliente': 'TEST', 
    'p_tipo_pdv': 'TEST', 
    'p_drive_links': ['http://test.com'], 
    'p_lat': 0.0, 
    'p_lon': 0.0
}

print(f"Testing RPC with params: {params}")

try:
    res = sb.rpc('fn_bot_registrar_exhibicion', params).execute()
    print("✅ Result:", res.data)
except Exception as e:
    print("❌ Error:", e)
