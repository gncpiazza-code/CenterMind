#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publica un APK SHELFYAPP en Supabase Storage + vendedor_app_releases.

Uso:
  cd CenterMind
  python scripts/publish_mobile_release.py \\
    --apk ../shelfy-mobile/build/app/outputs/flutter-apk/app-tabaco-release.apk \\
    --flavor tabaco \\
    --version-name 1.0.3 \\
    --build-number 8 \\
    --changelog "Patrón cartera + actualización in-app"

Requiere CenterMind/.env con SUPABASE_URL y SUPABASE_KEY (service role).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db import sb  # noqa: E402
from services.vendedor_app_release_service import publish_release_apk  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Publicar release APK SHELFYAPP")
    parser.add_argument("--apk", required=True, help="Ruta al .apk")
    parser.add_argument("--flavor", default="tabaco")
    parser.add_argument("--version-name", required=True)
    parser.add_argument("--build-number", type=int, required=True)
    parser.add_argument("--changelog", default="")
    parser.add_argument("--mandatory", action="store_true")
    parser.add_argument("--min-supported-build", type=int, default=None)
    args = parser.parse_args()

    apk_path = Path(args.apk).expanduser().resolve()
    if not apk_path.is_file():
        print(f"APK no encontrado: {apk_path}", file=sys.stderr)
        return 1

    body = apk_path.read_bytes()
    result = publish_release_apk(
        sb,
        flavor=args.flavor,
        version_name=args.version_name,
        build_number=args.build_number,
        apk_bytes=body,
        changelog=args.changelog,
        mandatory=args.mandatory,
        min_supported_build=args.min_supported_build,
        published_by="publish_mobile_release.py",
    )
    print("OK release publicado:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
