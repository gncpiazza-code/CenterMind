import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def find_monchi_dupes():
    monchi_uid = 5466310928
    print(f"Investigating Monchi (UID: {monchi_uid}) duplicates...")
    
    try:
        # Get all exhibitions for Monchi in March
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", 3)\
            .gte("timestamp_subida", "2026-03-01")\
            .limit(500)\
            .execute()
        
        # Filter by and group by message id
        msg_groups = {}
        for r in res.data:
            # We need to find his id_integrante first
            pass
        
        # Let's just fetch all his id_integrantes
        res_int = sb.table("integrantes_grupo").select("id_integrante").eq("telegram_user_id", monchi_uid).execute()
        ids = [i["id_integrante"] for i in res_int.data]
        
        monchi_ex = [r for r in res.data if r["id_integrante"] in ids]
        print(f"Found {len(monchi_ex)} monchi exhibitions in first 500 rows of march.")
        
        from collections import defaultdict
        dupes = defaultdict(list)
        for e in monchi_ex:
            key = (e["telegram_chat_id"], e["telegram_msg_id"])
            dupes[key].append(e)
            
        print("\nEXAMPLES OF EXACT DUPLICATES (Same Message ID):")
        count = 0
        for key, records in dupes.items():
            if len(records) > 1 and key[1] is not None:
                count += 1
                print(f"  Group {key[0]} | Msg {key[1]}: {len(records)} entries found!")
                for r in records[:2]:
                    print(f"    - ID: {r['id_exhibicion']} | Time: {r['timestamp_subida']} | Client: {r['id_cliente_pdv']}")
                if count >= 3: break
                
        print("\nEXAMPLES OF NEAR DUPLICATES (Same Client, Same minute):")
        near = defaultdict(list)
        for e in monchi_ex:
            time_key = e["timestamp_subida"][:16] # YYYY-MM-DD HH:MM
            key = (e["id_cliente_pdv"], time_key)
            near[key].append(e)
            
        count = 0
        for key, records in near.items():
            if len(records) > 1:
                # Filter out those already found in exact dupes
                count += 1
                print(f"  Client {key[0]} | Time {key[1]}: {len(records)} entries found!")
                for r in records[:2]:
                    print(f"    - ID: {r['id_exhibicion']} | Time: {r['timestamp_subida']} | Msg: {r['telegram_msg_id']}")
                if count >= 3: break

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_monchi_dupes()
