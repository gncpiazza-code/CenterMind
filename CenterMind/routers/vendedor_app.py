# -*- coding: utf-8 -*-
"""
Router para la app móvil de vendedores (SHELFYAPP / Flutter).
Prefix: /api/vendedor-app

Separación de contextos de auth:
  - verify_vendedor_session: JWT tipo "vendedor_app" (emitido por activate_key)
  - Depends(verify_auth): JWT portal normal (admin/supervisor) para gestión de claves
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, File, Form, UploadFile
from pydantic import BaseModel

from core.security import verify_auth, check_dist_permission
from core.vendedor_app_auth import decode_session_jwt
from core.pdv_proximity import pdvs_cercanos_cartera
from services.vendedor_app_auth_service import (
    activate_key,
    create_vendor_key,
    list_vendor_keys,
    revoke_key,
    revoke_device,
)
from services.vendedor_cartera_service import build_cartera_json
from services.vendedor_upload_service import (
    process_exhibicion_upload,
    upload_mobile_photos_to_storage,
    validate_nro_cliente_en_cartera,
)
from services.vendedor_stats_service import get_stats_vendedor_app
from services.vendedor_objetivos_service import list_objetivos_vendedor
from db import sb

logger = logging.getLogger("ShelfyAPI")
router = APIRouter(prefix="/api/vendedor-app", tags=["Vendedor App"])


# ─── Dependencia: sesión de vendedor app ─────────────────────────────────────


def verify_vendedor_session(authorization: str | None = None) -> dict:
    """
    Extrae y valida el JWT de sesión de la app móvil.
    Header: Authorization: Bearer <token>
    Retorna payload con keys: key_id, id_distribuidor (dist), id_vendedor (vendor), device_id (device).
    """
    if not authorization:
        # FastAPI inyecta None si el header no existe; necesitamos importar Header
        raise HTTPException(status_code=401, detail="Se requiere Authorization: Bearer <token>")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Formato inválido. Usa: Authorization: Bearer <token>")
    return decode_session_jwt(token)


def _get_vendedor_session(authorization: str = None) -> dict:
    """Wrapper para uso como dependencia FastAPI con Header injection."""
    from fastapi import Header as _Header
    raise HTTPException(status_code=401, detail="Se requiere Authorization: Bearer <token>")


# ─── Usar Header de FastAPI correctamente ────────────────────────────────────

from fastapi import Header


async def vendedor_session_dep(authorization: str = Header(None)) -> dict:
    """Dependencia FastAPI: extrae sesión móvil del header Authorization."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Se requiere Authorization: Bearer <token>")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Formato inválido. Usa: Authorization: Bearer <token>")
    return decode_session_jwt(token)


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────


class ActivateKeyRequest(BaseModel):
    key: str
    device_id: str
    platform: str
    app_version: str | None = None


class CreateKeyRequest(BaseModel):
    id_vendedor: int
    label: str | None = None


# ─── Modelos de app móvil ─────────────────────────────────────────────────────


class BatchUploadIn(BaseModel):
    nro_cliente: str
    tipo_pdv: str
    photo_urls: list[str]
    client_upload_id: str  # UUID como string para compatibilidad Flutter
    capture_lat: Optional[float] = None
    capture_lng: Optional[float] = None


class BatchUploadOut(BaseModel):
    exhibicion_ids: list[int]
    stats_summary: dict
    idempotent: bool = False


class StatsOut(BaseModel):
    mes_actual: dict
    mes_anterior: dict
    ranking: dict


class ObjetivoOut(BaseModel):
    id: Optional[int] = None
    tipo: str
    descripcion: Optional[str] = None
    fecha_objetivo: Optional[str] = None
    fecha_inicio: Optional[str] = None
    valor_objetivo: float
    valor_actual: float
    progreso_pct: float
    cumplido: bool
    lanzado_at: Optional[str] = None
    origen: Optional[str] = None
    mes_referencia: Optional[str] = None
    nombre_vendedor: Optional[str] = None


class CarteraOut(BaseModel):
    mode: str
    snapshot_label: str
    rutas: list[dict]


# ─── Endpoints Auth ───────────────────────────────────────────────────────────


@router.post(
    "/auth/activate",
    summary="Activar API key y obtener sesión JWT",
    description=(
        "El vendedor provee su API key (formato sapp_{id}_{token}) junto con "
        "device_id y plataforma. Si la clave es válida, retorna un JWT de sesión "
        "de 7 días más datos de branding del distribuidor."
    ),
)
def auth_activate(body: ActivateKeyRequest):
    result = activate_key(
        sb,
        plain_key=body.key,
        device_id=body.device_id,
        platform=body.platform,
        app_version=body.app_version,
    )
    return result


# ─── Endpoints de sesión (requieren JWT vendedor_app) ────────────────────────


@router.get(
    "/branding",
    summary="Obtener branding del distribuidor para la app",
)
def get_branding(session: dict = Depends(vendedor_session_dep)):
    """Retorna mobile_branding del distribuidor con defaults si no configurado."""
    id_distribuidor = session.get("dist")
    if not id_distribuidor:
        raise HTTPException(status_code=400, detail="dist no encontrado en sesión")

    try:
        res = (
            sb.table("distribuidores")
            .select("mobile_branding, nombre")
            .eq("id_distribuidor", id_distribuidor)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"get_branding dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail="Error consultando branding")

    defaults = {
        "primary_color": "#1A56DB",
        "logo_url": None,
        "app_name": "Shelfy",
        "accent_color": "#7C3AED",
    }

    if res.data:
        branding = res.data[0].get("mobile_branding") or {}
        nombre = res.data[0].get("nombre", "")
        if isinstance(branding, dict):
            merged = {**defaults, **branding}
        else:
            merged = defaults
        if not merged.get("app_name") or merged["app_name"] == "Shelfy":
            merged["app_name"] = nombre or "Shelfy"
        return merged

    return defaults


@router.get(
    "/pdv/cercanos",
    summary="PDVs de la cartera del vendedor cercanos a la ubicación actual",
)
def get_pdvs_cercanos(
    lat: float = Query(..., description="Latitud GPS del vendedor"),
    lng: float = Query(..., description="Longitud GPS del vendedor"),
    radio: float = Query(100.0, description="Radio en metros (máx 5000)", le=5000.0, ge=1.0),
    session: dict = Depends(vendedor_session_dep),
):
    """
    Retorna PDVs de la cartera del vendedor dentro del radio especificado,
    ordenados por distancia ascendente.
    """
    id_distribuidor: int = int(session["dist"])
    id_vendedor: int = int(session["vendor"])

    try:
        results = pdvs_cercanos_cartera(
            sb,
            dist_id=id_distribuidor,
            id_vendedor=id_vendedor,
            lat=lat,
            lng=lng,
            radio_m=radio,
        )
    except Exception as e:
        logger.error(f"get_pdvs_cercanos vendor={id_vendedor} dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail="Error consultando PDVs cercanos")

    return {"pdvs": results, "total": len(results)}


# ─── Endpoints de datos del vendedor (requieren JWT vendedor_app) ────────────


@router.post(
    "/exhibiciones/batch",
    response_model=BatchUploadOut,
    summary="Subir exhibiciones desde la app móvil (batch con idempotencia)",
    description=(
        "Registra una o más fotos de exhibición para un PDV. "
        "Usa client_upload_id para garantizar idempotencia (reintentos seguros). "
        "Valida que el PDV esté en la cartera del vendedor antes de registrar."
    ),
)
def post_exhibicion_batch(
    body: BatchUploadIn,
    session: dict = Depends(vendedor_session_dep),
):
    dist_id: int = int(session["dist"])
    id_vendedor_v2: int = int(session["vendor"])
    device_id: str = str(session.get("device") or "unknown")

    if not body.photo_urls:
        raise HTTPException(status_code=400, detail="Se requiere al menos una URL de foto")

    # Validar que el PDV esté en la cartera del vendedor
    try:
        en_cartera = validate_nro_cliente_en_cartera(
            sb, dist_id, id_vendedor_v2, body.nro_cliente
        )
    except Exception as e:
        logger.error(f"post_exhibicion_batch validate_cartera dist={dist_id} vendor={id_vendedor_v2}: {e}")
        raise HTTPException(status_code=500, detail="Error validando cartera")

    if not en_cartera:
        raise HTTPException(
            status_code=400,
            detail=f"El PDV '{body.nro_cliente}' no pertenece a la cartera del vendedor",
        )

    try:
        result = process_exhibicion_upload(
            sb=sb,
            dist_id=dist_id,
            id_vendedor_v2=id_vendedor_v2,
            device_id=device_id,
            nro_cliente=body.nro_cliente,
            tipo_pdv=body.tipo_pdv,
            photo_urls=body.photo_urls,
            client_upload_id=body.client_upload_id,
            capture_lat=body.capture_lat,
            capture_lng=body.capture_lng,
        )
    except Exception as e:
        logger.error(f"post_exhibicion_batch dist={dist_id} vendor={id_vendedor_v2}: {e}")
        raise HTTPException(status_code=500, detail="Error procesando la subida")

    return result


@router.post(
    "/exhibiciones/batch-multipart",
    response_model=BatchUploadOut,
    summary="Subir exhibiciones con fotos multipart (app móvil)",
    description=(
        "Recibe fotos como multipart/form-data, las sube a Supabase Storage "
        "y registra la exhibición con idempotencia por client_upload_id."
    ),
)
async def post_exhibicion_batch_multipart(
    nro_cliente: str = Form(...),
    tipo_pdv: str = Form(...),
    client_upload_id: str = Form(...),
    capture_lat: Optional[float] = Form(None),
    capture_lng: Optional[float] = Form(None),
    photos: list[UploadFile] = File(...),
    session: dict = Depends(vendedor_session_dep),
):
    dist_id: int = int(session["dist"])
    id_vendedor_v2: int = int(session["vendor"])
    device_id: str = str(session.get("device") or "unknown")

    if not photos:
        raise HTTPException(status_code=400, detail="Se requiere al menos una foto")

    try:
        en_cartera = validate_nro_cliente_en_cartera(
            sb, dist_id, id_vendedor_v2, nro_cliente
        )
    except Exception as e:
        logger.error(
            f"post_exhibicion_batch_multipart validate_cartera dist={dist_id} vendor={id_vendedor_v2}: {e}"
        )
        raise HTTPException(status_code=500, detail="Error validando cartera")

    if not en_cartera:
        raise HTTPException(
            status_code=400,
            detail=f"El PDV '{nro_cliente}' no pertenece a la cartera del vendedor",
        )

    file_payloads: list[tuple[str, bytes]] = []
    for upload in photos:
        content = await upload.read()
        if not content:
            continue
        file_payloads.append((upload.filename or "photo.jpg", content))

    if not file_payloads:
        raise HTTPException(status_code=400, detail="Las fotos enviadas están vacías")

    try:
        photo_urls = upload_mobile_photos_to_storage(sb, dist_id, file_payloads)
        result = process_exhibicion_upload(
            sb=sb,
            dist_id=dist_id,
            id_vendedor_v2=id_vendedor_v2,
            device_id=device_id,
            nro_cliente=nro_cliente,
            tipo_pdv=tipo_pdv,
            photo_urls=photo_urls,
            client_upload_id=client_upload_id,
            capture_lat=capture_lat,
            capture_lng=capture_lng,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"post_exhibicion_batch_multipart dist={dist_id} vendor={id_vendedor_v2}: {e}"
        )
        raise HTTPException(status_code=500, detail="Error procesando la subida")

    return result


@router.get(
    "/stats",
    response_model=StatsOut,
    summary="Estadísticas de exhibiciones del vendedor (mes actual y anterior + ranking)",
)
def get_stats(session: dict = Depends(vendedor_session_dep)):
    dist_id: int = int(session["dist"])
    id_vendedor_v2: int = int(session["vendor"])

    try:
        stats = get_stats_vendedor_app(sb, dist_id=dist_id, id_vendedor_v2=id_vendedor_v2)
    except Exception as e:
        logger.error(f"get_stats dist={dist_id} vendor={id_vendedor_v2}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo estadísticas")

    return stats


@router.get(
    "/objetivos",
    summary="Objetivos activos del vendedor",
    description="Lista objetivos activos (tipo != ruteo, fecha vigente, lanzado). Ordenados por fecha_objetivo asc.",
)
def get_objetivos(session: dict = Depends(vendedor_session_dep)):
    dist_id: int = int(session["dist"])
    id_vendedor_v2: int = int(session["vendor"])

    try:
        objetivos = list_objetivos_vendedor(sb, dist_id=dist_id, id_vendedor_v2=id_vendedor_v2)
    except Exception as e:
        logger.error(f"get_objetivos dist={dist_id} vendor={id_vendedor_v2}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo objetivos")

    return objetivos


@router.get(
    "/cartera",
    response_model=CarteraOut,
    summary="Cartera de PDVs del vendedor",
    description=(
        "Retorna la cartera de PDVs con vitalidad, coordenadas y datos de contacto. "
        "mode='hoy': solo rutas del día actual AR. mode='general': toda la semana."
    ),
)
def get_cartera(
    mode: str = Query("general", description="'hoy' para rutas del día | 'general' para toda la semana"),
    session: dict = Depends(vendedor_session_dep),
):
    if mode not in ("hoy", "general"):
        raise HTTPException(status_code=400, detail="mode debe ser 'hoy' o 'general'")

    dist_id: int = int(session["dist"])
    id_vendedor_v2: int = int(session["vendor"])

    try:
        cartera = build_cartera_json(sb, dist_id=dist_id, id_vendedor=id_vendedor_v2, mode=mode)
    except Exception as e:
        logger.error(f"get_cartera dist={dist_id} vendor={id_vendedor_v2} mode={mode}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo cartera")

    return cartera


# ─── Endpoints de gestión de claves (requieren portal auth admin/supervisor) ─


@router.get(
    "/vendedor/keys",
    summary="Listar API keys de vendedores (admin/supervisor)",
)
def get_vendor_keys(
    dist_id: int = Query(..., description="ID del distribuidor"),
    vendor_id: int | None = Query(None, description="Filtrar por ID de vendedor"),
    user_payload: dict = Depends(verify_auth),
):
    """Lista claves activas. Requiere acceso de admin o supervisor al tenant."""
    check_dist_permission(user_payload, dist_id)
    return list_vendor_keys(sb, id_distribuidor=dist_id, id_vendedor=vendor_id)


@router.post(
    "/vendedor/keys",
    summary="Crear API key para un vendedor (admin/supervisor)",
    status_code=201,
)
def post_vendor_key(
    dist_id: int = Query(..., description="ID del distribuidor"),
    body: CreateKeyRequest = ...,
    user_payload: dict = Depends(verify_auth),
):
    """
    Genera una nueva API key para el vendedor indicado.
    La key se muestra UNA SOLA VEZ en la respuesta — guardarla de inmediato.
    """
    check_dist_permission(user_payload, dist_id)
    created_by = user_payload.get("usuario") or user_payload.get("sub") or "portal"
    result = create_vendor_key(
        sb,
        id_distribuidor=dist_id,
        id_vendedor=body.id_vendedor,
        label=body.label,
        created_by=created_by,
    )
    return result


@router.post(
    "/vendedor/keys/{key_id}/revoke",
    summary="Revocar una API key (admin/supervisor)",
)
def post_revoke_key(
    key_id: int,
    dist_id: int = Query(..., description="ID del distribuidor (para validar acceso)"),
    user_payload: dict = Depends(verify_auth),
):
    """
    Revoca la API key. Los JWTs de sesión vigentes siguen funcionando hasta expirar
    (máx 7 días), pero no se podrán emitir nuevos.
    """
    check_dist_permission(user_payload, dist_id)
    # Verificar que la key pertenece al dist antes de revocar
    res = (
        sb.table("vendedor_app_keys")
        .select("id, id_distribuidor")
        .eq("id", key_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Clave no encontrada")
    if int(res.data[0]["id_distribuidor"]) != dist_id:
        raise HTTPException(status_code=403, detail="La clave no pertenece a este distribuidor")

    performed_by = user_payload.get("usuario") or user_payload.get("sub") or "portal"
    revoke_key(sb, key_id=key_id, revoked_by=performed_by)
    return {"ok": True, "key_id": key_id}


@router.post(
    "/vendedor/keys/{key_id}/devices/{device_id}/revoke",
    summary="Revocar un dispositivo específico (admin/supervisor)",
)
def post_revoke_device(
    key_id: int,
    device_id: str,
    dist_id: int = Query(..., description="ID del distribuidor (para validar acceso)"),
    user_payload: dict = Depends(verify_auth),
):
    """Desactiva un dispositivo para la API key dada."""
    check_dist_permission(user_payload, dist_id)
    # Verificar pertenencia al dist
    res = (
        sb.table("vendedor_app_keys")
        .select("id, id_distribuidor")
        .eq("id", key_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Clave no encontrada")
    if int(res.data[0]["id_distribuidor"]) != dist_id:
        raise HTTPException(status_code=403, detail="La clave no pertenece a este distribuidor")

    revoke_device(sb, key_id=key_id, device_id=device_id)
    return {"ok": True, "key_id": key_id, "device_id": device_id}


# ─── Endpoints core extendidos (A3) ──────────────────────────────────────────

from services.vendedor_stats_service import get_stats_full_vendedor_app
from services.vendedor_ranking_service import get_ranking_vendedor_app
from services.vendedor_cartera_service import get_ruta_hoy_summary
from services.vendedor_objetivos_service import get_objetivo_detalle


@router.get("/stats/full", summary="Stats full con delta de ranking")
def get_stats_full(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_stats_full_vendedor_app(sb, dist_id, vendor_id)
    except Exception as e:
        logger.error(f"get_stats_full dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo stats full")


@router.get("/ranking", summary="Ranking completo del mes")
def get_ranking(
    year: int = Query(None, description="Año (default: mes actual)"),
    month: int = Query(None, description="Mes 1-12 (default: mes actual)"),
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    from datetime import datetime, timezone, timedelta
    AR_TZ = timezone(timedelta(hours=-3))
    now = datetime.now(AR_TZ)
    y = year or now.year
    m = month or now.month
    if not (1 <= m <= 12):
        raise HTTPException(status_code=400, detail="Mes inválido (1-12)")
    try:
        return get_ranking_vendedor_app(sb, dist_id, vendor_id, y, m)
    except Exception as e:
        logger.error(f"get_ranking dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo ranking")


@router.get("/cartera/ruta-hoy", summary="Resumen de la ruta del día actual")
def get_ruta_hoy(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_ruta_hoy_summary(sb, dist_id, vendor_id)
    except Exception as e:
        logger.error(f"get_ruta_hoy dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo ruta hoy")


@router.get("/objetivos/{objetivo_id}", summary="Detalle de un objetivo específico")
def get_objetivo_by_id(
    objetivo_id: int,
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        detalle = get_objetivo_detalle(sb, dist_id, vendor_id, objetivo_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_objetivo_by_id dist={dist_id} vendor={vendor_id} obj={objetivo_id}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo objetivo")
    if detalle is None:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    return detalle

# --- FCM Device Token ------------------------------------------------------

class DeviceTokenIn(BaseModel):
    fcm_token: str
    platform: str = "unknown"


@router.post("/device-token", summary="Registrar token FCM/APNs del dispositivo")
def register_device_token_endpoint(
    body: DeviceTokenIn,
    session: dict = Depends(vendedor_session_dep),
):
    from services.vendedor_push_service import register_device_token as _reg_token
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    device_id = str(session.get("device") or "unknown")
    _reg_token(sb, dist_id, vendor_id, device_id, body.fcm_token, body.platform)
    return {"ok": True}


# ─── Endpoints extendidos: galería, ventas, CC, bundle, post-upload (A4) ─────

from fastapi.responses import Response as _Response
from services.vendedor_galeria_service import (
    get_galeria_clientes_vendedor,
    get_galeria_cliente_timeline,
    get_galeria_mapa_pins,
)
from services.vendedor_ventas_service import get_ventas_vendedor, get_ventas_pdf_bytes
from services.vendedor_cc_service import get_cc_vendedor, get_cc_pdf_bytes
from services.vendedor_post_upload_service import build_post_upload_summary
from services.vendedor_bundle_service import get_offline_bundle


@router.get("/galeria/clientes", summary="Galería: PDVs con exhibiciones del vendedor")
def get_galeria_clientes(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return {"clientes": get_galeria_clientes_vendedor(sb, dist_id, vendor_id)}
    except Exception as e:
        logger.error(f"get_galeria_clientes dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error galería clientes")


@router.get("/galeria/cliente/{id_cliente_erp}/timeline", summary="Timeline de exhibiciones de un PDV")
def get_galeria_timeline(
    id_cliente_erp: str,
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_galeria_cliente_timeline(sb, dist_id, vendor_id, id_cliente_erp)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"get_galeria_timeline dist={dist_id} vendor={vendor_id} pdv={id_cliente_erp}: {e}")
        raise HTTPException(status_code=500, detail="Error timeline galería")


@router.get("/galeria/mapa", summary="Pins del mapa de galería del vendedor")
def get_galeria_mapa(
    min_lat: float = Query(None),
    max_lat: float = Query(None),
    min_lng: float = Query(None),
    max_lng: float = Query(None),
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    bbox = None
    if all(x is not None for x in [min_lat, max_lat, min_lng, max_lng]):
        bbox = {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng}
    try:
        return {"pins": get_galeria_mapa_pins(sb, dist_id, vendor_id, bbox)}
    except Exception as e:
        logger.error(f"get_galeria_mapa dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error mapa galería")


@router.get("/ventas", summary="Ventas MTD del vendedor")
def get_ventas(
    modo: str = Query("mtd"),
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_ventas_vendedor(sb, dist_id, vendor_id, modo)
    except Exception as e:
        logger.error(f"get_ventas dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo ventas")


@router.get("/ventas/pdf", summary="PDF de ventas MTD del vendedor")
def get_ventas_pdf(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        pdf_bytes = get_ventas_pdf_bytes(sb, dist_id, vendor_id)
    except Exception as e:
        logger.error(f"get_ventas_pdf dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error generando PDF ventas")
    return _Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/cc", summary="Cuentas corrientes del vendedor")
def get_cc(
    modo: str = Query("general", description="'hoy' para vencimientos hoy | 'general' para todo"),
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_cc_vendedor(sb, dist_id, vendor_id, modo)
    except Exception as e:
        logger.error(f"get_cc dist={dist_id} vendor={vendor_id} modo={modo}: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo CC")


@router.get("/cc/pdf", summary="PDF de cuentas corrientes del vendedor")
def get_cc_pdf(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        pdf_bytes = get_cc_pdf_bytes(sb, dist_id, vendor_id)
    except Exception as e:
        logger.error(f"get_cc_pdf dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error generando PDF CC")
    return _Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/post-upload/{nro_cliente}", summary="Confirmación rica post-subida de exhibición")
def get_post_upload_summary_endpoint(
    nro_cliente: str,
    session: dict = Depends(vendedor_session_dep),
):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return build_post_upload_summary(sb, dist_id, vendor_id, nro_cliente)
    except Exception as e:
        logger.error(f"get_post_upload dist={dist_id} vendor={vendor_id} pdv={nro_cliente}: {e}")
        raise HTTPException(status_code=500, detail="Error post-upload summary")


@router.get("/bundle", summary="Bundle offline completo para la app")
def get_bundle(session: dict = Depends(vendedor_session_dep)):
    dist_id = int(session["dist"])
    vendor_id = int(session["vendor"])
    try:
        return get_offline_bundle(sb, dist_id, vendor_id)
    except Exception as e:
        logger.error(f"get_bundle dist={dist_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Error generando bundle offline")
