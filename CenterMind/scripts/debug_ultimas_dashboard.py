#!/usr/bin/env python3
"""Diagnóstico local de últimas evaluadas + enrich (dashboard carrusel)."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from db import sb
from routers.reportes import (
    _enrich_ultimas_dashboard_rows,
    _fetch_ultimas_evaluadas_rows,
    _build_integrante_vendor_name_map,
    tenant_table_name,
)


def main() -> None:
    dist_id = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    print(f"=== dist={dist_id} n={n} ===\n")

    raw = _fetch_ultimas_evaluadas_rows(dist_id, n)
    print(f"fetch_ultimas: {len(raw)} rows")
    if raw:
        print("RAW[0]:", json.dumps(raw[0], default=str, indent=2))

    vendor_map = _build_integrante_vendor_name_map(dist_id)
    print(f"\nvendor_map size: {len(vendor_map)}")
    if raw:
        iid = raw[0].get("id_integrante")
        print(f"RAW[0] id_integrante={iid} -> vendor_map={vendor_map.get(int(iid)) if iid else None}")

    enriched = _enrich_ultimas_dashboard_rows([dict(r) for r in raw], dist_id)
    print(f"\nenriched: {len(enriched)} rows")
    for i, row in enumerate(enriched):
        print(
            f"  [{i}] ex={row.get('id_exhibicion')} "
            f"vend={row.get('vendedor_erp')!r} nro={row.get('nro_cliente')!r} "
            f"rs={row.get('razon_social')!r} ciudad={row.get('ciudad')!r}"
        )

    # Sample clientes_pdv join for first row
    if raw:
        ex = raw[0]
        t = tenant_table_name("clientes_pdv_v2", dist_id)
        pk = ex.get("id_cliente_pdv") or ex.get("id_cliente")
        nc = ex.get("nro_cliente") or ex.get("numero_cliente_local")
        print(f"\nclientes table: {t}")
        if pk:
            r = sb.table(t).select("*").eq("id_cliente", pk).limit(1).execute()
            print(f"by id_cliente={pk}: {r.data}")
        if nc:
            r2 = (
                sb.table(t)
                .select("id_cliente,id_cliente_erp,nombre_razon_social,localidad")
                .eq("id_cliente_erp", str(nc))
                .limit(1)
                .execute()
            )
            print(f"by id_cliente_erp={nc}: {r2.data}")


if __name__ == "__main__":
    main()
