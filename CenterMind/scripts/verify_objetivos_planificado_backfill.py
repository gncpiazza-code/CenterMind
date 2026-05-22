#!/usr/bin/env python3
"""
verify_objetivos_planificado_backfill.py
Audita que no queden objetivos legacy en estado planificado incorrecto
post-migración 20260522_objetivos_lanzado_at_backfill_v2.
"""
import sys
import os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from db import sb

TZ_AR = timezone(timedelta(hours=-3))
HOY_AR = datetime.now(TZ_AR).date().isoformat()

def main():
    print(f"Auditoría backfill lanzado_at — hoy AR: {HOY_AR}\n")

    # Total objectives
    total = sb.table("objetivos").select("id", count="exact").execute()
    print(f"Total objetivos: {total.count}")

    # With lanzado_at
    con_lanzado = sb.table("objetivos").select("id", count="exact").not_.is_("lanzado_at", "null").execute()
    print(f"Con lanzado_at: {con_lanzado.count}")

    # lanzado_at NULL, no cumplido, fecha_inicio <= hoy (should be 0 after migration for non-ruteo)
    PAGE = 1000
    rows = []
    offset = 0
    while True:
        batch = (
            sb.table("objetivos")
            .select("id,tipo,fecha_inicio,created_at,id_distribuidor")
            .is_("lanzado_at", "null")
            .eq("cumplido", False)
            .lte("fecha_inicio", HOY_AR)
            .neq("tipo", "ruteo")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    print(f"\nObjetivos con lanzado_at NULL + fecha_inicio <= hoy + tipo != ruteo: {len(rows)}")
    if rows:
        print("ALERTA: estos deberían ser 0 post-migración. Muestra:")
        for r in rows[:10]:
            print(f"  id={r['id']} tipo={r['tipo']} dist={r['id_distribuidor']} fecha_inicio={r['fecha_inicio']}")
    else:
        print("OK: ningún objetivo legacy activo queda como planificado incorrecto.")

if __name__ == "__main__":
    main()
