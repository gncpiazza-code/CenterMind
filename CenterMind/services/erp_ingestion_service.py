import pandas as pd
import logging
from typing import List, Dict, Any
from db import sb
from datetime import datetime

logger = logging.getLogger("ERPIngestion")

class ERPIngestionService:
    def __init__(self):
        self.mapping: Dict[str, int] = {}
        self._load_mappings()

    def _load_mappings(self):
        """Carga el mapeo de Nombre ERP -> ID Distribuidor desde Supabase."""
        try:
            res = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
            self.mapping = {row["nombre_erp"]: row["id_distribuidor"] for row in res.data}
            logger.info(f"Mapeos ERP cargados: {len(self.mapping)}")
        except Exception as e:
            logger.error(f"Error cargando mapeos ERP: {e}")

    def ingest_clientes(self, file_source):
        """Procesa el Excel de Padrón de Clientes y lo guarda en erp_clientes_raw.
        'file_source' puede ser un path (str) o un objeto file-like (BytesIO).
        """
        logger.info("Iniciando ingesta de clientes...")
        df = pd.read_excel(file_source)
        
        # 1. Identificar columnas necesarias
        col_empresa = "dsempresa"
        col_id_erp   = "idcliente"
        col_nombre   = "nomcli"
        col_fantasia = "fantacli"
        col_vendedor = "d_vendedor"
        col_sucursal = "dssucur"
        col_id_int   = "IdClienteInterno"

        records_to_upsert = []
        
        for _, row in df.iterrows():
            nombre_empresa_erp = str(row.get(col_empresa, "")).strip()
            dist_id = self.mapping.get(nombre_empresa_erp)
            
            if not dist_id:
                continue

            record = {
                "id_distribuidor": dist_id,
                "id_cliente_erp_local": str(row.get(col_id_erp)),
                "id_cliente_interno": str(row.get(col_id_int)),
                "nombre_cliente": str(row.get(col_nombre, "")),
                "nombre_fantasia": str(row.get(col_fantasia, "")),
                "vendedor_erp": str(row.get(col_vendedor, "")),
                "sucursal_erp": str(row.get(col_sucursal, "")),
            }
            records_to_upsert.append(record)

        if records_to_upsert:
            try:
                sb.table("erp_clientes_raw").upsert(
                    records_to_upsert, 
                    on_conflict="id_distribuidor, id_cliente_erp_local"
                ).execute()
                logger.info(f"✅ Clientes ERP: {len(records_to_upsert)} registros procesados.")
                return len(records_to_upsert)
            except Exception as e:
                logger.error(f"Error en upsert de clientes: {e}")
                raise e
        return 0

    def ingest_ventas(self, file_source):
        """Procesa el Excel de Informe de Ventas y lo guarda en erp_ventas_raw.
        'file_source' puede ser un path (str) o un objeto file-like (BytesIO).
        """
        logger.info("Iniciando ingesta de ventas...")
        df = pd.read_excel(file_source)

        col_empresa   = "dsempresa"
        col_nro_doc   = "nro_documento"
        col_fecha     = "fecha_factura"
        col_id_cli    = "codi_cliente"
        col_nom_cli   = "nomcli"
        col_neto      = "importe_neto"
        col_final     = "importe_final"
        col_unidades  = "cantidad_total_unidades"
        col_vendedor  = "dsvendedor"
        col_sucursal  = "dssucur"

        records_to_upsert = []

        for _, row in df.iterrows():
            nombre_empresa_erp = str(row.get(col_empresa, "")).strip()
            dist_id = self.mapping.get(nombre_empresa_erp)

            if not dist_id:
                continue

            fecha = row.get(col_fecha)
            if isinstance(fecha, datetime):
                fecha_str = fecha.strftime("%Y-%m-%d")
            else:
                fecha_str = str(fecha)

            record = {
                "id_distribuidor": dist_id,
                "nro_documento": str(row.get(col_nro_doc)),
                "fecha_factura": fecha_str,
                "codi_cliente": str(row.get(col_id_cli)),
                "nomcli": str(row.get(col_nom_cli, "")),
                "importe_neto": float(row.get(col_neto, 0)),
                "importe_final": float(row.get(col_final, 0)),
                "unidades": float(row.get(col_unidades, 0)),
                "vendedor_erp": str(row.get(col_vendedor, "")),
                "sucursal_erp": str(row.get(col_sucursal, "")),
            }
            records_to_upsert.append(record)

        if records_to_upsert:
            try:
                sb.table("erp_ventas_raw").upsert(
                    records_to_upsert,
                    on_conflict="id_distribuidor, nro_documento"
                ).execute()
                logger.info(f"✅ Ventas ERP: {len(records_to_upsert)} registros procesados.")
                return len(records_to_upsert)
            except Exception as e:
                logger.error(f"Error en upsert de ventas: {e}")
                raise e
        return 0

erp_service = ERPIngestionService()
