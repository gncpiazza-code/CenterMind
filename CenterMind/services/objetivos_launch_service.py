# -*- coding: utf-8 -*-
"""
objetivos_launch_service.py
============================
Lanzamiento de objetivos planificados — automático (cron 08:00 AR) y manual.

Un objetivo está "planificado" cuando:
  - lanzado_at IS NULL  (nunca fue notificado)
  - fecha_inicio <= hoy AR  (ya llegó su fecha de inicio)

Al lanzar: se notifica por Telegram y se setea lanzado_at = now().
"""

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from db import sb

logger = logging.getLogger("objetivos_launch")

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def _hoy_ar() -> str:
    return datetime.now(AR_TZ).date().isoformat()


def lanzar_un_objetivo(
    obj_id: str,
    dist_id: int,
    asignado_por: str | None = None,
) -> dict:
    """
    Lanza un objetivo planificado: notifica Telegram y setea lanzado_at.

    Returns dict con resultado: {"ok": bool, "error": str | None}.
    Es idempotente: si lanzado_at ya está seteado retorna ok=True sin re-enviar.
    """
    try:
        res = sb.table("objetivos").select("*").eq("id", obj_id).eq("id_distribuidor", dist_id).limit(1).execute()
        rows = res.data or []
        if not rows:
            return {"ok": False, "error": "objetivo no encontrado"}

        obj = rows[0]
        if obj.get("lanzado_at"):
            return {"ok": True, "already_launched": True}

        if obj.get("tipo") == "ruteo":
            return {"ok": False, "error": "tipo ruteo no se notifica por Telegram"}

        from services.objetivos_notification_service import objetivos_notification
        notify_payload = {
            **obj,
            "asignado_por_usuario": asignado_por,
        }
        notif_meta = objetivos_notification.notify_new_objective_telegram(
            dist_id, notify_payload, obj_id=obj_id
        )

        ahora = datetime.now(timezone.utc).isoformat()
        sb.table("objetivos").update({"lanzado_at": ahora}).eq("id", obj_id).execute()

        if notif_meta and notif_meta.get("chat_id") and notif_meta.get("message_id"):
            try:
                sb.table("objetivos_tracking").upsert(
                    {
                        "id_objetivo": obj_id,
                        "id_referencia": str(notif_meta["message_id"]),
                        "tipo_evento": "telegram_objetivo_asignado",
                        "metadata": {
                            "chat_id": int(notif_meta["chat_id"]),
                            "message_id": int(notif_meta["message_id"]),
                        },
                    },
                    on_conflict="id_objetivo,id_referencia,tipo_evento",
                ).execute()
            except Exception as e_track:
                logger.warning(f"[Launch] No se pudo guardar ref Telegram objetivo {obj_id}: {e_track}")

        logger.info(f"[Launch] objetivo {obj_id} dist={dist_id} lanzado ok")
        return {"ok": True, "already_launched": False}

    except Exception as e:
        logger.error(f"[Launch] Error lanzando objetivo {obj_id}: {e}")
        return {"ok": False, "error": str(e)}


def lanzar_programados_fecha(dist_id: int | None = None) -> dict:
    """
    Lanza todos los objetivos planificados con fecha_inicio <= hoy AR y lanzado_at null.
    Llamado por el cron de 08:00 AR.

    Si dist_id es None, procesa todos los distribuidores.
    """
    hoy = _hoy_ar()
    try:
        q = (
            sb.table("objetivos")
            .select("id, id_distribuidor, tipo, lanzado_at")
            .is_("lanzado_at", "null")
            .eq("cumplido", False)
            .lte("fecha_inicio", hoy)
        )
        if dist_id is not None:
            q = q.eq("id_distribuidor", dist_id)

        res = q.execute()
        objetivos = res.data or []

        lanzados = 0
        errores = 0
        for obj in objetivos:
            result = lanzar_un_objetivo(str(obj["id"]), int(obj["id_distribuidor"]))
            if result.get("ok"):
                lanzados += 1
            else:
                errores += 1
                logger.warning(f"[Launch cron] obj={obj['id']}: {result.get('error')}")

        logger.info(f"[Launch cron] fecha={hoy} lanzados={lanzados} errores={errores}")
        return {"fecha": hoy, "lanzados": lanzados, "errores": errores, "total": len(objetivos)}
    except Exception as e:
        logger.error(f"[Launch cron] Error general: {e}")
        return {"fecha": hoy, "lanzados": 0, "errores": 1, "error": str(e)}
