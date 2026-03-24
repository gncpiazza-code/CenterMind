import asyncio
import os
import sys
import json

sys.path.append("c:\\Users\\cigar\\OneDrive\\Desktop\\BOT-SQL\\antigravity\\CenterMind")

from CenterMind.api import reportes_exhibiciones, ReporteQuery

async def main():
    q = ReporteQuery(fecha_desde="2026-03-01", fecha_hasta="2026-03-31")
    out = {}
    try:
        res = reportes_exhibiciones(3, q, {})
        out["Dist 3"] = len(res)
    except Exception as e:
        out["Dist 3 Error"] = str(e)
        
    try:
        res = reportes_exhibiciones(1, q, {})
        out["Dist 1"] = len(res)
    except Exception as e:
        out["Dist 1 Error"] = str(e)

    with open("test_api_out.json", "w") as f:
        json.dump(out, f)

if __name__ == "__main__":
    asyncio.run(main())
