import asyncio
import json
import logging
from api import manager

# Configuración de logging simple
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WSTest")

async def simulate_broadcast(dist_id: int):
    """Simula el envío de una nueva exhibición al WebSocket."""
    mock_event = {
        "type": "NUEVA_EXHIBICION",
        "data": {
            "id_ex": 999999,
            "id_dist": dist_id,
            "vendedor_nombre": "TESTER AGENTE",
            "lat": -34.6037, # Obelisco, BA
            "lon": -58.3816,
            "timestamp_evento": "2026-03-31T14:30:00Z",
            "nro_cliente": "999-TEST",
            "cliente_nombre": "TIENDA DE PRUEBA REALTIME",
            "drive_link": "https://shelfy.app/test-photo.jpg"
        }
    }
    
    logger.info(f"🚀 Iniciando broadcast de prueba para dist_id {dist_id}...")
    await manager.broadcast(dist_id, mock_event)
    logger.info("✅ Broadcast enviado. Si el monitor está conectado, debería haber reaccionado.")

if __name__ == "__main__":
    # ID de prueba (puedes cambiarlo al de tu distribuidor activo)
    TEST_DIST_ID = 1 
    asyncio.run(simulate_broadcast(TEST_DIST_ID))
