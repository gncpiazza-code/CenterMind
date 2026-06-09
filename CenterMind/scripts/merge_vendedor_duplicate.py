#!/usr/bin/env python3
"""Fusiona vendedores_v2 duplicados (mismo nombre/sucursal, distinto ERP)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from core.vendedor_merge import merge_vendedor_v2  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Fusionar vendedor_v2 duplicado")
    p.add_argument("--dist-id", type=int, required=True)
    p.add_argument("--keep", type=int, required=True, help="id_vendedor canónico")
    p.add_argument("--drop", type=int, required=True, help="id_vendedor obsoleto")
    p.add_argument("--erp", type=str, default=None, help="ERP vigente tras merge")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    result = merge_vendedor_v2(
        args.dist_id,
        args.keep,
        args.drop,
        new_erp=args.erp,
        dry_run=args.dry_run,
    )
    print(result)


if __name__ == "__main__":
    main()
