#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backfill seguro de snapshots portal: cartas Estadísticas + Repaso Comercial (Q1/Q2/C).

Diseñado para correr post-deploy sin colapsar Railway/Supabase:
  - 1 tenant por lote (configurable)
  - pausa entre lotes
  - dry-run para planificar

Uso:
  cd CenterMind
  python scripts/backfill_portal_snapshots.py --dry-run
  python scripts/backfill_portal_snapshots.py --mes 2026-05 --only estadisticas
  python scripts/backfill_portal_snapshots.py --mes 2026-05 --only recap
  python scripts/backfill_portal_snapshots.py --mes 2026-05 --dist 3 --pause-secs 5
  python scripts/backfill_portal_snapshots.py --mes 2026-05 --include-sucursales
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db import sb
from core.recap_period import resolve_period_bounds
from services.estadisticas_service import fetch_sucursales_disponibles
from services.recap_cron_service import _run_recap_for_dist
from services.snapshot_estadisticas_service import (
    get_or_refresh_estadisticas,
    mark_estadisticas_stale,
)

_TZ_AR = ZoneInfo("America/Argentina/Buenos_Aires")
PAGE = 1000


def _today_ar() -> datetime:
    return datetime.now(_TZ_AR)


def _default_mes() -> str:
    return _today_ar().strftime("%Y-%m")


def _list_active_dists(dist_filter: int | None) -> list[int]:
    if dist_filter is not None:
        return [dist_filter]
    ids: list[int] = []
    offset = 0
    while True:
        batch = (
            sb.table("distribuidores")
            .select("id_distribuidor")
            .eq("estado", "activo")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for row in batch:
            try:
                ids.append(int(row["id_distribuidor"]))
            except (TypeError, ValueError):
                continue
        if len(batch) < PAGE:
            break
        offset += PAGE
    return sorted(set(ids))


def _recap_jobs_for_mes(mes: str) -> list[tuple[str, str, str]]:
    return [
        (f"{mes}-Q1", *resolve_period_bounds(f"{mes}-Q1")),
        (f"{mes}-Q2", *resolve_period_bounds(f"{mes}-Q2")),
        (f"{mes}-C", *resolve_period_bounds(f"{mes}-C")),
    ]


def _backfill_estadisticas_dist(
    dist_id: int,
    meses: list[str],
    include_sucursales: bool,
    dry_run: bool,
) -> dict:
    targets: list[str | None] = [None]
    if include_sucursales:
        try:
            targets.extend(fetch_sucursales_disponibles(dist_id))
        except Exception as e:
            print(f"    WARN sucursales dist={dist_id}: {e}")

    ok = 0
    skipped = 0
    errors = 0
    for sucursal in targets:
        label = sucursal or "TODAS"
        meses_csv = ",".join(meses)
        print(f"    estadisticas dist={dist_id} meses={meses_csv} sucursal={label}")
        if dry_run:
            ok += 1
            continue
        try:
            mark_estadisticas_stale(dist_id)
            resp = get_or_refresh_estadisticas(
                dist_id,
                meses,
                sucursal,
                force_refresh=True,
            )
            meta = resp.get("meta") or {}
            n = int(resp.get("total") or len(resp.get("cartas") or []))
            if n == 0:
                skipped += 1
                print(f"      → sin cartas (skip)")
                continue
            ok += 1
            reval = meta.get("revalidating")
            stale = meta.get("stale")
            print(f"      → cartas={n} stale={stale} revalidating={reval}")
        except Exception as e:
            errors += 1
            print(f"      → ERROR: {e}")
    return {"ok": ok, "skipped": skipped, "errors": errors}


def _backfill_recap_dist(dist_id: int, mes: str, dry_run: bool) -> dict:
    ok = 0
    errors = 0
    for periodo_key, desde, hasta in _recap_jobs_for_mes(mes):
        print(f"    recap dist={dist_id} {periodo_key}: {desde} .. {hasta}")
        if dry_run:
            ok += 1
            continue
        try:
            result = _run_recap_for_dist(dist_id, periodo_key, desde, hasta)
            processed = int(result.get("processed") or 0)
            err_n = int(result.get("errors") or 0)
            ok += 1 if err_n == 0 else 0
            errors += err_n
            print(f"      → processed={processed} errors={err_n}")
        except Exception as e:
            errors += 1
            print(f"      → ERROR: {e}")
    return {"ok": ok, "skipped": 0, "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill snapshots portal (Estadísticas + Repaso)")
    parser.add_argument("--mes", default=_default_mes(), help="YYYY-MM base (default: mes AR actual)")
    parser.add_argument(
        "--meses",
        default=None,
        help="CSV YYYY-MM para cartas (default: --mes). Ej: 2026-04,2026-05",
    )
    parser.add_argument("--dist", type=int, default=None, help="Solo un id_distribuidor")
    parser.add_argument(
        "--only",
        choices=("estadisticas", "recap", "all"),
        default="all",
        help="Qué dominio backfillear",
    )
    parser.add_argument(
        "--include-sucursales",
        action="store_true",
        help="Además de TODAS, persistir snapshot por sucursal ERP",
    )
    parser.add_argument("--batch-size", type=int, default=1, help="Tenants por lote (default 1)")
    parser.add_argument("--pause-secs", type=float, default=10.0, help="Pausa entre lotes")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    mes = args.mes.strip()
    meses = [m.strip() for m in (args.meses or mes).split(",") if m.strip()]
    dists = _list_active_dists(args.dist)

    print(f"Backfill portal — mes base={mes} meses cartas={meses}")
    print(f"  tenants={len(dists)} only={args.only} dry_run={args.dry_run}")
    print(f"  batch_size={args.batch_size} pause={args.pause_secs}s")
    if args.include_sucursales:
        print("  include_sucursales=True")

    total_ok = total_skip = total_err = 0
    batch: list[int] = []

    def _flush_batch(batch_ids: list[int]) -> None:
        nonlocal total_ok, total_skip, total_err
        if not batch_ids:
            return
        for dist_id in batch_ids:
            print(f"\n=== dist {dist_id} ===")
            if args.only in ("estadisticas", "all"):
                r = _backfill_estadisticas_dist(
                    dist_id, meses, args.include_sucursales, args.dry_run
                )
                total_ok += r["ok"]
                total_skip += r["skipped"]
                total_err += r["errors"]
            if args.only in ("recap", "all"):
                r = _backfill_recap_dist(dist_id, mes, args.dry_run)
                total_ok += r["ok"]
                total_skip += r["skipped"]
                total_err += r["errors"]
        if not args.dry_run and args.pause_secs > 0:
            print(f"\n… pausa {args.pause_secs}s antes del próximo lote")
            time.sleep(args.pause_secs)

    for dist_id in dists:
        batch.append(dist_id)
        if len(batch) >= max(1, args.batch_size):
            _flush_batch(batch)
            batch = []
    _flush_batch(batch)

    print(
        f"\nDone: ok={total_ok} skipped={total_skip} errors={total_err} "
        f"tenants={len(dists)}"
    )
    return 1 if total_err else 0


if __name__ == "__main__":
    raise SystemExit(main())
