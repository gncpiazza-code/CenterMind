# -*- coding: utf-8 -*-
"""
Simula respuestas del bot Telegram para el panel de preview en Bot Settings.
Usa los mismos servicios de datos/PDF que el bot real, sin enviar a Telegram.
"""
from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from core.bot_settings import get_settings_cache
from core.bot_dynamic_messages import (
    build_objetivos_item_line,
    build_objetivos_message,
    build_ranking_result_message,
    build_stats_message,
)
from core.tenant_tables import tenant_table_name
from core.objetivos_filters import hoy_ar, objetivo_activo_para_vendedor
from supabase import Client

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
MESES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}


def _text(
    html_body: str,
    buttons: list[list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"type": "text", "html": html_body}
    if buttons:
        out["buttons"] = buttons
    return out


def _photo(url: str, caption_html: str = "") -> dict[str, Any]:
    return {"type": "photo", "photo_url": url, "caption_html": caption_html}


def _document(filename: str, caption_html: str, size_bytes: int) -> dict[str, Any]:
    return {
        "type": "document",
        "filename": filename,
        "caption_html": caption_html,
        "size_bytes": size_bytes,
    }


def _dist_name(sb: Client, dist_id: int) -> str:
    res = (
        sb.table("distribuidores")
        .select("nombre_empresa")
        .eq("id_distribuidor", dist_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0].get("nombre_empresa") or f"Dist #{dist_id}"
    return f"Dist #{dist_id}"


def _vendor_name(sb: Client, dist_id: int, id_vendedor: int) -> str:
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    res = (
        sb.table(t_vend)
        .select("nombre_erp")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", id_vendedor)
        .limit(1)
        .execute()
    )
    if res.data and res.data[0].get("nombre_erp"):
        return str(res.data[0]["nombre_erp"])
    return f"Vendedor #{id_vendedor}"


def _template_or_fallback(sb: Client, key: str, fallback: str, **variables: object) -> str:
    from core.bot_messages import resolve_bot_message
    return resolve_bot_message(sb, key, fallback=fallback, **variables)


def _signed_image_url(sb: Client, image_path: str) -> str | None:
    try:
        res = sb.storage.from_("bot-command-assets").create_signed_url(image_path, 3600)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl")
    except Exception:
        pass
    return None


def _require_vendor(id_vendedor: int | None) -> list[dict[str, Any]] | None:
    if id_vendedor is None:
        return [_text(
            "⚠️ Seleccioná un <b>vendedor</b> en el panel de prueba para simular "
            "comandos que dependen de identidad (/stats, /cartera, etc.)."
        )]
    return None


def preview_bot_interaction(
    sb: Client,
    *,
    dist_id: int,
    id_vendedor: int | None,
    input_text: str | None = None,
    callback_action: str | None = None,
) -> list[dict[str, Any]]:
    """Devuelve lista de mensajes simulados del bot."""
    if callback_action:
        return _handle_callback(sb, dist_id, id_vendedor, callback_action)

    raw = (input_text or "").strip()
    if not raw:
        return [_text("Escribí un comando (ej. <code>/stats</code>) o usá los chips del menú.")]

    # Simulación de pasos del flujo de carga (@foto, @nro 123, etc.)
    if raw.startswith("@"):
        return _preview_flow_step(sb, raw)

    cmd = raw.lower().split()[0].lstrip("/")
    if not cmd:
        return [_text("Comando vacío. Probá <code>/help</code>.")]

    nombre_dist = _dist_name(sb, dist_id)

    if cmd == "start":
        fallback = (
            f"¡Hola! Soy el bot de <b>{html.escape(nombre_dist)}</b>.\n"
            "Enviá una foto para cargar una exhibición.\n"
            "Usá /help para ver los comandos disponibles."
        )
        return [_text(_template_or_fallback(sb, "start", fallback, nombre_dist=nombre_dist))]

    if cmd == "help":
        fallback = (
            f"📘 <b>Ayuda — {html.escape(nombre_dist)}</b>\n\n"
            "Usá /stats, /ranking, /objetivos, /cartera, /ventas, /cuentas."
        )
        return [_text(_template_or_fallback(sb, "help", fallback, nombre_dist=nombre_dist))]

    if cmd == "stats":
        err = _require_vendor(id_vendedor)
        if err:
            return err
        return _preview_stats(sb, dist_id, id_vendedor, nombre_dist)

    if cmd == "ranking":
        return _preview_ranking_picker(sb)

    if cmd == "objetivos":
        err = _require_vendor(id_vendedor)
        if err:
            return err
        return _preview_objetivos(sb, dist_id, id_vendedor)

    if cmd in ("cartera", "carterahoy"):
        err = _require_vendor(id_vendedor)
        if err:
            return err
        if cmd == "carterahoy":
            return _preview_cartera_pdf(sb, dist_id, id_vendedor, "hoy")
        return [_text(
            _template_or_fallback(sb, "cartera_prompt", "📋 <b>Cartera de clientes</b>\n¿Qué cartera querés ver?"),
            buttons=[[
                {"label": "📅 Hoy", "action": "cartera:hoy"},
                {"label": "📋 General", "action": "cartera:general"},
            ]],
        )]

    if cmd == "ventas":
        err = _require_vendor(id_vendedor)
        if err:
            return err
        return _preview_ventas_pdf(sb, dist_id, id_vendedor)

    if cmd == "cuentas":
        err = _require_vendor(id_vendedor)
        if err:
            return err
        return [_text(
            _template_or_fallback(sb, "cuentas_prompt", "💳 <b>Cuentas corrientes</b>\n¿Qué reporte querés?"),
            buttons=[[
                {"label": "📅 Hoy", "action": "cuentas:hoy"},
                {"label": "📋 General", "action": "cuentas:general"},
            ]],
        )]

    # Comandos custom static_media
    commands = get_settings_cache().list_commands(sb)
    cmd_row = next(
        (c for c in commands if c.get("command") == cmd and c.get("enabled")),
        None,
    )
    if cmd_row and cmd_row.get("kind") == "static_media":
        return _preview_custom_command(sb, cmd_row)

    return [_text(f"❓ Comando <code>/{cmd}</code> no reconocido en el simulador.")]


def _preview_flow_step(sb: Client, raw: str) -> list[dict[str, Any]]:
    """Atajos @foto, @nro 123, @registrando, etc. para probar plantillas del flujo carga."""
    from core.bot_messages import resolve_bot_message

    parts = raw.split()
    step = parts[0].lower()

    if step == "@foto":
        n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1
        if n > 1:
            html_body = resolve_bot_message(sb, "foto_recibida_multi", n_fotos=n)
        else:
            html_body = resolve_bot_message(sb, "foto_recibida")
        return [_text(html_body)]

    if step == "@nro":
        nro = parts[1] if len(parts) > 1 else "12345"
        html_body = resolve_bot_message(
            sb, "nro_ok_select_tipo", nro_cliente=nro, pdv_name=" - Kiosco Demo",
        )
        return [_text(html_body, buttons=[[
            {"label": "Kiosco", "action": "preview:tipo:kiosco"},
            {"label": "Autoservicio", "action": "preview:tipo:auto"},
        ]])]

    if step == "@registrando":
        html_body = resolve_bot_message(
            sb,
            "registering",
            nro_cliente="12345",
            pdv_name=" - Kiosco Demo",
            tipo_pdv="Kiosco",
            fotos_label="1 foto",
        )
        return [_text(html_body)]

    if step == "@ok":
        html_body = resolve_bot_message(
            sb, "upload_success", nro_cliente="12345", tipo_pdv="Kiosco", procesadas=1,
        )
        return [_text(html_body)]

    if step == "@eval":
        estado = resolve_bot_message(sb, "eval_aprobada", supervisor="Supervisor Demo")
        html_body = resolve_bot_message(
            sb,
            "eval_header",
            vendedor="Vendedor Demo",
            cliente="12345",
            tipo="Kiosco",
            estado_bloque=estado,
            __raw_estado_bloque=True,
            __raw_vendedor=True,
            __raw_cliente=True,
            __raw_tipo=True,
        )
        return [_text(html_body)]

    return [_text(
        "Pasos simulables: <code>@foto</code>, <code>@foto 3</code>, "
        "<code>@nro 194</code>, <code>@registrando</code>, <code>@ok</code>, <code>@eval</code>"
    )]


def _handle_callback(
    sb: Client,
    dist_id: int,
    id_vendedor: int | None,
    action: str,
) -> list[dict[str, Any]]:
    if action.startswith("ranking:"):
        parts = action.split(":")
        if len(parts) != 3:
            return [_text("❌ Acción de ranking inválida.")]
        try:
            month, year = int(parts[1]), int(parts[2])
        except ValueError:
            return [_text("❌ Acción de ranking inválida.")]
        return _preview_ranking_month(sb, dist_id, month, year)

    if action.startswith("cartera:"):
        err = _require_vendor(id_vendedor)
        if err:
            return err
        mode = action.split(":", 1)[1]
        if mode not in ("hoy", "general"):
            return [_text("❌ Modo de cartera inválido.")]
        return _preview_cartera_pdf(sb, dist_id, id_vendedor, mode)

    if action.startswith("cuentas:"):
        err = _require_vendor(id_vendedor)
        if err:
            return err
        mode = action.split(":", 1)[1]
        if mode not in ("hoy", "general"):
            return [_text("❌ Modo de cuentas inválido.")]
        return _preview_cuentas_pdf(sb, dist_id, id_vendedor, mode)

    return [_text(f"❌ Acción desconocida: <code>{html.escape(action)}</code>")]


def _preview_stats(sb: Client, dist_id: int, id_vendedor: int, nombre_dist: str) -> list[dict[str, Any]]:
    from bot_worker import Database

    db = Database()
    display_name = _vendor_name(sb, dist_id, id_vendedor)
    stats = db.get_stats_vendedor(dist_id, vendor_v2_id=id_vendedor)

    if not stats:
        return [_text(
            "⚠️ No hay estadísticas disponibles para este vendedor en la distribuidora seleccionada."
        )]

    now = datetime.now(AR_TZ)
    prev_m = 12 if now.month == 1 else now.month - 1
    counts_actual = {**stats["mes_actual"], "total_logicas": stats["mes_actual"]["total"]}
    counts_prev = {**stats["mes_anterior"], "total_logicas": stats["mes_anterior"]["total"]}

    ranking_pos: int | None = None
    ranking_total = 0
    ranking_delta = 0
    try:
        from core.bot_ranking_delta import ranking_with_deltas

        ranking_data = ranking_with_deltas(sb, dist_id)
        erp_upper = display_name.strip().upper()
        ranking_total = len(ranking_data)
        for entry in ranking_data:
            if entry.get("vendedor", "").upper() == erp_upper:
                ranking_pos = entry["pos_now"]
                ranking_delta = entry.get("delta", 0)
                break
    except Exception:
        pass

    msg = build_stats_message(
        sb,
        nombre_dist=nombre_dist,
        display_name=display_name,
        mes_actual_nombre=MESES[now.month],
        mes_anterior_nombre=MESES[prev_m],
        counts_actual=counts_actual,
        counts_prev=counts_prev,
        ranking_pos=ranking_pos,
        ranking_total=ranking_total,
        ranking_delta=ranking_delta,
    )
    return [_text(msg)]


def _preview_ranking_picker(sb: Client) -> list[dict[str, Any]]:
    now = datetime.now(AR_TZ)
    rows: list[list[dict[str, str]]] = []
    for i in range(3):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        rows.append([{
            "label": f"📊 {MESES[m]} {y}",
            "action": f"ranking:{m}:{y}",
        }])
    return [_text(
        _template_or_fallback(
            sb,
            "ranking_picker",
            "🏆 <b>Ranking de Exhibiciones</b>\nSeleccioná el mes que querés consultar:",
        ),
        buttons=rows,
    )]


def _preview_ranking_month(sb: Client, dist_id: int, month: int, year: int) -> list[dict[str, Any]]:
    nombre_dist = _dist_name(sb, dist_id)
    periodo = f"{year}-{month:02d}"
    now = datetime.now(AR_TZ)
    is_mes_actual = now.month == month and now.year == year
    month_name = MESES.get(month, "Mes")

    try:
        if is_mes_actual:
            from core.bot_ranking_delta import ranking_with_deltas

            ranking_raw = ranking_with_deltas(sb, dist_id, periodo)
            ranking = [
                {
                    "vendedor": r["vendedor"],
                    "puntos": r["puntos"],
                    "aprobadas": r.get("aprobadas", 0),
                    "destacadas": r.get("destacadas", 0),
                    "delta": r.get("delta", 0),
                    "sucursal": "",
                }
                for r in ranking_raw
            ]
        else:
            from bot_worker import Database

            db = Database()
            ranking_legacy = db.get_ranking_periodo(dist_id, periodo) or []
            ranking = [{**r, "delta": 0} for r in ranking_legacy]

        if not ranking:
            return [_text("📊 No hay datos para ese período.")]

        msg = build_ranking_result_message(
            sb,
            nombre_dist=nombre_dist,
            mes_nombre=month_name,
            year=year,
            entries=ranking,
            limit=25,
        )
        return [_text(msg)]
    except Exception as e:
        return [_text(f"❌ Error al obtener el ranking: {html.escape(str(e))}")]


def _preview_objetivos(sb: Client, dist_id: int, id_vendedor: int) -> list[dict[str, Any]]:
    vendedor_nombre = _vendor_name(sb, dist_id, id_vendedor)
    objetivos_res = (
        sb.table("objetivos")
        .select(
            "id, tipo, descripcion, fecha_objetivo, valor_actual, valor_objetivo, "
            "cumplido, origen, mes_referencia, tasa_pendientes"
        )
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor", id_vendedor)
        .order("fecha_objetivo", desc=False)
        .limit(40)
        .execute()
    )
    hoy = hoy_ar()
    objetivos = [
        o for o in (objetivos_res.data or [])
        if objetivo_activo_para_vendedor(o, hoy)
    ]

    if not objetivos:
        return [_text(
            "🎯 <b>No tenés objetivos activos en este momento.</b>\n"
            "<i>Los objetivos vencidos o aún no lanzados no se muestran aquí.</i>"
        )]

    tipo_label = {
        "exhibicion": "Exhibición",
        "conversion_estado": "Activación",
        "activacion": "Activación",
        "cobranza": "Cobranza",
        "ruteo_alteo": "Alteo",
        "compradores": "Compradores",
    }

    item_lines: list[str] = []
    for obj in objetivos[:8]:
        tipo = str(obj.get("tipo") or "").strip().lower()
        tipo_txt = tipo_label.get(tipo, tipo.replace("_", " ").title() or "Objetivo")
        origen_tag = " [Cía]" if obj.get("origen") == "compania" else ""
        cumplido = bool(obj.get("cumplido"))
        estado_icon = "✅" if cumplido else "⏳"
        try:
            vo = float(obj.get("valor_objetivo") or 0)
            va = float(obj.get("valor_actual") or 0)
        except (ValueError, TypeError):
            vo, va = 0.0, 0.0
        pct = 0 if vo <= 0 else int(max(0, min(100, round((va / vo) * 100))))
        fecha = str(obj.get("fecha_objetivo") or "")[:10]
        vence_line = ""
        if re.match(r"^\d{4}-\d{2}-\d{2}$", fecha):
            y, mo, d = fecha.split("-")
            vence_line = f" · Vence: {d}/{mo}/{y}"
        progreso = f"{va:.0f}/{vo:.0f}"
        item_lines.append(
            build_objetivos_item_line(
                sb,
                estado_icon=estado_icon,
                tipo_txt=tipo_txt,
                origen_tag=origen_tag,
                progreso=progreso,
                pct=pct,
                vence_line=vence_line,
            )
        )

    msg = build_objetivos_message(
        sb,
        vendedor_nombre=vendedor_nombre,
        item_lines=item_lines,
        total_count=len(objetivos),
        shown_count=min(8, len(objetivos)),
    )
    return [_text(msg)]


def _preview_cartera_pdf(sb: Client, dist_id: int, id_vendedor: int, mode: str) -> list[dict[str, Any]]:
    try:
        from services.bot_cartera_pdf_service import build_cartera_pdf

        pdf_bytes, snapshot_label = build_cartera_pdf(sb, dist_id, id_vendedor, mode)
        caption = (
            f"📋 <b>Cartera {'de hoy' if mode == 'hoy' else 'general'}</b>\n"
            f"<i>{html.escape(snapshot_label)}</i>"
        )
        return [_document(f"cartera_{mode}.pdf", caption, len(pdf_bytes))]
    except Exception as e:
        return [_text(f"❌ Error generando PDF de cartera: {html.escape(str(e))}")]


def _preview_ventas_pdf(sb: Client, dist_id: int, id_vendedor: int) -> list[dict[str, Any]]:
    try:
        from services.bot_ventas_pdf_service import build_ventas_pdf

        pdf_bytes, snapshot_label = build_ventas_pdf(sb, dist_id, id_vendedor)
        caption = f"📦 <b>Ventas MTD</b>\n<i>{html.escape(snapshot_label)}</i>"
        return [_document("ventas_mtd.pdf", caption, len(pdf_bytes))]
    except Exception as e:
        return [_text(f"❌ Error generando PDF de ventas: {html.escape(str(e))}")]


def _preview_cuentas_pdf(sb: Client, dist_id: int, id_vendedor: int, mode: str) -> list[dict[str, Any]]:
    try:
        from services.cc_difusion_service import export_cc_pdf_supervision

        pdf_bytes, _media_type, filename = export_cc_pdf_supervision(
            dist_id,
            id_vendedor=id_vendedor,
            modo=mode,
        )
        caption = f"💳 <b>Cuentas {'de hoy' if mode == 'hoy' else 'generales'}</b>"
        return [_document(filename or f"cuentas_{mode}.pdf", caption, len(pdf_bytes))]
    except Exception as e:
        return [_text(f"❌ Error generando PDF de cuentas: {html.escape(str(e))}")]


def _preview_custom_command(sb: Client, cmd_row: dict) -> list[dict[str, Any]]:
    from services.objetivos_notification_service import sanitize_telegram_html

    caption = sanitize_telegram_html((cmd_row.get("caption_html") or "").strip())
    image_path = (cmd_row.get("image_path") or "").strip()

    if image_path:
        url = _signed_image_url(sb, image_path)
        if url:
            return [_photo(url, caption)]
        return [_text("⚠️ No se pudo cargar la imagen del comando custom.")]

    if caption:
        return [_text(caption)]

    return [_text("ℹ️ Comando custom sin contenido configurado.")]
