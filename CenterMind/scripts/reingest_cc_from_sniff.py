#!/usr/bin/env python3
"""
Re-ingesta CC desde un sniff JSONL (captura API CHESS) usando el parser corregido.
Uso:
  python scripts/reingest_cc_from_sniff.py \\
    --jsonl ../ShelfMind-RPA/logs/cuentas_v2_capture/sniff_cuentas_beltrocco_20260513_180204.jsonl \\
    --dist-id 11 --fecha 2026-05-13
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO / "ShelfMind-RPA"))

from db import sb  # noqa: E402
from core.helpers import _enrich_and_store_cc  # noqa: E402
from motores.chess_cuentas_v2.json_heuristic import api_rows_to_datos  # noqa: E402


def _load_rows(jsonl: Path) -> list[dict]:
    rows = []
    for line in jsonl.open(encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        j = o.get("json") or {}
        grid = j.get("ttsaldototaldeudores")
        if grid:
            rows = grid
            break
    if not rows:
        raise SystemExit(f"No se encontró ttsaldototaldeudores en {jsonl}")
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", required=True, type=Path)
    ap.add_argument("--dist-id", required=True, type=int)
    ap.add_argument("--fecha", required=True, help="YYYY-MM-DD")
    ap.add_argument("--tenant-id", default=None)
    args = ap.parse_args()

    rows = _load_rows(args.jsonl)
    datos = api_rows_to_datos(rows)
    if not datos:
        raise SystemExit("api_rows_to_datos devolvió None")

    detalle = datos.get("detalle_cuentas") or []
    with_buckets = sum(
        1
        for r in detalle
        if any((r.get(k) or 0) > 0 for k in (
            "deuda_7_dias", "deuda_15_dias", "deuda_30_dias",
            "deuda_60_dias", "deuda_mas_60_dias",
        ))
    )
    print(f"Filas: {len(detalle)}, con algún bucket > 0: {with_buckets}")

    saved = _enrich_and_store_cc(args.dist_id, args.fecha, detalle)
    print(f"cc_detalle guardados: {saved}")

    tenant = args.tenant_id or f"dist_{args.dist_id}"
    payload = {
        "id_distribuidor": args.dist_id,
        "tenant_id": tenant,
        "fecha": args.fecha,
        "data": datos,
    }
    existing = (
        sb.table("cuentas_corrientes_data")
        .select("id")
        .eq("id_distribuidor", args.dist_id)
        .eq("fecha", args.fecha)
        .limit(1)
        .execute()
    )
    if existing.data:
        sb.table("cuentas_corrientes_data").update({"data": datos}).eq(
            "id_distribuidor", args.dist_id
        ).eq("fecha", args.fecha).execute()
    else:
        sb.table("cuentas_corrientes_data").insert(payload).execute()
    print("cuentas_corrientes_data actualizado")


if __name__ == "__main__":
    main()
