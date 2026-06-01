#!/usr/bin/env python3
"""
Auditoría de cartas estadísticas con ceros en compradores/bultos.
Produce un reporte CSV/JSON con: dist, vendedor, pdvs, compradores, bultos, ventas_match_pct, erp_sync_alert.

Uso:
  cd CenterMind && PYTHONPATH=. python scripts/audit_estadisticas_ceros.py
  cd CenterMind && PYTHONPATH=. python scripts/audit_estadisticas_ceros.py --dist 1 --meses 2026-05
  cd CenterMind && PYTHONPATH=. python scripts/audit_estadisticas_ceros.py --csv /tmp/audit_ceros.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta, timezone

from db import sb

AR_TZ = timezone(timedelta(hours=-3))
PAGE = 1000


def get_dists_activas() -> list[dict]:
    res = sb.table("distribuidoras").select("id_distribuidor,nombre").execute()
    return res.data or []


def get_meses_default() -> list[str]:
    now = datetime.now(AR_TZ)
    return [(now - timedelta(days=30 * i)).strftime("%Y-%m") for i in range(2)]


def audit_dist(dist_id: int, meses: list[str]) -> list[dict]:
    from services.estadisticas_service import (
        _fetch_carta_source_rows,
        _aggregate_kpis_from_rows,
    )
    source = _fetch_carta_source_rows(dist_id, meses)
    all_raw, _loc = _aggregate_kpis_from_rows(source, meses)
    ventas_meta: dict = all_raw.pop("__ventas_meta__", {})
    ventas_total = ventas_meta.get("ventas_total", 0)
    ventas_unmatched = ventas_meta.get("ventas_unmatched", 0)
    ventas_unmatched_pct = ventas_meta.get("ventas_unmatched_pct", 0.0)
    ventas_match_pct = round(100.0 - ventas_unmatched_pct, 1)

    rows_out = []
    for vid_str, raw in all_raw.items():
        pdvs = int(raw.get("pdvs") or 0)
        if pdvs == 0:
            continue
        compradores = float(raw.get("compradores") or 0)
        bultos_raw = float(raw.get("bultos_raw") or 0)
        nombre = raw.get("__nombre__", vid_str)
        erp_sync_alert = (
            ventas_total >= 100
            and pdvs > 0
            and compradores == 0
            and bultos_raw == 0
            and ventas_unmatched_pct >= 50.0
        )
        rows_out.append({
            "dist_id": dist_id,
            "id_vendedor": vid_str,
            "nombre": nombre,
            "pdvs": pdvs,
            "compradores": int(compradores),
            "bultos": round(bultos_raw, 2),
            "ventas_total_dist": ventas_total,
            "ventas_unmatched_dist": ventas_unmatched,
            "ventas_match_pct": ventas_match_pct,
            "erp_sync_alert": erp_sync_alert,
        })
    # Enriquecer con nombre desde vendedores
    vend_map = {
        str(v.get("id_vendedor") or ""): (v.get("nombre_erp") or "").strip()
        for v in (source.get("vendedores") or [])
    }
    for r in rows_out:
        r["nombre"] = vend_map.get(r["id_vendedor"], r["nombre"])
    return rows_out


def main() -> None:
    parser = argparse.ArgumentParser(description="Auditoría cartas ceros estadísticas")
    parser.add_argument("--dist", type=int, help="Solo esta distribuidora")
    parser.add_argument("--meses", nargs="+", help="Meses YYYY-MM (default: 2 meses recientes)")
    parser.add_argument("--csv", help="Ruta de salida CSV")
    parser.add_argument("--json", dest="json_out", help="Ruta de salida JSON")
    parser.add_argument("--only-alerts", action="store_true", help="Solo cartas con erp_sync_alert=true")
    args = parser.parse_args()

    meses = args.meses or get_meses_default()
    dists = [{"id_distribuidor": args.dist, "nombre": str(args.dist)}] if args.dist else get_dists_activas()

    all_rows: list[dict] = []
    for d in dists:
        dist_id = d["id_distribuidor"]
        dist_nombre = d.get("nombre", str(dist_id))
        print(f"[audit] dist={dist_id} ({dist_nombre}) meses={meses}", file=sys.stderr)
        try:
            rows = audit_dist(dist_id, meses)
            for r in rows:
                r["dist_nombre"] = dist_nombre
            all_rows.extend(rows)
        except Exception as e:
            print(f"[audit] ERROR dist={dist_id}: {e}", file=sys.stderr)

    if args.only_alerts:
        all_rows = [r for r in all_rows if r["erp_sync_alert"]]

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(all_rows, f, indent=2, ensure_ascii=False)
        print(f"[audit] JSON → {args.json_out}")

    fieldnames = [
        "dist_id", "dist_nombre", "id_vendedor", "nombre",
        "pdvs", "compradores", "bultos",
        "ventas_total_dist", "ventas_unmatched_dist", "ventas_match_pct",
        "erp_sync_alert",
    ]
    writer = csv.DictWriter(
        open(args.csv, "w", newline="") if args.csv else sys.stdout,
        fieldnames=fieldnames,
        extrasaction="ignore",
    )
    writer.writeheader()
    writer.writerows(sorted(all_rows, key=lambda r: (r["dist_id"], not r["erp_sync_alert"], r["nombre"])))

    alerts = sum(1 for r in all_rows if r["erp_sync_alert"])
    print(f"\n[audit] Total cartas: {len(all_rows)} | Con ERP sync alert: {alerts}", file=sys.stderr)


if __name__ == "__main__":
    main()
