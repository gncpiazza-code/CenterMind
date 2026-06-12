#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Elimina filas ventas_enriched contaminadas (IdEmpresa / nombre de otro tenant).

Borra por filtro PostgREST (raw_json->>id_empresa / nombre_empresa) — no escaneo full table.

⚠️  DEPRECADO para uso operativo — borró histórico válido (id_empresa Excel ≠ tenant).
    Recuperación: re-correr Informe Ventas RPA por tenant o restore Supabase PITR.
    Avance lee por tabla _d{N}; desglose vendedor usa roster.

Uso (solo auditoría dry-run):
  cd CenterMind && PYTHONPATH=. .venv/bin/python scripts/cleanup_ventas_empresa_contamination.py
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "CenterMind"))

from core.rpa_tenant_registry import (  # noqa: E402
    CONSOLIDO_TENANTS,
    DIST_TO_ID_EMPRESA,
    expected_id_empresa_for_dist,
)
from core.tenant_tables import load_dist_ids, tenant_table_name  # noqa: E402
from db import sb  # noqa: E402

MAX_RETRIES = 5


def _count_filtered(table: str, dist_id: int, *, id_empresa: str | None = None, nombre: str | None = None) -> int:
    q = sb.table(table).select("id", count="exact").eq("id_distribuidor", dist_id).limit(0)
    if id_empresa is not None:
        q = q.filter("raw_json->>id_empresa", "eq", id_empresa)
    if nombre is not None:
        q = q.filter("raw_json->>nombre_empresa", "eq", nombre)
    return int(q.execute().count or 0)


def _delete_filtered(
    table: str,
    dist_id: int,
    *,
    id_empresa: str | None = None,
    nombre: str | None = None,
    dry_run: bool,
    skip_count: bool = False,
) -> int:
    if not skip_count:
        n = _count_filtered(table, dist_id, id_empresa=id_empresa, nombre=nombre)
        if n == 0:
            return 0
        if dry_run:
            return n
    elif dry_run:
        return 0

    q = sb.table(table).delete().eq("id_distribuidor", dist_id)
    if id_empresa is not None:
        q = q.filter("raw_json->>id_empresa", "eq", id_empresa)
    if nombre is not None:
        q = q.filter("raw_json->>nombre_empresa", "eq", nombre)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            q.execute()
            if skip_count:
                return 1
            return n
        except Exception as e:
            msg = str(e).lower()
            if "57014" in msg or "timeout" in msg or "readtimeout" in msg:
                if attempt == MAX_RETRIES:
                    if skip_count:
                        return 0
                    raise
                time.sleep(min(3 * attempt, 15))
                continue
            raise
    return 0


def _foreign_targets(dist_id: int) -> list[tuple[str, str | None, str | None]]:
    """(label, id_empresa, nombre_empresa) ajenos al dist."""
    expected = expected_id_empresa_for_dist(dist_id)
    out: list[tuple[str, str | None, str | None]] = []
    for row in CONSOLIDO_TENANTS:
        if not row.get("activo", True):
            continue
        if int(row["id_distribuidor"]) == int(dist_id):
            continue
        ie = str(row.get("id_empresa") or "").strip()
        nom = str(row.get("nombre_consolido") or "").strip()
        if ie:
            out.append((f"IdEmpresa {ie}", ie, None))
        if nom:
            out.append((f"nombre {nom[:40]}", None, nom))
    if expected:
        out.append(("IdEmpresa vacío + nombre ajeno", "", None))  # handled separately
    return out


def cleanup_dist(dist_id: int, *, dry_run: bool) -> dict:
    expected = expected_id_empresa_for_dist(dist_id)
    tenant = next(
        (r["tenant_id"] for r in CONSOLIDO_TENANTS if int(r["id_distribuidor"]) == dist_id),
        str(dist_id),
    )
    tenant_table = tenant_table_name("ventas_enriched_v2", dist_id)

    if not expected:
        return {"dist_id": dist_id, "tenant": tenant, "skipped": True, "reason": "sin id_empresa"}

    by_target: Counter[str] = Counter()
    del_tenant = 0
    del_base = 0

    foreign_ies = sorted(
        ie
        for d, ie in DIST_TO_ID_EMPRESA.items()
        if int(d) != int(dist_id) and ie and ie != expected
    )
    for ie in foreign_ies:
        try:
            n_t = _delete_filtered(tenant_table, dist_id, id_empresa=ie, dry_run=dry_run)
            n_b = _delete_filtered(
                "ventas_enriched_v2",
                dist_id,
                id_empresa=ie,
                dry_run=dry_run,
                skip_count=True,
            )
        except Exception as e:
            print(f"       WARN delete IdEmpresa {ie} falló: {e}")
            continue
        if n_t:
            by_target[ie] += n_t
        del_tenant += n_t
        if n_b:
            del_base += 1

    # Solo IdEmpresa ajeno — no borrar por nombre_empresa (falsos positivos si id es correcto).

    return {
        "dist_id": dist_id,
        "tenant": tenant,
        "expected_id_empresa": expected,
        "tenant_table": tenant_table,
        "deleted_tenant": del_tenant,
        "deleted_base": del_base,
        "by_target": by_target.most_common(10),
        "dry_run": dry_run,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Cleanup ventas_enriched IdEmpresa contaminado")
    ap.add_argument("--dist", type=int, default=None, help="Solo este id_distribuidor")
    ap.add_argument(
        "--apply",
        action="store_true",
        help="NO USAR en prod — script deprecado (ver docstring)",
    )
    args = ap.parse_args()
    dry_run = not args.apply
    if args.apply:
        print("ERROR: cleanup --apply deshabilitado. Re-ingestar vía RPA o restore Supabase.")
        sys.exit(2)

    dist_ids = sorted(
        int(r["id_distribuidor"])
        for r in CONSOLIDO_TENANTS
        if r.get("activo", True) and int(r["id_distribuidor"]) in load_dist_ids(sb)
    )
    if args.dist is not None:
        if args.dist not in dist_ids:
            print(f"dist {args.dist} no está en registry / distribuidores")
            sys.exit(1)
        dist_ids = [args.dist]

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"=== cleanup ventas_enriched contaminación [{mode}] ===\n")

    grand = 0
    for dist_id in dist_ids:
        r = cleanup_dist(dist_id, dry_run=dry_run)
        if r.get("skipped"):
            print(f"[SKIP] d{dist_id} {r.get('reason')}")
            continue
        n = r["deleted_tenant"]
        grand += n
        action = "borrarían" if dry_run else "borradas"
        base_note = f"+ base sync ({r['deleted_base']} ops)" if r["deleted_base"] else ""
        print(
            f"[{'OK' if n == 0 else 'CLEAN'}] d{r['dist_id']:2d} {r['tenant']:10s} "
            f"id_emp={r['expected_id_empresa']} "
            f"→ {action} {n} filas ({r['tenant_table']}) {base_note}"
        )
        for label, cnt in r["by_target"]:
            print(f"       {cnt:6d}  {label}")

    print(f"\nTotal filas contaminadas (~): {grand}")
    if dry_run:
        print("\nRe-ejecutar con --apply para borrar en Supabase.")
    else:
        print("\nCleanup aplicado. Desplegar API con filtro ingesta antes del próximo ciclo RPA.")


if __name__ == "__main__":
    main()
