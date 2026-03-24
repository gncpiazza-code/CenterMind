import asyncio
import os
import sys

# Agrega la ruta del proyecto actual
sys.path.append("c:\\Users\\cigar\\OneDrive\\Desktop\\BOT-SQL\\antigravity\\CenterMind")

from db import sb

async def main():
    try:
        # Check exhibiciones per distributor
        res = sb.table("exhibiciones").select("id_distribuidor").execute()
        dist_counts = {}
        for row in res.data:
            d = row["id_distribuidor"]
            dist_counts[d] = dist_counts.get(d, 0) + 1
            
        print("Total Exhibiciones por ID Distribuidor:")
        for k, v in dist_counts.items():
            print(f"Dist {k}: {v}")
            
        # Check distributors
        dist_res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa").execute()
        print("\nDistribuidores en BD:")
        for r in dist_res.data:
            print(f"{r['id_distribuidor']}: {r['nombre_empresa']}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
