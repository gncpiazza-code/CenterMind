# -*- coding: utf-8 -*-
"""
Shelfy -- Modulo de conexion a Supabase (reemplaza get_conn() de SQLite)
========================================================================
Usa exclusivamente el cliente REST de Supabase (sin psycopg2).
Para queries complejas con JOINs, creamos funciones RPC en Supabase.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

_CM_DIR = Path(__file__).resolve().parent
_ENV_FILE = _CM_DIR / ".env"


def _bootstrap_env() -> None:
    """
    Orden de carga (sin romper nada en Railway: allí las vars ya vienen del panel).

    1) SHELFY_DOTENV_EXTRA — ruta opcional a un .env suelto (export local).
    2) Primer archivo que exista en ~/Desktop/*railway*.env (copia tipo Railway/RPA).
    3) CenterMind/.env — prioridad (Gemini, overrides; pisa lo anterior).
    4) .env en el directorio de trabajo actual.

    Así podés tener Supabase en el archivo del escritorio y solo GEMINI en CenterMind/.env.
    """
    extra = (os.environ.get("SHELFY_DOTENV_EXTRA") or "").strip()
    if extra:
        p = Path(extra).expanduser()
        if p.is_file():
            load_dotenv(p, override=False)

    desktop = Path.home() / "Desktop"
    # Cualquier export tipo *railway*.env en el Escritorio (nombre exacto da igual)
    for cand in sorted(desktop.glob("*railway*.env")):
        if cand.is_file():
            load_dotenv(cand, override=False)
            break
    else:
        # Nombres fijos habituales si no hubo glob
        for name in (
            "shelfmind-rpa-railway.env",
            "ShelfMind-RPA-railway.env",
            "shelfy-railway.env",
        ):
            cand = desktop / name
            if cand.is_file():
                load_dotenv(cand, override=False)
                break

    if _ENV_FILE.is_file():
        load_dotenv(_ENV_FILE, override=True)
    load_dotenv(override=True)


_bootstrap_env()
from supabase import create_client, Client, ClientOptions
import httpx

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL:
    raise RuntimeError("Falta la variable de entorno SUPABASE_URL. Si estás en Railway, agregala en la pestaña Variables del SERVICIO.")
if not SUPABASE_KEY:
    raise RuntimeError("Falta la variable de entorno SUPABASE_KEY. Si estás en Railway, agregala en la pestaña Variables del SERVICIO.")

# Cliente Supabase singleton con parche para HTTP/2
# Forzamos HTTP/1.1 para evitar errores <ConnectionTerminated error_code:9>
# Balance: meses históricos necesitan >30s, pero 120s bloqueaba la UI ~1 min en timeout.
opts = ClientOptions(postgrest_client_timeout=45)

sb: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY,
    options=opts
)

# Parcheamos el cliente postgrest interno para asegurar que no use HTTP2
if hasattr(sb, "postgrest"):
    # Reemplazamos la sesión postgrest por una que no use HTTP2 conservando la config
    old_session = sb.postgrest.session
    sb.postgrest.session = httpx.Client(
        http2=False,
        base_url=old_session.base_url,
        headers=old_session.headers,
        timeout=httpx.Timeout(45.0, connect=10.0),
    )
