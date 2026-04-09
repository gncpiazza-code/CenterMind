# -*- coding: utf-8 -*-
"""
Servicio de generación y almacenamiento de PDFs para objetivos de tipo 'ruteo'.

Genera un PDF operativo con:
 - Encabezado: objetivo, vendedor, fecha.
 - Tabla de PDVs: nombre, ruta actual, acción, destino / motivo.
 - (Opcional) Mapa de contexto simplificado con coordenadas.

Almacena el PDF en Supabase Storage (bucket: 'objetivos-pdf') y devuelve
la URL pública para registrarla en objetivo_documentos.
"""
import io
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("ShelfyAPI")

# ─── Supabase client ──────────────────────────────────────────────────────────
try:
    from db import sb
except ImportError:
    sb = None  # type: ignore

# ─── PDF libs ─────────────────────────────────────────────────────────────────
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    )
    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False
    logger.warning("[RuteoPDF] reportlab no disponible — PDFs desactivados")


STORAGE_BUCKET = "objetivos-pdf"

# Violet accent para encabezados (#7C3AED equivalente en RGB)
_VIOLET = colors.HexColor("#7C3AED")
_VIOLET_LIGHT = colors.HexColor("#EDE9FE")
_SLATE = colors.HexColor("#64748B")


def _build_ruteo_context(dist_id: int, pdv_items: list[Any]) -> list[dict]:
    """
    Enriquece cada ítem con datos de la base de datos:
    - nombre_pdv (si no viene)
    - ruta_actual (dia_semana de rutas_v2)
    - nombre_ruta_destino (si accion = cambio_ruta)
    - coordenadas del PDV
    """
    if not sb:
        return [{"nombre_pdv": item.nombre_pdv or f"PDV {item.id_cliente_pdv}",
                 "ruta_actual": "-", "accion_ruteo": item.accion_ruteo or "-",
                 "destino_o_motivo": item.motivo_baja or "-", "orden": i + 1}
                for i, item in enumerate(pdv_items)]

    # Bulk-fetch PDV data
    pdv_ids = [item.id_cliente_pdv for item in pdv_items]
    try:
        pdv_res = sb.table("clientes_pdv_v2") \
            .select("id_cliente, nombre_fantasia, id_ruta, latitud, longitud") \
            .in_("id_cliente", pdv_ids) \
            .execute()
        pdv_map = {p["id_cliente"]: p for p in (pdv_res.data or [])}
    except Exception as e:
        logger.warning(f"[RuteoPDF] Error fetching PDVs: {e}")
        pdv_map = {}

    # Bulk-fetch rutas
    ruta_ids_actuales = [pdv_map[pid]["id_ruta"] for pid in pdv_ids if pid in pdv_map and pdv_map[pid].get("id_ruta")]
    ruta_ids_destino  = [item.id_ruta_destino for item in pdv_items if item.id_ruta_destino]
    all_ruta_ids = list(set(ruta_ids_actuales + ruta_ids_destino))
    ruta_map: dict[int, dict] = {}
    if all_ruta_ids:
        try:
            ruta_res = sb.table("rutas_v2") \
                .select("id_ruta, dia_semana, nombre_ruta") \
                .in_("id_ruta", all_ruta_ids) \
                .execute()
            ruta_map = {r["id_ruta"]: r for r in (ruta_res.data or [])}
        except Exception as e:
            logger.warning(f"[RuteoPDF] Error fetching rutas: {e}")

    rows = []
    for i, item in enumerate(pdv_items):
        pdv = pdv_map.get(item.id_cliente_pdv, {})
        ruta_actual_obj = ruta_map.get(pdv.get("id_ruta", 0), {})
        ruta_actual = ruta_actual_obj.get("dia_semana") or ruta_actual_obj.get("nombre_ruta") or "-"

        if item.accion_ruteo == "cambio_ruta":
            ruta_dest_obj = ruta_map.get(item.id_ruta_destino or 0, {})
            destino = ruta_dest_obj.get("dia_semana") or ruta_dest_obj.get("nombre_ruta") or str(item.id_ruta_destino or "-")
        else:
            destino = item.motivo_baja or "-"

        rows.append({
            "orden":             item.orden_sugerido or (i + 1),
            "nombre_pdv":        item.nombre_pdv or pdv.get("nombre_fantasia") or f"PDV {item.id_cliente_pdv}",
            "ruta_actual":       ruta_actual,
            "accion_ruteo":      "Cambio de ruta" if item.accion_ruteo == "cambio_ruta" else "Baja",
            "destino_o_motivo":  destino,
        })

    rows.sort(key=lambda r: r["orden"])
    return rows


def _render_pdf(objetivo_id: str, nombre_vendedor: str, rows: list[dict]) -> bytes:
    """Genera el PDF en memoria y devuelve los bytes."""
    if not _REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab no está instalado")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=2 * cm,    bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ShelfyTitle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=_VIOLET,
        spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "ShelfySub",
        parent=styles["Normal"],
        fontSize=9,
        textColor=_SLATE,
        spaceAfter=12,
    )
    cell_style = ParagraphStyle(
        "Cell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )

    fecha_str = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    story = [
        Paragraph("Objetivo de Ruteo — Shelfy", title_style),
        Paragraph(f"Vendedor: <b>{nombre_vendedor}</b> &nbsp;|&nbsp; Generado: {fecha_str}", sub_style),
        HRFlowable(width="100%", thickness=0.5, color=_VIOLET_LIGHT, spaceAfter=10),
    ]

    # Table header + rows
    col_widths = [1 * cm, 6.5 * cm, 3 * cm, 3 * cm, 4.5 * cm]
    header = ["#", "PDV", "Ruta actual", "Acción", "Destino / Motivo"]
    table_data = [header]
    for r in rows:
        table_data.append([
            str(r["orden"]),
            Paragraph(r["nombre_pdv"], cell_style),
            Paragraph(r["ruta_actual"], cell_style),
            Paragraph(r["accion_ruteo"], cell_style),
            Paragraph(r["destino_o_motivo"], cell_style),
        ])

    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0), _VIOLET),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("ALIGN",         (0, 0), (-1, 0), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING",    (0, 0), (-1, 0), 6),
        # Body
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _VIOLET_LIGHT]),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (0, -1), "CENTER"),
        ("GRID",          (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("TOPPADDING",    (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        f"Total de PDVs: <b>{len(rows)}</b>  |  "
        f"Cambios de ruta: <b>{sum(1 for r in rows if r['accion_ruteo'] == 'Cambio de ruta')}</b>  |  "
        f"Bajas: <b>{sum(1 for r in rows if r['accion_ruteo'] == 'Baja')}</b>",
        sub_style,
    ))

    doc.build(story)
    return buf.getvalue()


def _store_pdf(dist_id: int, objetivo_id: str, pdf_bytes: bytes) -> str:
    """Sube el PDF a Supabase Storage y devuelve la URL pública."""
    if not sb:
        raise RuntimeError("Supabase client no disponible")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = f"{dist_id}/{objetivo_id}/ruteo_{timestamp}.pdf"

    sb.storage.from_(STORAGE_BUCKET).upload(
        path,
        pdf_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    url = sb.storage.from_(STORAGE_BUCKET).get_public_url(path)
    return url


class ObjetivosRuteoPdfService:
    def generate_and_store(
        self,
        dist_id: int,
        objetivo_id: str,
        nombre_vendedor: str,
        pdv_items: list[Any],
    ) -> dict:
        """
        Genera el PDF de ruteo, lo sube a Storage y devuelve {"url": "..."}.
        Si falla, loguea el error y devuelve {} para no bloquear la creación del objetivo.
        """
        try:
            context_rows = _build_ruteo_context(dist_id, pdv_items)
            pdf_bytes    = _render_pdf(objetivo_id, nombre_vendedor, context_rows)
            url          = _store_pdf(dist_id, objetivo_id, pdf_bytes)
            logger.info(f"[RuteoPDF] PDF generado para objetivo {objetivo_id}: {url}")
            return {"url": url}
        except Exception as e:
            logger.error(f"[RuteoPDF] Error generando PDF para {objetivo_id}: {e}")
            return {}


objetivos_ruteo_pdf_service = ObjetivosRuteoPdfService()
