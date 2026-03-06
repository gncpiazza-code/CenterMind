"""
SHELFY - Script de Migracion de Datos: SQLite -> Supabase PostgreSQL
====================================================================
REQUISITOS:
  pip install supabase

USO:
  1. Primero ejecuta el DDL (supabase_ddl_migration.sql) en Supabase SQL Editor.
  2. Edita las variables SUPABASE_URL y SUPABASE_KEY de abajo con tus claves.
  3. Corre este script:  python migrate_data_to_supabase.py
====================================================================
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import sqlite3
import json
import os
from supabase import create_client

# ══════════════════════════════════════════════════════════
# ⚠️  CONFIGURACIÓN — Completá con tus datos de Supabase
# ══════════════════════════════════════════════════════════
SUPABASE_URL = "https://xjwadmzuuzctxbrvgopx.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "YOUR_SUPABASE_KEY_HERE")
SQLITE_PATH  = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\centermind_2026-03-06_01-27.db"

# ══════════════════════════════════════════════════════════

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
conn = sqlite3.connect(SQLITE_PATH)
conn.row_factory = sqlite3.Row


def migrate_table(table_name: str, columns: list[str], id_col: str | None = None):
    """Lee todas las filas de SQLite y las inserta en Supabase, en bloques de 500."""
    cursor = conn.execute(f"SELECT * FROM [{table_name}]")
    rows = [dict(row) for row in cursor.fetchall()]

    if not rows:
        print(f"  ⏭️  {table_name}: vacía, saltando.")
        return

    # Limpiar campos que no existen en PostgreSQL
    for row in rows:
        # Convertir None a null-compatible y limpiar campos de metadata
        for key in list(row.keys()):
            if row[key] is None:
                del row[key]  # Supabase acepta sin el campo = NULL

    # Insertar en bloques de 500
    BATCH = 500
    total = len(rows)
    for i in range(0, total, BATCH):
        batch = rows[i:i + BATCH]
        try:
            sb.table(table_name).upsert(batch, on_conflict=id_col or "").execute()
            print(f"  ✅  {table_name}: {min(i + BATCH, total)}/{total}")
        except Exception as e:
            print(f"  ❌  {table_name} bloque {i}: {e}")
            # Intentar uno por uno para identificar el registro problemático
            for j, row in enumerate(batch):
                try:
                    sb.table(table_name).insert(row).execute()
                except Exception as e2:
                    print(f"      ⚠️  Fila {i + j}: {e2}")

    print(f"  🏁  {table_name}: {total} filas migradas.")


def main():
    print("=" * 60)
    print("MIGRACIÓN DE DATOS: SQLite → Supabase PostgreSQL")
    print("=" * 60)

    # ── ORDEN ESTRICTO (respetando foreign keys) ──

    print("\n1/10 distribuidores")
    migrate_table("distribuidores",
                  ["id_distribuidor", "nombre_empresa", "token_bot",
                   "ruta_credencial_drive", "id_carpeta_drive", "estado", "admin_telegram_id"],
                  "id_distribuidor")

    print("\n2/10 locations")
    migrate_table("locations",
                  ["location_id", "dist_id", "ciudad", "provincia", "lat", "lon", "label"],
                  "location_id")

    print("\n3/10 clientes")
    migrate_table("clientes",
                  ["id_cliente", "id_distribuidor", "numero_cliente_local",
                   "nombre_fantasia", "location_id", "id_vendedor"],
                  "id_cliente")

    print("\n4/10 grupos")
    migrate_table("grupos",
                  ["telegram_chat_id", "id_distribuidor", "nombre_grupo"],
                  "telegram_chat_id")

    print("\n5/10 integrantes_grupo")
    migrate_table("integrantes_grupo",
                  ["id_integrante", "id_distribuidor", "telegram_user_id",
                   "nombre_integrante", "rol_telegram", "telegram_group_id", "location_id"],
                  "id_integrante")

    print("\n6/10 exhibiciones (4244 registros — puede tardar...)")
    migrate_table("exhibiciones",
                  ["id_exhibicion", "id_distribuidor", "telegram_chat_id",
                   "id_integrante", "id_cliente", "timestamp_subida",
                   "url_foto_drive", "tipo_pdv", "estado", "id_evaluador",
                   "evaluated_at", "comentario_evaluacion", "supervisor_nombre",
                   "telegram_msg_id", "synced_telegram"],
                  "id_exhibicion")

    print("\n7/10 usuarios_portal")
    migrate_table("usuarios_portal",
                  ["id_usuario", "id_distribuidor", "usuario_login", "password", "rol"],
                  "id_usuario")

    print("\n8/10 bonos_config")
    migrate_table("bonos_config",
                  ["id_config", "id_distribuidor", "anio", "mes", "umbral",
                   "monto_bono_fijo", "monto_por_punto", "edicion_bloqueada", "modificado_en"],
                  "id_config")

    print("\n9/10 bonos_ranking")
    migrate_table("bonos_ranking",
                  ["id_ranking", "id_config", "puesto", "premio_si_llego", "premio_si_no_llego"],
                  "id_ranking")

    print("\n10/10 sessions & events (probablemente vacías)")
    migrate_table("sessions",
                  ["session_id", "user_id", "rol", "dist_id", "login_at",
                   "last_seen_at", "ip", "user_agent", "ciudad", "provincia", "activa"],
                  "session_id")
    migrate_table("events",
                  ["event_id", "session_id", "user_id", "ts", "event_type", "page", "metadata"],
                  "event_id")

    print("\n" + "=" * 60)
    print("✅ MIGRACIÓN COMPLETADA.")
    print("   Verificá en Supabase Studio → Table Editor que los datos estén ok.")
    print("=" * 60)

    conn.close()


if __name__ == "__main__":
    main()
