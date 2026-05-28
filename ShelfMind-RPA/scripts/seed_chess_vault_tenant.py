#!/usr/bin/env python3
"""
Carga credenciales CHESS en Supabase Vault (no en .env del repo).

Uso:
  cd ShelfMind-RPA
  python3 scripts/seed_chess_vault_tenant.py hugo_cena --usuario admin --password '***'

Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en CenterMind/.env (solo service key, sin credenciales CHESS).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CM_ENV = ROOT.parent / "CenterMind" / ".env"


def _load_service_env() -> None:
    for p in (CM_ENV, ROOT / ".env"):
        if not p.is_file():
            continue
        for raw in p.read_text(encoding="utf-8").splitlines():
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_KEY"):
                os.environ.setdefault(k, v)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("tenant_id", help="ej. hugo_cena → chess_hugo_cena_usuario")
    ap.add_argument("--usuario", required=True)
    ap.add_argument("--password", required=True)
    args = ap.parse_args()

    _load_service_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or ""
    ).strip()
    if not url or not key:
        print("Faltan SUPABASE_URL / service role key en CenterMind/.env", file=sys.stderr)
        sys.exit(1)

    prefix = f"chess_{args.tenant_id.strip().lower()}"
    names = (f"{prefix}_usuario", f"{prefix}_password")

    from supabase import create_client

    sb = create_client(url, key)

    def save(name: str, value: str) -> bool:
        try:
            sb.rpc(
                "guardar_secreto_vault",
                {"secret_name": name, "secret_value": value},
            ).execute()
            return True
        except Exception as e:
            err = str(e)
            if "guardar_secreto_vault" in err and "Could not find" in err:
                return False
            raise

    if not (
        save(names[0], args.usuario)
        and save(names[1], args.password)
    ):
        print(
            "RPC guardar_secreto_vault no disponible. "
            "Aplicá supabase/migrations/20260528120000_guardar_secreto_vault.sql "
            "o cargá secrets en Vault vía SQL Editor.",
            file=sys.stderr,
        )
        sys.exit(2)

    for name in names:
        check = sb.rpc("leer_secreto_vault", {"secret_name": name}).execute()
        ok = bool(check.data)
        print(f"{'OK' if ok else 'FAIL'} vault:{name}")


if __name__ == "__main__":
    main()
