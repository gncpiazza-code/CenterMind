#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auditoría: PDVs con ventas en informe sin match de nombre al padrón."""
from __future__ import annotations

from collections import defaultdict

from db import sb
from core.cliente_nombre_match import cliente_nombre_coincide_padron
from core.tenant_tables import tenant_table_name, load_dist_ids
from services.ventas_ingestion_service import TENANT_DIST_MAP

PAGE = 1000
TENANTS = {2: "real", 3: "tabaco", 4: "aloma", 5: "liver"}


def audit_dist(dist_id: int) -> dict:
    t_p = tenant_table_name("clientes_pdv_v2", dist_id)
    t_v = tenant_table_name("ventas_enriched_v2", dist_id)
    padron: dict[str, dict] = {}
    offset = 0
    while True:
        batch = (
            sb.table(t_p)
            .select("id_cliente_erp,nombre_fantasia,nombre_razon_social,fecha_ultima_compra")
            .eq("id_distribuidor", dist_id)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for r in batch:
            erp = str(r.get("id_cliente_erp") or "").strip()
            if erp:
                padron[erp] = r
        if len(batch) < PAGE:
            break
        offset += PAGE

    ventas_por_erp: dict[str, list[str]] = defaultdict(list)
    offset = 0
    while True:
        batch = (
            sb.table(t_v)
            .select("id_cliente_erp,nombre_cliente,importe_final,anulado")
            .eq("id_distribuidor", dist_id)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for r in batch:
            if r.get("anulado") or float(r.get("importe_final") or 0) < 0:
                continue
            erp = str(r.get("id_cliente_erp") or "").strip()
            if erp:
                ventas_por_erp[erp].append(str(r.get("nombre_cliente") or ""))
        if len(batch) < PAGE:
            break
        offset += PAGE

    sin_match = 0
    activo_falso = 0
    ejemplos: list[tuple] = []
    for erp, nombres in ventas_por_erp.items():
        p = padron.get(erp)
        if not p:
            continue
        ok = any(
            cliente_nombre_coincide_padron(
                n,
                nombre_fantasia=p.get("nombre_fantasia"),
                nombre_razon_social=p.get("nombre_razon_social"),
            )
            for n in set(nombres)
        )
        if not ok:
            sin_match += 1
            fuc = str(p.get("fecha_ultima_compra") or "")[:10]
            if fuc >= "2026-05-02":  # ~30d desde 2026-06-01
                activo_falso += 1
            if len(ejemplos) < 5:
                ejemplos.append(
                    (erp, p.get("nombre_fantasia"), fuc, " | ".join(sorted(set(nombres))[:3]))
                )

    return {
        "dist_id": dist_id,
        "tenant": TENANTS.get(dist_id, str(dist_id)),
        "pdvs_padron": len(padron),
        "erps_con_ventas": len(ventas_por_erp),
        "pdvs_sin_match_nombre": sin_match,
        "activos_mapa_potencialmente_falsos": activo_falso,
        "ejemplos": ejemplos,
    }


def main() -> None:
    for dist_id in sorted(TENANTS):
        if dist_id not in load_dist_ids(sb):
            continue
        r = audit_dist(dist_id)
        print(
            f"{r['tenant']} (d{dist_id}): sin_match={r['pdvs_sin_match_nombre']} "
            f"activos_falsos~={r['activos_mapa_potencialmente_falsos']} "
            f"(ventas ERPs={r['erps_con_ventas']} padron={r['pdvs_padron']})"
        )
        for ex in r["ejemplos"]:
            print(f"  ej {ex[0]} padron={ex[1]!r} fuc={ex[2]} informe={ex[3]!r}")


if __name__ == "__main__":
    main()
