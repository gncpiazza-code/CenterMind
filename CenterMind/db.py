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

def _shield_timeouts() -> tuple[int, httpx.Timeout]:
    """Timeouts dinámicos según estado del escudo (fail-fast bajo estrés)."""
    try:
        from core.supabase_shield import shield

        total = shield.httpx_timeout_seconds()
        postgrest = shield.postgrest_timeout_seconds()
    except Exception:
        total, postgrest = 60.0, 45
    return postgrest, httpx.Timeout(total, connect=min(15.0, total / 3))


def _patch_httpx_session(client: httpx.Client) -> httpx.Client:
    """HTTP/1.1 + timeout acorde al escudo: evita workers colgados."""
    _, timeout = _shield_timeouts()
    return httpx.Client(
        http2=False,
        base_url=client.base_url,
        headers=client.headers,
        timeout=timeout,
    )


def refresh_supabase_client_timeouts() -> None:
    """Reaplica timeouts tras probe del escudo (llamar desde job periódico)."""
    postgrest_s, _ = _shield_timeouts()
    if hasattr(sb, "postgrest"):
        sb.postgrest.session = _patch_httpx_session(sb.postgrest.session)
        if hasattr(sb.postgrest, "timeout"):
            sb.postgrest.timeout = postgrest_s
    if hasattr(sb, "storage") and hasattr(sb.storage, "session"):
        sb.storage.session = _patch_httpx_session(sb.storage.session)


# Cliente Supabase singleton con parche para HTTP/2
# Forzamos HTTP/1.1 para evitar errores <ConnectionTerminated error_code:9>
_postgrest_timeout, _http_timeout = _shield_timeouts()
opts = ClientOptions(postgrest_client_timeout=_postgrest_timeout)

sb: Client = create_client(
    SUPABASE_URL,
    SUPABASE_KEY,
    options=opts,
)

# Parcheamos postgrest y storage: el parche original solo cubría RPC/REST, no Storage.
if hasattr(sb, "postgrest"):
    sb.postgrest.session = _patch_httpx_session(sb.postgrest.session)

if hasattr(sb, "storage") and hasattr(sb.storage, "session"):
    sb.storage.session = _patch_httpx_session(sb.storage.session)
