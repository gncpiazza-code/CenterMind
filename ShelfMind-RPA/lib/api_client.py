# -*- coding: utf-8 -*-
"""
lib/api_client.py
=================
Cliente HTTP para subir archivos descargados por los motores RPA a la API de Shelfy.

Funciones:
    subir_ventas(tenant_id, tipo, filename, file_bytes)  -> bool
    subir_cuentas(tenant_id, filename, file_bytes)       -> bool

Configuración: ver lib/shelfy_config.py
  (SHELFY_API_URL, API_URL, claves de Supabase+Vault, default prod https://api.shelfycenter.com)
"""

import httpx
from lib.logger import get_logger
from lib.shelfy_config import get_shelfy_api_key, get_shelfy_base_url

logger = get_logger("API_CLIENT")

# Compat: lectura perezosa; dev local: export API_URL o SHELFY_API_URL
TIMEOUT = 120  # segundos

def _url() -> str:
    return get_shelfy_base_url()

def _key() -> str:
    k = (get_shelfy_api_key() or "").strip()
    return k if k else "shelfy-clave-2025"

def _headers() -> dict:
    return {"x-api-key": _key()}


def subir_ventas(tenant_id: str, tipo: str, filename: str, file_bytes: bytes) -> bool:
    """
    Sube un Excel de ventas (resumido o detallado) a POST /api/motor/ventas.

    Args:
        tenant_id  : id del tenant ("tabaco", "aloma", "liver", "real")
        tipo       : "resumido" o "detallado"
        filename   : nombre sugerido del archivo
        file_bytes : contenido binario del Excel

    Returns:
        True si la API respondió 200/201, False en cualquier otro caso.
    """
    url = f"{_url()}/api/motor/ventas"
    try:
        resp = httpx.post(
            url,
            headers=_headers(),
            data={"tenant_id": tenant_id, "tipo": tipo},
            files={"file": (filename, file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            timeout=TIMEOUT,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info(f"  ✅ Ventas {tipo} subidas — {data.get('registros', '?')} registros, dist={data.get('id_distribuidor','?')}")
            return True
        else:
            logger.error(f"  ❌ API ventas respondió {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo ventas {tipo} para {tenant_id}: {e}")
        return False


def subir_cuentas(tenant_id: str, filename: str, file_bytes: bytes) -> bool:
    """
    Sube un Excel de cuentas corrientes a POST /api/motor/cuentas.

    Args:
        tenant_id  : id del tenant
        filename   : nombre del archivo
        file_bytes : contenido binario del Excel

    Returns:
        True si la API respondió 200/201, False en cualquier otro caso.
    """
    url = f"{_url()}/api/motor/cuentas"
    try:
        resp = httpx.post(
            url,
            headers=_headers(),
            data={"tenant_id": tenant_id},
            files={"file": (filename, file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            timeout=TIMEOUT,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info(f"  ✅ Cuentas subidas — {data.get('registros', '?')} registros, dist={data.get('id_distribuidor','?')}")
            return True
        else:
            logger.error(f"  ❌ API cuentas respondió {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo cuentas para {tenant_id}: {e}")
        return False
