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

# Debug para Railway (se verá en Deploy Logs)
print(f"DEBUG: SUPABASE_URL detected? {'SÍ' if SUPABASE_URL else 'NO'}")
if SUPABASE_URL:
    print(f"DEBUG: URL prefix: {SUPABASE_URL[:10]}...")
print(f"DEBUG: SUPABASE_KEY detected? {'SÍ' if SUPABASE_KEY else 'NO'}")

if not SUPABASE_URL:
    # Mostrar todas las keys disponibles (solo nombres) para diagnosticar
    available_keys = list(os.environ.keys())
    print(f"DEBUG: Available env keys: {available_keys}")
    raise RuntimeError("Falta la variable de entorno SUPABASE_URL. Si estás en Railway, agregala en la pestaña Variables del SERVICIO (no solo en Shared).")
if not SUPABASE_KEY:
    raise RuntimeError("Falta la variable de entorno SUPABASE_KEY. Si estás en Railway, agregala en la pestaña Variables del SERVICIO.")

# Cliente Supabase singleton
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
