#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recalcula fecha_ultima_compra / fecha_compra_anterior con regla operativa:
informe de ventas (nomcli = padrón) y, si no hay match válido, padrón sin contaminar por ERP ajeno.

Uso:
  python scripts/recalc_fechas_compra_operativas.py liver
  python scripts/recalc_fechas_compra_operativas.py 5
"""
from __future__ import annotations

import sys

from db import sb
from core.compras_fechas import batch_update_fechas_compra_desde_ventas
from core.tenant_tables import tenant_table_name, load_dist_ids
from services.ventas_ingestion_service import TENANT_DIST_MAP

PAGE = 1000


def _all_erps(dist_id: int) -> list[str]:
    t = tenant_table_name("clientes_pdv_v2", dist_id)
    erps: list[str] = []
    offset = 0
    while True:
        batch = (
            sb.table(t)
            .select("id_cliente_erp")
            .eq("id_distribuidor", dist_id)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for r in batch:
            e = str(r.get("id_cliente_erp") or "").strip()
            if e:
                erps.append(e)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return erps


def main() -> None:
    arg = (sys.argv[1] if len(sys.argv) > 1 else "liver").strip().lower()
    if arg.isdigit():
        dist_id = int(arg)
    else:
        dist_id = TENANT_DIST_MAP.get(arg)
    if not dist_id:
        print(f"tenant desconocido: {arg}")
        sys.exit(1)

    dist_ids = load_dist_ids(sb)
    if dist_id not in dist_ids:
        print(f"dist_id {dist_id} no encontrado")
        sys.exit(1)

    erps = _all_erps(dist_id)
    print(f"dist={dist_id} ERPs={len(erps)} — recalculando fechas…")
    n = batch_update_fechas_compra_desde_ventas(dist_id, erps)
    print(f"actualizados={n}")


if __name__ == "__main__":
    main()
