# -*- coding: utf-8 -*-
import sqlite3
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Entorno Sandbox: Todo ocurre en la misma carpeta
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "centermind.db"
BACKUP_DIR = BASE_DIR / "backups"

def backup_db():
    if not DB_PATH.exists():
        print(f"❌ ERROR: No se encontró 'centermind.db' en {BASE_DIR}")
        print("Asegúrate de haber copiado tu base de datos a esta carpeta.")
        sys.exit(1)
        
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"centermind_pre_migracion_{timestamp}.db"
    
    shutil.copy2(DB_PATH, backup_path)
    print(f"🛡️  Backup de sandbox creado en: {backup_path}")

def migrar_esquema():
    print("🚀 Iniciando migración estructural en el Sandbox...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA foreign_keys = OFF;")
        cursor.execute("BEGIN TRANSACTION;")

        # 1. TABLA GRUPOS
        print("   ├─ Creando tabla 'grupos'...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grupos (
                telegram_chat_id INTEGER PRIMARY KEY,
                id_distribuidor INTEGER NOT NULL,
                nombre_grupo TEXT,
                FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor)
            )
        """)

        # 2. TABLA CLIENTES
        print("   ├─ Creando tabla 'clientes'...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clientes (
                id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
                id_distribuidor INTEGER NOT NULL,
                numero_cliente_local TEXT NOT NULL,
                nombre_fantasia TEXT,
                UNIQUE(id_distribuidor, numero_cliente_local),
                FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor)
            )
        """)

        # 3. TABLA EXHIBICIONES V2
        print("   ├─ Estructurando 'exhibiciones_v2'...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS exhibiciones_v2 (
                id_exhibicion INTEGER PRIMARY KEY AUTOINCREMENT,
                id_distribuidor INTEGER NOT NULL,
                telegram_chat_id INTEGER,
                id_integrante INTEGER NOT NULL,
                id_cliente INTEGER,
                timestamp_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
                url_foto_drive TEXT NOT NULL,
                tipo_pdv TEXT,
                estado TEXT DEFAULT 'Pendiente', 
                id_evaluador INTEGER,
                evaluated_at DATETIME,
                comentario_evaluacion TEXT,
                supervisor_nombre TEXT,
                telegram_msg_id INTEGER,
                synced_telegram INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor),
                FOREIGN KEY(id_integrante) REFERENCES integrantes_grupo(id_integrante),
                FOREIGN KEY(id_evaluador) REFERENCES usuarios_portal(id_usuario),
                FOREIGN KEY(telegram_chat_id) REFERENCES grupos(telegram_chat_id),
                FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente)
            )
        """)

        # 4. EXTRACCIÓN Y POBLADO
        print("   ├─ Extrayendo Grupos y Clientes históricos...")
        cursor.execute("""
            INSERT OR IGNORE INTO grupos (telegram_chat_id, id_distribuidor, nombre_grupo)
            SELECT DISTINCT telegram_group_id, id_distribuidor, nombre_grupo 
            FROM integrantes_grupo 
            WHERE telegram_group_id IS NOT NULL
        """)

        cursor.execute("""
            INSERT OR IGNORE INTO clientes (id_distribuidor, numero_cliente_local)
            SELECT DISTINCT id_distribuidor, numero_cliente_local
            FROM exhibiciones
            WHERE numero_cliente_local IS NOT NULL
        """)

        # 5. MIGRACIÓN DEL HISTORIAL
        print("   ├─ Transfiriendo historial de exhibiciones...")
        cursor.execute("""
            INSERT INTO exhibiciones_v2 (
                id_exhibicion, id_distribuidor, telegram_chat_id, id_integrante, 
                id_cliente, timestamp_subida, url_foto_drive, tipo_pdv, estado, 
                id_evaluador, evaluated_at, comentario_evaluacion, supervisor_nombre, 
                telegram_msg_id, synced_telegram
            )
            SELECT 
                e.id_exhibicion, e.id_distribuidor, 
                COALESCE(e.telegram_chat_id, e.id_grupo), 
                e.id_integrante, c.id_cliente, e.timestamp_subida, e.url_foto_drive, 
                e.comentarios_telegram, e.estado, e.id_evaluador, 
                COALESCE(e.evaluated_at, e.timestamp_evaluacion), 
                COALESCE(e.comentarios, e.comentarios_evaluador), 
                e.supervisor_nombre, e.telegram_msg_id, e.synced_telegram
            FROM exhibiciones e
            LEFT JOIN clientes c ON e.id_distribuidor = c.id_distribuidor 
                                AND e.numero_cliente_local = c.numero_cliente_local
        """)

        # 6. ÍNDICES DE RENDIMIENTO
        print("   ├─ Inyectando índices de rendimiento...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_exh_estado ON exhibiciones_v2(estado)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_exh_fecha ON exhibiciones_v2(timestamp_subida)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_exh_chat ON exhibiciones_v2(telegram_chat_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cliente_dist ON clientes(id_distribuidor, numero_cliente_local)")

        # 7. PURGA
        print("   ├─ Limpiando basura técnica...")
        cursor.execute("DROP TABLE IF EXISTS integrantes_grupo_new")
        cursor.execute("DROP TABLE exhibiciones")
        cursor.execute("ALTER TABLE exhibiciones_v2 RENAME TO exhibiciones")
        
        try:
            cursor.execute("ALTER TABLE integrantes_grupo DROP COLUMN nombre_grupo")
        except sqlite3.OperationalError:
            pass 

        cursor.execute("COMMIT;")
        cursor.execute("PRAGMA foreign_keys = ON;")
        print("\n✅ ÉXITO: Sandbox reestructurado correctamente.")

    except Exception as e:
        cursor.execute("ROLLBACK;")
        print(f"\n❌ ERROR: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    backup_db()
    migrar_esquema()