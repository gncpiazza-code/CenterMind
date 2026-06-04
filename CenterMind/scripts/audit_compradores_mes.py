#!/usr/bin/env python3
"""Audita compradores del mes: ventas_enriched vs padron por distribuidora."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.tenant_tables import tenant_table_name, load_dist_ids
from db import sb

MES = "2026-05"
DESDE, HASTA = f"{MES}-01", f"{MES}-31"


def norm_erp(erp_id) -> str | None:
    if not erp_id:
        return None
    s = str(erp_id).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return (s.lstrip("0") or "0").upper()


def count_ventas(dist_id: int) -> int:
    t = tenant_table_name("ventas_enriched_v2", dist_id)
    n = 0
    off = 0
    while True:
        batch = (
            sb.table(t)
            .select("id")
            .eq("id_distribuidor", dist_id)
            .eq("anulado", False)
            .gte("fecha_factura", DESDE)
            .lte("fecha_factura", HASTA)
            .range(off, off + 999)
            .execute()
            .data
            or []
        )
        n += len(batch)
        if len(batch) < 1000:
            break
        off += 1000
    return n


def compradores_vendedor(dist_id: int, id_vendedor: int) -> int:
    from routers.supervision import (
        _supervision_route_ids,
        _supervision_clients_by_route,
        _supervision_compradores_mes,
    )

    route_ids = _supervision_route_ids(dist_id, id_vendedor)
    clients = _supervision_clients_by_route(
        dist_id,
        route_ids,
        "id_cliente,id_cliente_erp,fecha_ultima_compra",
    )
    ids, _, _ = _supervision_compradores_mes(
        dist_id, clients, DESDE, HASTA, id_vendedor
    )
    return len(ids)


def main():
    dist_ids = load_dist_ids(sb)
    print(f"Mes {MES}\n")
    for dist_id in dist_ids:
        try:
            t_v = tenant_table_name("vendedores_v2", dist_id)
            vend = (
                sb.table(t_v)
                .select("id_vendedor,nombre_erp")
                .limit(3)
                .execute()
                .data
                or []
            )
        except Exception as e:
            print(f"dist {dist_id}: skip ({e})")
            continue
        nv = count_ventas(dist_id)
        print(f"dist {dist_id}: ventas_enriched rows in month={nv}")
        for v in vend[:2]:
            vid = v["id_vendedor"]
            n_comp = compradores_vendedor(dist_id, int(vid))
            print(f"  vendedor {vid} ({v.get('nombre_erp')}): compradores_mes={n_comp}")


if __name__ == "__main__":
    main()
