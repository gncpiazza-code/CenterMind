import logging
import sys
import os

# Configurar logging para ver qué pasa
logging.basicConfig(level=logging.INFO)

# Agregar la carpeta actual al path para importar el servicio
sys.path.append(os.getcwd())

from services.erp_ingestion_service import erp_service

def test_manual_ingestion():
    # Rutas de los archivos del usuario
    clientes_path = r"C:\Users\cigar\Downloads\resultados_Reporte.PadronDeClientes (3).xlsx"
    ventas_path   = r"C:\Users\cigar\Downloads\resultados_Reporte.InformeDeVentas (3).xlsx"
    
    print("--- Probando Ingesta de Clientes ---")
    erp_service.ingest_clientes(clientes_path)
    
    print("\n--- Probando Ingesta de Ventas ---")
    erp_service.ingest_ventas(ventas_path)
    
    print("\n✅ Prueba terminada. Revisa el Dashboard de Supabase en las tablas 'erp_clientes_raw' y 'erp_ventas_raw'.")

if __name__ == "__main__":
    test_manual_ingestion()
