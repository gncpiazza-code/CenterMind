# -*- coding: utf-8 -*-
"""
services/objetivos_notification_service.py
==========================================
Servicio centralizado de notificaciones para el sistema de objetivos.

Canales soportados:
  - Telegram: mensaje al grupo del vendedor (sync via requests)
  - WebSocket: broadcast al supervisor en tiempo real (async bridge)
"""
from __future__ import annotations

import asyncio
import logging
import requests
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosNotification")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

TIPO_EMOJI = {
    "alteo":      "📍",
    "activacion": "🟢",
    "exhibicion": "📸",
    "cobranza":   "💰",
}


class ObjetivosNotificationService:
    # ── Telegram ──────────────────────────────────────────────────────────────

    def notify_vendor_telegram(
        self,
        dist_id: int,
        id_objetivo: str,
        id_vendedor: int,
        tipo_evento: str,
        pdv_data: dict[str, Any],
    ) -> None:
        """
        Envía un mensaje al grupo Telegram del vendedor indicando que un
        evento de objetivo fue detectado.
        """
        try:
            token = self._get_bot_token(dist_id)
            if not token:
                logger.warning(f"[Notif] Sin token_bot para dist={dist_id}")
                return

            chat_id = self._get_vendor_group_chat_id(dist_id, id_vendedor)
            if not chat_id:
                logger.info(
                    f"[Notif] No se encontró grupo Telegram para "
                    f"vendedor={id_vendedor} dist={dist_id} — sin notificación"
                )
                return

            emoji = TIPO_EMOJI.get(tipo_evento, "🎯")
            pdv_nombre = pdv_data.get("nombre_cliente") or pdv_data.get("nombre") or "PDV"
            pdv_codigo = pdv_data.get("id_cliente_erp") or pdv_data.get("codigo") or ""
            cod_str = f" (#{pdv_codigo})" if pdv_codigo else ""

            tipo_label = {
                "alteo":      "Alteo",
                "activacion": "Activación",
                "exhibicion": "Exhibición",
                "cobranza":   "Pago registrado",
            }.get(tipo_evento, tipo_evento.capitalize())

            text = (
                f"{emoji} <b>¡Objetivo en Marcha!</b>\n"
                f"Se detectó un <b>{tipo_label}</b> en el PDV "
                f"<b>{pdv_nombre}</b>{cod_str}.\n"
                f"¡Sigue así! 💪"
            )

            resp = requests.post(
                TELEGRAM_API.format(token=token),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=8,
            )
            if resp.ok:
                logger.info(
                    f"[Notif] Telegram enviado a chat={chat_id} "
                    f"(dist={dist_id}, vendedor={id_vendedor}, tipo={tipo_evento})"
                )
            else:
                logger.warning(
                    f"[Notif] Telegram error: {resp.status_code} {resp.text[:120]}"
                )
        except Exception as e:
            logger.error(f"[Notif] Error en notify_vendor_telegram: {e}")

    # ── WebSocket (supervisor) ────────────────────────────────────────────────

    def notify_supervisor_ws(
        self,
        dist_id: int,
        event_data: dict[str, Any],
    ) -> None:
        """
        Emite un evento WebSocket al supervisor para mostrar un toast/alerta
        en tiempo real en la interfaz web.

        Compatible con contextos síncronos (scheduler, ingesta) gracias al
        bridge asyncio.run_coroutine_threadsafe.
        """
        try:
            from core.lifespan import manager

            payload = {
                "type": "objetivo_evento",
                "dist_id": dist_id,
                **event_data,
            }

            loop = self._get_running_loop()
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(dist_id, payload), loop
                )
                logger.info(
                    f"[Notif] WS broadcast encolado para dist={dist_id} "
                    f"tipo={event_data.get('tipo_evento')}"
                )
            else:
                # Fallback: crear loop temporario (e.g. scripts standalone)
                asyncio.run(manager.broadcast(dist_id, payload))
        except Exception as e:
            logger.warning(f"[Notif] WS broadcast omitido: {e}")

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _get_bot_token(self, dist_id: int) -> str | None:
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
            logger.warning(f"[Notif] _get_bot_token dist={dist_id}: {e}")
            return None

    def _get_vendor_group_chat_id(
        self, dist_id: int, id_vendedor: int
    ) -> int | None:
        """
        Busca el telegram_group_id del grupo al que pertenece el vendedor.
        Estrategia: integrantes_grupo.telegram_group_id WHERE id_vendedor_v2 = id_vendedor.
        """
        try:
            res = (
                sb.table("integrantes_grupo")
                .select("telegram_group_id")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_v2", id_vendedor)
                .limit(1)
                .execute()
            )
            row = (res.data or [{}])[0]
            return row.get("telegram_group_id")
        except Exception as e:
            logger.warning(
                f"[Notif] _get_vendor_group_chat_id vend={id_vendedor}: {e}"
            )
            return None

    @staticmethod
    def _get_running_loop() -> asyncio.AbstractEventLoop | None:
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            return None


# Singleton
objetivos_notification = ObjetivosNotificationService()
