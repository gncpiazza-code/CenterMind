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
from supabase import create_client, Client

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL:
    raise RuntimeError("Falta la variable de entorno SUPABASE_URL. Si estás en Railway, agregala en la pestaña Variables del SERVICIO.")
if not SUPABASE_KEY:
    raise RuntimeError("Falta la variable de entorno SUPABASE_KEY. Si estás en Railway, agregala en la pestaña Variables del SERVICIO.")

# Cliente Supabase singleton con parche para HTTP/2
# Forzamos HTTP/1.1 para evitar errores <ConnectionTerminated error_code:9>
import httpx
from postgrest import SyncPostgrestClient

# Opciones personalizadas para el cliente HTTP
client_options = {
    "http2": False,
    "verify": True,
}

sb: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY,
    options={"postgrest_client_timeout": 30}
)

# Parcheamos el cliente postgrest interno para asegurar que no use HTTP2
if hasattr(sb, "postgrest"):
    sb.postgrest.session = httpx.Client(http2=False)
