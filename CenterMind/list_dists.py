import sqlite3
import os

db_path = "C:/Users/cigar/OneDrive/Desktop/BOT-SQL/antigravity/CenterMind/CenterMind/base_datos/centermind.db"

def list_dists():
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT id_distribuidor, nombre_empresa, estado FROM distribuidores").fetchall()
        for r in rows:
            print(f"ID: {r['id_distribuidor']} | Nombre: {r['nombre_empresa']} | Estado: {r['estado']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    list_dists()
