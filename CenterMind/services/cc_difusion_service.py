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
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ShelfyAPI")

TELEGRAM_SEND_DOC = "https://api.telegram.org/bot{token}/sendDocument"
TELEGRAM_SEND_MSG = "https://api.telegram.org/bot{token}/sendMessage"

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
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
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
    table_data = [["Cliente", "Días", "Comprobantes", "Deuda $"]]
    for c in clientes:
        dias = c.get("antiguedad") or 0
        table_data.append([
            (c.get("cliente") or "—")[:40],
            str(dias),
            str(c.get("cantidad_comprobantes") or "—"),
            f"${float(c.get('deuda_total') or 0):,.0f}".replace(",", "."),
        ])

    col_widths = [9 * cm, 2 * cm, 3 * cm, 3.5 * cm]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), _VIOLET),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0), 8),
        ("ALIGN",        (1, 0), (-1, -1), "CENTER"),
        ("ALIGN",        (0, 0), (0, -1), "LEFT"),
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


def _send_document(token: str, chat_id: int, pdf_bytes: bytes, filename: str, caption: str) -> bool:
    try:
        resp = requests.post(
            TELEGRAM_SEND_DOC.format(token=token),
            files={"document": (filename, pdf_bytes, "application/pdf")},
            data={"chat_id": str(chat_id), "caption": caption, "parse_mode": "HTML"},
            timeout=20,
        )
        if resp.ok:
            logger.info(f"[CCDifusion] PDF enviado chat={chat_id}")
            return True
        logger.warning(f"[CCDifusion] sendDocument error chat={chat_id}: {resp.status_code} {resp.text[:120]}")
        return False
    except Exception as e:
        logger.error(f"[CCDifusion] sendDocument exc chat={chat_id}: {e}")
        return False


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
            .select("id_vendedor, vendedor_nombre, cliente_nombre, id_cliente_erp, id_cliente, deuda_total, antiguedad_dias, cantidad_comprobantes")
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
            "deuda_total": float(r.get("deuda_total") or 0),
            "antiguedad": r.get("antiguedad_dias"),
            "cantidad_comprobantes": r.get("cantidad_comprobantes"),
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
    if mensaje_extra.strip():
        caption_lines.append(f"\n{mensaje_extra.strip()}")
    caption = "\n".join(caption_lines)

    try:
        pdf_bytes = _build_cc_pdf(
            vendedor_nombre=nombre_display,
            dist_nombre=dist_nombre,
            fecha=fecha_fmt,
            clientes=clientes,
            deuda_total=deuda_total,
        )
        filename = f"CC_{_norm(nombre_display)}_{fecha_snapshot[:10].replace('-', '')}.pdf"
        ok = _send_document(token, chat_id, pdf_bytes, filename, caption)
        return {"ok": ok, "vendedor": vend_data["vendedor_nombre"], "error": None if ok else "Error al enviar"}
    except RuntimeError as e:
        # PDF no disponible — enviar solo texto
        logger.warning(f"[CCDifusion] PDF no disponible, enviando texto: {e}")
        ok = _send_text(token, chat_id, caption)
        return {"ok": ok, "vendedor": vend_data["vendedor_nombre"], "error": None if ok else "Error al enviar texto"}
    except Exception as e:
        logger.error(f"[CCDifusion] exc vend={id_vendedor}: {e}")
        return {"ok": False, "vendedor": vend_data["vendedor_nombre"], "error": str(e)}


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
        vd = vendors.get(id_vendedor)
        if not vd:
            return {"enviados": [], "errores": [{"vendedor": str(id_vendedor), "error": "Sin datos CC para este vendedor"}], "fecha_snapshot": fecha_snapshot}
        result = enviar_cc_vendedor(dist_id, id_vendedor, token, dist_nombre, fecha_snapshot, vd, mensaje_template)
        (enviados if result["ok"] else errores).append(result)

    else:  # "todos"
        for vid, vd in vendors.items():
            real_id = vd.get("id_vendedor")
            if not real_id:
                continue
            result = enviar_cc_vendedor(dist_id, real_id, token, dist_nombre, fecha_snapshot, vd, mensaje_template)
            (enviados if result["ok"] else errores).append(result)

    return {"enviados": enviados, "errores": errores, "fecha_snapshot": fecha_snapshot}
