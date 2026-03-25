import asyncio
import os

os.environ["SHELFY_API_URL"] = "http://localhost:8000"
os.environ["RPA_HEADLESS"] = "false" 

from motores.cuentas_corrientes import run

async def main():
    print("Iniciando prueba multi-tenant (Tabaco y Aloma) para Cuentas Corrientes...")
    # El motor procesa todos los activos en TENANTS, así que los filtraré ahí.
    resultado = await run()
    import json
    print("\nResultado final detallado:")
    print(json.dumps(resultado, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
