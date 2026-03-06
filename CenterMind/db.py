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

# Cliente Supabase singleton
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
