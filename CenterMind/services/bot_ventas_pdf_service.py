"""
PDF de ventas MTD para el bot Telegram.
Reutiliza _fetch_ventas_rows_vendedor y lógica de bultos de estadisticas_service.
"""
from __future__ import annotations
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from supabase import Client
from core.bot_snapshot_meta import resolve_snapshot_label

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def build_ventas_pdf(sb: Client, dist_id: int, id_vendedor: int, mes: str | None = None) -> tuple[bytes, str]:
    """
    mes: 'YYYY-MM' (default: mes actual AR)
    Retorna (pdf_bytes, snapshot_label)
    """
    # Importar funciones internas de estadisticas_service
    from services.estadisticas_service import (
        _fetch_ventas_rows_vendedor,
        _build_bultos_desglose,
        _vendor_context,
    )

    hoy_ar = datetime.now(AR_TZ)
    if mes is None:
        mes = f"{hoy_ar.year}-{hoy_ar.month:02d}"

    y, m = mes.split("-")
    fecha_desde = f"{y}-{m}-01"
    fecha_hasta = hoy_ar.date().isoformat()

    # Construir vctx completo con _vendor_context (incluye codigos, nombre_erp, match_indexes)
    vctx = _vendor_context(dist_id, str(id_vendedor))

    rows = _fetch_ventas_rows_vendedor(dist_id, vctx, fecha_desde, fecha_hasta)

    meses_set: set[str] = {mes}
    bultos_rows, total_bultos = _build_bultos_desglose(rows, meses_set)

    snapshot_label = resolve_snapshot_label(sb, dist_id, "ventas")
    pdf_bytes = _build_ventas_pdf(bultos_rows, total_bultos, rows, snapshot_label, mes)
    return pdf_bytes, snapshot_label


def _build_ventas_pdf(
    bultos_rows: list[dict],
    total_bultos: float,
    all_rows: list[dict],
    snapshot_label: str,
    mes: str,
) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except ImportError:
        raise RuntimeError("reportlab no disponible")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20, rightMargin=20, topMargin=30, bottomMargin=20)
    styles = getSampleStyleSheet()
    VIOLET = colors.HexColor("#7C3AED")
    LIGHT = colors.HexColor("#F5F3FF")

    story = []
    story.append(Paragraph(f"<b>Ventas {mes}</b>", styles["Title"]))
    story.append(Paragraph(f"<i>{snapshot_label}</i>", styles["Normal"]))
    story.append(Spacer(1, 10))

    if bultos_rows:
        story.append(Paragraph("<b>Artículos</b>", styles["Heading2"]))
        data = [["Artículo", "Bultos", "% Total"]]
        for r in bultos_rows:
            b_total = float(r.get("bultos_raw") or r.get("bultos") or 0)
            pct = (b_total / total_bultos * 100) if total_bultos else 0
            articulo = (r.get("articulo") or r.get("cod_articulo") or "—")[:45]
            data.append([
                articulo,
                f"{r.get('bultos', '0')}",
                f"{pct:.1f}%",
            ])
        # Fila total
        data.append(["TOTAL", f"{total_bultos:.2f}", "100%"])

        t = Table(data, colWidths=[260, 60, 60])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Sin ventas registradas para el período.", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()
