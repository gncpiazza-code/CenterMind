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

if _REPORTLAB_AVAILABLE:
    # Violet accent para encabezados (#7C3AED equivalente en RGB)
    _VIOLET = colors.HexColor("#7C3AED")
    _VIOLET_LIGHT = colors.HexColor("#EDE9FE")
    _SLATE = colors.HexColor("#64748B")
else:
    _VIOLET = None
    _VIOLET_LIGHT = None
    _SLATE = None


def _item_get(item: Any, key: str, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _route_nro(row: dict | None) -> str | None:
    """Normaliza el nro de ruta de diferentes esquemas posibles."""
    if not isinstance(row, dict):
        return None
    for key in ("nro_ruta", "id_ruta_erp", "numero_ruta", "nro", "ruta_numero"):
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    # Fallback suave: si nombre_ruta viene tipo "Ruta 4 - Lunes"
    nombre = row.get("nombre_ruta")
    if nombre is not None:
        text = str(nombre).strip()
        if text.lower().startswith("ruta "):
            tail = text[5:].strip()
            maybe_nro = tail.split(" ", 1)[0].strip("- ").strip()
            if maybe_nro:
                return maybe_nro
    return None


def _build_ruteo_context(dist_id: int, pdv_items: list[Any]) -> list[dict]:
    """
    Enriquece cada ítem con datos de la base de datos:
    - nombre_pdv (si no viene)
    - ruta_actual (dia_semana de rutas_v2)
    - nombre_ruta_destino (si accion = cambio_ruta) con formato "Ruta [nro] - [día]"
    - coordenadas del PDV
    """
    if not sb:
        return [{"id_cliente_pdv": _item_get(item, "id_cliente_pdv"),
                 "id_cliente_erp": _item_get(item, "id_cliente_erp"),
                 "nombre_pdv": _item_get(item, "nombre_pdv") or "Cliente sin nombre",
                 "ruta_actual": "-", "accion_ruteo": _item_get(item, "accion_ruteo") or "-",
                 "destino_o_motivo": _item_get(item, "motivo_baja") or "-",
                 "domicilio": "-",
                 "ultima_compra": "-",
                 "orden": i + 1}
                for i, item in enumerate(pdv_items)]

    # Bulk-fetch PDV data
    pdv_ids = [_item_get(item, "id_cliente_pdv") for item in pdv_items if _item_get(item, "id_cliente_pdv")]
    try:
        pdv_res = sb.table("clientes_pdv_v2") \
            .select(
                "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                "domicilio, localidad, fecha_ultima_compra, id_ruta, latitud, longitud"
            ) \
            .eq("id_distribuidor", dist_id) \
            .in_("id_cliente", pdv_ids) \
            .execute()
        pdv_map = {p["id_cliente"]: p for p in (pdv_res.data or [])}
    except Exception as e:
        logger.warning(f"[RuteoPDF] Error fetching PDVs: {e}")
        pdv_map = {}

    # Bulk-fetch rutas (robusto: algunos tenants no tienen las mismas columnas
    # y en ciertos esquemas rutas_v2 no expone id_distribuidor).
    ruta_ids_actuales = [pdv_map[pid]["id_ruta"] for pid in pdv_ids if pid in pdv_map and pdv_map[pid].get("id_ruta")]
    ruta_ids_destino  = [_item_get(item, "id_ruta_destino") for item in pdv_items if _item_get(item, "id_ruta_destino")]
    all_ruta_ids = list(set(ruta_ids_actuales + ruta_ids_destino))
    ruta_map: dict[int, dict] = {}
    ruta_by_nro: dict[str, dict] = {}
    if all_ruta_ids:
        rows = []
        select_attempts = [
            "*",
            "id_ruta, id_ruta_erp, nro_ruta, dia_semana, nombre_ruta",
            "id_ruta, id_ruta_erp, dia_semana, nombre_ruta",
            "id_ruta, nro_ruta, dia_semana, nombre_ruta",
            "id_ruta, dia_semana, nombre_ruta",
            "id_ruta, dia_semana",
        ]
        for cols in select_attempts:
            # Intento A: rutas scopiadas por distribuidor (si la columna existe)
            try:
                ruta_res = sb.table("rutas_v2").select(cols).eq("id_distribuidor", dist_id).execute()
                rows = ruta_res.data or []
                if rows:
                    break
            except Exception:
                pass
            # Intento B: fallback sin id_distribuidor
            try:
                ruta_res = sb.table("rutas_v2").select(cols).execute()
                rows = ruta_res.data or []
                if rows:
                    break
            except Exception:
                continue
        if not rows:
            logger.warning("[RuteoPDF] No se pudieron cargar rutas_v2 para el dist=%s", dist_id)
        ruta_map = {r["id_ruta"]: r for r in rows if r.get("id_ruta") is not None}
        for r in rows:
            nro = _route_nro(r)
            if nro is not None and str(nro).strip():
                ruta_by_nro[str(nro).strip()] = r

    rows = []
    for i, item in enumerate(pdv_items):
        id_cliente_pdv = _item_get(item, "id_cliente_pdv")
        pdv = pdv_map.get(id_cliente_pdv, {})
        ruta_actual_obj = ruta_map.get(pdv.get("id_ruta", 0), {})
        dia_actual = ruta_actual_obj.get("dia_semana")
        nro_actual = _route_nro(ruta_actual_obj)
        if nro_actual and dia_actual:
            ruta_actual = f"Ruta {nro_actual} - {dia_actual}"
        elif nro_actual:
            ruta_actual = f"Ruta {nro_actual}"
        else:
            ruta_actual = dia_actual or ruta_actual_obj.get("nombre_ruta") or "-"

        metadata = _item_get(item, "metadata_ruteo") or {}
        nro_meta_dest = None
        dia_meta_dest = None
        if isinstance(metadata, dict):
            nro_meta_dest = metadata.get("nro_ruta_destino")
            dia_meta_dest = metadata.get("dia_semana_destino")

        accion = _item_get(item, "accion_ruteo")
        if accion == "cambio_ruta":
            destino_raw = _item_get(item, "id_ruta_destino")
            destino_id_int = None
            if destino_raw is not None:
                try:
                    destino_id_int = int(str(destino_raw).strip())
                except Exception:
                    destino_id_int = None
            ruta_dest_obj = ruta_map.get(destino_id_int or 0, {})
            # Fallback: si destino_raw es nro_ruta (valor de negocio), resolver por nro.
            if not ruta_dest_obj and destino_raw is not None:
                ruta_dest_obj = ruta_by_nro.get(str(destino_raw).strip(), {})
            dia_dest = ruta_dest_obj.get("dia_semana")
            nro_dest = _route_nro(ruta_dest_obj)
            if nro_meta_dest and dia_meta_dest:
                destino = f"Ruta {nro_meta_dest} - {dia_meta_dest}"
            elif nro_dest and dia_dest:
                destino = f"Ruta {nro_dest} - {dia_dest}"
            elif nro_meta_dest:
                destino = f"Ruta {nro_meta_dest}"
            elif nro_dest:
                destino = f"Ruta {nro_dest}"
            elif dia_dest:
                destino = dia_dest
            elif destino_raw is not None and str(destino_raw).strip() in ruta_by_nro:
                # Si el valor guardado era nro_ruta y no hay día, al menos mostrar formato de negocio.
                destino = f"Ruta {str(destino_raw).strip()}"
            else:
                destino = ruta_dest_obj.get("nombre_ruta") or str(destino_raw or "-")
        else:
            destino = _item_get(item, "motivo_baja") or "-"

        if isinstance(metadata, dict):
            id_cliente_erp = _item_get(item, "id_cliente_erp") or metadata.get("id_cliente_erp") or pdv.get("id_cliente_erp")
        else:
            id_cliente_erp = _item_get(item, "id_cliente_erp") or pdv.get("id_cliente_erp")

        rows.append({
            "orden":             _item_get(item, "orden_sugerido") or (i + 1),
            "id_cliente_pdv":    id_cliente_pdv,
            "id_cliente_erp":    id_cliente_erp,
            "nombre_pdv":        _item_get(item, "nombre_pdv") or pdv.get("nombre_fantasia") or "Cliente sin nombre",
            "ruta_actual":       ruta_actual,
            "accion_ruteo":      "Cambio de ruta" if accion == "cambio_ruta" else "Baja",
            "destino_o_motivo":  destino,
            "domicilio":         (
                f"{pdv.get('domicilio') or '-'}"
                + (f" - {pdv.get('localidad')}" if pdv.get("localidad") else "")
            ),
            "ultima_compra":     pdv.get("fecha_ultima_compra") or "-",
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
    cambios_ruta = sum(1 for r in rows if r["accion_ruteo"] == "Cambio de ruta")
    bajas = sum(1 for r in rows if r["accion_ruteo"] == "Baja")
    story = [
        Paragraph("Objetivo de Ruteo — Shelfy", title_style),
        Paragraph(
            f"Objetivo ID: <b>{objetivo_id}</b> &nbsp;|&nbsp; Vendedor: <b>{nombre_vendedor}</b> "
            f"&nbsp;|&nbsp; Generado: {fecha_str}",
            sub_style,
        ),
        Paragraph(
            f"PDVs totales: <b>{len(rows)}</b> &nbsp;|&nbsp; Cambios de ruta: <b>{cambios_ruta}</b> "
            f"&nbsp;|&nbsp; Bajas: <b>{bajas}</b>",
            sub_style,
        ),
        HRFlowable(width="100%", thickness=0.5, color=_VIOLET_LIGHT, spaceAfter=10),
    ]

    # Table header + rows
    col_widths = [0.8 * cm, 4.9 * cm, 2.5 * cm, 2.3 * cm, 3.3 * cm, 5.2 * cm]
    header = ["#", "Cliente", "Ruta actual", "Acción", "Destino / Motivo", "Detalle operativo"]
    table_data = [header]

    def _fmt_fecha(v: str | None) -> str:
        if not v or v == "-":
            return "-"
        try:
            return datetime.fromisoformat(str(v).replace("Z", "+00:00")).strftime("%d/%m/%Y")
        except Exception:
            return str(v)[:10]

    for r in rows:
        cliente_lines = []
        cliente_lines.append(f"ERP: {r.get('id_cliente_erp') or 'S/D'}")
        cliente_lines.append(r["nombre_pdv"])

        detalle_lines = [
            f"Domicilio: {r.get('domicilio') or '-'}",
            f"Última compra: {_fmt_fecha(r.get('ultima_compra'))}",
        ]
        table_data.append([
            str(r["orden"]),
            Paragraph("<br/>".join(cliente_lines), cell_style),
            Paragraph(r["ruta_actual"], cell_style),
            Paragraph(r["accion_ruteo"], cell_style),
            Paragraph(r["destino_o_motivo"], cell_style),
            Paragraph("<br/>".join(detalle_lines), cell_style),
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
        "Checklist sugerido para supervisor: validar destino/motivo, confirmar contacto en PDV "
        "y registrar resolución de cada caso.",
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
