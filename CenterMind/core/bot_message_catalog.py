# -*- coding: utf-8 -*-
"""
Catálogo canónico de mensajes del bot Telegram.
Fuente de verdad para defaults + metadata de flujos (UI diagrama).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Alias legacy → clave canónica (UI/migraciones anteriores)
MESSAGE_KEY_ALIASES: dict[str, str] = {
    "bienvenida": "start",
    "ayuda": "help",
    "foto_ok": "foto_recibida",
    "foto_error": "upload_error",
    "aprobada": "eval_aprobada",
    "destacada": "eval_destacada",
    "rechazada": "eval_rechazada",
}


@dataclass(frozen=True)
class BotMessageDef:
    key: str
    label: str
    flow_id: str
    sort_order: int
    default_html: str
    placeholders: tuple[str, ...] = ()
    description: str = ""
    node_type: str = "message"  # message | branch | system | dynamic_part


@dataclass(frozen=True)
class BotFlowDef:
    flow_id: str
    title: str
    description: str
    icon: str
    sort_order: int


BOT_FLOWS: tuple[BotFlowDef, ...] = (
    BotFlowDef("inicio", "Inicio y ayuda", "Comandos /start y /help, bloqueo operativo", "👋", 1),
    BotFlowDef("carga_exhibicion", "Carga de exhibición", "Flujo foto → NRO → tipo PDV → registro", "📸", 2),
    BotFlowDef("evaluacion", "Evaluación supervisor", "Mensajes al aprobar/rechazar desde el portal", "✅", 3),
    BotFlowDef("comandos_consulta", "Comandos de consulta", "Stats, ranking, objetivos", "📊", 4),
    BotFlowDef("comandos_pdf", "Comandos PDF", "Cartera, ventas y cuentas corrientes", "📄", 5),
    BotFlowDef("vincular", "Vincular grupo", "Asignación grupo ↔ vendedor ERP", "🔗", 6),
)

BOT_MESSAGES: tuple[BotMessageDef, ...] = (
    # ── Inicio ──
    BotMessageDef(
        "start", "Bienvenida (/start)", "inicio", 1,
        "¡Hola! Soy el bot de <b>{nombre_dist}</b>.\n"
        "Enviá una foto para cargar una exhibición.\n"
        "Usá /help para ver los comandos disponibles.",
        ("nombre_dist",),
        "Primer contacto o reinicio del bot.",
    ),
    BotMessageDef(
        "help", "Ayuda (/help)", "inicio", 2,
        "📘 <b>Ayuda — {nombre_dist}</b>\n\n"
        "📸 <b>Cómo cargar una exhibición:</b>\n"
        "1️⃣ Enviá una foto al grupo\n"
        "2️⃣ El bot te pedirá el <b>NRO CLIENTE</b> (solo números)\n"
        "3️⃣ Seleccioná el <b>tipo de PDV</b> en los botones\n"
        "4️⃣ La exhibición queda registrada como <b>Pendiente</b>\n"
        "5️⃣ Un supervisor la aprueba desde la app\n\n"
        "📊 <b>Comandos:</b>\n"
        "• /stats — Tus estadísticas\n"
        "• /ranking — Ranking del mes\n"
        "• /objetivos — Tus objetivos y progreso\n"
        "• /cartera — Cartera PDF\n"
        "• /ventas — Ventas PDF\n"
        "• /cuentas — Cuentas corrientes PDF\n"
        "• /help — Esta ayuda",
        ("nombre_dist",),
    ),
    BotMessageDef(
        "compliance_blocked", "Carga pausada (tenant bloqueado)", "inicio", 3,
        "⚠️ <b>Carga pausada por disposición de Casa Matriz.</b>\n\n"
        "Motivo: <i>{motivo}</i>",
        ("motivo",),
        "Cuando estado_operativo ≠ Activo.",
    ),
    # ── Carga exhibición ──
    BotMessageDef(
        "foto_recibida", "Foto recibida (1 foto)", "carga_exhibicion", 10,
        "📸 Foto recibida. Enviá el <b>NRO CLIENTE</b> (solo números):",
    ),
    BotMessageDef(
        "foto_recibida_multi", "Fotos recibidas (ráfaga)", "carga_exhibicion", 11,
        "📸 <b>{n_fotos} fotos recibidas.</b> Enviá el <b>NRO CLIENTE</b> (solo números):",
        ("n_fotos",),
    ),
    BotMessageDef(
        "upload_incomplete", "Carga anterior incompleta", "carga_exhibicion", 12,
        "⚠️ <b>Tu carga anterior quedó incompleta.</b>\nPor favor, <b>reenviá la imagen</b>.",
    ),
    BotMessageDef(
        "no_active_session", "Sin sesión activa", "carga_exhibicion", 13,
        "⚠️ <b>No tengo una carga de foto activa</b> "
        "(puede pasar tras un reinicio del servidor).\n\n"
        "Por favor <b>reenviá la foto</b> del PDV y después el NRO CLIENTE.",
    ),
    BotMessageDef(
        "use_buttons", "Usar botones anteriores", "carga_exhibicion", 14,
        "⚠️ Usá los botones de la pantalla anterior para continuar.",
    ),
    BotMessageDef(
        "nro_invalid", "NRO inválido", "carga_exhibicion", 15,
        "⚠️ Por favor, enviá <b>solo números</b> para el NRO CLIENTE.",
    ),
    BotMessageDef(
        "cartera_not_found", "Cliente fuera de cartera", "carga_exhibicion", 16,
        "⚠️ El cliente <code>{nro_cliente}</code> no se encontró en tu cartera.\n\n"
        "¿Fue un error de tipeo o es un PDV nuevo?",
        ("nro_cliente",),
    ),
    BotMessageDef(
        "nro_ok_select_tipo", "NRO OK → elegir tipo PDV", "carga_exhibicion", 17,
        "✅ NRO CLIENTE: <code>{nro_cliente}</code>{pdv_name}\n\n"
        "Seleccioná el <b>tipo de PDV</b>:",
        ("nro_cliente", "pdv_name"),
        "pdv_name puede ir vacío si no hay razón social.",
    ),
    BotMessageDef(
        "pdv_nuevo_ok", "PDV nuevo declarado", "carga_exhibicion", 18,
        "✅ PDV nuevo: <code>{nro_cliente}</code>\n\n"
        "Seleccioná el <b>tipo de PDV</b>:",
        ("nro_cliente",),
    ),
    BotMessageDef(
        "retry_nro", "Reintentar NRO", "carga_exhibicion", 19,
        "📋 Enviá el <b>NRO CLIENTE</b> nuevamente.",
    ),
    BotMessageDef(
        "registering", "Registrando fotos", "carga_exhibicion", 20,
        "✅ NRO CLIENTE: <code>{nro_cliente}</code>{pdv_name}\n"
        "📍 <b>{tipo_pdv}</b>\n\n"
        "⏳ Registrando {fotos_label}...",
        ("nro_cliente", "pdv_name", "tipo_pdv", "fotos_label"),
    ),
    BotMessageDef(
        "upload_success", "Exhibición registrada OK", "carga_exhibicion", 21,
        "✅ <b>Exhibición registrada</b>\n\n"
        "🏪 <b>Cliente:</b> {nro_cliente}\n"
        "📍 <b>Tipo:</b> {tipo_pdv}\n"
        "📸 <b>Fotos:</b> {procesadas}",
        ("nro_cliente", "tipo_pdv", "procesadas"),
        "Confirmación simple (flujo legacy sin stats embebidos).",
    ),
    BotMessageDef(
        "upload_rich_header", "Confirmación rica — encabezado", "carga_exhibicion", 24,
        "📋 <b>Exhibición registrada</b>\n\n{fotos_text}",
        ("fotos_text",),
        "Plantilla dinámica. {fotos_text} vacío si es 1 sola foto.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_datos", "Confirmación rica — datos PDV", "carga_exhibicion", 25,
        "👤 <b>Vendedor:</b> {uploader_name}\n"
        "🏪 <b>Cliente:</b> {nro_cliente} - {cliente_nombre}\n"
        "📍 <b>Tipo:</b> {tipo_pdv}\n",
        ("uploader_name", "nro_cliente", "cliente_nombre", "tipo_pdv"),
        "Bloque fijo de identidad tras carga exitosa.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_extra", "Confirmación rica — bloques extra", "carga_exhibicion", 26,
        "{objetivo_badge}{stats_text}{historial_text}",
        ("objetivo_badge", "stats_text", "historial_text"),
        "Contenedor HTML dinámico ensamblado por el bot.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_footer", "Confirmación rica — pie", "carga_exhibicion", 27,
        "",
        (),
        "Opcional. Se concatena al final del mensaje enriquecido.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_fotos_multi", "Varias fotos subidas", "carga_exhibicion", 28,
        "📸 <b>{n} fotos subidas</b>\n\n",
        ("n",),
        "Solo si procesadas > 1.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_foto_link", "Link ver foto", "carga_exhibicion", 29,
        "🔗 <a href='{url}'>Ver foto</a>\n",
        ("url",),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_estado_pendiente", "Estado pendiente evaluación", "carga_exhibicion", 30,
        "⏳ <b>Estado:</b> Pendiente de evaluación",
        (),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_estado_revision", "Estado revisión ERP", "carga_exhibicion", 31,
        "⚠️ <b>Estado: REVISIÓN</b> — Pendiente de validación ERP",
        (),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_stats_block", "Stats embebidas post-carga", "carga_exhibicion", 32,
        "\n\n📊 <b>Tu mes ({mes_nombre}):</b>\n"
        "   ✅ {aprobadas} aprobadas   🔥 {destacadas} destacadas\n"
        "   ❌ {rechazadas} rechazadas   ⏳ {pendientes} pendientes\n"
        "   🏆 Puntos: {puntos}   📦 Exhibiciones: {total}\n"
        "   <i>(Únicas por cliente y día — mismo criterio que el ranking)</i>\n"
        "{racha_line}",
        ("mes_nombre", "aprobadas", "destacadas", "rechazadas", "pendientes", "puntos", "total", "racha_line"),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_racha_line", "Línea racha aprobaciones", "carga_exhibicion", 33,
        "   🔥 Racha: {racha} consecutivas aprobadas\n",
        ("racha",),
        "Solo si racha ≥ 2.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_historial_block", "Historial PDV", "carga_exhibicion", 34,
        "\n\n📂 <b>Historial en este PDV ({count} anteriores):</b>\n{lineas}",
        ("count", "lineas"),
        "{lineas} = filas HTML generadas en runtime.",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_objetivo_pdv", "Badge objetivo PDV", "carga_exhibicion", 35,
        "\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
        "Este PDV (<b>{pdv_nombre}</b>) está en tus metas. "
        "Ha pasado a revisión del supervisor.",
        ("pdv_nombre",),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_rich_objetivo_global", "Badge objetivo global", "carga_exhibicion", 36,
        "\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
        "Esta exhibición cuenta para tu meta general. "
        "Quedó a la espera de evaluación del supervisor.",
        (),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "upload_partial_fail", "Algunas fotos fallaron", "carga_exhibicion", 22,
        "⚠️ {fallidas} foto(s) no pudieron registrarse. Si falta alguna, reenviala.",
        ("fallidas",),
    ),
    BotMessageDef(
        "upload_error", "Error al registrar", "carga_exhibicion", 23,
        "⚠️ <b>No se pudo registrar la exhibición.</b>\n\n"
        "{uploader_name}, {hint}\n"
        "Por favor <b>reenviá la foto</b>.",
        ("uploader_name", "hint"),
    ),
    # ── Evaluación ──
    BotMessageDef(
        "eval_header", "Encabezado evaluación", "evaluacion", 30,
        "📋 <b>Exhibición evaluada</b>\n\n"
        "👤 <b>Vendedor:</b> {vendedor}\n"
        "🏪 <b>Cliente:</b> {cliente}\n"
        "📍 <b>Tipo:</b> {tipo}\n\n"
        "{estado_bloque}",
        ("vendedor", "cliente", "tipo", "estado_bloque"),
        "estado_bloque se arma según Aprobado/Destacado/Rechazado.",
    ),
    BotMessageDef(
        "eval_aprobada", "Estado aprobada", "evaluacion", 31,
        "✅ <b>APROBADA</b> por {supervisor}",
        ("supervisor",),
    ),
    BotMessageDef(
        "eval_destacada", "Estado destacada", "evaluacion", 32,
        "🔥 <b>¡EXHIBICIÓN DESTACADA!</b> 🔥\n🚀 ¡Ejecución perfecta!",
    ),
    BotMessageDef(
        "eval_rechazada", "Estado rechazada", "evaluacion", 33,
        "❌ <b>RECHAZADA</b> por {supervisor}",
        ("supervisor",),
    ),
    BotMessageDef(
        "eval_nota", "Nota del supervisor", "evaluacion", 34,
        "\n\n📝 <b>Nota:</b> <i>{comentario}</i>",
        ("comentario",),
    ),
    # ── Comandos consulta ──
    BotMessageDef(
        "stats_no_data", "Stats sin datos", "comandos_consulta", 40,
        "⚠️ No hay estadísticas disponibles. {hint}",
        ("hint",),
    ),
    BotMessageDef(
        "stats_error", "Error en /stats", "comandos_consulta", 41,
        "❌ Error al obtener estadísticas. Intentá de nuevo en un momento.",
    ),
    BotMessageDef(
        "stats_account_disabled", "Cuenta desactivada", "comandos_consulta", 42,
        "⚠️ <b>Esta cuenta ha sido desactivada o unificada.</b>",
    ),
    BotMessageDef(
        "stats_header", "/stats — encabezado", "comandos_consulta", 43,
        "📊 <b>Tus Estadísticas — {nombre_dist}</b>\n👤 Identidad: {display_name}",
        ("nombre_dist", "display_name"),
        "Plantilla dinámica /stats.",
        "dynamic_part",
    ),
    BotMessageDef(
        "stats_mes_actual", "/stats — mes actual", "comandos_consulta", 44,
        "🗓️ <b>Mes Actual ({mes_nombre}):</b>\n"
        "   • ✅ Aprobadas:  {aprobadas}\n"
        "   • 🔥 Destacadas: {destacadas}\n"
        "   • ❌ Rechazadas: {rechazadas}\n"
        "   • ⏳ Pendientes: {pendientes}\n"
        "   • 🏆 <b>Puntos: {puntos}</b>  (exhibiciones: {total})",
        ("mes_nombre", "aprobadas", "destacadas", "rechazadas", "pendientes", "puntos", "total"),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "stats_ranking_line", "/stats — línea posición ranking", "comandos_consulta", 45,
        "\n   • 📍 Posición: <b>#{pos} de {total}</b> {delta_icon}",
        ("pos", "total", "delta_icon"),
        "Opcional; solo si el vendedor está en el ranking MTD.",
        "dynamic_part",
    ),
    BotMessageDef(
        "stats_mes_anterior", "/stats — mes anterior", "comandos_consulta", 46,
        "📅 <b>Mes Anterior ({mes_nombre}):</b>\n"
        "   • ✅ Aprobadas:  {aprobadas}\n"
        "   • 🔥 Destacadas: {destacadas}\n"
        "   • ❌ Rechazadas: {rechazadas}\n"
        "   • ⏳ Pendientes: {pendientes}\n"
        "   • 🏆 <b>Puntos: {puntos}</b>  (exhibiciones: {total})",
        ("mes_nombre", "aprobadas", "destacadas", "rechazadas", "pendientes", "puntos", "total"),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "stats_footer", "/stats — pie", "comandos_consulta", 47,
        "<i>(Exhibiciones únicas por cliente y día)</i>",
        (),
        "",
        "dynamic_part",
    ),
    BotMessageDef(
        "ranking_picker", "Selector de mes (/ranking)", "comandos_consulta", 48,
        "🏆 <b>Ranking de Exhibiciones</b>\nSeleccioná el mes que querés consultar:",
    ),
    BotMessageDef(
        "ranking_loading", "Cargando ranking", "comandos_consulta", 49,
        "⏳ Obteniendo ranking...",
    ),
    BotMessageDef(
        "ranking_empty", "Ranking sin datos", "comandos_consulta", 50,
        "📊 No hay datos para ese período.",
    ),
    BotMessageDef(
        "ranking_error", "Error ranking", "comandos_consulta", 51,
        "❌ Error al obtener el ranking.",
    ),
    BotMessageDef(
        "ranking_result_header", "Ranking — encabezado", "comandos_consulta", 52,
        "🏆 <b>RANKING {mes_nombre} {year} — {nombre_dist}</b>\n\n",
        ("mes_nombre", "year", "nombre_dist"),
        "Plantilla dinámica tras elegir mes.",
        "dynamic_part",
    ),
    BotMessageDef(
        "ranking_result_row", "Ranking — fila vendedor", "comandos_consulta", 53,
        "{emoji} <b>{vendedor}</b>{sucursal}{arrow}\n"
        "   ✅ Aprod: {aprobadas} | 🔥 Dest: {destacadas}\n"
        "   ⭐ Puntos: {puntos}\n\n",
        ("emoji", "vendedor", "sucursal", "arrow", "aprobadas", "destacadas", "puntos"),
        "Se repite por cada vendedor en el ranking.",
        "dynamic_part",
    ),
    BotMessageDef(
        "ranking_result_footer", "Ranking — pie", "comandos_consulta", 54,
        "",
        (),
        "Opcional.",
        "dynamic_part",
    ),
    BotMessageDef(
        "objetivos_no_vendor", "Objetivos sin vendedor", "comandos_consulta", 55,
        "⚠️ No pude vincular tu usuario a un vendedor en este grupo.\n"
        "Pedile al admin que revise el mapeo en Fuerza de Ventas, "
        "o usá /vincular para asignar este grupo a un vendedor.",
    ),
    BotMessageDef(
        "objetivos_empty", "Sin objetivos activos", "comandos_consulta", 56,
        "🎯 <b>No tenés objetivos activos en este momento.</b>\n"
        "<i>Los objetivos vencidos o aún no lanzados no se muestran aquí.</i>",
    ),
    BotMessageDef(
        "objetivos_error", "Error /objetivos", "comandos_consulta", 57,
        "❌ No pude consultar tus objetivos en este momento.",
    ),
    BotMessageDef(
        "objetivos_header", "/objetivos — encabezado", "comandos_consulta", 58,
        "🎯 <b>Objetivos de {vendedor_nombre}</b>",
        ("vendedor_nombre",),
        "Plantilla dinámica /objetivos.",
        "dynamic_part",
    ),
    BotMessageDef(
        "objetivos_item", "/objetivos — ítem", "comandos_consulta", 59,
        "\n{estado_icon} <b>{tipo_txt}{origen_tag}</b>"
        "\n   • Progreso: <b>{progreso}</b> ({pct}%)"
        "{vence_line}{mes_ref_line}{tasa_line}{avance_semanal_line}{pdv_line}",
        ("estado_icon", "tipo_txt", "origen_tag", "progreso", "pct", "vence_line", "mes_ref_line", "tasa_line", "avance_semanal_line", "pdv_line"),
        "Se repite por cada objetivo activo.",
        "dynamic_part",
    ),
    BotMessageDef(
        "objetivos_overflow", "/objetivos — truncado", "comandos_consulta", 60,
        "\n<i>Mostrando {shown} de {total} objetivos.</i>",
        ("shown", "total"),
        "Si hay más de 8 objetivos.",
        "dynamic_part",
    ),
    BotMessageDef(
        "objetivos_footer", "/objetivos — pie", "comandos_consulta", 61,
        "",
        (),
        "Opcional.",
        "dynamic_part",
    ),
    BotMessageDef(
        "vendor_not_linked", "Grupo sin vendedor", "comandos_consulta", 62,
        "⚠️ No pude vincular este grupo a un vendedor.\n"
        "Usá /vincular para asignar el grupo.",
    ),
    # ── PDF ──
    BotMessageDef(
        "cartera_prompt", "Elegir cartera HOY/GENERAL", "comandos_pdf", 60,
        "📋 <b>Cartera de clientes</b>\n¿Qué cartera querés ver?",
    ),
    BotMessageDef(
        "cartera_loading", "Generando cartera", "comandos_pdf", 61,
        "⏳ Generando PDF de cartera...",
    ),
    BotMessageDef(
        "cartera_error", "Error cartera PDF", "comandos_pdf", 62,
        "❌ Error generando PDF de cartera. Intentá de nuevo.",
    ),
    BotMessageDef(
        "ventas_loading", "Generando ventas", "comandos_pdf", 63,
        "⏳ Generando PDF de ventas...",
    ),
    BotMessageDef(
        "ventas_error", "Error ventas PDF", "comandos_pdf", 64,
        "❌ Error generando PDF de ventas. Intentá de nuevo.",
    ),
    BotMessageDef(
        "cuentas_prompt", "Elegir cuentas HOY/GENERAL", "comandos_pdf", 65,
        "💳 <b>Cuentas Corrientes</b>\n¿Qué clientes querés ver?",
    ),
    BotMessageDef(
        "cuentas_loading", "Generando cuentas", "comandos_pdf", 66,
        "⏳ Generando PDF de cuentas corrientes...",
    ),
    BotMessageDef(
        "cuentas_error", "Error cuentas PDF", "comandos_pdf", 67,
        "❌ Error generando PDF de cuentas. Intentá de nuevo.",
    ),
    # ── Vincular ──
    BotMessageDef(
        "vincular_solo_grupo", "Solo en grupos", "vincular", 70,
        "⚠️ Este comando solo funciona en grupos.",
    ),
    BotMessageDef(
        "vincular_buscando", "Buscando candidatos", "vincular", 71,
        "🔍 Buscando vendedores candidatos...",
    ),
    BotMessageDef(
        "vincular_sin_candidatos", "Sin candidatos", "vincular", 72,
        "⚠️ No encontré candidatos para este grupo.\n"
        "Asegurate de que el nombre del grupo incluya el nombre del vendedor, "
        "o contactá a la compañía.",
    ),
    BotMessageDef(
        "vincular_confirm_auto", "Confirmación semi-auto", "vincular", 73,
        "🎯 Detecté que este grupo corresponde a <b>{nombre_erp}</b> "
        "(confianza {confianza}%).\n"
        "¿Confirmás la vinculación?",
        ("nombre_erp", "confianza"),
    ),
    BotMessageDef(
        "vincular_select_list", "Lista de candidatos", "vincular", 74,
        "👥 <b>Seleccioná el vendedor para este grupo:</b>",
    ),
    BotMessageDef(
        "vincular_error", "Error vincular", "vincular", 75,
        "❌ Error al buscar candidatos. Intentá de nuevo.",
    ),
    BotMessageDef(
        "vincular_ok", "Vinculación exitosa", "vincular", 76,
        "✅ Grupo vinculado a <b>{nombre_erp}</b>.\n"
        "Los comandos /stats, /objetivos y /ranking ahora usan este vendedor.",
        ("nombre_erp",),
    ),
    BotMessageDef(
        "vincular_cancel", "Vinculación cancelada", "vincular", 77,
        "❌ Vinculación cancelada.",
    ),
)

_BY_KEY: dict[str, BotMessageDef] = {m.key: m for m in BOT_MESSAGES}
_FLOW_INDEX: dict[str, BotFlowDef] = {f.flow_id: f for f in BOT_FLOWS}


def normalize_message_key(key: str) -> str:
    k = (key or "").strip()
    return MESSAGE_KEY_ALIASES.get(k, k)


def get_message_def(key: str) -> BotMessageDef | None:
    return _BY_KEY.get(normalize_message_key(key))


def get_default_message(key: str) -> str:
    defn = get_message_def(key)
    return defn.default_html if defn else ""


def list_all_message_keys() -> list[str]:
    return [m.key for m in BOT_MESSAGES]


def build_flows_payload(db_messages: dict[str, str]) -> list[dict[str, Any]]:
    """Arma estructura para UI: flujos → nodos con body merge DB + default."""
    from core.telegram_html import repair_telegram_message_html

    flows_out: list[dict[str, Any]] = []
    for flow in sorted(BOT_FLOWS, key=lambda f: f.sort_order):
        nodes = [
            m for m in BOT_MESSAGES if m.flow_id == flow.flow_id
        ]
        nodes.sort(key=lambda n: n.sort_order)
        flows_out.append({
            "flow_id": flow.flow_id,
            "title": flow.title,
            "description": flow.description,
            "icon": flow.icon,
            "sort_order": flow.sort_order,
            "nodes": [
                {
                    "message_key": n.key,
                    "label": n.label,
                    "description": n.description,
                    "node_type": n.node_type,
                    "sort_order": n.sort_order,
                    "placeholders": list(n.placeholders),
                    "body_html": repair_telegram_message_html(
                        db_messages.get(n.key) or n.default_html
                    ),
                    "default_html": n.default_html,
                    "is_customized": bool(db_messages.get(n.key, "").strip()),
                }
                for n in nodes
            ],
        })
    return flows_out


def merge_messages_for_api(db_rows: list[dict]) -> list[dict[str, Any]]:
    """Lista plana para compat API /messages."""
    from core.telegram_html import repair_telegram_message_html

    db_map = {normalize_message_key(r["message_key"]): r.get("body_html") or "" for r in db_rows}
    out: list[dict[str, Any]] = []
    for defn in BOT_MESSAGES:
        raw = db_map.get(defn.key, "")
        body = repair_telegram_message_html(raw if raw.strip() else defn.default_html)
        row = next((r for r in db_rows if normalize_message_key(r["message_key"]) == defn.key), None)
        out.append({
            "message_key": defn.key,
            "label": defn.label,
            "flow_id": defn.flow_id,
            "flow_title": _FLOW_INDEX[defn.flow_id].title,
            "placeholders": list(defn.placeholders),
            "description": defn.description,
            "body_html": body,
            "default_html": defn.default_html,
            "is_customized": bool(db_map.get(defn.key, "").strip()),
            "updated_at": row.get("updated_at") if row else None,
        })
    return out
