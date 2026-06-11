# -*- coding: utf-8 -*-
"""
Composición de mensajes dinámicos del bot (header + cuerpo + footer editables).
"""
from __future__ import annotations

import html
from typing import Any

from supabase import Client

from core.bot_messages import resolve_bot_message


def _r(
    sb: Client,
    key: str,
    *,
    fallback: str = "",
    raw_keys: frozenset[str] | None = None,
    **variables: Any,
) -> str:
    raw = raw_keys or frozenset()
    kwargs: dict[str, Any] = dict(variables)
    for k in raw:
        if k in kwargs:
            kwargs[f"__raw_{k}"] = True
    return resolve_bot_message(sb, key, fallback=fallback, **kwargs)


def build_stats_message(
    sb: Client,
    *,
    nombre_dist: str,
    display_name: str,
    mes_actual_nombre: str,
    mes_anterior_nombre: str,
    counts_actual: dict[str, Any],
    counts_prev: dict[str, Any],
    ranking_pos: int | None = None,
    ranking_total: int = 0,
    ranking_delta: int = 0,
) -> str:
    header = _r(
        sb,
        "stats_header",
        fallback="📊 <b>Tus Estadísticas — {nombre_dist}</b>\n👤 Identidad: {display_name}",
        nombre_dist=nombre_dist,
        display_name=display_name,
    )
    mes_actual = _r(
        sb,
        "stats_mes_actual",
        fallback=(
            "🗓️ <b>Mes Actual ({mes_nombre}):</b>\n"
            "   • ✅ Aprobadas:  {aprobadas}\n"
            "   • 🔥 Destacadas: {destacadas}\n"
            "   • ❌ Rechazadas: {rechazadas}\n"
            "   • ⏳ Pendientes: {pendientes}\n"
            "   • 🏆 <b>Puntos: {puntos}</b>  (exhibiciones: {total})"
        ),
        mes_nombre=mes_actual_nombre,
        aprobadas=counts_actual.get("aprobadas", 0),
        destacadas=counts_actual.get("destacadas", 0),
        rechazadas=counts_actual.get("rechazadas", 0),
        pendientes=counts_actual.get("pendientes", 0),
        puntos=counts_actual.get("puntos", 0),
        total=counts_actual.get("total_logicas", counts_actual.get("total", 0)),
    )
    ranking_line = ""
    if ranking_pos is not None and ranking_total > 0:
        delta_icon = "↑" if ranking_delta == 1 else ("↓" if ranking_delta == -1 else "—")
        ranking_line = _r(
            sb,
            "stats_ranking_line",
            fallback="\n   • 📍 Posición: <b>#{pos} de {total}</b> {delta_icon}",
            pos=ranking_pos,
            total=ranking_total,
            delta_icon=delta_icon,
        )
    mes_anterior = _r(
        sb,
        "stats_mes_anterior",
        fallback=(
            "📅 <b>Mes Anterior ({mes_nombre}):</b>\n"
            "   • ✅ Aprobadas:  {aprobadas}\n"
            "   • 🔥 Destacadas: {destacadas}\n"
            "   • ❌ Rechazadas: {rechazadas}\n"
            "   • ⏳ Pendientes: {pendientes}\n"
            "   • 🏆 <b>Puntos: {puntos}</b>  (exhibiciones: {total})"
        ),
        mes_nombre=mes_anterior_nombre,
        aprobadas=counts_prev.get("aprobadas", 0),
        destacadas=counts_prev.get("destacadas", 0),
        rechazadas=counts_prev.get("rechazadas", 0),
        pendientes=counts_prev.get("pendientes", 0),
        puntos=counts_prev.get("puntos", 0),
        total=counts_prev.get("total_logicas", counts_prev.get("total", 0)),
    )
    footer = _r(
        sb,
        "stats_footer",
        fallback="<i>(Exhibiciones únicas por cliente y día)</i>",
    )
    return f"{header}\n\n{mes_actual}{ranking_line}\n\n{mes_anterior}\n{footer}"


def build_ranking_result_message(
    sb: Client,
    *,
    nombre_dist: str,
    mes_nombre: str,
    year: int,
    entries: list[dict[str, Any]],
    limit: int = 25,
) -> str:
    header = _r(
        sb,
        "ranking_result_header",
        fallback="🏆 <b>RANKING {mes_nombre} {year} — {nombre_dist}</b>\n\n",
        nombre_dist=nombre_dist,
        mes_nombre=mes_nombre.upper(),
        year=year,
    )
    rows: list[str] = []
    row_tpl_fallback = (
        "{emoji} <b>{vendedor}</b>{sucursal}{arrow}\n"
        "   ✅ Aprod: {aprobadas} | 🔥 Dest: {destacadas}\n"
        "   ⭐ Puntos: {puntos}\n\n"
    )
    for i, entry in enumerate(entries[:limit], 1):
        emoji = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
        sucursal_text = f" ({entry['sucursal']})" if entry.get("sucursal") else ""
        delta = entry.get("delta", 0)
        arrow = " ↑" if delta == 1 else (" ↓" if delta == -1 else "")
        rows.append(
            _r(
                sb,
                "ranking_result_row",
                fallback=row_tpl_fallback,
                emoji=emoji,
                vendedor=entry.get("vendedor", "—"),
                sucursal=sucursal_text,
                arrow=arrow,
                aprobadas=entry.get("aprobadas", 0),
                destacadas=entry.get("destacadas", 0),
                puntos=entry.get("puntos", 0),
                raw_keys=frozenset({"sucursal", "arrow"}),
            )
        )
    footer = _r(sb, "ranking_result_footer", fallback="")
    body = "\n".join(rows)
    parts = [header, body, footer]
    return "\n".join(p for p in parts if p).rstrip(" \t")


def build_objetivos_item_line(
    sb: Client,
    *,
    estado_icon: str,
    tipo_txt: str,
    origen_tag: str,
    progreso: str,
    pct: int,
    vence_line: str = "",
    mes_ref_line: str = "",
    tasa_line: str = "",
    avance_semanal_line: str = "",
    pdv_line: str = "",
) -> str:
    return _r(
        sb,
        "objetivos_item",
        fallback=(
            "\n{estado_icon} <b>{tipo_txt}{origen_tag}</b>"
            "\n   • Progreso: <b>{progreso}</b> ({pct}%)"
            "{vence_line}{mes_ref_line}{tasa_line}{avance_semanal_line}{pdv_line}"
        ),
        estado_icon=estado_icon,
        tipo_txt=tipo_txt,
        origen_tag=origen_tag,
        progreso=progreso,
        pct=pct,
        vence_line=vence_line,
        mes_ref_line=mes_ref_line,
        tasa_line=tasa_line,
        avance_semanal_line=avance_semanal_line,
        pdv_line=pdv_line,
        raw_keys=frozenset({
            "vence_line", "mes_ref_line", "tasa_line",
            "avance_semanal_line", "pdv_line",
        }),
    )


def build_objetivos_message(
    sb: Client,
    *,
    vendedor_nombre: str,
    item_lines: list[str],
    total_count: int,
    shown_count: int,
) -> str:
    header = _r(
        sb,
        "objetivos_header",
        fallback="🎯 <b>Objetivos de {vendedor_nombre}</b>",
        vendedor_nombre=html.escape(str(vendedor_nombre), quote=False),
        raw_keys=frozenset({"vendedor_nombre"}),
    )
    overflow = ""
    if total_count > shown_count:
        overflow = _r(
            sb,
            "objetivos_overflow",
            fallback="\n<i>Mostrando {shown} de {total} objetivos.</i>",
            shown=shown_count,
            total=total_count,
        )
    footer = _r(sb, "objetivos_footer", fallback="")
    return f"{header}{''.join(item_lines)}{overflow}{footer}"


def build_upload_rich_message(
    sb: Client,
    *,
    fotos_text: str = "",
    uploader_name: str,
    nro_cliente: str,
    cliente_nombre: str,
    tipo_pdv: str,
    foto_line: str = "",
    estado_label: str = "",
    objetivo_badge: str = "",
    stats_text: str = "",
    historial_text: str = "",
) -> str:
    header = _r(
        sb,
        "upload_rich_header",
        fallback="📋 <b>Exhibición registrada</b>\n\n{fotos_text}",
        fotos_text=fotos_text,
        raw_keys=frozenset({"fotos_text"}),
    )
    datos = _r(
        sb,
        "upload_rich_datos",
        fallback=(
            "👤 <b>Vendedor:</b> {uploader_name}\n"
            "🏪 <b>Cliente:</b> {nro_cliente} - {cliente_nombre}\n"
            "📍 <b>Tipo:</b> {tipo_pdv}\n"
        ),
        uploader_name=uploader_name,
        nro_cliente=nro_cliente,
        cliente_nombre=cliente_nombre,
        tipo_pdv=tipo_pdv,
    )
    extra = _r(
        sb,
        "upload_rich_extra",
        fallback="{objetivo_badge}{stats_text}{historial_text}",
        foto_line="",
        estado_label="",
        objetivo_badge=objetivo_badge,
        stats_text=stats_text,
        historial_text=historial_text,
        raw_keys=frozenset({"objetivo_badge", "stats_text", "historial_text"}),
    )
    footer = _r(sb, "upload_rich_footer", fallback="")
    return f"{header}{datos}{extra}{footer}"


def build_upload_stats_block(
    sb: Client,
    *,
    mes_nombre: str,
    aprobadas: int,
    destacadas: int,
    rechazadas: int,
    pendientes: int,
    puntos: int,
    total: int,
    racha: int = 0,
) -> str:
    racha_line = ""
    if racha >= 2:
        racha_line = _r(
            sb,
            "upload_rich_racha_line",
            fallback="   🔥 Racha: {racha} consecutivas aprobadas\n",
            racha=racha,
        )
    return _r(
        sb,
        "upload_rich_stats_block",
        fallback=(
            "\n\n📊 <b>Tu mes ({mes_nombre}):</b>\n"
            "   ✅ {aprobadas} aprobadas   🔥 {destacadas} destacadas\n"
            "   ❌ {rechazadas} rechazadas   ⏳ {pendientes} pendientes\n"
            "   🏆 Puntos: {puntos}   📦 Exhibiciones: {total}\n"
            "   <i>(Únicas por cliente y día — mismo criterio que el ranking)</i>\n"
            "{racha_line}"
        ),
        mes_nombre=mes_nombre,
        aprobadas=aprobadas,
        destacadas=destacadas,
        rechazadas=rechazadas,
        pendientes=pendientes,
        puntos=puntos,
        total=total,
        racha_line=racha_line,
        raw_keys=frozenset({"racha_line"}),
    )


def build_upload_historial_block(sb: Client, *, lineas: str, count: int) -> str:
    if not lineas.strip():
        return ""
    return _r(
        sb,
        "upload_rich_historial_block",
        fallback="\n\n📂 <b>Historial en este PDV ({count} anteriores):</b>\n{lineas}",
        count=count,
        lineas=lineas,
        raw_keys=frozenset({"lineas"}),
    )


def build_upload_fotos_text(sb: Client, procesadas: int) -> str:
    if procesadas <= 1:
        return ""
    return _r(
        sb,
        "upload_rich_fotos_multi",
        fallback="📸 <b>{n} fotos subidas</b>\n\n",
        n=procesadas,
    )


def build_upload_foto_line(sb: Client, url: str) -> str:
    """Deprecated: la foto ya va como reply; no mostrar link en el texto."""
    return ""


def build_upload_estado_label(sb: Client, *, en_cuarentena: bool) -> str:
    """Deprecated: el estado interno no se muestra al vendedor (confundía con cartera OK)."""
    return ""


def build_upload_objetivo_badge(
    sb: Client,
    *,
    es_global: bool,
    pdv_nombre: str = "",
) -> str:
    if es_global:
        return _r(
            sb,
            "upload_rich_objetivo_global",
            fallback=(
                "\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
                "Esta exhibición cuenta para tu meta general. "
                "Quedó a la espera de evaluación del supervisor."
            ),
        )
    return _r(
        sb,
        "upload_rich_objetivo_pdv",
        fallback=(
            "\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
            "Este PDV (<b>{pdv_nombre}</b>) está en tus metas. "
            "Ha pasado a revisión del supervisor."
        ),
        pdv_nombre=pdv_nombre,
    )
