import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="C:/Users/cigar/OneDrive/Desktop/BOT-SQL/antigravity/CenterMind/.env")

_SECRETS = {}

def get_secret(name: str) -> str:
    # 1. Chequeo de variables de entorno / .env (para entorno local)
    val = os.getenv(name.upper()) or os.getenv(name)
    if val:
        return val
        
    # 2. Caché en memoria de los secrets traídos de Vault (solo intentamos 1 vez)
    if name in _SECRETS:
        return _SECRETS[name]
        
    if getattr(get_secret, "_tried_vault", False):
        return ""
        
    setattr(get_secret, "_tried_vault", True)
    
    # 3. Intentar buscar desde Supabase Vault
    try:
        from supabase import create_client, Client
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if url and key:
            supabase: Client = create_client(url, key)
            # Llamamos al RPC nativo 'leer_secreto_vault' si necesitamos, o asumimos el .env manda en pruebas
            res = supabase.rpc("leer_secreto_vault", {"secret_name": name}).execute()
            _SECRETS[name] = res.data
            return res.data
    except Exception as e:
        pass
        
    return ""
    
def verificar_vault():
    pass
