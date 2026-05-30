# -*- coding: utf-8 -*-
"""
Servicio de difusión de Cuentas Corrientes vía Telegram.

Flujo:
  1. Obtener CC snapshot de cc_detalle para un vendedor (o todos).
  2. Generar PDF con tabla de clientes deudores.
  3. Enviar PDF al grupo Telegram del vendedor usando sendDocument.
"""
from __future__ import annotations

import io
import logging
import re
import unicodedata
from typing import Any

import requests

from db import sb
from core.helpers import load_active_vendedor_ids
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ShelfyAPI")

TELEGRAM_SEND_DOC = "https://api.telegram.org/bot{token}/sendDocument"
TELEGRAM_SEND_MSG = "https://api.telegram.org/bot{token}/sendMessage"
TELEGRAM_PIN_MSG  = "https://api.telegram.org/bot{token}/pinChatMessage"
TELEGRAM_UNPIN_MSG = "https://api.telegram.org/bot{token}/unpinChatMessage"
# Límite caption Telegram ~1024; dejamos margen HTML
TELEGRAM_CAPTION_SAFE_MAX = 900

# In-memory store del último message_id pineado por (dist_id, chat_id)
_pinned_msgs: dict[tuple[int, int], int] = {}

# ─── PDF ──────────────────────────────────────────────────────────────────────
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    )
    _REPORTLAB = True
    _VIOLET = colors.HexColor("#7C3AED")
    _LIGHT  = colors.HexColor("#F5F3FF")
    _SLATE  = colors.HexColor("#64748B")
except ImportError:
    _REPORTLAB = False
    logger.warning("[CCDifusion] reportlab no disponible — PDF desactivado")


# ─── Normalización ────────────────────────────────────────────────────────────

def _norm(s: Any) -> str:
    if not s:
        return ""
    t = str(s).strip().upper()
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", "", t)).strip()


# ─── Rangos de antigüedad (mismo criterio que cuentas_parser / ingesta CC) ───

_RANGO_LABELS = ("1-7 Días", "8-15 Días", "16-21 Días", "22-30 Días", "+30 Días")


def _rango_antiguedad_label(dias: Any) -> str:
    """Bin por antigüedad en días: equivalente a pd.cut(..., bins=[-1,7,15,21,30,inf], right=True)."""
    try:
        d = float(dias) if dias is not None else 0.0
    except (TypeError, ValueError):
        d = 0.0
    if d <= 7:
        return "1-7 Días"
    if d <= 15:
        return "8-15 Días"
    if d <= 21:
        return "16-21 Días"
    if d <= 30:
        return "22-30 Días"
    return "+30 Días"


def _deuda_por_rango(clientes: list[dict]) -> list[tuple[str, float, float, int]]:
    """
    Por cada rango fijo: (etiqueta, deuda del rango, % sobre total deuda, cantidad clientes).
    """
    buckets: dict[str, tuple[float, int]] = {lab: (0.0, 0) for lab in _RANGO_LABELS}
    for c in clientes:
        lab = _rango_antiguedad_label(c.get("antiguedad"))
        amt = float(c.get("deuda_total") or 0)
        prev, n = buckets[lab]
        buckets[lab] = (prev + amt, n + 1)
    total = sum(t[0] for t in buckets.values()) or 1.0
    out: list[tuple[str, float, float, int]] = []
    for lab in _RANGO_LABELS:
        saldo, n_cli = buckets[lab]
        pct = 100.0 * saldo / total
        out.append((lab, saldo, pct, n_cli))
    return out


def _erp_display(value: Any) -> str:
    """Muestra ERP id preservando raw y versión normalizada para evitar confusión 002442 vs 2442."""
    if value is None:
        return "—"
    raw = str(value).strip()
    if not raw:
        return "—"
    norm = raw.lstrip("0") or "0"
    if norm != raw:
        return f"{raw} ({norm})"
    return raw


_COD_NOMBRE_RE = re.compile(r'^(\d+)\s*-\s*(.+)$')


def _normalize_cliente_row(cliente_nombre: str | None, id_cliente_erp: Any) -> tuple[str, str]:
    """
    Returns (erp_display, cliente_display).
    Si id_cliente_erp es null y cliente_nombre tiene formato 'COD - NOMBRE',
    extrae el código como ERP y deja solo el nombre como cliente.
    """
    nombre = (cliente_nombre or "").strip()
    erp_raw = id_cliente_erp

    if not erp_raw and nombre:
        m = _COD_NOMBRE_RE.match(nombre)
        if m:
            erp_raw = m.group(1)
            nombre = m.group(2).strip()

    return _erp_display(erp_raw), nombre


# ─── PDF generation ───────────────────────────────────────────────────────────

def _build_cc_pdf(
    vendedor_nombre: str,
    dist_nombre: str,
    fecha: str,
    clientes: list[dict],
    deuda_total: float,
) -> bytes:
    """Genera PDF con la tabla de clientes deudores para un vendedor."""
    if not _REPORTLAB:
        raise RuntimeError("reportlab no instalado")

    buf = io.BytesIO()
    from reportlab.lib.pagesizes import landscape, A4
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1.0 * cm, rightMargin=1.0 * cm,
        topMargin=1.0 * cm, bottomMargin=1.0 * cm,
    )
    styles = getSampleStyleSheet()
    title_style  = ParagraphStyle("Title",  parent=styles["Normal"], fontSize=14, textColor=_VIOLET, fontName="Helvetica-Bold", spaceAfter=4)
    sub_style    = ParagraphStyle("Sub",    parent=styles["Normal"], fontSize=9,  textColor=_SLATE,  spaceAfter=2)
    sect_style = ParagraphStyle("Sect", parent=styles["Normal"], fontSize=9, textColor=_VIOLET, fontName="Helvetica-Bold", spaceAfter=4, spaceBefore=2)

    story = [
        Paragraph(f"Cuentas Corrientes — {dist_nombre}", title_style),
        Paragraph(f"Vendedor: <b>{vendedor_nombre}</b>  ·  Al {fecha}  ·  Total deuda: <b>${deuda_total:,.0f}</b>".replace(",", "."), sub_style),
        Spacer(1, 8),
    ]

    por_rango = _deuda_por_rango(clientes)
    summary_rows = [["Rango (días)", "Clientes", "Deuda $", "% del total"]]
    for lab, saldo, pct, n_cli in por_rango:
        pct_txt = f"{pct:.1f}%".replace(".", ",")
        summary_rows.append([
            lab,
            str(n_cli),
            f"${saldo:,.0f}".replace(",", "."),
            pct_txt,
        ])
    sum_tw = [4.8 * cm, 2 * cm, 3.8 * cm, 3.9 * cm]
    sum_tbl = Table(summary_rows, colWidths=sum_tw, repeatRows=1)
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), _VIOLET),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0), 8),
        ("ALIGN",        (1, 0), (-1, -1), "CENTER"),
        ("ALIGN",        (0, 0), (0, -1), "LEFT"),
        ("FONTSIZE",     (0, 1), (-1, -1), 7.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.25, _SLATE),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([
        Paragraph("Distribución de deuda por antigüedad", sect_style),
        sum_tbl,
        Spacer(1, 10),
        Paragraph("Detalle por cliente", sect_style),
    ])

    # Table header + rows
    table_data = [["Cliente ERP", "Cliente", "Total $", "7 Días", "15 Días", "30 Días", "60 Días", "+60 Días"]]
    for c in clientes:
        erp_disp, cliente_disp = _normalize_cliente_row(c.get("cliente"), c.get("id_cliente_erp"))
        table_data.append([
            erp_disp,
            (cliente_disp or "—")[:40],
            f"${float(c.get('deuda_total') or 0):,.0f}".replace(",", "."),
            f"${float(c.get('deuda_7_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_7_dias') else "-",
            f"${float(c.get('deuda_15_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_15_dias') else "-",
            f"${float(c.get('deuda_30_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_30_dias') else "-",
            f"${float(c.get('deuda_60_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_60_dias') else "-",
            f"${float(c.get('deuda_mas_60_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_mas_60_dias') else "-",
        ])

    col_widths = [2.2 * cm, 7.5 * cm, 3.0 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), _VIOLET),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0), 8),
        ("ALIGN",        (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN",        (0, 0), (1, -1), "LEFT"),
        ("FONTSIZE",     (0, 1), (-1, -1), 7.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.3, _SLATE),
        ("TEXTCOLOR",    (0, 1), (-1, -1), colors.black),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    doc.build(story)
    return buf.getvalue()


def _build_cadenaone_pdf(
    dist_nombre: str,
    fecha: str,
    clientes: list[dict],
    deuda_total: float,
) -> bytes:
    if not _REPORTLAB:
        raise RuntimeError("reportlab no instalado")

    buf = io.BytesIO()
    # A4 Horizontal/Landscape
    from reportlab.lib.pagesizes import landscape, A4
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1.0 * cm, rightMargin=1.0 * cm,
        topMargin=1.0 * cm, bottomMargin=1.0 * cm,
    )
    styles = getSampleStyleSheet()
    title_style  = ParagraphStyle("Title",  parent=styles["Normal"], fontSize=14, textColor=_VIOLET, fontName="Helvetica-Bold", spaceAfter=4)
    sub_style    = ParagraphStyle("Sub",    parent=styles["Normal"], fontSize=9,  textColor=_SLATE,  spaceAfter=2)
    sect_style = ParagraphStyle("Sect", parent=styles["Normal"], fontSize=9, textColor=_VIOLET, fontName="Helvetica-Bold", spaceAfter=4, spaceBefore=2)

    story = [
        Paragraph(f"Cuentas Corrientes — Cadena One (Federico Alvarez)", title_style),
        Paragraph(f"Distribuidora: <b>{dist_nombre}</b>  ·  Al {fecha}  ·  Total deuda: <b>${deuda_total:,.0f}</b>".replace(",", "."), sub_style),
        Spacer(1, 10),
    ]

    table_data = [["Cliente ERP", "Cliente", "Total $", "7 Días", "15 Días", "30 Días", "60 Días", "+60 Días"]]
    for c in clientes:
        erp_disp, cliente_disp = _normalize_cliente_row(c.get("cliente"), c.get("id_cliente_erp"))
        table_data.append([
            erp_disp,
            (cliente_disp or "—")[:40],
            f"${float(c.get('deuda_total') or 0):,.0f}".replace(",", "."),
            f"${float(c.get('deuda_7_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_7_dias') else "-",
            f"${float(c.get('deuda_15_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_15_dias') else "-",
            f"${float(c.get('deuda_30_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_30_dias') else "-",
            f"${float(c.get('deuda_60_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_60_dias') else "-",
            f"${float(c.get('deuda_mas_60_dias') or 0):,.0f}".replace(",", ".") if c.get('deuda_mas_60_dias') else "-",
        ])

    col_widths = [2.2 * cm, 7.5 * cm, 3.0 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm, 2.7 * cm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), _VIOLET),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0), 8),
        ("ALIGN",        (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN",        (0, 0), (1, -1), "LEFT"),
        ("FONTSIZE",     (0, 1), (-1, -1), 7.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.3, _SLATE),
        ("TEXTCOLOR",    (0, 1), (-1, -1), colors.black),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    doc.build(story)
    return buf.getvalue()


# ─── Telegram helpers ─────────────────────────────────────────────────────────

def _get_bot_token(dist_id: int) -> str | None:
    try:
        r = sb.table("distribuidores").select("token_bot").eq("id_distribuidor", dist_id).limit(1).execute()
        return (r.data or [{}])[0].get("token_bot")
    except Exception as e:
        logger.warning(f"[CCDifusion] token_bot dist={dist_id}: {e}")
        return None


def _get_dist_nombre(dist_id: int) -> str:
    try:
        r = sb.table("distribuidores").select("nombre_distribuidor").eq("id_distribuidor", dist_id).limit(1).execute()
        return (r.data or [{}])[0].get("nombre_distribuidor") or f"Distribuidor {dist_id}"
    except Exception:
        return f"Distribuidor {dist_id}"


def _get_telegram_chat_id(dist_id: int, id_vendedor: int) -> int | None:
    from services.objetivos_notification_service import resolve_integrante_for_objetivos
    try:
        row = resolve_integrante_for_objetivos(dist_id, id_vendedor)
        if not row:
            return None
        gid = row.get("telegram_group_id")
        if gid is not None and str(gid).strip() not in ("", "0", "None"):
            return int(gid)
        return None
    except Exception as e:
        logger.warning(f"[CCDifusion] chat_id vend={id_vendedor} dist={dist_id}: {e}")
        return None


def _escape_telegram_html_text(s: str) -> str:
    """Texto plano para parse_mode HTML (evita que un '<' literal rompa Telegram)."""
    return (
        str(s).replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _trim_telegram_caption(html: str) -> str:
    """Evita errores Telegram por caption demasiado largo (tags HTML incluidos)."""
    if len(html) <= TELEGRAM_CAPTION_SAFE_MAX:
        return html
    cut = TELEGRAM_CAPTION_SAFE_MAX - 60
    return html[:cut] + "\n<b>…(texto cortado — ver mensaje siguiente)</b>"


def _send_document(token: str, chat_id: int, pdf_bytes: bytes, filename: str, caption: str) -> tuple[bool, int | None]:
    """Returns (ok, message_id). message_id is None on failure."""
    caption_eff = _trim_telegram_caption(caption)
    try:
        resp = requests.post(
            TELEGRAM_SEND_DOC.format(token=token),
            files={"document": (filename, pdf_bytes, "application/pdf")},
            data={"chat_id": str(chat_id), "caption": caption_eff, "parse_mode": "HTML"},
            timeout=20,
        )
        if resp.ok:
            msg_id = (resp.json().get("result") or {}).get("message_id")
            if msg_id is None:
                logger.warning(f"[CCDifusion] sendDocument ok pero message_id ausente en response: {resp.text[:200]}")
            logger.info(f"[CCDifusion] PDF enviado chat={chat_id} msg_id={msg_id}")
            return True, msg_id
        logger.warning(f"[CCDifusion] sendDocument error chat={chat_id}: {resp.status_code} {resp.text[:120]}")
        return False, None
    except Exception as e:
        logger.error(f"[CCDifusion] sendDocument exc chat={chat_id}: {e}")
        return False, None


def _pin_cc_message(token: str, dist_id: int, chat_id: int, message_id: int) -> None:
    """Pin el mensaje CC en el grupo. Desancla el anterior si existe. Degrada sin lanzar si sin permisos."""
    prev_id = _pinned_msgs.get((dist_id, chat_id))
    if prev_id:
        try:
            requests.post(
                TELEGRAM_UNPIN_MSG.format(token=token),
                json={"chat_id": chat_id, "message_id": prev_id},
                timeout=5,
            )
        except Exception:
            pass
    try:
        resp = requests.post(
            TELEGRAM_PIN_MSG.format(token=token),
            json={"chat_id": chat_id, "message_id": message_id, "disable_notification": True},
            timeout=5,
        )
        if resp.ok:
            _pinned_msgs[(dist_id, chat_id)] = message_id
            logger.info(f"[CCDifusion] Mensaje pineado chat={chat_id} msg_id={message_id}")
        elif resp.status_code == 403:
            logger.warning(f"[CCDifusion] Sin permisos de pin en chat={chat_id} (403) — {resp.text[:200]}")
        else:
            logger.warning(f"[CCDifusion] pinChatMessage error chat={chat_id}: HTTP {resp.status_code} resp={resp.text[:400]}")
    except Exception as e:
        logger.warning(f"[CCDifusion] pin exc chat={chat_id}: {e}")


def _send_text(token: str, chat_id: int, text: str) -> bool:
    try:
        resp = requests.post(
            TELEGRAM_SEND_MSG.format(token=token),
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        return resp.ok
    except Exception as e:
        logger.warning(f"[CCDifusion] sendMessage exc: {e}")
        return False


# ─── CC data fetcher ──────────────────────────────────────────────────────────

def _fetch_cc_snapshot(dist_id: int, fecha: str | None = None) -> tuple[str | None, list[dict]]:
    """Devuelve (fecha_snapshot, rows) del snapshot más reciente de cc_detalle."""
    q = sb.table("cc_detalle").select("fecha_snapshot").eq("id_distribuidor", dist_id)
    if fecha:
        q = q.lte("fecha_snapshot", fecha)
    snap = q.order("fecha_snapshot", desc=True).limit(1).execute()
    if not snap.data:
        return None, []
    fecha_snapshot = snap.data[0]["fecha_snapshot"]

    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("cc_detalle")
            .select("id_vendedor, vendedor_nombre, cliente_nombre, id_cliente_erp, id_cliente, deuda_total, antiguedad_dias, cantidad_comprobantes, deuda_7_dias, deuda_15_dias, deuda_30_dias, deuda_60_dias, deuda_mas_60_dias")
            .eq("id_distribuidor", dist_id)
            .eq("fecha_snapshot", fecha_snapshot)
            .range(offset, offset + 999)
            .execute()
            .data or []
        )
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    # Última compra: ventas_enriched (Informe Ventas); fallback padrón. Deuda = CHESS.
    from core.tenant_tables import tenant_table_name
    from core.ultima_compra import enrich_filas_fecha_ultima_compra

    t_cli = tenant_table_name("clientes_pdv_v2", dist_id)
    id_erps = [r["id_cliente_erp"] for r in rows if r.get("id_cliente_erp")]
    padron_fuc: dict[str, str] = {}
    if id_erps:
        chunk_size = 500
        for i in range(0, len(id_erps), chunk_size):
            chunk = id_erps[i : i + chunk_size]
            try:
                c_res = (
                    sb.table(t_cli)
                    .select("id_cliente_erp, fecha_ultima_compra")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_cliente_erp", chunk)
                    .execute()
                )
                for c in c_res.data or []:
                    if c.get("fecha_ultima_compra"):
                        padron_fuc[str(c["id_cliente_erp"]).strip().upper()] = str(
                            c["fecha_ultima_compra"]
                        )[:10]
            except Exception as e:
                logger.warning(f"[CCDifusion] Error fetching fecha_ultima_compra for chunk: {e}")

    for r in rows:
        erp_key = str(r.get("id_cliente_erp")).strip().upper()
        r["fecha_ultima_compra"] = padron_fuc.get(erp_key)
    try:
        enrich_filas_fecha_ultima_compra(dist_id, rows)
    except Exception as e:
        logger.warning(f"[CCDifusion] ventas enriched FUC overlay: {e}")

    return fecha_snapshot, rows


def _cc_rows_for_vendor(rows: list[dict], id_vendedor: int) -> list[dict]:
    return [r for r in rows if r.get("id_vendedor") == id_vendedor]


def _group_by_vendor(rows: list[dict]) -> dict[int | str, dict]:
    """Agrupa filas CC por id_vendedor (o nombre si NULL)."""
    vendors: dict = {}
    for r in rows:
        vid = r.get("id_vendedor") or r.get("vendedor_nombre", "SIN_VENDEDOR").upper()
        if vid not in vendors:
            vendors[vid] = {
                "id_vendedor": r.get("id_vendedor"),
                "vendedor_nombre": r.get("vendedor_nombre") or "Sin vendedor",
                "clientes": [],
                "deuda_total": 0.0,
            }
        vendors[vid]["clientes"].append({
            "cliente": r.get("cliente_nombre"),
            "id_cliente_erp": r.get("id_cliente_erp"),
            "deuda_total": float(r.get("deuda_total") or 0),
            "deuda_7_dias": float(r.get("deuda_7_dias") or 0),
            "deuda_15_dias": float(r.get("deuda_15_dias") or 0),
            "deuda_30_dias": float(r.get("deuda_30_dias") or 0),
            "deuda_60_dias": float(r.get("deuda_60_dias") or 0),
            "deuda_mas_60_dias": float(r.get("deuda_mas_60_dias") or 0),
            "antiguedad": r.get("antiguedad_dias"),
            "cantidad_comprobantes": r.get("cantidad_comprobantes"),
            "fecha_ultima_compra": r.get("fecha_ultima_compra"),
        })
        vendors[vid]["deuda_total"] += float(r.get("deuda_total") or 0)
    for vd in vendors.values():
        vd["clientes"].sort(key=lambda c: c["antiguedad"] or 0, reverse=True)
    return vendors


# ─── Resolución de nombre del vendedor para el mensaje ────────────────────────

def _extract_display_name(raw: str) -> str:
    """'CODE - NOMBRE' → 'NOMBRE'."""
    if " - " in (raw or ""):
        return raw.split(" - ", 1)[1].strip()
    return (raw or "").strip()


# ─── Función principal: enviar CC de un vendedor ──────────────────────────────

def enviar_cc_vendedor(
    dist_id: int,
    id_vendedor: int,
    token: str,
    dist_nombre: str,
    fecha_snapshot: str,
    vend_data: dict,
    mensaje_extra: str = "",
) -> dict:
    """
    Genera y envía el PDF de CC de un vendedor a su grupo Telegram.
    Retorna {'ok': bool, 'vendedor': str, 'error': str | None}.
    """
    chat_id = _get_telegram_chat_id(dist_id, id_vendedor)
    if not chat_id:
        return {"ok": False, "vendedor": vend_data["vendedor_nombre"], "error": "Sin grupo Telegram"}

    nombre_display = _extract_display_name(vend_data["vendedor_nombre"])
    clientes = vend_data.get("clientes", [])
    deuda_total = vend_data.get("deuda_total", 0.0)

    if not clientes:
        return {"ok": False, "vendedor": vend_data["vendedor_nombre"], "error": "Sin deuda registrada"}

    # Construir caption
    fecha_fmt = "/".join(reversed(fecha_snapshot[:10].split("-")))
    caption_lines = [
        f"💳 <b>Cuentas Corrientes — {nombre_display}</b>",
        f"📅 Al {fecha_fmt}",
        f"💰 Total deuda: <b>${deuda_total:,.0f}</b>".replace(",", "."),
        f"👥 {len(clientes)} clientes deudores",
    ]
    caption = "\n".join(caption_lines)
    extra_plain = mensaje_extra.strip()

    try:
        pdf_bytes = _build_cc_pdf(
            vendedor_nombre=nombre_display,
            dist_nombre=dist_nombre,
            fecha=fecha_fmt,
            clientes=clientes,
            deuda_total=deuda_total,
        )
        # Nombre corto: Telegram trunca nombres largos en la UI del chat
        ftag = fecha_snapshot[:10].replace("-", "")
        filename = f"CC_{ftag}_{id_vendedor}.pdf"
        ok, doc_msg_id = _send_document(token, chat_id, pdf_bytes, filename, caption)
        if ok and doc_msg_id:
            logger.info(f"[CCDifusion] Intentando pin chat={chat_id} msg_id={doc_msg_id}")
            _pin_cc_message(token, dist_id, chat_id, doc_msg_id)
        elif ok and not doc_msg_id:
            logger.warning(f"[CCDifusion] PDF enviado OK pero doc_msg_id=None, no se puede pinear")
        if ok and extra_plain:
            ok = ok and _send_text(token, chat_id, f"💬 {_escape_telegram_html_text(extra_plain)}")
        return {"ok": ok, "vendedor": vend_data["vendedor_nombre"], "error": None if ok else "Error al enviar"}
    except RuntimeError as e:
        # PDF no disponible — enviar solo texto
        logger.warning(f"[CCDifusion] PDF no disponible, enviando texto: {e}")
        ok = _send_text(token, chat_id, caption)
        if ok and extra_plain:
            ok = ok and _send_text(token, chat_id, f"💬 {_escape_telegram_html_text(extra_plain)}")
        return {"ok": ok, "vendedor": vend_data["vendedor_nombre"], "error": None if ok else "Error al enviar texto"}
    except Exception as e:
        logger.error(f"[CCDifusion] exc vend={id_vendedor}: {e}")
        return {"ok": False, "vendedor": vend_data["vendedor_nombre"], "error": str(e)}


def enviar_cc_cadenaone(
    dist_id: int,
    token: str,
    dist_nombre: str,
    chat_id: int,
) -> dict:
    """
    Genera y envía el PDF de CC para la Cadena One (Federico Alvarez) al chat indicado.
    """
    fecha_snapshot, rows = _fetch_cc_snapshot(dist_id)
    if not fecha_snapshot or not rows:
        return {"ok": False, "error": "No hay snapshot reciente"}

    clientes_cadena = []
    for r in rows:
        c_nombre = r.get("cliente_nombre", "")
        if "FEDERICO ALVAREZ" in _norm(c_nombre):
            clientes_cadena.append({
                "cliente": r.get("cliente_nombre"),
                "id_cliente_erp": r.get("id_cliente_erp"),
                "deuda_total": float(r.get("deuda_total") or 0),
                "deuda_7_dias": float(r.get("deuda_7_dias") or 0),
                "deuda_15_dias": float(r.get("deuda_15_dias") or 0),
                "deuda_30_dias": float(r.get("deuda_30_dias") or 0),
                "deuda_60_dias": float(r.get("deuda_60_dias") or 0),
                "deuda_mas_60_dias": float(r.get("deuda_mas_60_dias") or 0),
                "antiguedad": r.get("antiguedad_dias"),
                "cantidad_comprobantes": r.get("cantidad_comprobantes"),
                "fecha_ultima_compra": r.get("fecha_ultima_compra"),
            })

    if not clientes_cadena:
        return {"ok": False, "error": "No se encontraron clientes para la Cadena One (Federico Alvarez)."}

    deuda_total = sum(c["deuda_total"] or 0.0 for c in clientes_cadena)
    nombre_display = "Cadena One (Federico Alvarez)"
    fecha_fmt = "/".join(reversed(fecha_snapshot[:10].split("-")))

    caption_lines = [
        f"💳 <b>Cuentas Corrientes — {nombre_display}</b>",
        f"📅 Al {fecha_fmt}",
        f"💰 Total deuda: <b>${deuda_total:,.0f}</b>".replace(",", "."),
        f"👥 {len(clientes_cadena)} clientes deudores",
    ]
    caption = "\n".join(caption_lines)

    try:
        pdf_bytes = _build_cadenaone_pdf(
            dist_nombre=dist_nombre,
            fecha=fecha_fmt,
            clientes=clientes_cadena,
            deuda_total=deuda_total,
        )
        ftag = fecha_snapshot[:10].replace("-", "")
        filename = f"CC_{ftag}_CadenaOne.pdf"
        ok, doc_msg_id = _send_document(token, chat_id, pdf_bytes, filename, caption)
        return {"ok": ok, "error": None if ok else "Error al enviar PDF"}
    except Exception as e:
        logger.error(f"[CCDifusion] exc cadenaone: {e}")
        return {"ok": False, "error": str(e)}


# ─── SIGO resumen Telegram ───────────────────────────────────────────────────

def _build_sigo_mensaje(
    vendedor_nombre: str,
    date_from: str,
    date_to: str,
    dia_data: dict,
    mensaje_template: str,
) -> str:
    """
    Genera el texto del mensaje Telegram con KPIs SIGO de un vendedor.
    `dia_data` es la suma/agrupación de filas de `por_vendedor_y_dia` para ese vendedor.
    """
    planeadas = dia_data.get("planeadas", 0)
    ejecutadas = dia_data.get("ejecutadas", 0)
    con_venta = dia_data.get("con_venta", 0)
    motivo_no_venta = dia_data.get("motivo_no_venta", 0)
    sin_info = dia_data.get("sin_info", 0)
    hora_primera_visita = dia_data.get("hora_primera_visita") or "—"
    hora_primera_venta = dia_data.get("hora_primera_venta") or "—"

    pct_ejecutadas = round(ejecutadas / planeadas * 100, 1) if planeadas > 0 else 0.0
    pct_con_venta = round(con_venta / ejecutadas * 100, 1) if ejecutadas > 0 else 0.0

    nombre_display = _extract_display_name(vendedor_nombre)

    lines = [
        f"📊 <b>Reporte SIGO — {nombre_display}</b>",
        f"Período: {date_from} → {date_to}",
        "",
        f"Planeadas: {planeadas}",
        f"Ejecutadas: {ejecutadas} ({pct_ejecutadas}%)",
        f"Con venta: {con_venta} ({pct_con_venta}%)",
        f"Sin venta con motivo: {motivo_no_venta}",
        f"Sin info: {sin_info}",
        "",
        f"⏰ Primera visita: {hora_primera_visita}",
        f"💰 Primera venta: {hora_primera_venta}",
    ]
    if mensaje_template and mensaje_template.strip():
        lines.append("")
        lines.append(mensaje_template.strip())

    return "\n".join(lines)


def _aggregate_sigo_for_vendor(vendor_rows: list[dict]) -> dict:
    """Suma todas las filas `por_vendedor_y_dia` de un vendedor en un dict único."""
    agg: dict = {
        "planeadas": 0,
        "ejecutadas": 0,
        "sin_visita": 0,
        "con_venta": 0,
        "motivo_no_venta": 0,
        "sin_info": 0,
        "hora_primera_visita": None,
        "hora_primera_venta": None,
        "tiempo_promedio_venta_min": None,
    }
    tpv_list: list[float] = []
    for row in vendor_rows:
        agg["planeadas"] += row.get("planeadas") or 0
        agg["ejecutadas"] += row.get("ejecutadas") or 0
        agg["sin_visita"] += row.get("sin_visita") or 0
        agg["con_venta"] += row.get("con_venta") or 0
        agg["motivo_no_venta"] += row.get("motivo_no_venta") or 0
        agg["sin_info"] += row.get("sin_info") or 0
        h1v = row.get("hora_primera_visita")
        if h1v and (agg["hora_primera_visita"] is None or h1v < agg["hora_primera_visita"]):
            agg["hora_primera_visita"] = h1v
        h1e = row.get("hora_primera_venta")
        if h1e and (agg["hora_primera_venta"] is None or h1e < agg["hora_primera_venta"]):
            agg["hora_primera_venta"] = h1e
        tpv = row.get("tiempo_promedio_venta_min")
        if tpv is not None:
            tpv_list.append(float(tpv))
    if tpv_list:
        agg["tiempo_promedio_venta_min"] = round(sum(tpv_list) / len(tpv_list), 1)
    return agg


def difundir_sigo_resumen_telegram(
    dist_id: int,
    modo: str,          # "uno" | "todos"
    id_vendedor: int | None,
    mensaje_template: str,
    sigo_data: dict,    # resultado de parse_sigo() con por_vendedor_y_dia
) -> dict:
    """
    Envía un mensaje de texto con el resumen SIGO del período al grupo Telegram
    del vendedor (o de todos).
    Retorna {"enviados": [...], "errores": [...]}.
    """
    token = _get_bot_token(dist_id)
    if not token:
        raise ValueError(f"Distribuidor {dist_id} no tiene token_bot configurado")

    date_from = sigo_data.get("date_from") or ""
    date_to   = sigo_data.get("date_to") or ""
    por_dia   = sigo_data.get("por_vendedor_y_dia") or []

    if not por_dia:
        return {"enviados": [], "errores": [{"vendedor": "—", "error": "sigo_data no contiene por_vendedor_y_dia"}]}

    # Agrupar filas por vendedor (nombre del ERP tal como viene del SIGO)
    vendor_rows_map: dict[str, list[dict]] = {}
    for row in por_dia:
        vname = (row.get("vendedor") or "").strip()
        if not vname:
            continue
        vendor_rows_map.setdefault(vname, []).append(row)

    # Si modo=uno necesitamos resolver el nombre ERP del vendedor por id_vendedor
    def _resolve_erp_name_for_id(vid: int) -> str | None:
        try:
            from core.tenant_tables import tenant_table_name
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            r = sb.table(t_vend).select("nombre_erp").eq("id_distribuidor", dist_id).eq("id_vendedor", vid).limit(1).execute()
            rows = r.data or []
            return rows[0].get("nombre_erp") if rows else None
        except Exception:
            return None

    enviados: list[dict] = []
    errores:  list[dict] = []

    def _send_for_vendor(erp_name: str, real_id: int) -> None:
        dia_rows = vendor_rows_map.get(erp_name)
        if not dia_rows:
            errores.append({"vendedor": erp_name, "error": "Sin datos SIGO para este vendedor"})
            return
        agg = _aggregate_sigo_for_vendor(dia_rows)
        mensaje = _build_sigo_mensaje(erp_name, date_from, date_to, agg, mensaje_template)
        chat_id = _get_telegram_chat_id(dist_id, real_id)
        if not chat_id:
            errores.append({"vendedor": erp_name, "error": "Sin grupo Telegram"})
            return
        ok = _send_text(token, chat_id, mensaje)
        (enviados if ok else errores).append({
            "vendedor": erp_name,
            "error": None if ok else "Error al enviar mensaje",
        })

    if modo == "uno":
        if id_vendedor is None:
            return {"enviados": [], "errores": [{"vendedor": "—", "error": "modo=uno requiere id_vendedor"}]}
        active_ids_sigo = load_active_vendedor_ids(dist_id)
        if active_ids_sigo and id_vendedor not in active_ids_sigo:
            logger.warning(f"[SIGODifusion] modo=uno dist={dist_id}: vendedor {id_vendedor} inactivo — envío bloqueado")
            return {"enviados": [], "errores": [{"vendedor": str(id_vendedor), "error": "Vendedor inactivo — envío bloqueado"}]}
        erp_name = _resolve_erp_name_for_id(id_vendedor)
        if not erp_name:
            return {"enviados": [], "errores": [{"vendedor": str(id_vendedor), "error": "Vendedor no encontrado en vendedores_v2"}]}
        _send_for_vendor(erp_name, id_vendedor)
    else:  # "todos"
        # Obtener todos los vendedores del distribuidor para cruzar nombre→id_vendedor
        try:
            from core.tenant_tables import tenant_table_name
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            vend_rows: list[dict] = []
            offset = 0
            while True:
                batch = (
                    sb.table(t_vend)
                    .select("id_vendedor, nombre_erp")
                    .eq("id_distribuidor", dist_id)
                    .range(offset, offset + 999)
                    .execute()
                    .data or []
                )
                vend_rows.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
            name_to_id = {(v.get("nombre_erp") or "").strip(): v["id_vendedor"] for v in vend_rows if v.get("id_vendedor")}
        except Exception as e:
            logger.error(f"[SIGODifusion] fetch vendedores dist={dist_id}: {e}")
            return {"enviados": [], "errores": [{"vendedor": "—", "error": f"Error al obtener vendedores: {e}"}]}

        active_ids_sigo_all = load_active_vendedor_ids(dist_id)
        n_before_sigo = len(vendor_rows_map)
        active_names_sigo = {name for name, vid in name_to_id.items() if vid in active_ids_sigo_all} if active_ids_sigo_all else set(name_to_id.keys())
        if n_before_sigo != len(active_names_sigo):
            logger.info(f"[SIGODifusion] difundir dist={dist_id}: excludió {n_before_sigo - len(active_names_sigo)} vendedores inactivos")

        for erp_name in vendor_rows_map:
            if active_ids_sigo_all and erp_name not in active_names_sigo:
                logger.debug(f"[SIGODifusion] dist={dist_id}: skip inactivo '{erp_name}'")
                continue
            real_id = name_to_id.get(erp_name)
            if not real_id:
                errores.append({"vendedor": erp_name, "error": "id_vendedor no encontrado en vendedores_v2"})
                continue
            _send_for_vendor(erp_name, real_id)

    return {"enviados": enviados, "errores": errores}


# ─── Título de grupo Telegram ─────────────────────────────────────────────────

_chat_title_cache: dict[int, tuple[str, float]] = {}  # chat_id -> (title, ts)
_TITLE_TTL = 1800  # segundos

TELEGRAM_GET_CHAT = "https://api.telegram.org/bot{token}/getChat"


def _get_telegram_chat_title(token: str, chat_id: int) -> str | None:
    import time
    entry = _chat_title_cache.get(chat_id)
    if entry and (time.time() - entry[1]) < _TITLE_TTL:
        return entry[0]
    try:
        resp = requests.get(
            TELEGRAM_GET_CHAT.format(token=token),
            params={"chat_id": chat_id},
            timeout=6,
        )
        if resp.ok:
            title = resp.json().get("result", {}).get("title") or str(chat_id)
            _chat_title_cache[chat_id] = (title, time.time())
            return title
    except Exception as e:
        logger.warning(f"[CCDifusion] getChat chat={chat_id}: {e}")
    return None


# ─── Preview: planificación de envíos sin disparar Telegram ──────────────────

def planificar_envios_cc_telegram(
    dist_id: int,
    modo: str,
    id_vendedor: int | None,
    sucursal: str | None,
    fecha: str | None,
) -> dict:
    """
    Resuelve qué envíos se realizarían sin enviar nada.
    Retorna {
        'fecha_snapshot': str | None,
        'envios': [ { id_vendedor, vendedor_nombre, clientes_count, deuda_total,
                      telegram_group_id, telegram_title, flags: {duplicate_group, missing_group, empty_cc} } ],
        'tiene_conflictos': bool,
    }
    """
    token = _get_bot_token(dist_id)

    fecha_snapshot, all_rows = _fetch_cc_snapshot(dist_id, fecha)
    if not fecha_snapshot:
        return {"fecha_snapshot": None, "envios": [], "tiene_conflictos": False}

    if sucursal:
        t_suc = tenant_table_name("sucursales_v2", dist_id)
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        suc_rows = (
            sb.table(t_suc).select("id_sucursal")
            .eq("id_distribuidor", dist_id).ilike("nombre_erp", sucursal.strip()).execute().data or []
        )
        valid_suc_ids = {s["id_sucursal"] for s in suc_rows}
        valid_vend_ids: set = set()
        if valid_suc_ids:
            vend_rows = (
                sb.table(t_vend).select("id_vendedor")
                .eq("id_distribuidor", dist_id).in_("id_sucursal", list(valid_suc_ids)).execute().data or []
            )
            valid_vend_ids = {v["id_vendedor"] for v in vend_rows}
        all_rows = [r for r in all_rows if r.get("id_vendedor") in valid_vend_ids] if valid_vend_ids else []

    vendors = _group_by_vendor(all_rows)

    if modo == "uno":
        if id_vendedor is None:
            return {"fecha_snapshot": fecha_snapshot, "envios": [], "tiene_conflictos": False}
        vendors = {id_vendedor: vendors[id_vendedor]} if id_vendedor in vendors else {}
    else:
        active_ids = load_active_vendedor_ids(dist_id)
        n_before = len(vendors)
        vendors = {vid: vd for vid, vd in vendors.items() if vid in active_ids}
        if n_before != len(vendors):
            logger.info(f"[CCDifusion] planificar dist={dist_id}: excludió {n_before - len(vendors)} vendedores inactivos")

    group_id_to_vend: dict[int, list[int]] = {}
    envios = []

    for vid, vd in vendors.items():
        real_id = vd.get("id_vendedor")
        if not real_id:
            continue
        chat_id = _get_telegram_chat_id(dist_id, real_id) if real_id else None
        title: str | None = None
        if chat_id and token:
            title = _get_telegram_chat_title(token, chat_id)
        if chat_id:
            group_id_to_vend.setdefault(chat_id, []).append(real_id)

        envios.append({
            "id_vendedor":       real_id,
            "vendedor_nombre":   _extract_display_name(vd["vendedor_nombre"]),
            "clientes_count":    len(vd["clientes"]),
            "deuda_total":       vd["deuda_total"],
            "telegram_group_id": chat_id,
            "telegram_title":    title or (str(chat_id) if chat_id else None),
            "flags": {
                "missing_group": chat_id is None,
                "empty_cc":      len(vd["clientes"]) == 0,
                "duplicate_group": False,  # se rellena en el segundo pass
            },
        })

    # Detectar grupos duplicados (mismo chat_id → 2+ vendedores distintos)
    duplicated_group_ids = {gid for gid, vids in group_id_to_vend.items() if len(vids) > 1}
    for e in envios:
        gid = e["telegram_group_id"]
        if gid and gid in duplicated_group_ids:
            e["flags"]["duplicate_group"] = True

    tiene_conflictos = bool(duplicated_group_ids)

    return {
        "fecha_snapshot":   fecha_snapshot,
        "envios":           envios,
        "tiene_conflictos": tiene_conflictos,
    }


# ─── Entry point para el router ───────────────────────────────────────────────

def difundir_cc_telegram(
    dist_id: int,
    modo: str,          # "uno" | "todos"
    id_vendedor: int | None,
    sucursal: str | None,
    mensaje_template: str,
    fecha: str | None,
) -> dict:
    """
    Orquesta el envío de CC vía Telegram.
    Retorna {"enviados": [...], "errores": [...], "fecha_snapshot": str | None}.
    """
    token = _get_bot_token(dist_id)
    if not token:
        raise ValueError(f"Distribuidor {dist_id} no tiene token_bot configurado")

    dist_nombre = _get_dist_nombre(dist_id)
    fecha_snapshot, all_rows = _fetch_cc_snapshot(dist_id, fecha)
    if not fecha_snapshot:
        return {"enviados": [], "errores": [{"vendedor": "—", "error": "Sin datos de CC para este distribuidor"}], "fecha_snapshot": None}

    # Filtrar por sucursal si se especificó
    if sucursal:
        t_suc = tenant_table_name("sucursales_v2", dist_id)
        t_vend = tenant_table_name("vendedores_v2", dist_id)
        suc_rows = sb.table(t_suc).select("id_sucursal").eq("id_distribuidor", dist_id).ilike("nombre_erp", sucursal.strip()).execute().data or []
        valid_suc_ids = {s["id_sucursal"] for s in suc_rows}
        valid_vend_ids: set = set()
        if valid_suc_ids:
            vend_rows = sb.table(t_vend).select("id_vendedor").eq("id_distribuidor", dist_id).in_("id_sucursal", list(valid_suc_ids)).execute().data or []
            valid_vend_ids = {v["id_vendedor"] for v in vend_rows}
        all_rows = [r for r in all_rows if r.get("id_vendedor") in valid_vend_ids] if valid_vend_ids else []

    vendors = _group_by_vendor(all_rows)

    enviados, errores = [], []

    if modo == "uno":
        if id_vendedor is None:
            return {"enviados": [], "errores": [{"vendedor": "—", "error": "modo=uno requiere id_vendedor"}], "fecha_snapshot": fecha_snapshot}
        active_ids = load_active_vendedor_ids(dist_id)
        if active_ids and id_vendedor not in active_ids:
            logger.warning(f"[CCDifusion] modo=uno dist={dist_id}: vendedor {id_vendedor} inactivo — envío bloqueado")
            return {"enviados": [], "errores": [{"vendedor": str(id_vendedor), "error": "Vendedor inactivo — envío bloqueado"}], "fecha_snapshot": fecha_snapshot}
        vd = vendors.get(id_vendedor)
        if not vd:
            return {"enviados": [], "errores": [{"vendedor": str(id_vendedor), "error": "Sin datos CC para este vendedor"}], "fecha_snapshot": fecha_snapshot}
        result = enviar_cc_vendedor(dist_id, id_vendedor, token, dist_nombre, fecha_snapshot, vd, mensaje_template)
        (enviados if result["ok"] else errores).append(result)

    else:  # "todos"
        active_ids = load_active_vendedor_ids(dist_id)
        n_before = len(vendors)
        vendors = {vid: vd for vid, vd in vendors.items() if vid in active_ids}
        if n_before != len(vendors):
            logger.info(f"[CCDifusion] difundir dist={dist_id}: excludió {n_before - len(vendors)} vendedores inactivos")
        for vid, vd in vendors.items():
            real_id = vd.get("id_vendedor")
            if not real_id:
                continue
            result = enviar_cc_vendedor(dist_id, real_id, token, dist_nombre, fecha_snapshot, vd, mensaje_template)
            (enviados if result["ok"] else errores).append(result)

    return {"enviados": enviados, "errores": errores, "fecha_snapshot": fecha_snapshot}
