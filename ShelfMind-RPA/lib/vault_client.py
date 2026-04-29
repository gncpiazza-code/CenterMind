import os
from dotenv import load_dotenv

import pathlib
_ENV_CANDIDATES = [
    pathlib.Path(__file__).parent.parent.parent / "CenterMind" / ".env",  # repo/CenterMind/.env
    pathlib.Path(__file__).parent.parent / ".env",                         # repo/ShelfMind-RPA/.env
    pathlib.Path.home() / ".shelfy.env",                                   # ~/.shelfy.env
]
for _p in _ENV_CANDIDATES:
    if _p.exists():
        load_dotenv(dotenv_path=str(_p))
        break

_SECRETS = {}


def _get_supabase_url() -> str:
    return (
        os.getenv("SUPABASE_URL")
        or os.getenv("supabase_url")
        or ""
    ).strip()


def _get_supabase_key() -> str:
    return (
        os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("supabase_key")
        or ""
    ).strip()


def _coerce_secret_value(raw):
    """Soporta RPCs que retornan string, dict o lista."""
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, dict):
        for k in ("leer_secreto_vault", "secret", "value", "secret_value"):
            v = raw.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""
    if isinstance(raw, list) and raw:
        # Formato común: [{"leer_secreto_vault": "..."}]
        return _coerce_secret_value(raw[0])
    return ""

def get_secret(name: str) -> str:
    # 1. Chequeo de variables de entorno / .env (p. ej. SUPABASE_KEY sin SERVICE_KEY)
    val = os.getenv(name.upper()) or os.getenv(name)
    if val:
        return val.strip()
        
    # 2. Caché en memoria de los secrets traídos de Vault
    if name in _SECRETS:
        return _SECRETS[name]
    
    # 3. Intentar buscar desde Supabase Vault
    try:
        from supabase import create_client, Client
        url = _get_supabase_url()
        key = _get_supabase_key()
        if url and key:
            supabase: Client = create_client(url, key)
            # Llamamos al RPC nativo de vault.
            res = supabase.rpc("leer_secreto_vault", {"secret_name": name}).execute()
            secret = _coerce_secret_value(getattr(res, "data", None))
            if secret:
                _SECRETS[name] = secret
                return secret
    except Exception as e:
        print(f"Error vault {name}: {e}")

    return ""
    
def verificar_vault() -> bool:
    """Retorna True si hay acceso potencial a credenciales por env/vault."""
    # Al menos URL+KEY para vault, o credenciales CHESS directas en env.
    if _get_supabase_url() and _get_supabase_key():
        return True
    return any(k.startswith("CHESS_") for k in os.environ.keys())
