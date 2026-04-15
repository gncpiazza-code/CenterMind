#!/usr/bin/env python3
"""
Backfill de perfiles tipo PDV desde histórico de exhibiciones.

Uso:
  cd CenterMind
  python backfill_pdv_tipo_profiles.py --dry-run
  python backfill_pdv_tipo_profiles.py
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

from db import sb

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
BATCH = 1000


def compute_trust(total: int, top: int) -> tuple[str, float]:
    confidence = (top / total) if total > 0 else 0.0
    if total >= 3 and confidence >= 0.75:
        return "high", round(confidence, 4)
    if total >= 2 and confidence >= 0.6:
        return "medium", round(confidence, 4)
    return "low", round(confidence, 4)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("🔎 Leyendo exhibiciones históricas...")
    offset = 0
    grouped: dict[tuple[int, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    total_rows = 0

    while True:
        res = (
            sb.table("exhibiciones")
            .select("id_distribuidor, tipo_pdv, cliente_sombra_codigo, id_cliente")
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        total_rows += len(rows)
        for r in rows:
            dist = r.get("id_distribuidor")
            tipo = (r.get("tipo_pdv") or "").strip()
            key_raw = (r.get("cliente_sombra_codigo") or r.get("id_cliente") or "")
            key = str(key_raw).strip()
            if not dist or not key or not tipo:
                continue
            grouped[(int(dist), key)][tipo] += 1
        if len(rows) < BATCH:
            break
        offset += BATCH

    print(f"📦 Filas leídas: {total_rows}")
    print(f"🧠 Clientes con perfil candidato: {len(grouped)}")

    if args.dry_run:
        preview = list(grouped.items())[:10]
        for (dist, cliente), counts in preview:
            total = sum(counts.values())
            preferido, top = max(counts.items(), key=lambda kv: kv[1])
            trust, conf = compute_trust(total, top)
            print(
                f"  dist={dist} cliente={cliente} tipo={preferido} "
                f"trust={trust} conf={conf} total={total}"
            )
        print("✅ Dry-run finalizado (sin escribir en DB).")
        return

    upserts = 0
    for (dist, cliente), counts in grouped.items():
        total = sum(counts.values())
        preferido, top = max(counts.items(), key=lambda kv: kv[1])
        trust, conf = compute_trust(total, top)
        payload: dict[str, Any] = {
            "id_distribuidor": dist,
            "id_cliente_erp": cliente,
            "tipo_pdv_preferido": preferido,
            "trust_level": trust,
            "confidence": conf,
            "total_observaciones": total,
            "tipo_counts": dict(counts),
            "source": "backfill_exhibiciones",
            "last_seen": datetime.now(AR_TZ).isoformat(),
        }
        (
            sb.table("pdv_tipo_profiles")
            .upsert(payload, on_conflict="id_distribuidor,id_cliente_erp")
            .execute()
        )
        upserts += 1
        if upserts % 500 == 0:
            print(f"  ... upserts: {upserts}")

    print(f"✅ Backfill completado. Perfiles upserted: {upserts}")


if __name__ == "__main__":
    main()

