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
import html
import logging
import re
import unicodedata
import requests
from datetime import datetime
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosNotification")


def _row_usable_telegram_group(row: dict[str, Any]) -> bool:
    gid = row.get("telegram_group_id")
    return gid is not None and str(gid).strip() not in ("", "0", "None")


def _row_operational(row: dict[str, Any]) -> bool:
    """Evita cuentas legacy fusionadas/inactivas al resolver destinatario."""
    if row.get("activo") is False:
        return False
    estado = str(row.get("estado_mapeo") or "").strip().lower()
    if estado in {"fusionado", "franquiciado_inactivo", "inactivo"}:
        return False
    return True


def _norm_name(value: str | None) -> str:
    if not value:
        return ""
    txt = str(value).strip().lower()
    txt = "".join(
        c for c in unicodedata.normalize("NFD", txt)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(txt.split())


def _norm_erp_code(value: Any) -> str:
    if value is None:
        return ""
    raw = str(value).strip().lower()
    if not raw:
        return ""
    # Unificar variantes numéricas (e.g. 0076 vs 76)
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return str(int(digits))
    return raw


def _pick_integrante_row(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Prefiere fila con telegram_group_id válido; si no, primera con id_integrante."""
    if not rows:
        return None
    for row in rows:
        if (
            row.get("id_integrante") is not None
            and _row_operational(row)
            and _row_usable_telegram_group(row)
        ):
            return row
    for row in rows:
        if row.get("id_integrante") is not None and _row_operational(row):
            return row
    return None


def _pick_integrante_row_strict(
    rows: list[dict[str, Any]],
    *,
    expected_vendor_name: str | None = None,
    allow_ambiguous: bool = False,
) -> dict[str, Any] | None:
    """
    Selección determinística para evitar cruces entre homónimos o filas ambiguas.
    Si hay `expected_vendor_name`, prioriza coincidencia exacta normalizada con
    `nombre_integrante`. Si hay múltiples candidatos de distintos nombres y no
    se puede desambiguar, devuelve None para no notificar al grupo incorrecto.
    """
    base = [r for r in rows if r.get("id_integrante") is not None and _row_operational(r)]
    if not base:
        return None

    with_group = [r for r in base if _row_usable_telegram_group(r)]
    candidates = with_group or base

    expected_norm = _norm_name(expected_vendor_name)
    if expected_norm:
        named = [
            r for r in candidates
            if _norm_name(r.get("nombre_integrante")) == expected_norm
        ]
        if len(named) == 1:
            return named[0]
        if len(named) > 1:
            # Múltiples filas del mismo vendedor; tomar estable la de menor id.
            return sorted(named, key=lambda r: int(r.get("id_integrante") or 0))[0]

    # Sin match por nombre esperado: si hay más de un nombre distinto, no adivinar.
    distinct_names = {
        _norm_name(r.get("nombre_integrante"))
        for r in candidates
        if _norm_name(r.get("nombre_integrante"))
    }
    if len(distinct_names) > 1 and not allow_ambiguous:
        return None

    # Candidato único (o múltiples filas equivalentes): orden estable.
    return sorted(candidates, key=lambda r: int(r.get("id_integrante") or 0))[0]


def _select_integrantes(
    dist_id: int,
    cols_primary: str,
    cols_fallback: str,
    *,
    id_vendedor_v2: int | None = None,
    id_vendedor_erp: str | None = None,
    offset: int | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """
    Lee integrantes_grupo con fallback de columnas para esquemas legacy
    que no tienen `activo`.
    """
    def _run(cols: str) -> list[dict[str, Any]]:
        q = sb.table("integrantes_grupo").select(cols).eq("id_distribuidor", dist_id)
        if id_vendedor_v2 is not None:
            q = q.eq("id_vendedor_v2", id_vendedor_v2)
        if id_vendedor_erp is not None:
            q = q.eq("id_vendedor_erp", id_vendedor_erp)
        if offset is not None and limit is not None:
            q = q.range(offset, offset + limit - 1)
        res = q.execute()
        return res.data or []

    try:
        return _run(cols_primary)
    except Exception as e:
        msg = str(e).lower()
        if "column integrantes_grupo.activo does not exist" in msg or "42703" in msg:
            return _run(cols_fallback)
        raise


def resolve_integrante_for_objetivos(
    dist_id: int, id_vendedor: int
) -> dict[str, Any] | None:
    """
    Fila de integrantes_grupo para vincular objetivos / Telegram / exhibiciones.

    1) id_vendedor_v2
    2) id_vendedor_erp exacto (vendedores_v2 → integrantes_grupo)
    3) Paginado por distribuidor con comparación case-insensitive de ERP
       (evita techo ~1000 filas del fallback anterior que cargaba todo de una vez).
    """
    try:
        # 0) Prioridad al nuevo vínculo de Fuerza de Ventas (migración progresiva)
        try:
            bres = (
                sb.table("vendedores_telegram_binding")
                .select("telegram_group_id, telegram_user_id")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_v2", id_vendedor)
                .limit(1)
                .execute()
            )
            brow = (bres.data or [{}])[0] if bres.data else None
            if brow and (brow.get("telegram_group_id") or brow.get("telegram_user_id")):
                q = (
                    sb.table("integrantes_grupo")
                    .select(
                        "id_integrante, telegram_group_id, id_vendedor_erp, telegram_user_id, "
                        "nombre_integrante, estado_mapeo"
                    )
                    .eq("id_distribuidor", dist_id)
                )
                if brow.get("telegram_user_id"):
                    q = q.eq("telegram_user_id", brow["telegram_user_id"])
                if brow.get("telegram_group_id"):
                    q = q.eq("telegram_group_id", brow["telegram_group_id"])
                qres = q.limit(1).execute()
                if qres.data:
                    row = qres.data[0]
                    logger.info(
                        f"[Notif] integrante vía fuerza_ventas vend={id_vendedor} dist={dist_id}"
                    )
                    return row

                # Si no encontró integrante, devolver al menos group/user para notificar Telegram.
                logger.info(
                    f"[Notif] vínculo fuerza_ventas sin integrante vend={id_vendedor} dist={dist_id} "
                    f"(usa telegram_group_id directo)"
                )
                return {
                    "id_integrante": None,
                    "telegram_group_id": brow.get("telegram_group_id"),
                    "telegram_user_id": brow.get("telegram_user_id"),
                    "id_vendedor_erp": None,
                    "nombre_integrante": None,
                }
        except Exception as e_bind:
            logger.warning(
                f"[Notif] fallback a legacy (binding no disponible) vend={id_vendedor} dist={dist_id}: {e_bind}"
            )

        cols_primary = (
            "id_integrante, telegram_group_id, id_vendedor_erp, telegram_user_id, "
            "nombre_integrante, activo, estado_mapeo"
        )
        cols_fallback = (
            "id_integrante, telegram_group_id, id_vendedor_erp, telegram_user_id, "
            "nombre_integrante, estado_mapeo"
        )
        res_v2_rows = _select_integrantes(
            dist_id,
            cols_primary,
            cols_fallback,
            id_vendedor_v2=id_vendedor,
        )
        # Match por id_vendedor_v2 es la señal más fuerte: si hay varias filas,
        # tomar una determinísticamente en lugar de bloquear por ambigüedad nominal.
        picked = _pick_integrante_row_strict(res_v2_rows, allow_ambiguous=True)
        if picked:
            return picked

        vres = (
            sb.table("vendedores_v2")
            .select("id_vendedor_erp, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor", id_vendedor)
            .limit(1)
            .execute()
        )
        vrow = (vres.data or [{}])[0]
        verp = vrow.get("id_vendedor_erp")
        vendor_name = vrow.get("nombre_erp")
        vendor_name_norm = _norm_name(vendor_name)
        if verp is None or str(verp).strip() == "":
            verp_s = ""
        else:
            verp_stripped = str(verp).strip()
            verp_s = _norm_erp_code(verp_stripped)

            erp_exact_rows = _select_integrantes(
                dist_id,
                cols_primary,
                cols_fallback,
                id_vendedor_erp=verp_stripped,
            )
            picked = _pick_integrante_row_strict(
                erp_exact_rows,
                expected_vendor_name=vendor_name,
            )
            if picked:
                logger.info(
                    f"[Notif] integrante vía id_vendedor_erp exact={verp_stripped!r} "
                    f"vendedor_v2={id_vendedor} dist={dist_id}"
                )
                return picked
            if erp_exact_rows:
                logger.warning(
                    f"[Notif] Ambigüedad id_vendedor_erp exact para vend={id_vendedor} "
                    f"dist={dist_id}; filas={len(erp_exact_rows)}"
                )

        offset = 0
        batch = 500
        while True:
            rows = _select_integrantes(
                dist_id,
                cols_primary,
                cols_fallback,
                offset=offset,
                limit=batch,
            )
            if not rows:
                break
            for row in rows:
                if not _row_operational(row):
                    continue
                ig_erp = row.get("id_vendedor_erp")
                if ig_erp is not None and verp_s and _norm_erp_code(ig_erp) == verp_s:
                    if row.get("id_integrante") is not None:
                        logger.info(
                            f"[Notif] integrante vía id_vendedor_erp paginado "
                            f"vendedor_v2={id_vendedor} dist={dist_id}"
                        )
                        # Evitar cruces: validar contra nombre esperado cuando haya ambigüedad
                        chosen = _pick_integrante_row_strict(
                            rows,
                            expected_vendor_name=vendor_name,
                        )
                        if chosen:
                            return chosen
                        logger.warning(
                            f"[Notif] Ambigüedad paginada id_vendedor_erp para vend={id_vendedor} "
                            f"dist={dist_id}; no se selecciona grupo"
                        )
                        return None
            if len(rows) < batch:
                break
            offset += batch

        # Fallback final controlado: nombre ERP exacto normalizado (solo si es único).
        if vendor_name_norm:
            try:
                all_rows = _select_integrantes(
                    dist_id,
                    cols_primary,
                    cols_fallback,
                    offset=0,
                    limit=2000,
                )
                by_name = [
                    r for r in all_rows
                    if _row_operational(r)
                    and _norm_name(r.get("nombre_integrante")) == vendor_name_norm
                    and r.get("id_integrante") is not None
                ]
                if len(by_name) == 1:
                    logger.info(
                        f"[Notif] integrante vía nombre exacto único "
                        f"vendedor_v2={id_vendedor} dist={dist_id}"
                    )
                    return by_name[0]
                if len(by_name) > 1:
                    logger.warning(
                        f"[Notif] Ambigüedad por nombre exacto vend={id_vendedor} "
                        f"dist={dist_id}; filas={len(by_name)}"
                    )
            except Exception as e_name:
                logger.warning(
                    f"[Notif] fallback nombre exacto vend={id_vendedor} dist={dist_id}: {e_name}"
                )
        return None
    except Exception as e:
        logger.warning(
            f"[Notif] resolve_integrante_for_objetivos dist={dist_id} "
            f"vend={id_vendedor}: {e}"
        )
        return None

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
TELEGRAM_DELETE_API = "https://api.telegram.org/bot{token}/deleteMessage"

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
    ) -> dict[str, Any] | None:
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
                return None

            id_vendedor = obj_data.get("id_vendedor")
            if id_vendedor is None:
                logger.warning("[Notif] nuevo objetivo: payload sin id_vendedor — no se envía Telegram")
                return None

            chat_id = self._get_vendor_group_chat_id(dist_id, int(id_vendedor))
            if not chat_id:
                logger.warning(
                    f"[Notif] nuevo objetivo: sin telegram_group_id para vendedor_v2={id_vendedor} "
                    f"dist={dist_id} — revisá integrantes_grupo (id_vendedor_v2 o id_vendedor_erp)"
                )
                return None

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
            sup_esc = html.escape(str(sup), quote=False) if sup else ""
            supervisor_str = f"\n👤 <b>Supervisor:</b> {sup_esc}" if sup_esc else ""

            fecha = obj_data.get("fecha_objetivo")
            desc = obj_data.get("descripcion")
            desc_str = ""
            if desc:
                desc_s = str(desc).strip()
                # Evitar "Tenés 0 días…" duplicado con la línea de fecha límite / vence hoy
                desc_s = re.sub(
                    r"\s*Tenés\s+0\s+días?\s+para\s+cumplir\s+el\s+objetivo\.?",
                    "",
                    desc_s,
                    flags=re.IGNORECASE,
                ).strip()
                if desc_s:
                    desc_esc = html.escape(desc_s, quote=False)
                    desc_str = f"\n📝 <b>Detalle:</b> <i>{desc_esc}</i>"

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
            limite_fmt = self._format_fecha_dd_mm_yyyy(fecha) if fecha else ""
            limite_str = (
                f"\n📅 <b>Fecha límite:</b> {limite_fmt or fecha}{dias_str}" if fecha else ""
            )

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
                    items: list[dict[str, Any]] = []
                    payload_items = obj_data.get("pdv_items")
                    if isinstance(payload_items, list) and payload_items:
                        items = [
                            it for it in payload_items
                            if isinstance(it, dict) and it.get("id_cliente_pdv")
                        ]
                    if obj_id_s:
                        items_res = (
                            sb.table("objetivo_items")
                            .select(cols)
                            .eq("id_objetivo", obj_id_s)
                            .execute()
                        )
                        db_items = items_res.data or []
                        if db_items:
                            items = db_items
                    if not items:
                        logger.warning(
                            f"[Notif] objetivo {obj_id or '?'} tipo={tipo}: sin filas en objetivo_items "
                            f"(dist={dist_id}) — usando fallback PDV único si aplica"
                        )
                    if items:
                        pdv_ids = [it["id_cliente_pdv"] for it in items if it.get("id_cliente_pdv")]
                        erp_map: dict[int, dict] = {}
                        if pdv_ids:
                            erp_res = (
                                sb.table("clientes_pdv_v2")
                                .select(
                                    "id_cliente, id_cliente_erp, nombre_fantasia, nombre_cliente, "
                                    "nombre_razon_social, domicilio, telefono, id_ruta"
                                )
                                .in_("id_cliente", pdv_ids)
                                .eq("id_distribuidor", dist_id)
                                .execute()
                            )
                            erp_map = {
                                r["id_cliente"]: {
                                    "erp": r.get("id_cliente_erp") or "",
                                    "nombre_fantasia": (r.get("nombre_fantasia") or "").strip(),
                                    "nombre_cliente": (r.get("nombre_cliente") or "").strip(),
                                    "nombre_razon_social": (r.get("nombre_razon_social") or "").strip(),
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
                            nombre_raw = (
                                (it.get("nombre_pdv") or "").strip()
                                or info.get("nombre_fantasia")
                                or info.get("nombre_cliente")
                                or info.get("nombre_razon_social")
                                or (f"Cliente #{info.get('erp')}" if info.get("erp") else "")
                                or f"PDV #{cid}"
                            )
                            nombre = html.escape(nombre_raw, quote=False)
                            erp = info.get("erp", "") or (it.get("id_cliente_erp") or "")
                            cod = f" · <b>NRO CLIENTE ERP:</b> {html.escape(str(erp), quote=False)}" if erp else ""
                            ruta_actual = self._ruta_label(info.get("id_ruta"))
                            ruta_part = f" · <b>Ruta:</b> {ruta_actual}" if ruta_actual else ""

                            extra = ""
                            ar = it.get("accion_ruteo")
                            if tipo == "ruteo" and ar:
                                if ar == "cambio_ruta":
                                    dest = it.get("id_ruta_destino")
                                    dl = dest_rutas.get(int(dest), self._ruta_label(dest)) if dest else ""
                                    extra = f"\n    → <b>Cambio de ruta</b> → {dl or '—'}"
                                    accion_resumen.append("Cambio de ruta")
                                elif ar == "baja":
                                    mot = html.escape(
                                        (it.get("motivo_baja") or "").strip(), quote=False
                                    )
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
                            .select(
                                "id_cliente_erp, id_ruta, nombre_fantasia, nombre_cliente, nombre_razon_social"
                            )
                            .eq("id_cliente", id_target_pdv)
                            .eq("id_distribuidor", dist_id)
                            .limit(1)
                            .execute()
                        )
                        row0 = (pdv_res.data or [{}])[0]
                        erp = row0.get("id_cliente_erp") or ""
                        id_ruta_pdv = row0.get("id_ruta")
                        if not pdv_nombre:
                            pdv_nombre = (
                                (row0.get("nombre_fantasia") or "").strip()
                                or (row0.get("nombre_cliente") or "").strip()
                                or (row0.get("nombre_razon_social") or "").strip()
                            )
                    if not pdv_nombre:
                        pdv_nombre = (
                            (f"Cliente ERP {erp}" if erp else "")
                            or "PDV (sin nombre en padrón)"
                        )
                    pdv_nombre = html.escape(pdv_nombre, quote=False)
                    if erp:
                        nro_cliente_str = f" · <b>NRO CLIENTE ERP:</b> {html.escape(str(erp), quote=False)}"
                    ruta_p = self._ruta_label(id_ruta_pdv) if id_ruta_pdv else ""
                    ruta_txt = f" · <b>Ruta:</b> {ruta_p}" if ruta_p else ""
                    pdv_lines = f"\n📍 <b>PDV objetivo:</b> {pdv_nombre}{nro_cliente_str}{ruta_txt}"
                    if (
                        "sin nombre en padrón" in pdv_nombre.lower()
                        and tipo in {"exhibicion", "conversion_estado", "activacion", "cobranza"}
                    ):
                        cant = int(float(obj_data.get("valor_objetivo") or 0))
                        if cant > 1:
                            pdv_lines = f"\n📍 <b>PDVs objetivo:</b> {cant} (consultá el detalle en la app)"

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
                try:
                    payload = resp.json() or {}
                    msg = payload.get("result") or {}
                    message_id = msg.get("message_id")
                    if message_id:
                        return {
                            "chat_id": int(chat_id),
                            "message_id": int(message_id),
                        }
                except Exception:
                    pass
                return {"chat_id": int(chat_id), "message_id": None}
            else:
                logger.warning(
                    f"[Notif] Error enviando nuevo objetivo: "
                    f"chat={chat_id} dist={dist_id} → {resp.status_code} {resp.text[:120]}"
                )
                return None
        except Exception as e:
            logger.error(f"[Notif] Error en notify_new_objective_telegram: {e}")
            return None

    def delete_objective_telegram_message(
        self,
        dist_id: int,
        chat_id: int,
        message_id: int,
    ) -> bool:
        """Borra el mensaje de objetivo en Telegram si sigue disponible."""
        try:
            token = self._get_bot_token(dist_id)
            if not token:
                return False
            resp = requests.post(
                TELEGRAM_DELETE_API.format(token=token),
                json={"chat_id": int(chat_id), "message_id": int(message_id)},
                timeout=8,
            )
            if resp.ok:
                logger.info(
                    f"[Notif] Mensaje Telegram borrado chat={chat_id} msg={message_id} dist={dist_id}"
                )
                return True
            logger.warning(
                f"[Notif] No se pudo borrar msg Telegram chat={chat_id} msg={message_id} dist={dist_id}: "
                f"{resp.status_code} {resp.text[:120]}"
            )
            return False
        except Exception as e:
            logger.warning(
                f"[Notif] Error borrando msg Telegram chat={chat_id} msg={message_id} dist={dist_id}: {e}"
            )
            return False

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
            pdv_nombre_raw = (
                pdv_data.get("nombre_cliente") or pdv_data.get("nombre") or "PDV"
            )
            pdv_nombre = html.escape(str(pdv_nombre_raw), quote=False)
            pdv_codigo = pdv_data.get("id_cliente_erp") or pdv_data.get("codigo") or ""
            cod_esc = html.escape(str(pdv_codigo), quote=False) if pdv_codigo else ""
            cod_str = f" (#{cod_esc})" if cod_esc else ""

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
            elif tipo_evento == "exhibicion":
                text = (
                    f"✅ <b>¡Foto aprobada!</b>\n"
                    f"El supervisor aprobó tu exhibición en <b>{pdv_nombre}</b>{cod_str}.\n"
                    f"¡Objetivo avanzando! 📈"
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

            pdv_str = (
                f" en <b>{html.escape(str(nombre_pdv), quote=False)}</b>"
                if nombre_pdv
                else ""
            )
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

    def notify_objetivo_fallido(
        self,
        dist_id: int,
        id_vendedor: int,
        tipo: str,
        nombre_pdv: str | None = None,
    ) -> None:
        """Notifica al vendedor que su objetivo fue cerrado como FALLIDO (no cumplido)."""
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
                "ruteo":      "Ruteo",
            }.get(tipo, tipo.capitalize() if tipo else "Objetivo")

            pdv_str = (
                f" en <b>{html.escape(str(nombre_pdv), quote=False)}</b>"
                if nombre_pdv
                else ""
            )
            text = (
                f"⏱️ <b>Objetivo cerrado sin completar</b> {emoji}\n\n"
                f"Tu objetivo de <b>{tipo_label}</b>{pdv_str} venció sin alcanzar la meta.\n"
                f"¡En la próxima tenés la revancha! 💪"
            )

            resp = requests.post(
                TELEGRAM_API.format(token=token),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=8,
            )
            if resp.ok:
                logger.info(f"[Notif] Fallido enviado a chat={chat_id} dist={dist_id}")
            else:
                logger.warning(
                    f"[Notif] Error enviando fallido: {resp.status_code} {resp.text[:80]}"
                )
        except Exception as e:
            logger.error(f"[Notif] Error en notify_objetivo_fallido: {e}")

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
        Busca telegram_group_id del grupo del vendedor via
        resolve_integrante_for_objetivos (v2 + ERP exacto + paginado ERP).
        """
        try:
            row = resolve_integrante_for_objetivos(dist_id, id_vendedor)
            if not row:
                return None
            gid = row.get("telegram_group_id")
            if gid is not None and str(gid).strip() not in ("", "0", "None"):
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
