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
import re
import requests
from datetime import datetime
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosNotification")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

TIPO_EMOJI = {
    "alteo":             "📍",
    "activacion":        "🟢",
    "exhibicion":        "📸",
    "cobranza":          "💰",
    "ruteo":             "🗺️",
    "ruteo_alteo":       "📍",
    "conversion_estado": "🟢",
}


class ObjetivosNotificationService:
    # ── Telegram ──────────────────────────────────────────────────────────────

    @staticmethod
    def _format_fecha_dd_mm_yyyy(value: Any) -> str:
        """ISO / datetime → dd/mm/aaaa (solo fecha)."""
        if not value:
            return ""
        s = str(value).strip()
        if not s:
            return ""
        try:
            if "T" in s:
                s = s.split("T", 1)[0]
            m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
            if m:
                y, mo, d = m.group(1), m.group(2), m.group(3)
                return f"{d}/{mo}/{y}"
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.strftime("%d/%m/%Y")
        except Exception:
            return s[:10]

    def _ruta_label(self, id_ruta: int | None) -> str:
        if not id_ruta:
            return ""
        try:
            ruta_res = (
                sb.table("rutas_v2")
                .select("dia_semana, id_ruta_erp")
                .eq("id_ruta", id_ruta)
                .limit(1)
                .execute()
            )
            ruta_row = (ruta_res.data or [{}])[0]
            dia = (ruta_row.get("dia_semana") or "").capitalize()
            nro = ruta_row.get("id_ruta_erp") or ""
            if nro and dia:
                return f"id {id_ruta} · Ruta ERP {nro} — {dia}"
            if nro:
                return f"id {id_ruta} · Ruta ERP {nro}"
            return f"id {id_ruta}" + (f" — {dia}" if dia else "")
        except Exception:
            return f"id {id_ruta}"

    def notify_new_objective_telegram(
        self,
        dist_id: int,
        obj_data: dict[str, Any],
        obj_id: str | None = None,
    ) -> None:
        """
        Notifica al vendedor que se le ha asignado un NUEVO objetivo.
        Incluye inicio, supervisor, tipo/acción, PDVs (ERP + ruta cuando aplica),
        fecha límite y días restantes.
        """
        try:
            token = self._get_bot_token(dist_id)
            if not token:
                logger.warning(
                    f"[Notif] nuevo objetivo: distribuidor {dist_id} sin token_bot — no se envía Telegram"
                )
                return

            id_vendedor = obj_data.get("id_vendedor")
            if id_vendedor is None:
                logger.warning("[Notif] nuevo objetivo: payload sin id_vendedor — no se envía Telegram")
                return

            chat_id = self._get_vendor_group_chat_id(dist_id, int(id_vendedor))
            if not chat_id:
                logger.warning(
                    f"[Notif] nuevo objetivo: sin telegram_group_id para vendedor_v2={id_vendedor} "
                    f"dist={dist_id} — revisá integrantes_grupo (id_vendedor_v2 o id_vendedor_erp)"
                )
                return

            tipo = obj_data.get("tipo")
            emoji = TIPO_EMOJI.get(tipo, "🎯")
            tipo_label = {
                "ruteo":             "Ruteo (cambio / baja)",
                "ruteo_alteo":       "Alteo de ruta",
                "conversion_estado": "Activación",
                "exhibicion":        "Exhibición",
                "cobranza":          "Cobranza",
                "alteo":             "Alteo",
                "activacion":        "Activación",
            }.get(
                tipo,
                str(tipo or "").replace("_", " ").title() or "General",
            )

            created = obj_data.get("created_at")
            inicio_fmt = self._format_fecha_dd_mm_yyyy(created)
            inicio_str = (
                f"\n📆 <b>Inicio del objetivo:</b> {inicio_fmt}" if inicio_fmt else ""
            )

            sup = obj_data.get("asignado_por_usuario") or obj_data.get("supervisor")
            supervisor_str = f"\n👤 <b>Supervisor:</b> {sup}" if sup else ""

            fecha = obj_data.get("fecha_objetivo")
            desc = obj_data.get("descripcion")
            desc_str = f"\n📝 <b>Detalle:</b> <i>{desc}</i>" if desc else ""

            dias_str = ""
            if fecha:
                try:
                    from datetime import date as _date

                    hoy = _date.today()
                    fecha_limite = _date.fromisoformat(str(fecha)[:10])
                    dias = (fecha_limite - hoy).days
                    if dias > 0:
                        dias_str = f"\n⏰ <b>Tenés {dias} día{'s' if dias != 1 else ''} para realizarlo.</b>"
                    elif dias == 0:
                        dias_str = "\n⏰ <b>¡Vence hoy!</b>"
                    else:
                        dias_str = f"\n⏰ <i>Venció hace {abs(dias)} día{'s' if abs(dias) != 1 else ''}.</i>"
                except Exception:
                    pass
            limite_str = f"\n📅 <b>Fecha límite:</b> {fecha}{dias_str}" if fecha else ""

            pdv_lines = ""
            ruta_str = ""
            accion_block = ""
            id_target_pdv = obj_data.get("id_target_pdv")
            id_target_ruta = obj_data.get("id_target_ruta")

            TIPOS_MULTI_PDV = (
                "exhibicion",
                "ruteo_alteo",
                "conversion_estado",
                "activacion",
                "ruteo",
            )

            try:
                obj_id_s = str(obj_id).strip() if obj_id else ""
                if obj_id_s and tipo in TIPOS_MULTI_PDV:
                    cols = "id_cliente_pdv, nombre_pdv"
                    if tipo == "ruteo":
                        cols += ", accion_ruteo, id_ruta_destino, motivo_baja"
                    items_res = (
                        sb.table("objetivo_items")
                        .select(cols)
                        .eq("id_objetivo", obj_id_s)
                        .eq("id_distribuidor", dist_id)
                        .execute()
                    )
                    items = items_res.data or []
                    if not items:
                        logger.warning(
                            f"[Notif] objetivo {obj_id_s} tipo={tipo}: sin filas en objetivo_items "
                            f"(dist={dist_id}) — usando fallback PDV único si aplica"
                        )
                    if items:
                        pdv_ids = [it["id_cliente_pdv"] for it in items if it.get("id_cliente_pdv")]
                        erp_map: dict[int, dict] = {}
                        if pdv_ids:
                            erp_res = (
                                sb.table("clientes_pdv_v2")
                                .select(
                                    "id_cliente, id_cliente_erp, nombre_fantasia, domicilio, telefono, id_ruta"
                                )
                                .in_("id_cliente", pdv_ids)
                                .eq("id_distribuidor", dist_id)
                                .execute()
                            )
                            erp_map = {
                                r["id_cliente"]: {
                                    "erp": r.get("id_cliente_erp") or "",
                                    "nombre_fantasia": (r.get("nombre_fantasia") or "").strip(),
                                    "domicilio": r.get("domicilio") or "",
                                    "telefono": r.get("telefono") or "",
                                    "id_ruta": r.get("id_ruta"),
                                }
                                for r in (erp_res.data or [])
                            }

                        dest_rutas: dict[int, str] = {}
                        if tipo == "ruteo":
                            dest_ids = list(
                                {
                                    int(it["id_ruta_destino"])
                                    for it in items
                                    if it.get("id_ruta_destino")
                                }
                            )
                            for rid in dest_ids:
                                dest_rutas[rid] = self._ruta_label(rid)

                        MAX_PDV_DISPLAY = 8
                        lineas: list[str] = []
                        accion_resumen: list[str] = []

                        for it in items:
                            cid = it.get("id_cliente_pdv") or 0
                            info = erp_map.get(cid, {})
                            nombre = (
                                (it.get("nombre_pdv") or "").strip()
                                or info.get("nombre_fantasia")
                                or f"PDV #{cid}"
                            )
                            erp = info.get("erp", "")
                            cod = f" <b>#{erp}</b>" if erp else ""
                            ruta_actual = self._ruta_label(info.get("id_ruta"))
                            ruta_part = f" · <i>Ruta actual:</i> {ruta_actual}" if ruta_actual else ""

                            extra = ""
                            ar = it.get("accion_ruteo")
                            if tipo == "ruteo" and ar:
                                if ar == "cambio_ruta":
                                    dest = it.get("id_ruta_destino")
                                    dl = dest_rutas.get(int(dest), self._ruta_label(dest)) if dest else ""
                                    extra = f"\n    → <b>Cambio de ruta</b> → {dl or '—'}"
                                    accion_resumen.append("Cambio de ruta")
                                elif ar == "baja":
                                    mot = (it.get("motivo_baja") or "").strip()
                                    extra = f"\n    → <b>Baja de ruta</b>{(': ' + mot) if mot else ''}"
                                    accion_resumen.append("Baja de ruta")

                            lineas.append(f"  • <b>{nombre}</b>{cod}{ruta_part}{extra}")

                        n_items = len(items)
                        pdv_word = "PDV objetivo" if n_items == 1 else "PDVs objetivo"
                        if len(items) > MAX_PDV_DISPLAY:
                            shown = lineas[:MAX_PDV_DISPLAY]
                            remaining = len(items) - MAX_PDV_DISPLAY
                            resto = "PDV" if remaining == 1 else "PDVs"
                            shown.append(f"  <i>...y {remaining} {resto} más</i>")
                            pdv_lines = (
                                f"\n📍 <b>{pdv_word} ({n_items}):</b>\n" + "\n".join(shown)
                            )
                        else:
                            pdv_lines = (
                                f"\n📍 <b>{pdv_word} ({n_items}):</b>\n" + "\n".join(lineas)
                            )

                        if tipo == "ruteo" and accion_resumen:
                            uniq = sorted(set(accion_resumen))
                            accion_block = (
                                f"\n⚙️ <b>Acción a realizar:</b> {', '.join(uniq)}"
                            )
                        elif tipo == "ruteo_alteo":
                            accion_block = "\n⚙️ <b>Acción a realizar:</b> Alteo en la ruta indicada"
                        elif tipo == "exhibicion":
                            ex_n = len(items)
                            if ex_n == 1:
                                accion_block = "\n⚙️ <b>Acción a realizar:</b> Exhibición en el PDV objetivo"
                            else:
                                accion_block = (
                                    f"\n⚙️ <b>Acción a realizar:</b> Exhibición en los {ex_n} PDVs objetivo"
                                )
                        elif tipo == "conversion_estado":
                            accion_block = "\n⚙️ <b>Acción a realizar:</b> Activación de cliente(s)"
                        elif tipo == "cobranza":
                            accion_block = "\n⚙️ <b>Acción a realizar:</b> Cobranza"
                        elif tipo in ("activacion",):
                            accion_block = "\n⚙️ <b>Acción a realizar:</b> Activación"

                if not pdv_lines:
                    pdv_nombre = (obj_data.get("nombre_pdv") or "").strip()
                    nro_cliente_str = ""
                    erp = ""
                    id_ruta_pdv = None
                    if id_target_pdv:
                        pdv_res = (
                            sb.table("clientes_pdv_v2")
                            .select("id_cliente_erp, id_ruta, nombre_fantasia")
                            .eq("id_cliente", id_target_pdv)
                            .eq("id_distribuidor", dist_id)
                            .limit(1)
                            .execute()
                        )
                        row0 = (pdv_res.data or [{}])[0]
                        erp = row0.get("id_cliente_erp") or ""
                        id_ruta_pdv = row0.get("id_ruta")
                        if not pdv_nombre:
                            pdv_nombre = (row0.get("nombre_fantasia") or "").strip()
                    if not pdv_nombre:
                        pdv_nombre = "PDV sin nombre"
                    if erp:
                        nro_cliente_str = f" <b>#{erp}</b>"
                    ruta_p = self._ruta_label(id_ruta_pdv) if id_ruta_pdv else ""
                    ruta_txt = f" · Ruta: {ruta_p}" if ruta_p else ""
                    pdv_lines = f"\n📍 <b>PDV objetivo:</b> {pdv_nombre}{nro_cliente_str}{ruta_txt}"

                    if tipo == "cobranza":
                        accion_block = "\n⚙️ <b>Acción a realizar:</b> Cobranza"
                    elif tipo == "exhibicion":
                        accion_block = "\n⚙️ <b>Acción a realizar:</b> Exhibición en el PDV objetivo"
                    elif tipo == "ruteo_alteo":
                        accion_block = "\n⚙️ <b>Acción a realizar:</b> Alteo"
                    elif tipo == "conversion_estado":
                        accion_block = "\n⚙️ <b>Acción a realizar:</b> Activación"

                if id_target_ruta:
                    rl = self._ruta_label(int(id_target_ruta))
                    if rl:
                        ruta_str = f"\n🗺️ <b>Ruta referencia:</b> {rl}"

            except Exception as e_enrich:
                logger.warning(f"[Notif] Enrich PDV/ruta omitido: {e_enrich}")

            if not accion_block and tipo:
                accion_block = f"\n⚙️ <b>Acción a realizar:</b> {tipo_label}"

            text = (
                f"🚀 <b>¡Nuevo objetivo asignado!</b>\n"
                f"{inicio_str}"
                f"{supervisor_str}"
                f"\n\n🎯 <b>Tipo:</b> {tipo_label} {emoji}"
                f"{accion_block}"
                f"{pdv_lines}"
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
        Busca telegram_group_id del grupo del vendedor.

        1) integrantes_grupo filas con id_vendedor_v2 y telegram_group_id no nulo
        2) Fallback: id_vendedor_erp en vendedores_v2 → misma columna en integrantes_grupo
        (evita .limit(1) sobre filas huérfanas sin grupo).
        """
        try:
            res = (
                sb.table("integrantes_grupo")
                .select("telegram_group_id, id_vendedor_erp")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_v2", id_vendedor)
                .execute()
            )
            for row in res.data or []:
                gid = row.get("telegram_group_id")
                if gid is not None and str(gid).strip() not in ("", "0", "None"):
                    return int(gid)

            vres = (
                sb.table("vendedores_v2")
                .select("id_vendedor_erp")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .limit(1)
                .execute()
            )
            verp = (vres.data or [{}])[0].get("id_vendedor_erp")
            if verp is None or verp == "":
                return None
            verp_s = str(verp).strip().lower()
            ires = (
                sb.table("integrantes_grupo")
                .select("telegram_group_id, id_vendedor_erp")
                .eq("id_distribuidor", dist_id)
                .execute()
            )
            for row in ires.data or []:
                ig_erp = row.get("id_vendedor_erp")
                if ig_erp is None:
                    continue
                if str(ig_erp).strip().lower() != verp_s:
                    continue
                gid = row.get("telegram_group_id")
                if gid is not None and str(gid).strip() not in ("", "0", "None"):
                    logger.info(
                        f"[Notif] grupo Telegram vía id_vendedor_erp={verp!r} "
                        f"vendedor_v2={id_vendedor} dist={dist_id}"
                    )
                    return int(gid)
            return None
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
