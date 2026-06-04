#!/usr/bin/env python3
"""
Compara compradores del mes: batch cartas (snapshot) vs compradores_en_periodo (canónico).
Uso: python scripts/audit_compradores_cartas_vs_canon.py [dist_id] [mes YYYY-MM]
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.objetivos_compradores import compradores_en_periodo
from core.tenant_tables import tenant_table_name
from db import sb
from services.estadisticas_service import (
    _build_vendor_match_indexes,
    _compradores_cids_by_vend_from_parallel,
    _fetch_carta_source_rows,
    _get_fecha_bounds,
)

PAGE = 1000


def _paginate(q_fn):
    rows = []
    offset = 0
    while True:
        batch = q_fn(offset).range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def main() -> None:
    dist_id = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    mes = sys.argv[2] if len(sys.argv) > 2 else "2026-05"
    meses = [mes]
    fd, fh = _get_fecha_bounds(meses)
    fd, fh = fd[:10], fh[:10]

    parallel = _fetch_carta_source_rows(dist_id, meses)
    vend_rows = parallel.get("vendedores") or []
    match_indexes = _build_vendor_match_indexes(vend_rows, dist_id)
    ruta_to_vend: dict[int, int] = {}
    for r in parallel.get("rutas") or []:
        rid, vid = r.get("id_ruta"), r.get("id_vendedor")
        if rid is not None and vid is not None:
            ruta_to_vend[int(rid)] = int(vid)

    batch = _compradores_cids_by_vend_from_parallel(
        dist_id, parallel, set(meses), fd, fh, match_indexes, ruta_to_vend
    )

    t_v = tenant_table_name("vendedores_v2", dist_id)
    vend_all = (
        sb.table(t_v)
        .select("id_vendedor,nombre_erp")
        .eq("id_distribuidor", dist_id)
        .execute()
        .data
        or []
    )

    mismatches = []
    for v in vend_all:
        vid = int(v["id_vendedor"])
        n_batch = len(batch.get(vid, set()))
        try:
            n_canon = len(compradores_en_periodo(dist_id, vid, fd, fh))
        except Exception as e:
            print(f"vendedor {vid}: canon error {e}")
            continue
        if n_batch != n_canon:
            mismatches.append((vid, v.get("nombre_erp"), n_batch, n_canon, n_canon - n_batch))

    print(f"dist={dist_id} mes={mes} vendedores={len(vend_all)}")
    print(f"diffs={len(mismatches)}")
    for vid, nom, nb, nc, delta in sorted(mismatches, key=lambda x: -abs(x[4]))[:25]:
        print(f"  vid={vid} {nom!r}: batch={nb} canon={nc} delta={delta:+d}")


if __name__ == "__main__":
    main()
