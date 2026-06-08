# -*- coding: utf-8 -*-
"""
Servicio de push notifications para la app movil de vendedores.
Por ahora los pushes se loggean (FCM real se conecta cuando FCM_SERVER_KEY este configurado).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb

logger = logging.getLogger("ShelfyAPI")


def register_device_token(
    sb_client,
    dist_id: int,
    id_vendedor_v2: int,
    device_id: str,
    fcm_token: str,
    platform: str,
) -> dict:
    """
    Registra o actualiza el token FCM/APNs de un dispositivo.
    Upsert en vendedor_app_device_tokens por (dist_id, id_vendedor_v2, device_id).
    """
    data = {
        "id_distribuidor": dist_id,
        "id_vendedor_v2": id_vendedor_v2,
        "device_id": device_id,
        "fcm_token": fcm_token,
        "platform": platform,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = (
            sb_client.table("vendedor_app_device_tokens")
            .upsert(data, on_conflict="id_distribuidor,id_vendedor_v2,device_id")
            .execute()
        )
        logger.info(
            f"[push] token registrado dist={dist_id} vendor={id_vendedor_v2} platform={platform}"
        )
        return {"ok": True, "rows": len(res.data or [])}
    except Exception as e:
        logger.error(f"[push] register_device_token dist={dist_id} vendor={id_vendedor_v2}: {e}")
        raise


def dispatch_scheduled_pushes(dist_id: int | None = None) -> dict:
    """
    Despacha pushes de objetivos programados.

    - Obtiene settings de vendedor_app_settings
    - Filtra tokens de vendedor_app_device_tokens para el dist dado (o todos si None)
    - Registra cada intento en vendedor_app_push_log
    - Por ahora: solo LOG (FCM real se conecta cuando FCM_SERVER_KEY este configurado)

    Returns:
        dict con claves "dispatched" y "errors"
    """
    dispatched = 0
    errors = 0

    try:
        # Obtener settings habilitadas
        settings_q = sb.table("vendedor_app_settings").select("*")
        if dist_id is not None:
            settings_q = settings_q.eq("id_distribuidor", dist_id)
        settings_rows = settings_q.execute().data or []
    except Exception as e:
        logger.error(f"[push] dispatch_scheduled_pushes: error leyendo settings: {e}")
        return {"dispatched": 0, "errors": 1}

    enabled_dists = [
        row["id_distribuidor"]
        for row in settings_rows
        if row.get("push_objetivos_enabled", True)
    ]

    if not enabled_dists:
        logger.info("[push] dispatch_scheduled_pushes: sin distribuidores habilitados")
        return {"dispatched": 0, "errors": 0}

    try:
        # Obtener tokens activos para los distribuidores habilitados
        tokens_res = (
            sb.table("vendedor_app_device_tokens")
            .select("id_distribuidor, id_vendedor_v2, device_id, fcm_token, platform")
            .in_("id_distribuidor", enabled_dists)
            .execute()
        )
        tokens = tokens_res.data or []
    except Exception as e:
        logger.error(f"[push] dispatch_scheduled_pushes: error leyendo tokens: {e}")
        return {"dispatched": 0, "errors": 1}

    for token_row in tokens:
        d_id = token_row["id_distribuidor"]
        v_id = token_row["id_vendedor_v2"]
        try:
            # TODO: enviar push real via FCM cuando FCM_SERVER_KEY este configurado
            # from services.fcm_service import send_fcm_push
            # send_fcm_push(token_row["fcm_token"], title="Objetivos del dia", body=...)
            logger.info(
                "[push] SIMULADO dist=%s vendor=%s platform=%s token=%s..." % (d_id, v_id, token_row.get("platform"), token_row["fcm_token"][:12])
            )

            # Registrar en push log
            sb.table("vendedor_app_push_log").insert({
                "id_distribuidor": d_id,
                "id_vendedor_v2": v_id,
                "push_type": "objetivos_diarios",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "status": "simulated",
            }).execute()
            dispatched += 1
        except Exception as e:
            logger.warning(f"[push] error despachando dist={d_id} vendor={v_id}: {e}")
            try:
                sb.table("vendedor_app_push_log").insert({
                    "id_distribuidor": d_id,
                    "id_vendedor_v2": v_id,
                    "push_type": "objetivos_diarios",
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                    "status": "error",
                    "error_detail": str(e),
                }).execute()
            except Exception:
                pass
            errors += 1

    logger.info(f"[push] dispatch_scheduled_pushes: dispatched={dispatched} errors={errors}")
    return {"dispatched": dispatched, "errors": errors}
