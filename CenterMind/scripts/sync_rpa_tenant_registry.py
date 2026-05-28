#!/usr/bin/env python3
"""
Sincroniza rpa_consolido_tenants + id_empresa_erp desde el registro canónico.
Imprime matriz de auditoría para probar todos los tenants.

Uso:
  cd CenterMind && python scripts/sync_rpa_tenant_registry.py
  cd CenterMind && python scripts/sync_rpa_tenant_registry.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from core.rpa_tenant_registry import CONSOLIDO_TENANTS, consolido_rows_for_db
from core.tenant_tables import TENANT_TABLE_BLUEPRINTS, tenant_table_name
from db import sb


def _load_distribuidores() -> dict[int, dict]:
    rows = (
        sb.table("distribuidores")
        .select("id_distribuidor,nombre_empresa,estado,id_empresa_erp,id_erp")
        .order("id_distribuidor")
        .execute()
        .data
        or []
    )
    return {int(r["id_distribuidor"]): r for r in rows}


def _load_rpa_db() -> dict[str, dict]:
    rows = (
        sb.table("rpa_consolido_tenants")
        .select("tenant_id,nombre,id_empresa,id_distribuidor,activo,orden")
        .execute()
        .data
        or []
    )
    return {str(r["tenant_id"]): r for r in rows}


def _tenant_tables_ok(dist_id: int) -> str:
    missing = []
    for base in TENANT_TABLE_BLUEPRINTS:
        t = tenant_table_name(base, dist_id)
        try:
            if base == "rutas_v2":
                sb.table(t).select("id_ruta").limit(1).execute()
            else:
                sb.table(t).select("id_distribuidor").limit(1).execute()
        except Exception:
            missing.append(t)
    return "OK" if not missing else f"FALTA {', '.join(missing)}"


def _print_audit() -> None:
    dists = _load_distribuidores()
    rpa_db = _load_rpa_db()

    print("\n=== REGISTRO CANÓNICO Consolido (padrón + informe ventas) ===\n")
    hdr = (
        f"{'tenant_id':<12} {'id_dist':>7} {'id_empresa':>10} "
        f"{'activo':>6} {'en_DB':>6} {'tablas':<8} nombre_shelfy / consolido"
    )
    print(hdr)
    print("-" * len(hdr))

    for row in CONSOLIDO_TENANTS:
        tid = row["tenant_id"]
        did = int(row["id_distribuidor"])
        dist = dists.get(did, {})
        shelfy = (dist.get("nombre_empresa") or "—").strip()
        in_db = tid in rpa_db
        erp_db = (dist.get("id_empresa_erp") or "").strip()
        erp_match = "✓" if erp_db == str(row["id_empresa"]) else f"erp={erp_db or '∅'}"
        tables = _tenant_tables_ok(did) if dist else "sin dist"
        print(
            f"{tid:<12} {did:>7} {row['id_empresa']:>10} "
            f"{str(row.get('activo', True)):>6} {str(in_db):>6} {tables:<8} "
            f"{shelfy} | {row['nombre_consolido']} [{erp_match}]"
        )

    print("\n=== Distribuidores sin fila Consolido (franquicias / test) ===\n")
    mapped = {int(r["id_distribuidor"]) for r in CONSOLIDO_TENANTS}
    for did, d in sorted(dists.items()):
        if did in mapped or did == 1:
            continue
        print(
            f"  dist {did:>2} {d.get('nombre_empresa','')} "
            f"estado={d.get('estado')} erp={d.get('id_empresa_erp') or '—'} "
            f"tablas={_tenant_tables_ok(did)}"
        )

    print("\n=== CHESS (cuentas + ventas) — ver ShelfMind-RPA/lib/chess_tenants_config.py ===\n")
    try:
        rpa_root = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ShelfMind-RPA")
        sys.path.insert(0, rpa_root)
        from lib.chess_tenants_config import CHESS_TENANTS  # noqa: WPS433

        for t in CHESS_TENANTS:
            did = int(t["id_dist"])
            dist = dists.get(did, {})
            url = (t.get("url_base") or "").strip() or "—"
            print(
                f"  {t['id']:<12} dist={did:>2} activo={str(t.get('activo')):>5} "
                f"url={url[:40]} vault={t.get('vault_user','')}"
            )
    except Exception as e:
        print(f"  (no se pudo importar chess_tenants_config: {e})")


def _apply_sync() -> None:
    for row in consolido_rows_for_db():
        sb.table("rpa_consolido_tenants").upsert(
            row,
            on_conflict="tenant_id",
        ).execute()

    from services.erp_identity_sync_service import sync_from_consolido_tenants

    result = sync_from_consolido_tenants()
    print(f"\n✅ rpa_consolido_tenants sincronizado ({len(consolido_rows_for_db())} filas)")
    print(f"✅ distribuidores.id_empresa_erp actualizados: {result['distribuidores_updated']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Upsert rpa_consolido_tenants y sync id_empresa_erp",
    )
    args = parser.parse_args()
    _print_audit()
    if args.apply:
        _apply_sync()
        print("\n--- Post-sync ---")
        _print_audit()


if __name__ == "__main__":
    main()
