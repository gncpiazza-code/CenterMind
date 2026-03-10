import os
import requests
import logging
from datetime import datetime

# ==============================================================================
# CONFIGURACIÓN DEL AGENTE (Cambiar estos valores)
# ==============================================================================
API_URL = "https://fabric-usa-drill-anyone.trycloudflare.com/api/v1/sync"
API_KEY = "shelfy-clave-2025"
ID_DISTRIBUIDOR = 3  # Ej: Real Distribucion - T&H

# Rutas a los archivos EXCEL generados por el ERP
FILES_TO_SYNC = {
    "erp-clientes": "data_erp/clientes.xlsx",
    "erp-sucursales": "data_erp/sucursales.xlsx",
    "erp-ventas": "data_erp/ventas.xlsx",
}

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("erp_agent.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ERPCrow")

class ERPPushAgent:
    def __init__(self, api_url, api_key, dist_id):
        self.api_url = api_url.rstrip('/')
        self.headers = {"X-API-Key": api_key}
        self.dist_id = dist_id

    def sync_file(self, endpoint, file_path):
        if not os.path.exists(file_path):
            logger.warning(f"Archivo no encontrado: {file_path}. Saltando...")
            return False

        logger.info(f"Enviando {file_path} a {endpoint}...")
        
        try:
            with open(file_path, 'rb') as f:
                # Determinamos el content-type para Excel
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                if file_path.endswith('.xls'):
                    content_type = 'application/vnd.ms-excel'
                
                files = {'file': (os.path.basename(file_path), f, content_type)}
                params = {'id_distribuidor': self.dist_id}
                
                response = requests.post(
                    f"{self.api_url}/{endpoint}",
                    headers=self.headers,
                    files=files,
                    params=params,
                    timeout=120 # Más tiempo para Excels pesados
                )
                
                if response.status_code in (200, 202):
                    logger.info(f"✅ Éxito: {response.json().get('message', 'Aceptado')}")
                    return True
                else:
                    logger.error(f"❌ Error {response.status_code}: {response.text}")
                    return False
        except Exception as e:
            logger.error(f"❌ Error de conexión: {e}")
            return False

    def run_full_sync(self):
        logger.info("=== INICIANDO SINCRONIZACIÓN ERP ===")
        success_count = 0
        
        # Primero sucursales (dependencia), luego clientes, luego ventas
        endpoints_order = ["erp-sucursales", "erp-clientes", "erp-ventas"]
        
        for endpoint in endpoints_order:
            if endpoint in FILES_TO_SYNC:
                if self.sync_file(endpoint, FILES_TO_SYNC[endpoint]):
                    success_count += 1
        
        logger.info(f"=== SINCRONIZACIÓN FINALIZADA ({success_count}/{len(FILES_TO_SYNC)} exitosos) ===")

if __name__ == "__main__":
    agent = ERPPushAgent(API_URL, API_KEY, ID_DISTRIBUIDOR)
    agent.run_full_sync()
