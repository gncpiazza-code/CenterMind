import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(r"c:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\CenterMind\.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

def deep_monchi_audit():
    monchi_uid = 5466310928
    print(f"Deep Audit for Monchi (UID: {monchi_uid})...")
    
    try:
        # Get all his integrantes_grupo first
        res_int = sb.table("integrantes_grupo").select("id_integrante").eq("telegram_user_id", monchi_uid).execute()
        ids = [i["id_integrante"] for i in res_int.data]
        
        # Fetch all exhibitions for Monchi in March
        res = sb.table("exhibiciones").select("*")\
            .eq("id_distribuidor", 3)\
            .in_("id_integrante", ids)\
            .gte("timestamp_subida", "2026-03-01")\
            .order("timestamp_subida")\
            .execute()
        
        ex = res.data or []
        print(f"Total raw exhibitions for Monchi in March: {len(ex)}")

        # Check for unique photo URLs
        urls = [e.get("url_foto_drive") for e in ex if e.get("url_foto_drive")]
        unique_urls = set(urls)
        print(f"Total unique photo URLs: {len(unique_urls)}")
        
        # Check March 7th Specifically
        m7 = [e for e in ex if "2026-03-07" in e["timestamp_subida"]]
        print(f"\nMarch 7th Breakdown:")
        print(f"  Total records: {len(m7)}")
        m7_urls = set([e.get("url_foto_drive") for e in m7 if e.get("url_foto_drive")])
        print(f"  Unique URLs on March 7th: {len(m7_urls)}")
        
        if len(m7) > 0:
            print(f"  Sample timestamp: {m7[0]['timestamp_subida']}")
            print(f"  Sample message ID: {m7[0]['telegram_msg_id']}")

        # Check for non-photo exhibitions (maybe some are just text? unlikely)
        no_url = [e for e in ex if not e.get("url_foto_drive")]
        print(f"\nExhibitions without URL: {len(no_url)}")
        
        # If there are MANY without URL, maybe they are in a different column?
        if ex:
             print("\nAvailable columns in one record:", list(ex[0].keys()))

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    deep_monchi_audit()
