import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_ivan_w_activity():
    uid = 9000666
    print(f"Checking activity for Ivan Wuthrich (UID: {uid})...")
    try:
        # Get id_integrante for this UID
        res_int = sb.table("integrantes_grupo").select("id_integrante").eq("telegram_user_id", uid).execute()
        ids = [i["id_integrante"] for i in res_int.data]
        
        res = sb.table("exhibiciones").select("id_exhibicion, timestamp_subida")\
            .eq("id_distribuidor", 3)\
            .in_("id_integrante", ids)\
            .gte("timestamp_subida", "2026-03-01")\
            .execute()
        
        print(f"  Total exhibitions in March: {len(res.data or [])}")
        if res.data:
             print(f"  Sample: {res.data[0]['timestamp_subida']}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_ivan_w_activity()
