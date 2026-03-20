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
        """Procesa el Excel de Padrón de Clientes (Manual) con mapeo flexible."""
        logger.info("Iniciando ingesta manual de clientes...")
        df = pd.read_excel(file_source, dtype=str)
        
        # Mapeo flexible idéntico al del Push para consistencia
        c_id = self._get_flexible_col(df, ["idcliente", "id_cliente", "codi_cliente", "cliente_id"])
        c_nom = self._get_flexible_col(df, ["nomcli", "nombre", "nombre_cliente"])
        c_fan = self._get_flexible_col(df, ["fantacli", "fantasia", "nombre_fantasia"])
        c_vend = self._get_flexible_col(df, ["dsvendedor", "vendedor", "d_vendedor"])
        c_suc = self._get_flexible_col(df, ["dssucur", "sucursal", "sucursal_nombre"])
        c_id_suc = self._get_flexible_col(df, ["idsucur", "id_sucursal"])
        c_lat = self._get_flexible_col(df, ["ycoord", "lat"])
        c_lon = self._get_flexible_col(df, ["xcoord", "lon"])
        c_dir = self._get_flexible_col(df, ["domicli", "direccion", "domicilio"])
        c_loc = self._get_flexible_col(df, ["descloca", "localidad"])
        c_prov = self._get_flexible_col(df, ["desprovincia", "provincia"])
        c_ruta = self._get_flexible_col(df, ["ruta", "nro_ruta"])
        c_alta = self._get_flexible_col(df, ["fecalta", "fecha_alta"])
        c_ult = self._get_flexible_col(df, ["fecha_ultima_compra", "fec_ult"])
        c_tel = self._get_flexible_col(df, ["telefos", "telefono"])
        c_mov = self._get_flexible_col(df, ["movil", "celular"])
        c_canal = self._get_flexible_col(df, ["descanal", "canal"])
        c_subc = self._get_flexible_col(df, ["dessubcanal", "subcanal"])
        
        # Usamos un diccionario para deduplicar: clave = (dist_id, id_local)
        records_to_upsert: Dict[tuple, Dict[str, Any]] = {}
        
        for _, row in df.iterrows():
            # En la carga manual, la empresa viene en una columna (ej: 'dsempresa')
            # y usamos el mapping interno para saber qué dist_id es.
            c_emp = self._get_flexible_col(df, ["dsempresa", "empresa", "distribuidora"])
            nombre_empresa_erp = str(row.get(c_emp, "")).strip().lower()
            dist_id = self.mapping.get(nombre_empresa_erp)
            
            if not dist_id:
                sb.table("erp_empresas_desconocidas").upsert(
                    {"nombre_erp": nombre_empresa_erp or "DESCONOCIDA"},
                    on_conflict="nombre_erp"
                ).execute()
                continue

            id_local = str(row.get(c_id, "")).strip()
            if not id_local or id_local.lower() in ("nan", "none", "null"): continue
            
            # Parsing fechas
            f_alta = None
            if c_alta and row.get(c_alta):
                try: f_alta = pd.to_datetime(row[c_alta], dayfirst=True, errors='coerce').strftime("%Y-%m-%d")
                except: pass
            
            f_ult = None
            if c_ult and row.get(c_ult):
                try: f_ult = pd.to_datetime(row[c_ult], dayfirst=True, errors='coerce').strftime("%Y-%m-%d")
                except: pass

            record = {
                "id_distribuidor": dist_id,
                "id_cliente_erp_local": id_local,
                "nombre_cliente": str(row.get(c_nom, "")).strip().upper() if c_nom else "SIN NOMBRE",
                "nombre_fantasia": str(row.get(c_fan, "")).strip().upper() if c_fan else "",
                "vendedor_erp": str(row.get(c_vend, "")).strip().upper() if c_vend else "SIN VENDEDOR",
                "sucursal_erp": str(row.get(c_suc, "")).strip().upper() if c_suc else "CASA CENTRAL",
                "id_sucursal_erp": str(row.get(c_id_suc, "")).strip() if c_id_suc else "0",
                "lat": float(row.get(c_lat)) if c_lat and row.get(c_lat) and str(row[c_lat]).lower() != "nan" else None,
                "lon": float(row.get(c_lon)) if c_lon and row.get(c_lon) and str(row[c_lon]).lower() != "nan" else None,
                "domicilio": str(row.get(c_dir, "")).strip().upper() if c_dir else "",
                "localidad": str(row.get(c_loc, "")).strip().upper() if c_loc else "",
                "provincia": str(row.get(c_prov, "")).strip().upper() if c_prov else "",
                "ruta": str(row.get(c_ruta, "")).strip().upper() if c_ruta else None,
                "canal": str(row.get(c_canal, "")).strip().upper() if c_canal else None,
                "subcanal": str(row.get(c_subc, "")).strip().upper() if c_subc else None,
                "telefono": str(row.get(c_tel, "")).strip() if c_tel else None,
                "movil": str(row.get(c_mov, "")).strip() if c_mov else None,
                "fecha_alta": f_alta,
                "fecha_ultima_compra": f_ult,
                "estado": "activo",
                "updated_at": datetime.now().isoformat()
            }
            records_to_upsert[(dist_id, id_local)] = record

        final_records = list(records_to_upsert.values())

        if final_records:
            try:
                sb.table("erp_clientes_raw").upsert(final_records, on_conflict="id_distribuidor, id_cliente_erp_local").execute()
                
                # Baja Lógica
                dists_in_file = set(r["id_distribuidor"] for r in final_records)
                for d_id in dists_in_file:
                    current_ids = [r["id_cliente_erp_local"] for r in final_records if r["id_distribuidor"] == d_id]
                    self._logical_delete("erp_clientes_raw", d_id, "id_cliente_erp_local", current_ids)
                
                logger.info(f"✅ Clientes ERP (Manual): {len(final_records)} procesados.")
                
                # Sincronizar Sucursales -> Locations automáticamente
                for d_id in dists_in_file:
                    self._sync_erp_branches_to_locations(d_id)
                
                return len(final_records)
            except Exception as e:
                logger.error(f"Error en upsert manual de clientes: {e}")
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
        col_proveedor = "proveedor" # Nueva columna

        col_articulo  = "descrip" # Columna AK

        # Usamos un diccionario para AGREGAR: clave = (dist_id, nro_documento, articulo)
        # Ahora bajamos a nivel artículo para el gráfico de Top Ventas.
        records_to_upsert: Dict[tuple, Dict[str, Any]] = {}

        for _, row in df.iterrows():
            nombre_empresa_erp = str(row.get(col_empresa, "")).strip().lower()
            dist_id = self.mapping.get(nombre_empresa_erp)

            if not dist_id:
                # PASO 2: Captura de empresas desconocidas
                sb.table("erp_empresas_desconocidas").upsert(
                    {"nombre_erp": str(row.get(col_empresa, "DESCONOCIDA")).strip()},
                    on_conflict="nombre_erp"
                ).execute()
                logger.error(f"CRÍTICO: Empresa '{row.get(col_empresa)}' desconocida. Abortando fila.")
                continue

            nro_doc = str(row.get(col_nro_doc))
            articulo = str(row.get(col_articulo, "SIN NOMBRE"))
            key = (dist_id, nro_doc, articulo)

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
                    "nro_documento": nro_doc.strip(),
                    "articulo": articulo.strip().upper(),
                    "fecha_factura": fecha_str,
                    "codi_cliente": str(row.get(col_id_cli, "")).strip(),
                    "nomcli": str(row.get(col_nom_cli, "")).strip().upper(),
                    "importe_neto": v_neto,
                    "importe_final": v_final,
                    "unidades": v_unid,
                    "vendedor_erp": str(row.get(col_vendedor, "")).strip().upper(),
                    "sucursal_erp": str(row.get(col_sucursal, "")).strip().upper(),
                    "proveedor": str(row.get(col_proveedor, "SIN PROVEEDOR")).strip().upper(),
                    "tipo_documento": str(row.get("cod_tipo_docs", "")).strip().upper(),
                }

        final_records = list(records_to_upsert.values())

        if final_records:
            try:
                sb.table("erp_ventas_raw").upsert(
                    final_records,
                    on_conflict="id_distribuidor, nro_documento, articulo"
                ).execute()
                logger.info(f"✅ Ventas ERP: {len(final_records)} registros procesados (artículos).")
                return len(final_records)
            except Exception as e:
                logger.error(f"Error en upsert de ventas: {e}")
                raise e
        return 0

    def _get_flexible_col(self, df, possible_names: List[str], default=None):
        """Busca una columna en el DataFrame entre varios nombres posibles."""
        for name in possible_names:
            if name in df.columns:
                return name
        return default

    # ════════════════════════════════════════════════════════════════
    # NUEVOS MÉTODOS PARA ARQUITECTURA "PUSH" (Excel .xlsx / .xls)
    # ════════════════════════════════════════════════════════════════

    def ingest_clientes_xlsx(self, file_source, dist_id: int):
        """Ingesta de clientes via Excel con mapeo flexible y metadatos extendidos."""
        logger.info(f"Iniciando ingesta Excel de clientes para dist {dist_id}...")
        try:
            df = pd.read_excel(file_source, dtype=str)
            
            # Mapeo flexible de columnas basado en el ERP de Cigarrillera
            c_id = self._get_flexible_col(df, ["idcliente", "id_cliente", "codi_cliente", "cliente_id", "numero_cliente_local"])
            c_nom = self._get_flexible_col(df, ["nomcli", "nombre", "nombre_cliente", "razon_social"])
            c_fan = self._get_flexible_col(df, ["fantacli", "fantasia", "nombre_fantasia"])
            c_vend = self._get_flexible_col(df, ["dsvendedor", "vendedor", "d_vendedor", "vendedor_nombre"])
            c_suc = self._get_flexible_col(df, ["dssucur", "sucursal", "sucursal_nombre", "nombre_sucursal"])
            c_id_suc = self._get_flexible_col(df, ["idsucur", "id_sucursal", "sucursal_id"])
            c_lat = self._get_flexible_col(df, ["ycoord", "lat", "latitud"])
            c_lon = self._get_flexible_col(df, ["xcoord", "lon", "longitud"])
            c_dir = self._get_flexible_col(df, ["domicli", "direccion", "domicilio"])
            c_loc = self._get_flexible_col(df, ["descloca", "localidad"])
            c_prov = self._get_flexible_col(df, ["desprovincia", "provincia"])
            
            # Metadata extendida (Ruteo, Segmentación, Contacto)
            c_ruta = self._get_flexible_col(df, ["ruta", "nro_ruta"])
            c_alta = self._get_flexible_col(df, ["fecalta", "fec_alta", "fecha_alta"])
            c_ult = self._get_flexible_col(df, ["fecha_ultima_compra", "fec_ult"])
            c_tel = self._get_flexible_col(df, ["telefos", "telefono"])
            c_mov = self._get_flexible_col(df, ["movil", "celular"])
            c_canal = self._get_flexible_col(df, ["descanal", "canal", "canal_venta"])
            c_subc = self._get_flexible_col(df, ["dessubcanal", "subcanal"])
            
            # Días de visita
            c_lun = self._get_flexible_col(df, ["lunes", "lun"])
            c_mar = self._get_flexible_col(df, ["martes", "mar"])
            c_mie = self._get_flexible_col(df, ["miercoles", "mie"])
            c_jue = self._get_flexible_col(df, ["jueves", "jue"])
            c_vie = self._get_flexible_col(df, ["viernes", "vie"])
            c_sab = self._get_flexible_col(df, ["sabado", "sab"])
            c_dom = self._get_flexible_col(df, ["domingo", "dom"])

            records = []
            current_ids = []
            for _, row in df.iterrows():
                id_erp = str(row.get(c_id, "")).strip() if c_id else ""
                if not id_erp or id_erp.lower() in ("nan", "none", "null"): continue
                
                current_ids.append(id_erp)
                
                # Parsing fechas
                f_alta = None
                if c_alta and row.get(c_alta):
                    try: f_alta = pd.to_datetime(row[c_alta], dayfirst=True, errors='coerce').strftime("%Y-%m-%d")
                    except: pass
                
                f_ult = None
                if c_ult and row.get(c_ult):
                    try: f_ult = pd.to_datetime(row[c_ult], dayfirst=True, errors='coerce').strftime("%Y-%m-%d")
                    except: pass

                records.append({
                    "id_distribuidor": dist_id,
                    "id_cliente_erp_local": id_erp,
                    "nombre_cliente": str(row.get(c_nom, "")).strip().upper() if c_nom else "SIN NOMBRE",
                    "nombre_fantasia": str(row.get(c_fan, "")).strip().upper() if c_fan else "",
                    "vendedor_erp": str(row.get(c_vend, "")).strip().upper() if c_vend else "SIN VENDEDOR",
                    "sucursal_erp": str(row.get(c_suc, "")).strip().upper() if c_suc else "CASA CENTRAL",
                    "id_sucursal_erp": str(row.get(c_id_suc, "")).strip() if c_id_suc else "0",
                    "lat": float(row.get(c_lat)) if c_lat and row.get(c_lat) and str(row[c_lat]).lower() != "nan" else None,
                    "lon": float(row.get(c_lon)) if c_lon and row.get(c_lon) and str(row[c_lon]).lower() != "nan" else None,
                    "domicilio": str(row.get(c_dir, "")).strip().upper() if c_dir else "",
                    "localidad": str(row.get(c_loc, "")).strip().upper() if c_loc else "",
                    "provincia": str(row.get(c_prov, "")).strip().upper() if c_prov else "",
                    "ruta": str(row.get(c_ruta, "")).strip().upper() if c_ruta else None,
                    "canal": str(row.get(c_canal, "")).strip().upper() if c_canal else None,
                    "subcanal": str(row.get(c_subc, "")).strip().upper() if c_subc else None,
                    "telefono": str(row.get(c_tel, "")).strip() if c_tel else None,
                    "movil": str(row.get(c_mov, "")).strip() if c_mov else None,
                    "fecha_alta": f_alta,
                    "fecha_ultima_compra": f_ult,
                    "visita_lunes": str(row.get(c_lun, "")).strip().upper() if c_lun else "NO",
                    "visita_martes": str(row.get(c_mar, "")).strip().upper() if c_mar else "NO",
                    "visita_miercoles": str(row.get(c_mie, "")).strip().upper() if c_mie else "NO",
                    "visita_jueves": str(row.get(c_jue, "")).strip().upper() if c_jue else "NO",
                    "visita_viernes": str(row.get(c_vie, "")).strip().upper() if c_vie else "NO",
                    "visita_sabado": str(row.get(c_sab, "")).strip().upper() if c_sab else "NO",
                    "visita_domingo": str(row.get(c_dom, "")).strip().upper() if c_dom else "NO",
                    "estado": "activo",
                    "updated_at": datetime.now().isoformat()
                })
            
            if records:
                for i in range(0, len(records), 500):
                    batch = records[i:i+500]
                    sb.table("erp_clientes_raw").upsert(batch, on_conflict="id_distribuidor, id_cliente_erp_local").execute()
                
                self._logical_delete("erp_clientes_raw", dist_id, "id_cliente_erp_local", current_ids)
                
                # Sincronizar Sucursales -> Locations automáticamente
                self._sync_erp_branches_to_locations(dist_id)
                
                logger.info(f"✅ Sync Clientes Excel: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_clientes_xlsx: {e}")
            raise e

    def ingest_sucursales_xlsx(self, file_source, dist_id: int):
        """Ingesta de sucursales via Excel con mapeo flexible."""
        logger.info(f"Iniciando ingesta Excel de sucursales para dist {dist_id}...")
        try:
            df = pd.read_excel(file_source, dtype=str)
            
            c_id = self._get_flexible_col(df, ["id_sucursal", "idsucur", "sucursal_id"])
            c_nom = self._get_flexible_col(df, ["nombre", "dssucur", "nombre_sucursal"])
            c_dir = self._get_flexible_col(df, ["direccion", "domicilio", "direccion_sucursal"])
            
            records = []
            current_ids = []
            for _, row in df.iterrows():
                id_suc = str(row.get(c_id, "")).strip() if c_id else ""
                if not id_suc or id_suc.lower() in ("nan", "none", "null"): continue
                current_ids.append(id_suc)
                records.append({
                    "id_distribuidor": dist_id,
                    "id_sucursal_erp_local": id_suc,
                    "nombre_sucursal": str(row.get(c_nom, "")).strip().upper() if c_nom else "SUCURSAL",
                    "direccion": str(row.get(c_dir, "")).strip().upper() if c_dir else "",
                    "estado": "activo",
                    "updated_at": datetime.now().isoformat()
                })
            
            if records:
                sb.table("erp_sucursales_raw").upsert(records, on_conflict="id_distribuidor, id_sucursal_erp_local").execute()
                self._logical_delete("erp_sucursales_raw", dist_id, "id_sucursal_erp_local", current_ids)
                logger.info(f"✅ Sync Sucursales Excel: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_sucursales_xlsx: {e}")
            raise e

    def ingest_vendedores_xlsx(self, file_source, dist_id: int):
        """Ingesta de vendedores (jerarquía) via Excel."""
        logger.info("Ingesta Excel de vendedores recibida.")
        return 0

    def ingest_ventas_xlsx(self, file_source, dist_id: int):
        """Ingesta de ventas via Excel con mapeo flexible."""
        logger.info(f"Iniciando ingesta Excel de ventas para dist {dist_id}...")
        try:
            df = pd.read_excel(file_source, dtype=str)
            
            c_nro = self._get_flexible_col(df, ["nro_documento", "nro_comprobante", "documento"])
            c_art = self._get_flexible_col(df, ["articulo", "descrip", "descripcion_producto"])
            c_fec = self._get_flexible_col(df, ["fecha", "fecha_factura", "fec_doc"])
            c_cli = self._get_flexible_col(df, ["id_cliente", "codi_cliente", "cliente_id"])
            c_nom = self._get_flexible_col(df, ["cliente", "nomcli", "razon_social"])
            c_neto = self._get_flexible_col(df, ["neto", "importe_neto", "subtotal"])
            c_fin = self._get_flexible_col(df, ["final", "importe_final", "total"])
            c_unid = self._get_flexible_col(df, ["unidades", "cantidad_total_unidades", "cantidad"])
            c_vend = self._get_flexible_col(df, ["vendedor", "dsvendedor", "vendedor_nombre"])
            c_suc = self._get_flexible_col(df, ["sucursal", "dssucur", "sucursal_nombre"])
            c_prov = self._get_flexible_col(df, ["proveedor", "desc_proveedor", "prov"])

            records = []
            for _, row in df.iterrows():
                nro_doc = str(row.get(c_nro, "")).strip() if c_nro else ""
                articulo = str(row.get(c_art, "SIN NOMBRE")).strip().upper() if c_art else "SIN NOMBRE"
                if not nro_doc or nro_doc.lower() in ("nan", "none", "null"): continue
                
                records.append({
                    "id_distribuidor": dist_id,
                    "nro_documento": nro_doc,
                    "articulo": articulo,
                    "fecha_factura": str(row.get(c_fec, "")),
                    "codi_cliente": str(row.get(c_cli, "")).strip(),
                    "nomcli": str(row.get(c_nom, "")).strip().upper() if c_nom else "CLIENTE",
                    "importe_neto": float(row.get(c_neto, 0)) if c_neto and row.get(c_neto) and str(row[c_neto]).lower() != "nan" else 0,
                    "importe_final": float(row.get(c_fin, 0)) if c_fin and row.get(c_fin) and str(row[c_fin]).lower() != "nan" else 0,
                    "unidades": float(row.get(c_unid, 0)) if c_unid and row.get(c_unid) and str(row[c_unid]).lower() != "nan" else 0,
                    "vendedor_erp": str(row.get(c_vend, "")).strip().upper() if c_vend else "SIN VENDEDOR",
                    "sucursal_erp": str(row.get(c_suc, "")).strip().upper() if c_suc else "CASA CENTRAL",
                    "proveedor": str(row.get(c_prov, "SIN PROVEEDOR")).strip().upper() if c_prov else "SIN PROVEEDOR",
                })
            
            if records:
                for i in range(0, len(records), 500):
                    batch = records[i:i+500]
                    sb.table("erp_ventas_raw").upsert(batch, on_conflict="id_distribuidor, nro_documento, articulo").execute()
                logger.info(f"✅ Sync Ventas Excel: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_ventas_xlsx: {e}")
            raise e

    def ingest_clientes_csv(self, file_source, dist_id: int):
        """Ingesta de clientes via CSV."""
        logger.info(f"Iniciando ingesta CSV de clientes para dist {dist_id}...")
        try:
            df = pd.read_csv(file_source, dtype=str)
            # Columnas esperadas (estandarizadas para el agente local)
            # id_cliente, nombre, fantasia, vendedor, sucursal, id_sucursal, lat, lon, etc.
            
            records = []
            current_ids = []
            for _, row in df.iterrows():
                id_erp = str(row.get("id_cliente", "")).strip()
                if not id_erp: continue
                
                current_ids.append(id_erp)
                records.append({
                    "id_distribuidor": dist_id,
                    "id_cliente_erp_local": id_erp,
                    "nombre_cliente": str(row.get("nombre", "")).strip().upper(),
                    "nombre_fantasia": str(row.get("fantasia", "")).strip().upper(),
                    "vendedor_erp": str(row.get("vendedor", "")).strip().upper(),
                    "sucursal_erp": str(row.get("sucursal", "")).strip().upper(),
                    "id_sucursal_erp": str(row.get("id_sucursal", "")).strip(),
                    "lat": float(row.get("lat")) if row.get("lat") and str(row["lat"]) != "nan" else None,
                    "lon": float(row.get("lon")) if row.get("lon") and str(row["lon"]) != "nan" else None,
                    "domicilio": str(row.get("direccion", "")).strip().upper(),
                    "localidad": str(row.get("localidad", "")).strip().upper(),
                    "provincia": str(row.get("provincia", "")).strip().upper(),
                    "estado": "activo",
                    "updated_at": datetime.now().isoformat()
                })
            
            if records:
                # Upsert en lotes de 500
                for i in range(0, len(records), 500):
                    batch = records[i:i+500]
                    sb.table("erp_clientes_raw").upsert(batch, on_conflict="id_distribuidor, id_cliente_erp_local").execute()
                
                # BAJA LÓGICA: Marcar como inactivos los que no vinieron en este CSV
                self._logical_delete("erp_clientes_raw", dist_id, "id_cliente_erp_local", current_ids)
                
                logger.info(f"✅ Sync Clientes CSV: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_clientes_csv: {e}")
            raise e

    def ingest_sucursales_csv(self, file_source, dist_id: int):
        """Ingesta de sucursales via CSV."""
        logger.info(f"Iniciando ingesta CSV de sucursales para dist {dist_id}...")
        try:
            df = pd.read_csv(file_source, dtype=str)
            records = []
            current_ids = []
            for _, row in df.iterrows():
                id_suc = str(row.get("id_sucursal", "")).strip()
                if not id_suc: continue
                current_ids.append(id_suc)
                records.append({
                    "id_distribuidor": dist_id,
                    "id_sucursal_erp_local": id_suc,
                    "nombre_sucursal": str(row.get("nombre", "")).strip().upper(),
                    "direccion": str(row.get("direccion", "")).strip().upper(),
                    "estado": "activo",
                    "updated_at": datetime.now().isoformat()
                })
            
            if records:
                sb.table("erp_sucursales_raw").upsert(records, on_conflict="id_distribuidor, id_sucursal_erp_local").execute()
                self._logical_delete("erp_sucursales_raw", dist_id, "id_sucursal_erp_local", current_ids)
                logger.info(f"✅ Sync Sucursales CSV: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_sucursales_csv: {e}")
            raise e

    def ingest_vendedores_csv(self, file_source, dist_id: int):
        """Ingesta de vendedores (jerarquía) via CSV."""
        # Por ahora los vendedores se mapean por nombre en erp_clientes_raw, 
        # pero podemos guardar la lista maestra aquí si fuera necesario en el futuro.
        logger.info("Ingesta CSV de vendedores recibida (No-op por ahora, se procesan via Clientes/Ventas).")
        return 0

    def ingest_ventas_csv(self, file_source, dist_id: int):
        """Ingesta de ventas via CSV."""
        logger.info(f"Iniciando ingesta CSV de ventas para dist {dist_id}...")
        try:
            df = pd.read_csv(file_source, dtype=str)
            records = []
            for _, row in df.iterrows():
                nro_doc = str(row.get("nro_documento", "")).strip()
                articulo = str(row.get("articulo", "SIN NOMBRE")).strip().upper()
                if not nro_doc: continue
                
                records.append({
                    "id_distribuidor": dist_id,
                    "nro_documento": nro_doc,
                    "articulo": articulo,
                    "fecha_factura": str(row.get("fecha", "")),
                    "codi_cliente": str(row.get("id_cliente", "")),
                    "nomcli": str(row.get("cliente", "")).strip().upper(),
                    "importe_neto": float(row.get("neto", 0)),
                    "importe_final": float(row.get("final", 0)),
                    "unidades": float(row.get("unidades", 0)),
                    "vendedor_erp": str(row.get("vendedor", "")).strip().upper(),
                    "sucursal_erp": str(row.get("sucursal", "")).strip().upper(),
                })
            
            if records:
                # Lotes de 500
                for i in range(0, len(records), 500):
                    batch = records[i:i+500]
                    sb.table("erp_ventas_raw").upsert(batch, on_conflict="id_distribuidor, nro_documento, articulo").execute()
                logger.info(f"✅ Sync Ventas CSV: {len(records)} upserted.")
                return len(records)
        except Exception as e:
            logger.error(f"Error en ingest_ventas_csv: {e}")
            raise e

    def _logical_delete(self, table: str, dist_id: int, id_column: str, current_ids: List[str]):
        """Marca como inactivos los registros que no están en la lista actual."""
        if not current_ids: return
        
        try:
            # Esta operación puede ser costosa si hay miles de clientes.
            # En Supabase/PostgreSQL, lo más eficiente es un UPDATE con NOT IN.
            # Pero vía REST API (supabase-py), no hay una forma directa de 'NOT IN'.
            # Usamos un truco: RPC o ejecutamos en lotes.
            
            # Opción B: Obtener todos los IDs activos de la DB y comparar.
            res = sb.table(table).select(id_column).eq("id_distribuidor", dist_id).eq("estado", "activo").execute()
            db_ids = [str(row[id_column]) for row in res.data]
            
            missing_ids = list(set(db_ids) - set(current_ids))
            
            if missing_ids:
                logger.info(f"Bajas lógicas detectadas en {table}: {len(missing_ids)} registros.")
                # Update en lotes de 100 para evitar URLs gigantes
                for i in range(0, len(missing_ids), 100):
                    batch = missing_ids[i:i+100]
                    sb.table(table).update({"estado": "inactivo"})\
                        .eq("id_distribuidor", dist_id)\
                        .in_(id_column, batch).execute()
        except Exception as e:
            logger.error(f"Error en baja lógica para {table}: {e}")

    def get_sync_stats(self, dist_id: int):
        """Obtiene resumen de sincronización desde la DB."""
        try:
            res = sb.rpc("fn_admin_erp_sync_status", {"p_dist_id": dist_id}).execute()
            return res.data if res.data else {}
        except Exception as e:
            logger.error(f"Error obteniendo sync stats: {e}")
            return {}

    def _sync_erp_branches_to_locations(self, dist_id: int):
        """
        Método legado para sincronizar sucursales a 'locations'.
        DEPRECATED: Ahora se usa maestro_jerarquia.
        """
        logger.info(f"Skipping legacy branch sync for dist {dist_id} (using maestro_jerarquia now).")
        self._sync_vendedor_locations(dist_id)

    def _sync_vendedor_locations(self, dist_id: int):
        """
        Asigna automáticamente la sucursal (id_sucursal_erp) a los integrantes_grupo
        basándose en el maestro de jerarquías.
        """
        try:
            # 1. Obtener mapeo Vendedor -> Sucursal desde el Maestro
            res_maestro = sb.table("maestro_jerarquia").select("Vendedor, \"id suc\"").eq("ID_DIST", dist_id).execute()
            if not res_maestro.data:
                logger.warning(f"No hay jerarquía en el maestro para dist {dist_id}")
                return
            
            # Map Vendedor Name (upper) -> Sucursal ID (string)
            import unicodedata
            def normalize_str(text: str) -> str:
                if not text or str(text).strip().upper() in ("NAN", "NONE", "NULL", "NA"): 
                    return ""
                text = str(text).strip().upper()
                return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

            vendedor_sucursal_map = {}
            for row in res_maestro.data:
                v_name = normalize_str(row.get("Vendedor"))
                s_id = row.get("id suc")
                if v_name:
                    vendedor_sucursal_map[v_name] = str(s_id)
                    if '-' in v_name:
                        v_clean = v_name.split('-', 1)[1].strip()
                        if v_clean: vendedor_sucursal_map[v_clean] = str(s_id)

            # 2. Obtener integrantes que tienen mapeado un vendedor ERP
            res_int = sb.table("integrantes_grupo")\
                .select("id_integrante, id_vendedor_erp, id_sucursal_erp, nombre_integrante")\
                .eq("id_distribuidor", dist_id)\
                .execute()
            
            updated_count = 0
            for row in (res_int.data or []):
                # Intentamos matchear por id_vendedor_erp (que hoy suele ser el nombre)
                # o por el nombre_integrante si el id_vendedor_erp está vacío
                v_search = normalize_str(row.get("id_vendedor_erp") or row.get("nombre_integrante"))
                if not v_search: continue
                
                target_suc_id = None
                if v_search in vendedor_sucursal_map:
                    target_suc_id = vendedor_sucursal_map[v_search]
                else:
                    # Substring match parcial
                    for v_key, v_val in vendedor_sucursal_map.items():
                        if v_search in v_key or v_key in v_search:
                            target_suc_id = v_val
                            break
                
                if target_suc_id and target_suc_id != row.get("id_sucursal_erp"):
                    logger.info(f"Auto-vinculando integrante {row['id_integrante']} -> sucursal {target_suc_id}")
                    sb.table("integrantes_grupo").update({"id_sucursal_erp": target_suc_id})\
                        .eq("id_integrante", row["id_integrante"]).execute()
                    updated_count += 1
            
            logger.info(f"Sincronización de jerarquía completada: {updated_count} integrantes actualizados.")

        except Exception as e:
            logger.error(f"Error en _sync_vendedor_locations: {e}")

erp_service = ERPIngestionService()
