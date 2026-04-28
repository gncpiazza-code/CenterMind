#!/usr/bin/env python3
"""
Lee ShelfMind-RPA/.env.railway (sin comentarios ni líneas vacías) y ejecuta
`railway variable set K=V ...` en un solo batch.

Requisitos:
  - Tener el CLI: npx @railway/cli@latest
  - En la carpeta ShelfMind-RPA haber hecho: npx @railway/cli@latest link
  - Tener creado el servicio (mismo directorio / Root Directory = ShelfMind-RPA)

Uso (desde ShelfMind-RPA):
  python3 scripts/push_railway_env.py
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.railway"

RE_LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")

# No subir al servicio: son solo para el CLI en tu Mac (no van al contenedor)
_SKIP_SERVICE = frozenset({"RAILWAY_API_TOKEN", "RAILWAY_TOKEN"})


def parse_env() -> list[str]:
    if not ENV_FILE.is_file():
        print(f"Falta {ENV_FILE.name}. Copiá .env.railway.example y completalo.", file=sys.stderr)
        sys.exit(1)
    args: list[str] = []
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        m = RE_LINE.match(s)
        if not m:
            print(f"Línea ignorada (formato raro): {raw[:60]!r}", file=sys.stderr)
            continue
        key, val = m.group(1), m.group(2)
        if not val:
            print(f"Omitido (vacío): {key}", file=sys.stderr)
            continue
        if key in _SKIP_SERVICE:
            print(f"Omitido (solo CLI local, no al servicio): {key}", file=sys.stderr)
            continue
        args.append(f"{key}={val}")
    if not args:
        print("No hay variables con valor. Completá .env.railway", file=sys.stderr)
        sys.exit(1)
    return args


def main() -> None:
    os.chdir(ROOT)
    pairs = parse_env()
    cmd = [
        "npx",
        "--yes",
        "@railway/cli@latest",
        "variable",
        "set",
        *pairs,
    ]
    print("Ejecutando:", " ".join(cmd[:4]), f"... ({len(pairs)} variables)", flush=True)
    r = subprocess.run(cmd, cwd=str(ROOT))
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
