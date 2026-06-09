"""
Servicio de subida de exhibiciones para la app móvil (SHELFYAPP / Flutter).

Maneja:
- Idempotencia vía client_upload_id (tabla vendedor_app_upload_queue)
- Llamada a RPC fn_bot_registrar_exhibicion (mismos parámetros que bot_worker)
- Marcado de source='mobile_app' + coordenadas en la fila de exhibicion
- Stats post-upload vía aggregate_exhibicion_counts_vendor_scope
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta

from supabase import Client
from fastapi import HTTPException

from core.helpers import tenant_table_name
from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    EXHIBICION_ROW_COLS,
)
from core.vendedor_app_auth import ensure_mobile_integrante, _mobile_telegram_user_id

logger = logging.getLogger("ShelfyAPI")

AR_TZ = timezone(timedelta(hours=-3))


def _parse_capture_metadata(raw: str | None) -> dict | None:
    """Parsea JSON de metadatos de captura in-app (auditoría)."""
    if not raw or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"raw": parsed}
    except json.JSONDecodeError:
        return {"raw": raw[:2000]}

# ─── Constantes ───────────────────────────────────────────────────────────────

_UPLOAD_QUEUE_TABLE = "vendedor_app_upload_queue"
_STORAGE_BUCKET = "Exhibiciones-PDV"


def _distribuidor_storage_folder(sb: Client, dist_id: int) -> str:
    """Nombre seguro del distribuidor para paths en Storage."""
    try:
        res = (
            sb.table("distribuidores")
            .select("nombre")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        nombre = (res.data or [{}])[0].get("nombre") or f"dist_{dist_id}"
    except Exception:
        nombre = f"dist_{dist_id}"
    return "".join(c if c.isalnum() or c in "-_ " else "" for c in str(nombre)).strip().replace(" ", "_") or f"dist_{dist_id}"


def upload_mobile_photos_to_storage(
    sb: Client,
    dist_id: int,
    files: list[tuple[str, bytes]],
) -> list[str]:
    """
    Sube fotos JPEG/PNG al bucket Exhibiciones-PDV.
    files: lista de (filename, bytes).
    Retorna URLs públicas en el mismo orden.
    """
    if not files:
        return []

    dist_folder = _distribuidor_storage_folder(sb, dist_id)
    date_folder = datetime.now(AR_TZ).strftime("%Y-%m-%d")
    urls: list[str] = []

    for original_name, file_bytes in files:
        if not file_bytes:
            continue
        ext = ".jpg"
        lower = original_name.lower()
        if lower.endswith(".png"):
            ext = ".png"
        elif lower.endswith(".webp"):
            ext = ".webp"
        storage_path = f"{dist_folder}/{date_folder}/mobile_{uuid.uuid4().hex}{ext}"
        content_type = "image/jpeg" if ext == ".jpg" else f"image/{ext.lstrip('.')}"

        uploaded = False
        for attempt in range(1, 4):
            try:
                sb.storage.from_(_STORAGE_BUCKET).upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"content-type": content_type, "upsert": "true"},
                )
                url = sb.storage.from_(_STORAGE_BUCKET).get_public_url(storage_path)
                urls.append(url)
                uploaded = True
                break
            except Exception as e:
                logger.warning(
                    f"upload_mobile_photos attempt {attempt}/3 dist={dist_id} path={storage_path}: {e}"
                )
                time.sleep(attempt * 2)

        if not uploaded:
            raise HTTPException(status_code=500, detail="Error subiendo foto a storage")

    return urls


# ─── Validación de cartera ────────────────────────────────────────────────────


def validate_nro_cliente_en_cartera(
    sb: Client,
    dist_id: int,
    id_vendedor: int,
    nro_cliente: str,
) -> bool:
    """
    Retorna True si el PDV (nro_cliente = id_cliente_erp) está en la cartera
    del vendedor (alguna ruta asignada al vendedor en rutas_v2).
    """
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas_res = (
        sb.table(rutas_table)
        .select("id_ruta")
        .eq("id_vendedor", id_vendedor)
        .execute()
    )
    ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
    if not ruta_ids:
        return False

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    pdv_res = (
        sb.table(pdv_table)
        .select("id_cliente_erp")
        .eq("id_distribuidor", dist_id)
        .eq("id_cliente_erp", nro_cliente)
        .in_("id_ruta", ruta_ids)
        .limit(1)
        .execute()
    )
    if pdv_res.data:
        return True

    # Fallback: nro_cliente sin ceros iniciales
    nro_stripped = nro_cliente.lstrip("0")
    if nro_stripped and nro_stripped != nro_cliente:
        pdv_res2 = (
            sb.table(pdv_table)
            .select("id_cliente_erp")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", nro_stripped)
            .in_("id_ruta", ruta_ids)
            .limit(1)
            .execute()
        )
        return bool(pdv_res2.data)

    return False


# ─── RPC wrapper (sin bot_worker) ─────────────────────────────────────────────


def _call_rpc_registrar_exhibicion(
    sb: Client,
    dist_id: int,
    vendedor_id: int,
    nro_cliente: str,
    tipo_pdv: str,
    drive_link: str,
    telegram_msg_id: int = 0,
    telegram_chat_id: int = -1,
) -> dict:
    """
    Llama a fn_bot_registrar_exhibicion directamente desde la API HTTP.
    telegram_msg_id=0 y telegram_chat_id=-1 son sentineles para indicar origen mobile.
    Retorna dict con id_exhibicion, estado_final, error.
    """
    try:
        res = sb.rpc("fn_bot_registrar_exhibicion", {
            "p_distribuidor_id": dist_id,
            "p_vendedor_id": vendedor_id,
            "p_nro_cliente": nro_cliente,
            "p_tipo_pdv": tipo_pdv,
            "p_drive_link": drive_link,
            "p_telegram_msg_id": telegram_msg_id,
            "p_telegram_chat_id": telegram_chat_id,
        }).execute()

        data = res.data
        if isinstance(data, list) and data:
            data = data[0]

        if isinstance(data, dict):
            return {**data, "error": None}

        return {"id_exhibicion": None, "estado_final": None, "error": "Respuesta inesperada del RPC"}

    except Exception as e:
        logger.error(f"_call_rpc_registrar_exhibicion dist={dist_id} vendor={vendedor_id}: {e}")
        return {"id_exhibicion": None, "estado_final": None, "error": str(e)}


# ─── Función principal ────────────────────────────────────────────────────────


def process_exhibicion_upload(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    device_id: str,
    nro_cliente: str,
    tipo_pdv: str,
    photo_urls: list[str],
    client_upload_id: str,
    capture_lat: float | None,
    capture_lng: float | None,
    capture_metadata: str | None = None,
) -> dict:
    """
    Procesa subida de exhibiciones desde la app móvil con idempotencia.

    1. Verifica idempotencia por client_upload_id.
    2. Inserta fila en upload_queue con estado='processing'.
    3. Asegura integrante sintético ANTES del RPC (fn_bot_registrar_exhibicion espera telegram_user_id).
    4. Llama a fn_bot_registrar_exhibicion por cada foto con telegram_user_id sintético.
    5. Actualiza source='mobile_app', coordenadas y client_upload_id en exhibiciones.
    6. Actualiza upload_queue a estado='done'.
    7. Calcula stats post-upload (vendor scope).
    8. Retorna {exhibicion_ids, stats_summary}.
    """
    # ── 1. Chequeo idempotencia ────────────────────────────────────────────────
    try:
        cached = (
            sb.table(_UPLOAD_QUEUE_TABLE)
            .select("id, estado, exhibicion_ids")
            .eq("client_upload_id", client_upload_id)
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        if cached.data:
            row = cached.data[0]
            if row.get("estado") == "done":
                logger.info(
                    f"process_exhibicion_upload: hit idempotency cache "
                    f"client_upload_id={client_upload_id}"
                )
                return {
                    "exhibicion_ids": row.get("exhibicion_ids") or [],
                    "stats_summary": {},
                    "idempotent": True,
                }
    except Exception as e:
        logger.warning(f"process_exhibicion_upload idempotency check failed: {e}")

    # ── 2. Insertar fila en upload_queue con estado='processing' ──────────────
    queue_row_id: int | None = None
    try:
        q_res = (
            sb.table(_UPLOAD_QUEUE_TABLE)
            .insert({
                "id_distribuidor": dist_id,
                "id_vendedor_v2": id_vendedor_v2,
                "device_id": device_id,
                "nro_cliente": nro_cliente,
                "tipo_pdv": tipo_pdv,
                "photo_urls": photo_urls,
                "client_upload_id": client_upload_id,
                "capture_lat": capture_lat,
                "capture_lng": capture_lng,
                "payload_meta": _parse_capture_metadata(capture_metadata),
                "estado": "processing",
                "created_at": datetime.now(AR_TZ).isoformat(),
            })
            .execute()
        )
        if q_res.data:
            queue_row_id = q_res.data[0].get("id")
    except Exception as e:
        # No bloquear el flujo si la tabla no existe aún (pendiente migración)
        logger.warning(f"process_exhibicion_upload insert queue failed (ignorando): {e}")

    # ── 3. Asegurar integrante sintético ANTES del RPC ───────────────────────
    # fn_bot_registrar_exhibicion espera p_vendedor_id = telegram_user_id
    # (lookup por integrantes_grupo). El integrante debe existir ANTES de llamar al RPC.
    try:
        ensure_mobile_integrante(sb, dist_id, id_vendedor_v2, device_id)
    except Exception as e:
        logger.warning(f"process_exhibicion_upload ensure_mobile_integrante pre-RPC: {e}")

    tg_user_id = _mobile_telegram_user_id(device_id, id_vendedor_v2)

    # ── 4. Llamar RPC por cada foto ───────────────────────────────────────────
    exhibicion_ids: list[int] = []
    for photo_url in photo_urls:
        if not photo_url:
            continue
        rpc_result = _call_rpc_registrar_exhibicion(
            sb=sb,
            dist_id=dist_id,
            vendedor_id=tg_user_id,
            nro_cliente=nro_cliente,
            tipo_pdv=tipo_pdv,
            drive_link=photo_url,
            telegram_msg_id=0,
            telegram_chat_id=-1,
        )
        ex_id = rpc_result.get("id_exhibicion")
        if ex_id:
            exhibicion_ids.append(int(ex_id))
        else:
            logger.warning(
                f"process_exhibicion_upload RPC error for photo={photo_url[:60]}: "
                f"{rpc_result.get('error')}"
            )

    # Fallar explícitamente si el RPC no registró ninguna exhibición
    if not exhibicion_ids:
        raise HTTPException(
            status_code=422,
            detail="El servidor no pudo registrar la exhibición. Verificá que el PDV esté en tu cartera e intentá de nuevo.",
        )

    # ── 5. Actualizar exhibiciones: source, coords, client_upload_id ─────────
    ex_table = tenant_table_name("exhibiciones", dist_id)
    update_payload: dict = {
        "source": "mobile_app",
        "client_upload_id": client_upload_id,
    }
    if capture_lat is not None:
        update_payload["capture_lat"] = capture_lat
    if capture_lng is not None:
        update_payload["capture_lng"] = capture_lng

    for ex_id in exhibicion_ids:
        try:
            sb.table(ex_table).update(update_payload).eq("id_exhibicion", ex_id).execute()
        except Exception as e:
            logger.warning(f"process_exhibicion_upload update exhibicion {ex_id}: {e}")

    # ── 6. Actualizar upload_queue a estado='done' ────────────────────────────
    if queue_row_id is not None:
        try:
            sb.table(_UPLOAD_QUEUE_TABLE).update({
                "estado": "done",
                "exhibicion_ids": exhibicion_ids,
                "updated_at": datetime.now(AR_TZ).isoformat(),
            }).eq("id", queue_row_id).execute()
        except Exception as e:
            logger.warning(f"process_exhibicion_upload update queue to done: {e}")

    # ── 7. Stats post-upload vía aggregate_exhibicion_counts_vendor_scope ─────
    stats_summary: dict = {}
    try:
        # Obtener exhibiciones del mes actual para el vendedor
        now_ar = datetime.now(AR_TZ)
        mes_inicio = now_ar.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        mes_fin = now_ar.isoformat()

        # Necesitamos los id_integrante del vendedor para la query
        integrantes_res = (
            sb.table("integrantes_grupo")
            .select("id_integrante")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor_v2)
            .execute()
        )
        integrante_ids = [r["id_integrante"] for r in (integrantes_res.data or [])]

        if integrante_ids:
            rows: list[dict] = []
            PAGE = 1000
            offset = 0
            exhibiciones_table = tenant_table_name("exhibiciones", dist_id)
            while True:
                batch = (
                    sb.table(exhibiciones_table)
                    .select(EXHIBICION_ROW_COLS)
                    .eq("id_distribuidor", dist_id)
                    .in_("id_integrante", integrante_ids)
                    .gte("timestamp_subida", mes_inicio)
                    .lte("timestamp_subida", mes_fin)
                    .range(offset, offset + PAGE - 1)
                    .execute().data or []
                )
                rows.extend(batch)
                if len(batch) < PAGE:
                    break
                offset += PAGE

            stats_summary = aggregate_exhibicion_counts_vendor_scope(rows)
    except Exception as e:
        logger.warning(f"process_exhibicion_upload stats: {e}")

    return {
        "exhibicion_ids": exhibicion_ids,
        "stats_summary": stats_summary,
        "idempotent": False,
    }
