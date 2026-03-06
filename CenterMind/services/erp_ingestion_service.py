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

    def reload_mappings(self):
        """Recarga el mapeo forzadamente."""
        self._load_mappings()

    def _load_mappings(self):
        """Carga el mapeo de Nombre ERP -> ID Distribuidor desde Supabase."""
        try:
            # Forzamos limpieza para evitar basura
            self.mapping = {}
            res = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
            # Guardamos las keys en minúsculas y sin espacios extras para máxima robustez
            self.mapping = {str(row["nombre_erp"]).strip().lower(): row["id_distribuidor"] for row in res.data}
            logger.info(f"Mapeos ERP (re)cargados: {len(self.mapping)} -> {self.mapping}")
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
        col_lat      = "xcoord"
        col_lon      = "ycoord"
        col_pago     = "FormaPago"

        # Usamos un diccionario para deduplicar: clave = (dist_id, id_local)
        # Esto evita el error 'ON CONFLICT DO UPDATE cannot affect row a second time'
        # si el Excel trae el mismo cliente dos veces en el mismo batch.
        records_to_upsert: Dict[tuple, Dict[str, Any]] = {}
        
        for _, row in df.iterrows():
            nombre_empresa_erp = str(row.get(col_empresa, "")).strip().lower()
            dist_id = self.mapping.get(nombre_empresa_erp)
            
            if not dist_id:
                continue

            id_local = str(row.get(col_id_erp))
            record = {
                "id_distribuidor": dist_id,
                "id_cliente_erp_local": id_local,
                "id_cliente_interno": str(row.get(col_id_int)),
                "nombre_cliente": str(row.get(col_nombre, "")),
                "nombre_fantasia": str(row.get(col_fantasia, "")),
                "vendedor_erp": str(row.get(col_vendedor, "")),
                "sucursal_erp": str(row.get(col_sucursal, "")),
                "lat": float(row.get(col_lat, 0)) if row.get(col_lat) else None,
                "lon": float(row.get(col_lon, 0)) if row.get(col_lon) else None,
                "forma_pago": str(row.get(col_pago, "")),
            }
            # Sobreescribimos si ya existe el mismo cliente en este batch
            records_to_upsert[(dist_id, id_local)] = record

        final_records = list(records_to_upsert.values())

        if final_records:
            try:
                sb.table("erp_clientes_raw").upsert(
                    final_records, 
                    on_conflict="id_distribuidor, id_cliente_erp_local"
                ).execute()
                logger.info(f"✅ Clientes ERP: {len(final_records)} registros procesados (deduplicados).")
                return len(final_records)
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

        # Usamos un diccionario para AGREGAR: clave = (dist_id, nro_documento)
        # Si un nro_documento aparece varias veces (ej: una fila por producto),
        # sumamos los importes y unidades para tener el total de la factura.
        records_to_upsert: Dict[tuple, Dict[str, Any]] = {}

        for _, row in df.iterrows():
            nombre_empresa_erp = str(row.get(col_empresa, "")).strip().lower()
            dist_id = self.mapping.get(nombre_empresa_erp)

            if not dist_id:
                continue

            nro_doc = str(row.get(col_nro_doc))
            key = (dist_id, nro_doc)

            fecha = row.get(col_fecha)
            try:
                dt_fecha = pd.to_datetime(fecha, dayfirst=True, errors='coerce')
                if pd.isna(dt_fecha):
                    logger.warning(f"⚠️ Fecha inválida omitida: {fecha}")
                    continue
                fecha_str = dt_fecha.strftime("%Y-%m-%d")
            except Exception as e:
                logger.warning(f"⚠️ Error parseando fecha {fecha}: {e}")
                continue

            v_neto   = float(row.get(col_neto, 0))
            v_final  = float(row.get(col_final, 0))
            v_unid   = float(row.get(col_unidades, 0))

            if key in records_to_upsert:
                # Agregamos a lo existente
                existing = records_to_upsert[key]
                existing["importe_neto"]  += v_neto
                existing["importe_final"] += v_final
                existing["unidades"]      += v_unid
            else:
                # Nuevo registro
                records_to_upsert[key] = {
                    "id_distribuidor": dist_id,
                    "nro_documento": nro_doc,
                    "fecha_factura": fecha_str,
                    "codi_cliente": str(row.get(col_id_cli)),
                    "nomcli": str(row.get(col_nom_cli, "")),
                    "importe_neto": v_neto,
                    "importe_final": v_final,
                    "unidades": v_unid,
                    "vendedor_erp": str(row.get(col_vendedor, "")),
                    "sucursal_erp": str(row.get(col_sucursal, "")),
                    "tipo_documento": str(row.get("cod_tipo_docs", "")),
                }

        final_records = list(records_to_upsert.values())

        if final_records:
            try:
                sb.table("erp_ventas_raw").upsert(
                    final_records,
                    on_conflict="id_distribuidor, nro_documento"
                ).execute()
                logger.info(f"✅ Ventas ERP: {len(final_records)} registros procesados (agregados).")
                return len(final_records)
            except Exception as e:
                logger.error(f"Error en upsert de ventas: {e}")
                raise e
        return 0

erp_service = ERPIngestionService()
