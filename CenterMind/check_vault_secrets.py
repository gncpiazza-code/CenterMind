from db import sb
import json

def check_secrets():
    secrets = [
        "chess_tabaco_usuario",
        "chess_aloma_usuario",
        "chess_liver_usuario",
        "chess_real_usuario"
    ]
    for s in secrets:
        res = sb.rpc("leer_secreto_vault", {"secret_name": s}).execute()
        print(f"{s}: {res.data}")

if __name__ == "__main__":
    check_secrets()
