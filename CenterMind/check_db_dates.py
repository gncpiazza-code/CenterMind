import asyncio
import os
import sys

sys.path.append("c:\\Users\\cigar\\OneDrive\\Desktop\\BOT-SQL\\antigravity\\CenterMind")

from db import sb

async def main():
    try:
        res = sb.table("exhibiciones").select("id_distribuidor, timestamp_subida").execute()
        
        dates = {}
        for row in res.data:
            d = row["id_distribuidor"]
            t = row["timestamp_subida"]
            if not t: continue
            
            # extract year-month
            ym = t[:7] 
            if d not in dates: dates[d] = {}
            dates[d][ym] = dates[d].get(ym, 0) + 1
            
        for d, yms in dates.items():
            print(f"Dist {d}:")
            for ym, c in sorted(yms.items()):
                print(f"  {ym}: {c}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
