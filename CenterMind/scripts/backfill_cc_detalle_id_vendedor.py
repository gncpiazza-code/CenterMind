#!/usr/bin/env python3
"""Rellena cc_detalle.id_vendedor cuando el nombre CHESS no coincide con nombre_erp del padrón."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from db import sb  # noqa: E402
from core.helpers import cc_row_matches_vendedor_erp  # noqa: E402
from core.tenant_tables import tenant_table_name, load_dist_ids  # noqa: E402


def backfill_dist(dist_id: int) -> int:
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    vend_rows = (
        sb.table(t_vend)
        .select("id_vendedor, id_vendedor_erp, nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
    ).data or []
    if not vend_rows:
        return 0

    snap = (
        sb.table("cc_detalle")
        .select("fecha_snapshot")
        .eq("id_distribuidor", dist_id)
        .order("fecha_snapshot", desc=True)
        .limit(1)
        .execute()
    )
    if not snap.data:
        return 0
    fecha = snap.data[0]["fecha_snapshot"]

    offset = 0
    updated = 0
    while True:
        batch = (
            sb.table("cc_detalle")
            .select("id, vendedor_nombre, id_vendedor")
            .eq("id_distribuidor", dist_id)
            .eq("fecha_snapshot", fecha)
            .is_("id_vendedor", "null")
            .range(offset, offset + 499)
            .execute()
        ).data or []
        if not batch:
            break
        for row in batch:
            vn = row.get("vendedor_nombre") or ""
            for v in vend_rows:
                if cc_row_matches_vendedor_erp(
                    vn,
                    None,
                    v.get("nombre_erp") or "",
                    id_vendedor=v.get("id_vendedor"),
                    id_vendedor_erp=v.get("id_vendedor_erp"),
                ):
                    sb.table("cc_detalle").update(
                        {"id_vendedor": v["id_vendedor"]}
                    ).eq("id", row["id"]).execute()
                    updated += 1
                    break
        if len(batch) < 500:
            break
        offset += 500
    return updated


def main() -> None:
    total = 0
    for dist_id in load_dist_ids(sb):
        n = backfill_dist(dist_id)
        if n:
            print(f"dist {dist_id}: {n} filas cc_detalle actualizadas")
        total += n
    print(f"Total: {total}")


if __name__ == "__main__":
    main()
