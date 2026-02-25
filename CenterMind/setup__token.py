# -*- coding: utf-8 -*-
"""
ShelfMind — Setup Token
========================================
Script interactivo para generar el archivo de credenciales (_token.json)
requerido por panel_maestro.py.
"""

import json
import getpass
from pathlib import Path
from datetime import datetime

# Definimos el directorio base (la misma carpeta donde está este script)
BASE_DIR = Path(__file__).resolve().parent
TOKEN_FILE = BASE_DIR / "_token.json"

def main():
    print("========================================")
    print("   ShelfMind - Generador de Acceso")
    print("========================================\n")
    
    print("Este script creará el archivo '_token.json' necesario para iniciar el Panel Maestro.")
    print("Por favor, ingresa un Token Maestro o Contraseña para asegurar el sistema.\n")
    
    # getpass permite escribir sin mostrar los caracteres en la consola
    token = getpass.getpass("🔑 Ingresa el nuevo Token Maestro: ").strip()
    
    if not token:
        print("❌ Error: El token no puede estar vacío. Operación cancelada.")
        return
        
    confirm_token = getpass.getpass("🔑 Confirma el Token Maestro: ").strip()
    
    if token != confirm_token:
        print("❌ Error: Los tokens no coinciden. Intenta nuevamente.")
        return

    # Estructuramos los datos que guardaremos en el JSON
    token_data = {
        "master_token": token,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "active"
    }

    try:
        # Guardamos el diccionario como un archivo JSON
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(token_data, f, indent=4)
            
        print(f"\n✅ ¡Éxito! El archivo se ha creado correctamente en:\n   {TOKEN_FILE}")
        print("\nYa puedes ejecutar 'python panel_maestro.py' para abrir el panel.")
        
    except Exception as e:
        print(f"\n❌ Ocurrió un error al intentar guardar el archivo:\n{e}")

if __name__ == "__main__":
    main()