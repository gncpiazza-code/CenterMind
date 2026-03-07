import psutil
import os
import time
from typing import Dict, Any
from db import sb
import logging

logger = logging.getLogger("MonitoringService")

class SystemMonitoringService:
    def __init__(self):
        self.start_time = time.time()

    def get_system_metrics(self) -> Dict[str, Any]:
        """Captura métricas de hardware (Capa Nivel 0)."""
        cpu_usage = psutil.cpu_percent(interval=1)
        ram = psutil.virtual_memory()
        
        # En Railway/Linux, podemos obtener más detalle
        return {
            "cpu_usage": cpu_usage,
            "ram_used_gb": round(ram.used / (1024**3), 2),
            "ram_total_gb": round(ram.total / (1024**3), 2),
            "ram_percent": ram.percent,
            "uptime_seconds": int(time.time() - self.start_time),
            "process_count": len(psutil.pids())
        }

    def get_db_stats(self) -> Dict[str, Any]:
        """Consulta métricas de almacenamiento en Supabase."""
        try:
            res = sb.rpc("fn_admin_get_storage_stats").execute()
            if res.data:
                total_kb = sum(row.get("total_size_kb", 0) for row in res.data)
                return {
                    "total_size_mb": round(total_kb / 1024, 2),
                    "table_details": res.data[:10] # Top 10 tablas
                }
            return {"total_size_mb": 0, "table_details": []}
        except Exception as e:
            logger.error(f"Error obteniendo DB stats: {e}")
            return {"error": str(e)}

    def get_active_sessions(self, bots_dict: Dict) -> Dict[str, Any]:
        """Calcula saturación basado en bots activos y sesiones de carga."""
        total_active_sessions = 0
        bot_statuses = {}
        
        for d_id, ptb_app in bots_dict.items():
            # Intentamos acceder a la instancia del worker a través del bot
            # Nota: En api.py guardamos ptb_app en el dict 'bots'
            # pero necesitamos llegar al BotWorker.
            # Por simplicidad aquí, asumimos que podemos medir el pulso básico.
            total_active_sessions += 1 # Placeholder
            
        return {
            "bots_online": len(bots_dict),
            "total_upload_sessions": total_active_sessions
        }

monitor_service = SystemMonitoringService()
