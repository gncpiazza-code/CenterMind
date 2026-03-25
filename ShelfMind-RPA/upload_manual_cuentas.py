import os
import sys
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Configurar paths
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from lib.cuentas_parser import procesar_excel_cuentas

# Cargar .env principal
load_dotenv(dotenv_path=BASE_DIR.parent / "CenterMind" / ".env")

API_URL = os.getenv("SHELFY_API_URL", "http://localhost:8000")
API_KEY = os.getenv("SHELFY_API_KEY", "shelfy-clave-2025")

async def upload_manual(file_path: str, tenant_id: str, id_dist: int):
    print(f"🚀 Iniciando carga manual...")
    print(f"   Archivo: {file_path}")
    print(f"   Tenant:  {tenant_id} (Dist {id_dist})")

    if not Path(file_path).exists():
        print(f"❌ Error: El archivo no existe.")
        return

    try:
        # 1. Parsear
        print(f"   Parseando Excel...")
        datos = procesar_excel_cuentas(file_path)
        print(f"   ✅ Parseado OK. Deudores: {len(datos['detalle_cuentas'])}")

        # 2. Subir a API
        url = f"{API_URL.rstrip('/')}/api/v1/sync/cuentas-corrientes"
        payload = {
            "tenant_id": tenant_id,
            "filename": Path(file_path).name,
            "datos": datos
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                json=payload,
                params={"id_distribuidor": id_dist},
                headers={"X-API-KEY": API_KEY}
            )
            
            if resp.status_code in (200, 202):
                print(f"✅ Sincronización exitosa (HTTP {resp.status_code})")
            else:
                print(f"❌ Error en API (HTTP {resp.status_code}): {resp.text}")

    except Exception as e:
        print(f"❌ Error inesperado: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Uso: python upload_manual_cuentas.py <ruta_excel> <tenant_id> <id_distribuidor>")
        print("Ejemplo: python upload_manual_cuentas.py saldos.xlsx aloma 2")
    else:
        ruta = sys.argv[1]
        tenant = sys.argv[2]
        dist_id = int(sys.argv[3])
        asyncio.run(upload_manual(ruta, tenant, dist_id))
