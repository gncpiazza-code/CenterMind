import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_volume():
    dist_id = 3
    # Use the current month YYYY-MM
    periodo = datetime.now().strftime("%Y-%m")
    print(f"Checking exhibition volume for dist {dist_id} in {periodo}...")
    
    try:
        # We only need the count
        res = sb.table("exhibiciones")\
            .select("id_exhibicion", count="exact")\
            .eq("id_distribuidor", dist_id)\
            .gte("timestamp_subida", f"{periodo}-01")\
            .execute()
        
        count = res.count
        print(f"Total exhibitions in {periodo}: {count}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_volume()
