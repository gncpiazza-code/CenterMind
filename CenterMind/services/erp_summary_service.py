import logging
from db import sb
from datetime import datetime, timedelta

logger = logging.getLogger("ERPSummary")

class ERPSummaryService:
    def consolidate_debt(self, id_distribuidor: int):
        """
        Consolida las ventas y el padrón de clientes en una tabla de consulta rápida
        y aplica las alertas de crédito configuradas.
        """
        logger.info(f"Consolidando deuda para distribuidor {id_distribuidor}...")
        
        try:
            # 1. Obtener configuración de alertas
            config_res = sb.table("erp_config_alertas").select("*").eq("id_distribuidor", id_distribuidor).execute()
            config = config_res.data[0] if config_res.data else {
                "limite_dinero": 500000,
                "limite_cbte": 5,
                "limite_dias": 30
            }

            # 2. Obtener resumen de ventas agrupado por cliente (codi_cliente)
            # Nota: En un escenario real con muchos datos, esto se haría vía RPC en Supabase
            # para mayor eficiencia. Aquí lo hacemos por pasos.
            ventas_res = sb.table("erp_ventas_raw") \
                .select("codi_cliente, nomcli, importe_neto, fecha_factura, nro_documento") \
                .eq("id_distribuidor", id_distribuidor) \
                .execute()
            
            if not ventas_res.data:
                logger.info("No hay ventas para consolidar.")
                return

            # Agrupar datos en memoria (puedes mover esto a una función SQL más adelante)
            deuda_temp = {}
            hoy = datetime.now().date()

            for v in ventas_res.data:
                cli_id = v["codi_cliente"]
                if cli_id not in deuda_temp:
                    deuda_temp[cli_id] = {
                        "nom": v["nomcli"],
                        "saldo": 0,
                        "cbtes": set(),
                        "max_dias": 0
                    }
                
                # Importe
                deuda_temp[cli_id]["saldo"] += float(v["importe_neto"] or 0)
                
                # Cantidad de comprobantes únicos
                deuda_temp[cli_id]["cbtes"].add(v["nro_documento"])
                
                # Antigüedad
                f_doc = datetime.strptime(v["fecha_factura"], "%Y-%m-%d").date()
                dias = (hoy - f_doc).days
                if dias > deuda_temp[cli_id]["max_dias"]:
                    deuda_temp[cli_id]["max_dias"] = dias

            # 3. Preparar registros para erp_deuda_clientes
            final_records = []
            for cli_id, info in deuda_temp.items():
                motivos = []
                if info["saldo"] > config["limite_dinero"]:
                    motivos.append(f"Dinero (>{config['limite_dinero']})")
                if len(info["cbtes"]) > config["limite_cbte"]:
                    motivos.append(f"Cbtes (>{config['limite_cbte']})")
                if info["max_dias"] > config["limite_dias"]:
                    motivos.append(f"Días (>{config['limite_dias']})")
                
                alerta = "⚠️ Crítico: " + " | ".join(motivos) if motivos else ""

                record = {
                    "id_distribuidor": id_distribuidor,
                    "id_cliente_erp_local": cli_id,
                    "nombre_cliente": info["nom"],
                    "saldo_total": info["saldo"],
                    "cant_cbte": len(info["cbtes"]),
                    "antiguedad_max_dias": info["max_dias"],
                    "alerta_texto": alerta,
                    "fecha_snapshot": datetime.now().isoformat()
                }
                final_records.append(record)

            # 4. Upsert masivo
            if final_records:
                sb.table("erp_deuda_clientes").upsert(
                    final_records,
                    on_conflict="id_distribuidor, id_cliente_erp_local"
                ).execute()
                logger.info(f"✅ Consolidación terminada: {len(final_records)} clientes actualizados.")

        except Exception as e:
            logger.error(f"Error consolidando deuda: {e}")

erp_summary_service = ERPSummaryService()
