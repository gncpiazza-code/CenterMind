#!/usr/bin/env python3
"""
Carga chess_beltrocco_usuario / chess_beltrocco_password en Supabase Vault.

1) Si existe RPC guardar_secreto_vault → usa Supabase REST.
2) Si no → imprime SQL para pegar en Supabase → SQL Editor.

Uso:
  cd ShelfMind-RPA
  set -a && source .env && set +a
  python3 scripts/seed_beltrocco_vault.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_env() -> None:
    for name in (".env",):
        p = ROOT / name
        if not p.is_file():
            continue
        for raw in p.read_text(encoding="utf-8").splitlines():
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k:
                os.environ.setdefault(k, v)


def _sql_escape(val: str) -> str:
    return val.replace("'", "''")


def main() -> None:
    _load_env()
    usuario = os.environ.get("CHESS_BELTROCCO_USUARIO", "").strip()
    password = os.environ.get("CHESS_BELTROCCO_PASSWORD", "").strip()
    if not usuario or not password:
        print("Faltan CHESS_BELTROCCO_* en ShelfMind-RPA/.env", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or ""
    ).strip()
    if not url or not key:
        print("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

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

    if save("chess_beltrocco_usuario", usuario) and save("chess_beltrocco_password", password):
        u = sb.rpc("leer_secreto_vault", {"secret_name": "chess_beltrocco_usuario"}).execute()
        print("Vault OK — chess_beltrocco_usuario leído:", bool(u.data))
        return

    u_esc = _sql_escape(usuario)
    p_esc = _sql_escape(password)
    sql = f"""-- Pegar en Supabase → SQL Editor (una sola corrida)
-- Requiere extensión vault habilitada

DO $$
DECLARE
  sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = 'chess_beltrocco_usuario' LIMIT 1;
  IF sid IS NOT NULL THEN
    PERFORM vault.update_secret(sid, '{u_esc}', 'chess_beltrocco_usuario', 'CHESS Beltrocco usuario');
  ELSE
    PERFORM vault.create_secret('{u_esc}', 'chess_beltrocco_usuario', 'CHESS Beltrocco usuario');
  END IF;

  SELECT id INTO sid FROM vault.secrets WHERE name = 'chess_beltrocco_password' LIMIT 1;
  IF sid IS NOT NULL THEN
    PERFORM vault.update_secret(sid, '{p_esc}', 'chess_beltrocco_password', 'CHESS Beltrocco password');
  ELSE
    PERFORM vault.create_secret('{p_esc}', 'chess_beltrocco_password', 'CHESS Beltrocco password');
  END IF;
END $$;
"""
    out = ROOT / "sql" / "seed_beltrocco_vault_runonce.sql"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(sql, encoding="utf-8")
    print(
        "RPC guardar_secreto_vault no existe aún.\n"
        f"SQL generado (no commitear): {out}\n"
        "Supabase → SQL Editor → pegar y Run.\n"
        "O aplicá primero la migración 20260521130000_guardar_secreto_vault.sql y volvé a ejecutar este script.",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
