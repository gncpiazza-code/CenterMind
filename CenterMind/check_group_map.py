import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def check_group_mapping():
    print("Group Mapping status in 'maestro_jerarquia':")
    try:
        res = sb.table("maestro_jerarquia").select("EMPRESA, SUCURSAL, Vendedor, \"Group id\"").execute()
        if res.data:
            total = len(res.data)
            mapped = len([r for r in res.data if r.get("Group id")])
            unmapped = total - mapped
            print(f"Total records: {total}")
            print(f"Mapped to groups: {mapped}")
            print(f"Unmapped: {unmapped}")
            
            if unmapped > 0:
                print("\nSome unmapped examples:")
                for r in [r for r in res.data if not r.get("Group id")][:5]:
                    print(f"  - {r['EMPRESA']} | {r['SUCURSAL']} | {r['Vendedor']}")
        else:
            print("No data")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_group_mapping()
