import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_migration_progress():
    print("Migration Progress in 'maestro_jerarquia':")
    try:
        # We can't do GROUP BY easily with the client without a view, 
        # so we fetch all unique ID_DIST if there are not too many.
        res = sb.table("maestro_jerarquia").select("ID_DIST, EMPRESA").execute()
        if res.data:
            counts = {}
            for d in res.data:
                did = d["ID_DIST"]
                emp = d["EMPRESA"]
                counts[did] = counts.get(did, 0) + 1
            
            for did, count in counts.items():
                print(f"Distributor {did}: {count} records")
        else:
            print("No data in maestro_jerarquia")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_migration_progress()
