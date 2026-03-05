import logging
import sys
import os
import io

# Configurar logging
logging.basicConfig(level=logging.INFO)
sys.path.append(os.getcwd())

from services.erp_ingestion_service import erp_service
from services.erp_summary_service import erp_summary_service

def test_full_flow():
    # 1. Rutas de archivos
    clientes_path = r"C:\Users\cigar\Downloads\resultados_Reporte.PadronDeClientes (3).xlsx"
    ventas_path   = r"C:\Users\cigar\Downloads\resultados_Reporte.InformeDeVentas (3).xlsx"
    
    print("--- 1. Ingestando RAW Data ---")
    erp_service.ingest_clientes(clientes_path)
    erp_service.ingest_ventas(ventas_path)
    
    print("\n--- 2. Consolidando Deudas y Alertas ---")
    # T&H es ID 3
    erp_summary_service.consolidate_debt(3)
    
    print("\n✅ Flujo completo terminado.")
    print("Revisa en Supabase:")
    print("1. erp_clientes_raw (Padrón)")
    print("2. erp_ventas_raw (Ventas)")
    print("3. erp_deuda_clientes (Resumen + Alertas ⚠️)")

if __name__ == "__main__":
    test_full_flow()
