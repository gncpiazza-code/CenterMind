# -*- coding: utf-8 -*-
"""
CenterMind — Setup OAuth2 para Google Drive
============================================
Ejecutar UNA SOLA VEZ por servidor (o cuando el token expire/se pierda).

Uso:
    python setup_drive_oauth.py

Qué hace:
  1. Lee credencial_oauth.json (descargado de Google Cloud Console)
  2. Abre el navegador para que autoricés con tu cuenta de Google
  3. Guarda token_drive.json (el bot lo usa automáticamente para siempre)
"""

import sys
import os
from pathlib import Path

# Fix SSL: anula cualquier variable de entorno rota (ej: PostgreSQL)
try:
    import certifi
    os.environ["SSL_CERT_FILE"]      = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
except ImportError:
    print("Faltan dependencias. Ejecuta:")
    print("   pip install google-auth google-auth-oauthlib google-api-python-client")
    sys.exit(1)

BASE_DIR   = Path(__file__).parent
CRED_PATH  = BASE_DIR / "credencial_oauth.json"
TOKEN_PATH = BASE_DIR / "token_drive.json"
SCOPES     = ["https://www.googleapis.com/auth/drive"]


def main():
    print("=" * 60)
    print("  CenterMind - Autorizacion Google Drive (OAuth2)")
    print("=" * 60)

    if not CRED_PATH.exists():
        print(f"\nERROR: No se encontro: {CRED_PATH}")
        print("\nComo obtenerla:")
        print("  1. Ve a https://console.cloud.google.com")
        print("  2. Selecciona tu proyecto")
        print("  3. APIs y servicios > Credenciales")
        print("  4. Crear credencial > ID de cliente OAuth 2.0")
        print("  5. Tipo: Aplicacion de escritorio")
        print("  6. Descargar JSON > renombrar a credencial_oauth.json")
        print(f"  7. Copiar a: {CRED_PATH}")
        sys.exit(1)

    if TOKEN_PATH.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
            if creds.valid:
                print(f"\nYa existe un token valido en {TOKEN_PATH}")
                _test_connection(creds)
                return
            elif creds.expired and creds.refresh_token:
                print("\nToken expirado, renovando automaticamente...")
                creds.refresh(Request())
                TOKEN_PATH.write_text(creds.to_json())
                print(f"Token renovado y guardado en {TOKEN_PATH}")
                _test_connection(creds)
                return
        except Exception as e:
            print(f"\nToken existente invalido ({e}), generando nuevo...")

    print("\nAbriendo navegador para autorizar acceso a Google Drive...")
    print("(Si no se abre, copia el link que aparece en consola)\n")

    try:
        flow  = InstalledAppFlow.from_client_secrets_file(str(CRED_PATH), SCOPES)
        creds = flow.run_local_server(port=0, open_browser=True)
    except Exception as e:
        print(f"\nError durante la autorizacion: {e}")
        sys.exit(1)

    TOKEN_PATH.write_text(creds.to_json())
    print(f"\nToken guardado en: {TOKEN_PATH}")
    _test_connection(creds)


def _test_connection(creds):
    print("\nProbando conexion con Google Drive...")
    try:
        service = build("drive", "v3", credentials=creds, cache_discovery=False)
        about   = service.about().get(fields="user,storageQuota").execute()
        user    = about.get("user", {})
        quota   = about.get("storageQuota", {})
        nombre  = user.get("displayName", "Desconocido")
        email   = user.get("emailAddress", "")
        total   = int(quota.get("limit", 0))
        usado   = int(quota.get("usage", 0))

        def fmt(b):
            return f"{b/1024**3:.1f} GB" if b > 0 else "N/A"

        print(f"\n  Conectado como: {nombre} ({email})")
        print(f"  Almacenamiento: {fmt(usado)} usado / {fmt(total)} total")
        print(f"  Libre: {fmt(total - usado)}")
        print(f"\nTodo listo. El bot puede subir fotos.")
        print(f"Token en: {TOKEN_PATH}")
    except Exception as e:
        print(f"\nError al probar conexion: {e}")
        print("Revisa que la API de Drive este habilitada en Google Cloud.")


if __name__ == "__main__":
    main()