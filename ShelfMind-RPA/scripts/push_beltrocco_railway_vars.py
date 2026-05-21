#!/usr/bin/env python3
"""
Sube CHESS_BELTROCCO_USUARIO y CHESS_BELTROCCO_PASSWORD al servicio RPA en Railway.

Requisitos (una de estas):
  - RAILWAY_API_TOKEN (cuenta) en el entorno o en .env.railway
  - Sesión CLI: railway login && railway link (desde ShelfMind-RPA)

Uso:
  cd ShelfMind-RPA
  set -a && source .env && set +a   # o .env.railway
  python3 scripts/push_beltrocco_railway_vars.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_local_env() -> None:
    for name in (".env.railway", ".env"):
        p = ROOT / name
        if not p.is_file():
            continue
        for raw in p.read_text(encoding="utf-8").splitlines():
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def main() -> None:
    _load_local_env()
    usuario = (
        os.environ.get("CHESS_BELTROCCO_USUARIO")
        or os.environ.get("chess_beltrocco_usuario")
        or ""
    ).strip()
    password = (
        os.environ.get("CHESS_BELTROCCO_PASSWORD")
        or os.environ.get("chess_beltrocco_password")
        or ""
    ).strip()
    if not usuario or not password:
        print(
            "Faltan CHESS_BELTROCCO_USUARIO / CHESS_BELTROCCO_PASSWORD en .env o .env.railway",
            file=sys.stderr,
        )
        sys.exit(1)

    pairs = [
        f"CHESS_BELTROCCO_USUARIO={usuario}",
        f"CHESS_BELTROCCO_PASSWORD={password}",
        # Alias que usa vault_client (minúsculas)
        f"chess_beltrocco_usuario={usuario}",
        f"chess_beltrocco_password={password}",
    ]
    cmd = ["railway", "variable", "set", *pairs]
    print("Ejecutando:", "railway variable set", "(4 variables Beltrocco)")
    r = subprocess.run(cmd, cwd=str(ROOT))
    if r.returncode != 0:
        print(
            "\nSi falló por auth: exportá RAILWAY_API_TOKEN=<token de cuenta> "
            "o ejecutá `railway login` y `railway link` en ShelfMind-RPA.",
            file=sys.stderr,
        )
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
