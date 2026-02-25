#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Script para diagnosticar la tabla de distribuidores"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "base_datos" / "centermind.db"

print(f"[DIAG] Diagnosticando: {DB_PATH}")
print()

try:
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()

    # Listar todas las tablas
    print("[TABLAS]")
    tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    for t in tables:
        print(f"  - {t[0]}")
    print()

    # Info de la tabla distribuidores
    print("[ESTRUCTURA DE 'distribuidores']")
    cols = c.execute("PRAGMA table_info(distribuidores)").fetchall()
    for col in cols:
        print(f"  {col[1]:20} {col[2]:15} nullable={col[3]}")
    print()

    # Contenido actual
    print("[DATOS EN 'distribuidores']")
    rows = c.execute("SELECT * FROM distribuidores").fetchall()
    print(f"  Total de filas: {len(rows)}")
    for row in rows:
        print(f"  {row}")
    print()

    # Probar la consulta original
    print("[CONSULTA ORIGINAL - CON ALIAS PROBLEMATICOS]")
    try:
        c.row_factory = sqlite3.Row
        result = c.execute(
            "SELECT id_distribuidor id, nombre_empresa nombre, token_bot,"
            " id_carpeta_drive drive, _telegram_id _id, estado"
            " FROM distribuidores ORDER BY nombre_empresa"
        ).fetchall()
        print(f"  OK - Resultado: {len(result)} filas")
        for r in result:
            print(f"    {dict(r)}")
    except Exception as e:
        print(f"  ERROR: {e}")
    print()

    # Probar consulta simple
    print("[CONSULTA SIMPLE - SIN ALIAS CONFLICTIVOS]")
    try:
        c.row_factory = sqlite3.Row
        result = c.execute(
            "SELECT id_distribuidor, nombre_empresa, token_bot, id_carpeta_drive, _telegram_id, estado"
            " FROM distribuidores ORDER BY nombre_empresa"
        ).fetchall()
        print(f"  OK - Resultado: {len(result)} filas")
        for r in result:
            print(f"    {dict(r)}")
    except Exception as e:
        print(f"  ERROR: {e}")

    conn.close()

except Exception as e:
    print(f"ERROR GENERAL: {e}")
