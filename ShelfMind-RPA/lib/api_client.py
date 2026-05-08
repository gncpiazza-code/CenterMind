# -*- coding: utf-8 -*-
"""
lib/api_client.py
=================
Cliente HTTP para subir archivos descargados por los motores RPA a la API de Shelfy.

Funciones:
    subir_ventas(tenant_id, tipo, filename, file_bytes)  -> bool
    subir_cuentas(tenant_id, filename, file_bytes)       -> bool
    subir_sigo(empresa_id, sucursal, tipo, filename, file_bytes) -> bool
    subir_rendimiento_calle_analytics(tenant_id, payload) -> bool

Configuración: ver lib/shelfy_config.py
  (SHELFY_API_URL, API_URL, claves de Supabase+Vault, default prod https://api.shelfycenter.com)
"""

import asyncio
import io
from pathlib import Path

import httpx
import pandas as pd
from lib.logger import get_logger
from lib.shelfy_config import get_shelfy_api_key, get_shelfy_base_url

logger = get_logger("API_CLIENT")

# Compat: lectura perezosa; dev local: export API_URL o SHELFY_API_URL
TIMEOUT = 120  # segundos
PADRON_MAX_DIRECT_UPLOAD_BYTES = 18 * 1024 * 1024  # 18MB (margen conservador ante límites/proxies)

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


def subir_rendimiento_calle_analytics(tenant_id: str, payload: dict) -> bool:
    """POST /api/motor/rendimiento-calle-analytics (JSON del script analizar_rendimiento_calle)."""
    url = f"{_url()}/api/motor/rendimiento-calle-analytics"
    body = {"tenant_id": tenant_id, "payload": payload}
    try:
        resp = httpx.post(url, headers=_headers(), json=body, timeout=TIMEOUT)
        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info(
                "  ✅ Rendimiento calle analytics — "
                f"run_id={data.get('run_id', '?')} dist={data.get('id_distribuidor', '?')}"
            )
            return True
        logger.error(f"  ❌ API rendimiento-calle-analytics {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo rendimiento calle analytics para {tenant_id}: {e}")
        return False


def subir_ventas_analytics(
    tenant_id: str,
    payload: dict,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
) -> bool:
    """
    Sube el JSON de análisis de comprobantes a POST /api/motor/ventas-analytics.
    """
    url = f"{_url()}/api/motor/ventas-analytics"
    body = {
        "tenant_id": tenant_id,
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "payload": payload,
    }
    try:
        resp = httpx.post(url, headers=_headers(), json=body, timeout=TIMEOUT)
        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info(
                "  ✅ Ventas analytics subido — "
                f"run_id={data.get('run_id', '?')} dist={data.get('id_distribuidor', '?')}"
            )
            return True
        logger.error(f"  ❌ API ventas-analytics respondió {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo ventas analytics para {tenant_id}: {e}")
        return False


def subir_sigo(
    empresa_id: str,
    sucursal: str,
    tipo: str,
    filename: str,
    file_bytes: bytes,
) -> bool:
    """
    Sube export SIGO (Puntos de venta XLS o ventas fuera de ruta XLSX).
    POST /api/motor/sigo — Form: empresa_id, sucursal, tipo (pdv|vfr), file.

    empresa_id: tabaco | aloma | liver | real | gyg (GyG → dist 6).
    """
    url = f"{_url()}/api/motor/sigo"
    if tipo not in ("pdv", "vfr"):
        logger.error(f"  ❌ subir_sigo tipo inválido: {tipo}")
        return False
    try:
        resp = httpx.post(
            url,
            headers=_headers(),
            data={"empresa_id": empresa_id, "sucursal": sucursal, "tipo": tipo},
            files={
                "file": (
                    filename,
                    file_bytes,
                    "application/vnd.ms-excel"
                    if filename.lower().endswith(".xls")
                    else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            timeout=TIMEOUT,
        )
        if resp.status_code in (200, 201):
            data = resp.json() if resp.content else {}
            logger.info(
                f"  ✅ SIGO {tipo} subido — dist={data.get('id_distribuidor', '?')} "
                f"bytes={data.get('bytes', len(file_bytes))}"
            )
            return True
        logger.error(f"  ❌ API motor/sigo {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo SIGO ({empresa_id}/{tipo}): {e}")
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


async def subir_padron(archivo_path, id_distribuidor: int) -> bool:
    """
    Sube un Excel de Padrón de Clientes a POST /api/v1/sync/erp-padrón.

    Args:
        archivo_path   : ruta Path del archivo Excel descargado desde Consolido
        id_distribuidor: id_distribuidor en Shelfy (mapeo desde tenant_id)

    Returns:
        True si la API respondió 200/201, False en cualquier otro caso.
    """
    url = f"{_url()}/api/v1/sync/erp-padrón"
    try:
        archivo_path = Path(archivo_path)

        # Leer archivo del disco
        with open(archivo_path, "rb") as f:
            file_bytes = f.read()

        payload_name = archivo_path.name
        payload_bytes = file_bytes
        original_size = len(file_bytes)

        # Si el archivo es muy grande, compactar (sin estilos/formato) para evitar cortes de conexión.
        if original_size > PADRON_MAX_DIRECT_UPLOAD_BYTES:
            logger.info(
                f"  ℹ️ Padrón grande ({original_size / (1024 * 1024):.1f} MB). "
                "Intentando compactar antes de upload..."
            )
            compacted = _compactar_excel_para_upload(file_bytes)
            if compacted and len(compacted) < original_size:
                payload_bytes = compacted
                payload_name = f"{archivo_path.stem}_compacto.xlsx"
                logger.info(
                    f"  ✅ Compactado OK: {original_size / (1024 * 1024):.1f} MB -> "
                    f"{len(payload_bytes) / (1024 * 1024):.1f} MB"
                )
            else:
                logger.warning(
                    "  ⚠️ No se pudo reducir tamaño del padrón; se sube archivo original."
                )

        # Padrón puede tardar bastante en backend (ingesta+normalización), usar timeout más amplio y reintentos.
        timeout = httpx.Timeout(connect=20.0, read=240.0, write=120.0, pool=20.0)
        for intento in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        url,
                        headers=_headers(),
                        params={"id_distribuidor": str(id_distribuidor)},
                        files={"file": (payload_name, payload_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                    )

                if resp.status_code in (200, 201, 202):
                    registros = "?"
                    try:
                        data = resp.json()
                        if isinstance(data, dict):
                            registros = data.get("registros", "?")
                    except Exception:
                        pass
                    logger.info(
                        f"  ✅ Padrón subido — {registros} registros, dist={id_distribuidor} "
                        f"(HTTP {resp.status_code}, intento {intento}/3)"
                    )
                    return True

                body = (resp.text or "").strip().replace("\n", " ")
                logger.warning(
                    f"  ⚠️ API padrón HTTP {resp.status_code} intento {intento}/3: {body[:260]}"
                )
            except Exception as e:
                logger.warning(
                    f"  ⚠️ Error subiendo padrón intento {intento}/3 dist={id_distribuidor}: "
                    f"{type(e).__name__}: {repr(e)}"
                )

            if intento < 3:
                await asyncio.sleep(4)

        logger.error(f"  ❌ Upload padrón agotó reintentos (dist={id_distribuidor}).")
        return False
    except Exception as e:
        logger.error(f"  ❌ Error preparando upload de padrón dist={id_distribuidor}: {type(e).__name__}: {repr(e)}")
        return False


async def subir_ventas_enriched(archivo_path, tenant_id: str) -> bool:
    """
    Sube un Excel de Informe de Ventas (Reporteador Genérico) a
    POST /api/motor/ventas-enriched.
    """
    url = f"{_url()}/api/motor/ventas-enriched"
    try:
        archivo_path = Path(archivo_path)
        with open(archivo_path, "rb") as f:
            file_bytes = f.read()
        timeout = httpx.Timeout(connect=20.0, read=240.0, write=120.0, pool=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                headers=_headers(),
                data={"tenant_id": tenant_id},
                files={"file": (archivo_path.name, file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        if resp.status_code in (200, 201):
            try:
                data = resp.json()
            except Exception:
                data = {}
            logger.info(
                f"  ✅ Ventas enriched subido — rows={data.get('rows', '?')} "
                f"upserted={data.get('upserted', '?')} dist={data.get('dist_id', '?')}"
            )
            return True
        logger.error(f"  ❌ API ventas-enriched {resp.status_code}: {resp.text[:260]}")
        return False
    except Exception as e:
        logger.error(f"  ❌ Error subiendo ventas-enriched ({tenant_id}): {e}")
        return False


def _compactar_excel_para_upload(file_bytes: bytes) -> bytes | None:
    """
    Reescribe el Excel sin estilos para bajar peso, preservando contenido.
    Se fuerza dtype=str para evitar pérdidas de precisión en IDs numéricos largos.
    """
    try:
        df = pd.read_excel(
            io.BytesIO(file_bytes),
            dtype=str,
            engine="openpyxl",
            keep_default_na=False,
        )

        out = io.BytesIO()
        df.to_excel(out, index=False, engine="openpyxl")
        return out.getvalue()
    except Exception as e:
        logger.warning(f"  ⚠️ Falló compactación de Excel: {type(e).__name__}: {e}")
        return None
