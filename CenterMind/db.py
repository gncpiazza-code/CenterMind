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
load_dotenv()
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
opts = ClientOptions(postgrest_client_timeout=30)

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
        timeout=old_session.timeout
    )
