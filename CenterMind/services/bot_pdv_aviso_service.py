# -*- coding: utf-8 -*-
"""
services/bot_pdv_aviso_service.py
===================================
Servicio de avisos post-padrón para PDVs nuevos declarados en el bot.

Flujo:
  1. PadronIngestionService llama a procesar_pendientes(dist_id) tras reconcile.
  2. Este servicio lee bot_pdv_pendiente_aviso (sin aviso enviado).
  3. Verifica que el PDV ya exista en clientes_pdv_v2 del dist.
  4. Arma un mensaje HTML y lo envía como reply al resumen «Exhibición registrada»
     (telegram_msg_id de la fila en exhibiciones).
  5. Marca aviso_enviado_at para evitar duplicados.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import requests

from db import sb
from core.bot_cliente_cartera import (
    cliente_en_cartera_vendedor,
    get_pdv_display_row,
    normalize_erp,
)

logger = logging.getLogger("bot_pdv_aviso_service")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
PAGE = 1000


def procesar_pendientes(dist_id: int) -> dict:
    """
    Lee bot_pdv_pendiente_aviso para el dist, envía avisos Telegram
    cuando el PDV ya aparece en el padrón. Retorna stats.
    """
    token = _get_bot_token(dist_id)
    if not token:
        logger.warning(f"[AvisoPDV] Sin token bot para dist={dist_id}; avisos omitidos.")
        return {"dist_id": dist_id, "enviados": 0, "errores": 0, "sin_token": True}

    n_ok = 0
    n_err = 0
    offset = 0

    while True:
        batch = (
            sb.table("bot_pdv_pendiente_aviso")
            .select("*")
            .eq("id_distribuidor", dist_id)
            .is_("aviso_enviado_at", "null")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )

        for fila in batch:
            erp = fila.get("id_cliente_erp", "")
            pdv_row = get_pdv_display_row(dist_id, erp, sb)
            if not pdv_row:
                continue  # todavía no ingresó al padrón

            id_vendedor_v2 = fila.get("id_vendedor_v2")
            if id_vendedor_v2:
                en_cartera = cliente_en_cartera_vendedor(dist_id, id_vendedor_v2, erp, sb)
                if not en_cartera:
                    logger.info(
                        f"[AvisoPDV] PDV {erp} dist={dist_id} ingresó al padrón "
                        f"pero no en ruta del vendedor {id_vendedor_v2}; omitiendo aviso."
                    )
                    continue

            texto = build_aviso_message(pdv_row, fila)
            chat_id = fila.get("telegram_chat_id")
            if not chat_id:
                continue

            reply_msg_id = _telegram_reply_msg_id(fila.get("id_exhibicion"))
            ok = send_aviso(token, chat_id, texto, reply_to_message_id=reply_msg_id)
            _marcar_pendiente(fila["id"], ok)
            if ok:
                n_ok += 1
            else:
                n_err += 1

        if len(batch) < PAGE:
            break
        offset += PAGE

    logger.info(f"[AvisoPDV] dist={dist_id} enviados={n_ok} errores={n_err}")
    return {"dist_id": dist_id, "enviados": n_ok, "errores": n_err}


def build_aviso_message(pdv_row: dict, pendiente_row: dict) -> str:
    erp = normalize_erp(pendiente_row.get("id_cliente_erp", ""))
    nf = (pdv_row.get("nombre_fantasia") or "").strip()
    rs = (pdv_row.get("nombre_razon_social") or "").strip()
    domicilio = (pdv_row.get("domicilio") or "").strip()
    localidad = (pdv_row.get("localidad") or "").strip()
    fecha_alta_raw = pdv_row.get("fecha_alta") or ""
    fecha_alta = str(fecha_alta_raw)[:10] if fecha_alta_raw else ""
    dia_semana = (pdv_row.get("dia_semana") or "").strip()

    lineas = [f"Tu PDV nuevo <code>{erp}</code> ya está en el padrón.\n"]

    if nf and rs and nf != rs:
        lineas.append(f"<b>{nf}</b> / <i>{rs}</i>")
    elif nf:
        lineas.append(f"<b>{nf}</b>")
    elif rs:
        lineas.append(f"<b>{rs}</b>")

    if domicilio or localidad:
        ubicacion = ", ".join(p for p in [domicilio, localidad] if p)
        lineas.append(f"📍 {ubicacion}")

    ruta_info = ""
    if fecha_alta:
        ruta_info += f"Alta: {fecha_alta}"
    if dia_semana:
        ruta_info += f" · Ruta: {dia_semana}"
    if ruta_info:
        lineas.append(f"🗓 {ruta_info.strip()}")

    lineas.append("La exhibición quedó vinculada.")
    return "\n".join(lineas)


def send_aviso(
    token: str,
    chat_id: int,
    text: str,
    reply_to_message_id: int | None = None,
) -> bool:
    url = TELEGRAM_API.format(token=token)
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_to_message_id:
        payload["reply_parameters"] = {
            "message_id": reply_to_message_id,
            "chat_id": chat_id,
        }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if not resp.ok:
            logger.warning(f"[AvisoPDV] Telegram error {resp.status_code}: {resp.text[:200]}")
        return resp.ok
    except Exception as e:
        logger.warning(f"[AvisoPDV] send_aviso exception: {e}")
        return False


# ── helpers privados ──────────────────────────────────────────────────────────

def _telegram_reply_msg_id(id_exhibicion: int | None) -> int | None:
    """
    message_id del resumen «Exhibición registrada» (telegram_msg_id en exhibiciones).
    El aviso post-padrón hace reply ahí para quedar en el hilo de la carga.
    """
    if not id_exhibicion:
        return None
    try:
        res = (
            sb.table("exhibiciones")
            .select("telegram_msg_id, telegram_chat_id")
            .eq("id_exhibicion", id_exhibicion)
            .limit(1)
            .execute()
        )
        row = (res.data or [{}])[0]
        msg_id = row.get("telegram_msg_id")
        return int(msg_id) if msg_id else None
    except Exception as e:
        logger.warning(f"[AvisoPDV] lookup telegram_msg_id ex={id_exhibicion}: {e}")
        return None


def _get_bot_token(dist_id: int) -> str | None:
    try:
        res = (
            sb.table("distribuidores")
            .select("token_bot")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        return (res.data or [{}])[0].get("token_bot")
    except Exception as e:
        logger.warning(f"[AvisoPDV] _get_bot_token dist={dist_id}: {e}")
        return None


def _marcar_pendiente(pendiente_id: int, ok: bool) -> None:
    try:
        if ok:
            sb.table("bot_pdv_pendiente_aviso").update({
                "aviso_enviado_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", pendiente_id).execute()
        else:
            sb.table("bot_pdv_pendiente_aviso").update({
                "aviso_error": "send_aviso retornó False",
            }).eq("id", pendiente_id).execute()
    except Exception as e:
        logger.warning(f"[AvisoPDV] _marcar_pendiente id={pendiente_id}: {e}")
