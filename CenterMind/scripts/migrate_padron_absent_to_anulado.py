#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migra motivo legacy `padron_absent` -> `padron_anulado` en clientes_pdv_v2.

Motivo operativo mismo que marca el tombstone actual: fuera del padrón = no visible
en mapa (alineado a Consolido anulado para métricas y soporte).

Uso:
  cd CenterMind && PYTHONPATH=. python scripts/migrate_padron_absent_to_anulado.py --dry-run
  cd CenterMind && PYTHONPATH=. python scripts/migrate_padron_absent_to_anulado.py
  cd CenterMind && PYTHONPATH=. python scripts/migrate_padron_absent_to_anulado.py --dist 3

Requiere SUPABASE_* en env (Railway/Desktop o ShelfMind-RPA/.env copiado con export).
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "CenterMind"))

from db import sb  # noqa: E402
from core.tenant_tables import load_dist_ids, tenant_table_name  # noqa: E402

BATCH = 400


def _count_absent(dist_id: int) -> int:
    cli_t = tenant_table_name("clientes_pdv_v2", dist_id)
    try:
        res = (
            sb.table(cli_t)
            .select("id_cliente", count="exact")
            .eq("id_distribuidor", dist_id)
            .eq("motivo_inactivo", "padron_absent")
            .limit(0)
            .execute()
        )
        return int(res.count or 0)
    except Exception:
        return 0


def _migrate_dist(dist_id: int) -> int:
    cli_t = tenant_table_name("clientes_pdv_v2", dist_id)
    payload = {
        "motivo_inactivo": "padron_anulado",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    moved = 0
    while True:
        res = (
            sb.table(cli_t)
            .select("id_cliente")
            .eq("id_distribuidor", dist_id)
            .eq("motivo_inactivo", "padron_absent")
            .limit(BATCH)
            .execute()
        )
        ids = [int(r["id_cliente"]) for r in (res.data or [])]
        if not ids:
            break
        moved += len(ids)
        sb.table(cli_t).update(payload).in_("id_cliente", ids).execute()
        sb.table("clientes_pdv_v2").update(payload).in_("id_cliente", ids).execute()
    return moved


def main() -> None:
    ap = argparse.ArgumentParser(description="padron_absent -> padron_anulado")
    ap.add_argument("--dist", type=int, default=None, help="solo este id_distribuidor")
    ap.add_argument("--dry-run", action="store_true", help="solo cuenta, no escribe")
    args = ap.parse_args()

    dists = load_dist_ids(sb)
    if args.dist is not None:
        dists = [d for d in dists if d == args.dist]
        if not dists:
            print(f"No existe distribuidor {args.dist}.")
            sys.exit(1)

    grand = 0
    for d in sorted(dists):
        if args.dry_run:
            n = _count_absent(d)
        else:
            n = _migrate_dist(d)
        if n:
            suffix = " (dry-run, sin escribir)" if args.dry_run else ""
            print(f"dist {d}: {n} filas{suffix}")
        grand += n

    mode = "DRY-RUN — " if args.dry_run else ""
    print(f"{mode}Total filas con padron_absent: {grand}")


if __name__ == "__main__":
    main()
