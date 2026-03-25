import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_dist3_mapping():
    print("Group Mapping status for Distributor 3:")
    try:
        res = sb.table("maestro_jerarquia").select("SUCURSAL, Vendedor, \"Group id\"").eq("ID_DIST", 3).execute()
        if res.data:
            total = len(res.data)
            mapped = len([r for r in res.data if r.get("Group id")])
            unmapped = total - mapped
            print(f"Total records (Dist 3): {total}")
            print(f"Mapped to groups: {mapped}")
            print(f"Unmapped: {unmapped}")
        else:
            print("No data for Dist 3")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_dist3_mapping()
