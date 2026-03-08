import os
import sys
from dotenv import load_dotenv

load_dotenv(r'c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env')

from supabase import create_client, Client

def test_rpc():
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Testing RPC fn_bot_registrar_exhibicion for Nacho in Dist 1...")
    res = sb.rpc("fn_bot_registrar_exhibicion", {
        "p_distribuidor_id": 1,        
        "p_vendedor_id": 2037005531,  
        "p_nro_cliente": "4",        
        "p_tipo_pdv": "COMERCIOCONINGRESO",
        "p_drive_link": "test_link_nacho_dist1",
        "p_telegram_msg_id": 99999,
        "p_telegram_chat_id": -5125535838
    }).execute()
    
    print("RES data:", res.data)
    
if __name__ == "__main__":
    test_rpc()
