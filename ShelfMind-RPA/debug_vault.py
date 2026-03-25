import os
import sys
from pathlib import Path

# Agregar el directorio actual al path para poder importar lib
sys.path.append(str(Path(__file__).resolve().parent))

from lib.vault_client import get_secret

def test_vault():
    print("Testing Vault credentials for 'tabaco'...")
    user = get_secret("chess_tabaco_usuario")
    password = get_secret("chess_tabaco_password")
    
    print(f"User: '{user}' (length: {len(user)})")
    print(f"Password: '{'*' * len(password)}' (length: {len(password)})")
    
    if not user or not password:
        print("❌ FAILED: Credentials are empty!")
    else:
        print("✅ SUCCESS: Credentials retrieved.")

if __name__ == "__main__":
    test_vault()
