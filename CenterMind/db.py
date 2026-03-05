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

# Intentar cargar .env local si existe (para desarrollo)
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    # En Railway/Producción las variables ya están en el sistema, 
    # pero esto ayuda si se subió un .env a la raíz (no recomendado)
    load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL:
    raise RuntimeError("Falta la variable de entorno SUPABASE_URL. Si estás en Railway, agregala en la pestaña Variables.")
if not SUPABASE_KEY:
    raise RuntimeError("Falta la variable de entorno SUPABASE_KEY. Si estás en Railway, agregala en la pestaña Variables.")

# Cliente Supabase singleton
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
