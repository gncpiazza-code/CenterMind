#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auditoría: filas ventas_enriched con IdEmpresa Consolido distinto al tenant.

Uso:
  cd CenterMind && .venv/bin/python scripts/audit_ventas_empresa_isolation.py
  cd CenterMind && .venv/bin/python scripts/audit_ventas_empresa_isolation.py --fecha 2026-06-11
"""
from __future__ import annotations

import argparse
from collections import Counter

from core.rpa_tenant_registry import CONSOLIDO_TENANTS, expected_id_empresa_for_dist
from core.tenant_tables import tenant_table_name, load_dist_ids
from db import sb

PAGE = 1000


def audit_dist(dist_id: int, fecha: str) -> dict:
    expected = expected_id_empresa_for_dist(dist_id)
    t = tenant_table_name("ventas_enriched_v2", dist_id)
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table(t)
            .select("raw_json")
            .eq("id_distribuidor", dist_id)
            .eq("fecha_factura", fecha)
            .eq("anulado", False)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    match = 0
    emp = Counter()
    for r in rows:
        raw = r.get("raw_json") or {}
        ie = str(raw.get("id_empresa") or "").strip()
        ne = str(raw.get("nombre_empresa") or "").strip()
        emp[ne or ie or "?"] += 1
        if expected and ie == expected:
            match += 1

    total = len(rows)
    pct = round(match / total * 100, 1) if total else 0.0
    tenant = next(
        (x["tenant_id"] for x in CONSOLIDO_TENANTS if int(x["id_distribuidor"]) == dist_id),
        str(dist_id),
    )
    return {
        "dist_id": dist_id,
        "tenant": tenant,
        "fecha": fecha,
        "expected_id_empresa": expected,
        "total": total,
        "match": match,
        "pct_match": pct,
        "contaminacion": total - match,
        "empresas_top": emp.most_common(6),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Auditoría IdEmpresa ventas_enriched")
    parser.add_argument("--fecha", default="2026-06-11", help="YYYY-MM-DD")
    args = parser.parse_args()

    dist_ids = sorted(
        int(r["id_distribuidor"])
        for r in CONSOLIDO_TENANTS
        if r.get("activo", True) and int(r["id_distribuidor"]) in load_dist_ids(sb)
    )

    print(f"=== ventas_enriched IdEmpresa vs tenant ({args.fecha}) ===\n")
    for dist_id in dist_ids:
        r = audit_dist(dist_id, args.fecha)
        flag = "OK" if r["pct_match"] >= 99 else "CONTAMINADO"
        print(
            f"[{flag}] d{r['dist_id']:2d} {r['tenant']:10s} "
            f"id_emp={r['expected_id_empresa']} "
            f"match={r['match']}/{r['total']} ({r['pct_match']}%)"
        )
        if r["pct_match"] < 99:
            for name, cnt in r["empresas_top"]:
                print(f"       {cnt:5d}  {name}")
    print("\nLecturas/API con filtro raw_json->>id_empresa ignoran filas ajenas sin borrar histórico.")


if __name__ == "__main__":
    main()
