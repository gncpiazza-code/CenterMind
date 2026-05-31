#!/usr/bin/env python3
"""
Sincroniza grupos.id_vendedor_v2 desde vendedores_telegram_binding (Fuerza de Ventas).

Tras el fix group-first de /stats, no hace falta re-vincular manualmente cada vendedor:
este script propaga los bindings ya guardados en FV hacia la tabla grupos vía apply_group_binding.

Ejecución (desde la raíz del repo):

  export $(grep -v '^#' CenterMind/.env | xargs)
  PYTHONPATH=CenterMind python CenterMind/scripts/backfill_grupos_binding_from_fv.py
  PYTHONPATH=CenterMind python CenterMind/scripts/backfill_grupos_binding_from_fv.py --dist 3
  PYTHONPATH=CenterMind python CenterMind/scripts/backfill_grupos_binding_from_fv.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import sys

from core.helpers import load_active_vendedor_ids
from core.telegram_group_matcher import apply_group_binding
from db import sb

PAGE = 1000

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill_grupos_binding_from_fv")


def _fetch_bindings(dist_id: int | None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    cols = (
        "id_distribuidor,id_vendedor_v2,telegram_group_id,"
        "telegram_user_id,telegram_user_id_secondary"
    )
    while True:
        q = (
            sb.table("vendedores_telegram_binding")
            .select(cols)
            .not_.is_("telegram_group_id", "null")
            .range(offset, offset + PAGE - 1)
        )
        if dist_id is not None:
            q = q.eq("id_distribuidor", dist_id)
        batch = q.execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Backfill grupos.id_vendedor_v2 desde vendedores_telegram_binding (FV)."
    )
    ap.add_argument("--dist", type=int, default=None, help="Filtrar por id_distribuidor")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo listar filas que se procesarían, sin escribir en BD",
    )
    args = ap.parse_args()

    bindings = _fetch_bindings(args.dist)
    logger.info("Filas con telegram_group_id: %d", len(bindings))

    processed = 0
    skipped = 0
    errors = 0
    active_cache: dict[int, set[int]] = {}

    for row in bindings:
        dist_id = int(row["id_distribuidor"])
        vid = int(row["id_vendedor_v2"])
        chat_id = int(row["telegram_group_id"])
        tg_uid = row.get("telegram_user_id")
        tg_uid_sec = row.get("telegram_user_id_secondary")
        if tg_uid is not None:
            tg_uid = int(tg_uid)
        if tg_uid_sec is not None:
            tg_uid_sec = int(tg_uid_sec)

        if dist_id not in active_cache:
            active_cache[dist_id] = load_active_vendedor_ids(dist_id)
        if vid not in active_cache[dist_id]:
            skipped += 1
            logger.debug("skip inactive dist=%s vendor=%s chat=%s", dist_id, vid, chat_id)
            continue

        if args.dry_run:
            processed += 1
            logger.info(
                "[dry-run] dist=%s vendor=%s chat=%s tg=%s tg2=%s",
                dist_id,
                vid,
                chat_id,
                tg_uid,
                tg_uid_sec,
            )
            continue

        try:
            apply_group_binding(
                dist_id,
                chat_id,
                vid,
                source="backfill_fv",
                performed_by="script",
                telegram_user_id=tg_uid,
                telegram_user_id_secondary=tg_uid_sec,
            )
            processed += 1
        except Exception as e:
            errors += 1
            logger.error(
                "error dist=%s vendor=%s chat=%s: %s",
                dist_id,
                vid,
                chat_id,
                e,
            )

    print(
        f"processed={processed} skipped_inactive={skipped} errors={errors} "
        f"total_bindings={len(bindings)} dry_run={args.dry_run}"
    )
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
