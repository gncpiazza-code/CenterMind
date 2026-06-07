"""
PDF de ventas MTD para el bot Telegram.
Reutiliza _fetch_ventas_rows_vendedor y lógica de bultos de estadisticas_service.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from supabase import Client

from core.bot_snapshot_meta import resolve_snapshot_label
from core.pdf_branding import prepend_pdf_logo
from core.ventas_bultos_rules import (
    bultos_display_2dec,
    bultos_pdf_html,
    classify_volumen,
    enrich_bultos_desglose_row,
    volumen_es_convertido,
)

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
TOP_COMPRADORES_LIMIT = 15


def _in_meses(date_str: str, meses: set[str]) -> bool:
    return bool(date_str) and date_str[:7] in meses


def _es_recaudacion(tipo: str | None) -> bool:
    s = (tipo or "").strip().upper()
    return "RECIB" in s or s in {"RECCC"}


def _es_devolucion(tipo: str | None, importe: float) -> bool:
    if importe < 0:
        return True
    s = (tipo or "").strip().upper()
    return "DEVOL" in s or "PRDVO" in s or ("NOTA" in s and "CRED" in s)


def _es_operacion_bultos_neto(tipo: str | None, importe: float) -> bool:
    return not _es_recaudacion(tipo)


def build_ventas_pdf(sb: Client, dist_id: int, id_vendedor: int, mes: str | None = None) -> tuple[bytes, str]:
    """
    mes: 'YYYY-MM' (default: mes actual AR)
    Retorna (pdf_bytes, snapshot_label)
    """
    from services.estadisticas_service import (
        _build_bultos_desglose,
        _fetch_ventas_rows_vendedor,
        _vendor_context,
    )

    hoy_ar = datetime.now(AR_TZ)
    if mes is None:
        mes = f"{hoy_ar.year}-{hoy_ar.month:02d}"

    y, m = mes.split("-")
    fecha_desde = f"{y}-{m}-01"
    fecha_hasta = hoy_ar.date().isoformat()

    vctx = _vendor_context(dist_id, str(id_vendedor))
    rows = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)

    meses_set: set[str] = {mes}
    bultos_rows, total_bultos = _build_bultos_desglose(rows, meses_set)
    top_compradores = _build_top_compradores_por_articulo(rows, meses_set, limit=TOP_COMPRADORES_LIMIT)

    snapshot_label = resolve_snapshot_label(sb, dist_id, "ventas")
    pdf_bytes = _build_ventas_pdf(
        bultos_rows,
        total_bultos,
        top_compradores,
        snapshot_label,
        mes,
    )
    return pdf_bytes, snapshot_label


def _build_top_compradores_por_articulo(
    venta_rows: list[dict],
    meses_set: set[str],
    *,
    limit: int = TOP_COMPRADORES_LIMIT,
) -> list[dict]:
    """
    Top N clientes por bultos netos del período, con desglose por artículo.
    Misma regla de filas que estadisticas/supervisión (sin devoluciones).
    """
    by_client: dict[str, dict] = {}

    for row in venta_rows:
        if not _in_meses(row.get("fecha_factura", ""), meses_set):
            continue
        tipo = row.get("tipo_documento")
        imp = float(row.get("importe_final") or 0)
        if not _es_operacion_bultos_neto(tipo, imp) or _es_devolucion(tipo, imp):
            continue

        erp = str(row.get("id_cliente_erp") or "").strip()
        nombre = (row.get("nombre_cliente") or "").strip() or erp or "Sin nombre"
        key = erp or nombre

        cod = str(row.get("cod_articulo") or "").strip()
        desc = (row.get("descripcion_articulo") or "").strip()
        art_label = desc or cod or "Artículo sin descripción"
        art_key = cod if cod else art_label
        bultos = float(row.get("bultos_total") or 0)
        kind = classify_volumen(
            row.get("agrupacion_art_2") or "",
            desc,
            "",
        )

        bucket = by_client.get(key)
        if bucket is None:
            bucket = {
                "id_cliente_erp": erp or "—",
                "nombre_cliente": nombre,
                "total_bultos_raw": 0.0,
                "articulos": {},
            }
            by_client[key] = bucket

        bucket["total_bultos_raw"] += bultos
        art_bucket = bucket["articulos"].get(art_key)
        if art_bucket is None:
            art_bucket = {"articulo": art_label, "bultos_raw": 0.0, "kind": None}
            bucket["articulos"][art_key] = art_bucket
        art_bucket["bultos_raw"] += bultos
        if volumen_es_convertido(kind):
            art_bucket["kind"] = kind

    ranked = sorted(
        by_client.values(),
        key=lambda x: (float(x.get("total_bultos_raw") or 0), x.get("nombre_cliente") or ""),
        reverse=True,
    )[:limit]

    result: list[dict] = []
    for idx, item in enumerate(ranked, 1):
        articulos = sorted(
            [
                enrich_bultos_desglose_row(float(art["bultos_raw"]), art.get("kind"))
                | {"articulo": art["articulo"]}
                for art in item["articulos"].values()
            ],
            key=lambda x: (float(x.get("bultos_raw") or 0), x.get("articulo") or ""),
            reverse=True,
        )
        total_raw = float(item["total_bultos_raw"] or 0)
        result.append(
            {
                "rank": idx,
                "id_cliente_erp": item["id_cliente_erp"],
                "nombre_cliente": item["nombre_cliente"],
                "total_bultos": bultos_display_2dec(total_raw),
                "total_bultos_raw": total_raw,
                "articulos": articulos,
            }
        )
    return result


def _build_ventas_pdf(
    bultos_rows: list[dict],
    total_bultos: float,
    top_compradores: list[dict],
    snapshot_label: str,
    mes: str,
) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise RuntimeError("reportlab no disponible")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20, rightMargin=20, topMargin=30, bottomMargin=20)
    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        "VentasCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
    VIOLET = colors.HexColor("#7C3AED")
    LIGHT = colors.HexColor("#F5F3FF")

    story = prepend_pdf_logo([])
    story.append(Paragraph(f"<b>Ventas {mes}</b>", styles["Title"]))
    story.append(Paragraph(f"<i>{snapshot_label}</i>", styles["Normal"]))
    story.append(Spacer(1, 10))

    if bultos_rows:
        story.append(Paragraph("<b>Artículos</b>", styles["Heading2"]))
        data = [[
            Paragraph("<b>Artículo</b>", cell_style),
            Paragraph("<b>Bultos</b>", cell_style),
            Paragraph("<b>% Total</b>", cell_style),
        ]]
        for r in bultos_rows:
            b_total = float(r.get("bultos_raw") or r.get("bultos") or 0)
            pct = (b_total / total_bultos * 100) if total_bultos else 0
            articulo = (r.get("articulo") or r.get("cod_articulo") or "—")[:45]
            data.append([
                Paragraph(articulo, cell_style),
                Paragraph(
                    bultos_pdf_html(
                        b_total,
                        r.get("kind"),
                        bultos_enteros=r.get("bultos_enteros"),
                        unidades_resto=r.get("unidades_resto"),
                    ),
                    cell_style,
                ),
                Paragraph(f"{pct:.1f}%", cell_style),
            ])
        data.append([
            Paragraph("<b>TOTAL</b>", cell_style),
            Paragraph(f"<b>{bultos_pdf_html(total_bultos)}</b>", cell_style),
            Paragraph("<b>100%</b>", cell_style),
        ])

        t = Table(data, colWidths=[260, 90, 60], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Sin ventas registradas para el período.", styles["Normal"]))

    story.append(Spacer(1, 14))
    story.append(Paragraph("<b>Mejores compradores (Top 15)</b>", styles["Heading2"]))
    story.append(
        Paragraph(
            "<i>Clientes con mayor volumen en bultos del mes, desglosados por artículo.</i>",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 6))

    if not top_compradores:
        story.append(Paragraph("Sin compradores con bultos en el período.", styles["Normal"]))
    else:
        for buyer in top_compradores:
            titulo = (
                f"<b>#{buyer['rank']} {buyer['nombre_cliente']}</b> "
                f"(ERP {buyer['id_cliente_erp']}) — "
                f"<b>{bultos_pdf_html(float(buyer['total_bultos_raw']))}</b>"
            )
            story.append(Paragraph(titulo, styles["Heading3"]))

            art_rows = buyer.get("articulos") or []
            if not art_rows:
                story.append(Paragraph("Sin detalle por artículo.", styles["Normal"]))
                story.append(Spacer(1, 6))
                continue

            data = [[
                Paragraph("<b>Artículo</b>", cell_style),
                Paragraph("<b>Bultos</b>", cell_style),
            ]]
            for art in art_rows:
                data.append([
                    Paragraph(str(art.get("articulo") or "—"), cell_style),
                    Paragraph(
                        bultos_pdf_html(
                            float(art.get("bultos_raw") or art.get("bultos") or 0),
                            art.get("kind"),
                            bultos_enteros=art.get("bultos_enteros"),
                            unidades_resto=art.get("unidades_resto"),
                        ),
                        cell_style,
                    ),
                ])

            t = Table(data, colWidths=[320, 90], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t)
            story.append(Spacer(1, 8))

    doc.build(story)
    return buf.getvalue()
