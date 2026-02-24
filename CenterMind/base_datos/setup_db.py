import sqlite3
import os

def crear_base_de_datos():
    # Nos aseguramos de que la base de datos se guarde en la carpeta "base_datos"
    ruta_db = os.path.join('base_datos', 'centermind.db')
    
    # Si la carpeta no existe, la crea
    if not os.path.exists('base_datos'):
        os.makedirs('base_datos')

    conexion = sqlite3.connect(ruta_db)
    cursor = conexion.cursor()

    # TABLA 1: DISTRIBUIDORES (Tus clientes)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS distribuidores (
            id_distribuidor INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_empresa TEXT UNIQUE NOT NULL,
            token_bot TEXT UNIQUE NOT NULL,
            ruta_credencial_drive TEXT, 
            id_carpeta_drive TEXT,
            estado TEXT DEFAULT 'activo'
        )
    ''')

    # TABLA 2: USUARIOS_PORTAL (Los que usan la PC / Evaluadores)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios_portal (
            id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
            id_distribuidor INTEGER NOT NULL,
            usuario_login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            rol TEXT NOT NULL, 
            FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor)
        )
    ''')

    # TABLA 3: INTEGRANTES_GRUPO (Los que usan Telegram / Vendedores, Observadores)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS integrantes_grupo (
            id_integrante INTEGER PRIMARY KEY AUTOINCREMENT,
            id_distribuidor INTEGER NOT NULL,
            telegram_user_id INTEGER NOT NULL,
            nombre_integrante TEXT NOT NULL,
            rol_telegram TEXT DEFAULT 'vendedor',
            telegram_group_id INTEGER,
            nombre_grupo TEXT,
            FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor)
        )
    ''')

    # TABLA 4: EXHIBICIONES (El historial absoluto)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exhibiciones (
            id_exhibicion INTEGER PRIMARY KEY AUTOINCREMENT,
            id_distribuidor INTEGER NOT NULL,
            id_grupo INTEGER,
            id_integrante INTEGER NOT NULL,
            numero_cliente_local TEXT,
            timestamp_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
            url_foto_drive TEXT NOT NULL,
            comentarios_telegram TEXT,
            estado TEXT DEFAULT 'Pendiente', 
            id_evaluador INTEGER,
            timestamp_evaluacion DATETIME,
            comentarios_evaluador TEXT,
            FOREIGN KEY(id_distribuidor) REFERENCES distribuidores(id_distribuidor),
            FOREIGN KEY(id_integrante) REFERENCES integrantes_grupo(id_integrante),
            FOREIGN KEY(id_evaluador) REFERENCES usuarios_portal(id_usuario)
        )
    ''')

    conexion.commit()
    conexion.close()
    
    print(f"¡Éxito! Base de datos maestra creada en: {ruta_db}")

if __name__ == '__main__':
    crear_base_de_datos()