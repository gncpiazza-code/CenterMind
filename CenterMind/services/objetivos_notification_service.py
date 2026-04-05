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

    def notify_new_objective_telegram(
        self,
        dist_id: int,
        obj_data: dict[str, Any],
    ) -> None:
        """
        Notifica al vendedor que se le ha asignado un NUEVO objetivo.
        """
        try:
            token = self._get_bot_token(dist_id)
            if not token: return

            id_vendedor = obj_data.get("id_vendedor")
            chat_id = self._get_vendor_group_chat_id(dist_id, id_vendedor)
            if not chat_id: return

            tipo = obj_data.get("tipo")
            emoji = TIPO_EMOJI.get(tipo, "🎯")
            tipo_label = {
                "alteo":      "Alteo",
                "activacion": "Activación",
                "exhibicion": "Exhibición",
                "cobranza":   "Cobranza",
            }.get(tipo, "General")

            pdv_nombre = obj_data.get("nombre_pdv") or "PDV"
            fecha = obj_data.get("fecha_objetivo")
            limite_str = f"\n📅 <b>Fecha límite:</b> {fecha}" if fecha else ""
            desc = obj_data.get("descripcion")
            desc_str = f"\n📝 <i>{desc}</i>" if desc else ""

            # Enrich with id_cliente_erp and route day
            nro_cliente_str = ""
            ruta_str = ""
            id_target_pdv = obj_data.get("id_target_pdv")
            id_target_ruta = obj_data.get("id_target_ruta")
            try:
                if id_target_pdv:
                    pdv_res = (
                        sb.table("clientes_pdv_v2")
                        .select("id_cliente_erp")
                        .eq("id", id_target_pdv)
                        .limit(1)
                        .execute()
                    )
                    erp = (pdv_res.data or [{}])[0].get("id_cliente_erp")
                    if erp:
                        nro_cliente_str = f"\n🔢 <b>Nº Cliente:</b> {erp}"
                if id_target_ruta:
                    ruta_res = (
                        sb.table("rutas_v2")
                        .select("dia_semana, id_ruta_erp")
                        .eq("id_ruta", id_target_ruta)
                        .limit(1)
                        .execute()
                    )
                    ruta_row = (ruta_res.data or [{}])[0]
                    dia = ruta_row.get("dia_semana", "").capitalize()
                    nro_ruta = ruta_row.get("id_ruta_erp") or ""
                    ruta_label = f"Ruta {nro_ruta} — {dia}" if nro_ruta else dia
                    if ruta_label:
                        ruta_str = f"\n🗺️ <b>Ruta:</b> {ruta_label}"
            except Exception as e_enrich:
                logger.warning(f"[Notif] Enrich PDV/ruta omitido: {e_enrich}")

            text = (
                f"🚀 <b>¡Nuevo Objetivo Asignado!</b>\n\n"
                f"Se ha creado un objetivo de <b>{tipo_label}</b> {emoji}\n"
                f"📍 <b>PDV:</b> {pdv_nombre}"
                f"{nro_cliente_str}"
                f"{ruta_str}"
                f"{limite_str}"
                f"{desc_str}\n\n"
                f"¡Éxitos con la gestión! 💪"
            )

            resp = requests.post(
                TELEGRAM_API.format(token=token),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=8,
            )
            if resp.ok:
                logger.info(f"[Notif] Nuevo objetivo enviado a chat={chat_id} dist={dist_id}")
            else:
                logger.warning(
                    f"[Notif] Error enviando nuevo objetivo: "
                    f"chat={chat_id} dist={dist_id} → {resp.status_code} {resp.text[:120]}"
                )
        except Exception as e:
            logger.error(f"[Notif] Error en notify_new_objective_telegram: {e}")

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
        evento de objetivo fue detectado (progreso).
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
                "alteo":               "Alteo",
                "activacion":          "Activación",
                "exhibicion_pendiente": "Foto recibida",
                "exhibicion":          "Exhibición",
                "cobranza":            "Pago registrado",
            }.get(tipo_evento, tipo_evento.capitalize())

            if tipo_evento == "exhibicion_pendiente":
                text = (
                    f"📸 <b>¡Foto recibida!</b>\n"
                    f"Tu exhibición en <b>{pdv_nombre}</b>{cod_str} fue enviada al supervisor.\n"
                    f"En cuanto sea aprobada, tu objetivo avanzará. ⏳"
                )
            else:
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

    def notify_objetivo_cumplido(
        self,
        dist_id: int,
        id_vendedor: int,
        tipo: str,
        nombre_pdv: str | None = None,
    ) -> None:
        """Notifica al vendedor que su objetivo fue marcado como CUMPLIDO."""
        try:
            token = self._get_bot_token(dist_id)
            if not token:
                return

            chat_id = self._get_vendor_group_chat_id(dist_id, id_vendedor)
            if not chat_id:
                return

            emoji = TIPO_EMOJI.get(tipo, "🎯")
            tipo_label = {
                "alteo":      "Alteo",
                "activacion": "Activación",
                "exhibicion": "Exhibición",
                "cobranza":   "Cobranza",
            }.get(tipo, tipo.capitalize() if tipo else "Objetivo")

            pdv_str = f" en <b>{nombre_pdv}</b>" if nombre_pdv else ""
            text = (
                f"🏆 <b>¡OBJETIVO CUMPLIDO!</b> {emoji}\n\n"
                f"Completaste tu objetivo de <b>{tipo_label}</b>{pdv_str}.\n"
                f"¡Excelente trabajo! 🎉"
            )

            resp = requests.post(
                TELEGRAM_API.format(token=token),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=8,
            )
            if resp.ok:
                logger.info(f"[Notif] Cumplido enviado a chat={chat_id} dist={dist_id}")
            else:
                logger.warning(
                    f"[Notif] Error enviando cumplido: {resp.status_code} {resp.text[:80]}"
                )
        except Exception as e:
            logger.error(f"[Notif] Error en notify_objetivo_cumplido: {e}")

    # ── WebSocket (supervisor) ────────────────────────────────────────────────

    def notify_supervisor_ws(
        self,
        dist_id: int,
        event_data: dict[str, Any],
    ) -> None:
        """
        Emite un evento WebSocket al supervisor para mostrar un toast/alerta
        en tiempo real en la interfaz web.
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
