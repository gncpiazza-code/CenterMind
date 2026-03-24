import asyncio
import os
import sys

sys.path.append("c:\\Users\\cigar\\OneDrive\\Desktop\\BOT-SQL\\antigravity\\CenterMind")

from db import sb

async def main():
    try:
        distribuidor_id = 3
        fecha_desde = "2026-03-01"
        fecha_hasta = "2026-03-31"
        
        query = sb.table("exhibiciones").select(
            "id_exhibicion, estado, tipo_pdv, supervisor_nombre, comentario_evaluacion, "
            "timestamp_subida, evaluated_at, url_foto_drive, id_integrante, id_cliente"
        )
        query = query.gte("timestamp_subida", f"{fecha_desde}T03:00:00Z")
        query = query.lte("timestamp_subida", f"{fecha_hasta}T23:59:59Z")
        query = query.eq("id_distribuidor", distribuidor_id)
        
        result = query.order("timestamp_subida", desc=True).execute()
        rows = result.data or []
        
        print(f"Dist {distribuidor_id}: Rows count for 2026-03: {len(rows)}")
        
        if len(rows) > 0:
            print("Row 0:", rows[0])
            
        # Test Dist 1 as well
        q2 = sb.table("exhibiciones").select("*").eq("id_distribuidor", 1).gte("timestamp_subida", f"{fecha_desde}T03:00:00Z").execute()
        print(f"Dist 1 Rows count: {len(q2.data)}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
