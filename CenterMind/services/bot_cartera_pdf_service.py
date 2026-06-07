"""
PDF de cartera para el bot Telegram.
Fuente: rutas_v2 + clientes_pdv_v2 + padron_cliente_vitalidad.
Modos: 'general' (toda la semana) | 'hoy' (solo día actual AR).
"""
from __future__ import annotations
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from supabase import Client
from core.tenant_tables import tenant_table_name
from core.padron_cliente_vitalidad import activo_comercial_por_fecha, DIAS_ACTIVO_COMERCIAL
from core.bot_snapshot_meta import resolve_snapshot_label

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Mapeo día semana Python (0=lunes) → label cartera
DIA_MAP = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado"}

# Días umbral para "próximo a caer" (entre 23 y 30 días sin compra)
DIAS_PROXIMO_CAER_MIN = 23


def _norm_dia(value: str) -> str:
    s = (value or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        s = s.replace(a, b)
    return s


def build_cartera_pdf(sb: Client, dist_id: int, id_vendedor: int, mode: str = "general") -> tuple[bytes, str]:
    """
    Genera PDF de cartera.
    mode: 'general' | 'hoy'
    Retorna (pdf_bytes, snapshot_label)
    """
    # 1. Obtener rutas del vendedor (rutas_v2_d* no tiene id_distribuidor)
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas = (
        sb.table(rutas_table)
        .select("id_ruta,dia_semana")
        .eq("id_vendedor", id_vendedor)
        .execute().data or []
    )

    # 2. Filtrar por hoy si mode='hoy'
    if mode == "hoy":
        hoy_nombre = DIA_MAP.get(datetime.now(AR_TZ).weekday(), "")
        hoy_norm = _norm_dia(hoy_nombre)
        rutas = [r for r in rutas if _norm_dia(r.get("dia_semana") or "") == hoy_norm]

    # 3. Para cada ruta, obtener PDVs
    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    ruta_ids = [r["id_ruta"] for r in rutas]

    pdvs_by_ruta: dict = {}
    if ruta_ids:
        PAGE = 1000
        offset = 0
        all_pdvs = []
        while True:
            batch = (
                sb.table(pdv_table)
                .select("id_ruta,id_cliente_erp,nombre_razon_social,nombre_fantasia,fecha_ultima_compra")
                .eq("id_distribuidor", dist_id)
                .in_("id_ruta", ruta_ids)
                .range(offset, offset + PAGE - 1)
                .execute().data or []
            )
            all_pdvs.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

        hoy_iso = datetime.now(AR_TZ).date().isoformat()
        for pdv in all_pdvs:
            rid = pdv.get("id_ruta")
            fuc = pdv.get("fecha_ultima_compra")
            es_activo = activo_comercial_por_fecha(fuc, ref_iso=hoy_iso)
            es_proximo_caer = (
                not es_activo
                and activo_comercial_por_fecha(fuc, dias_umbral=DIAS_ACTIVO_COMERCIAL + 7, ref_iso=hoy_iso)
            )
            pdv["es_activo"] = es_activo
            pdv["es_proximo_caer"] = es_proximo_caer
            # Nombre display: preferir nombre_fantasia, luego nombre_razon_social
            pdv["_nombre_display"] = (
                (pdv.get("nombre_fantasia") or "").strip()
                or (pdv.get("nombre_razon_social") or "").strip()
                or "—"
            )
            pdvs_by_ruta.setdefault(rid, []).append(pdv)

    # 4. Generar PDF con reportlab
    snapshot_label = resolve_snapshot_label(sb, dist_id, "padron")
    pdf_bytes = _build_pdf(rutas, pdvs_by_ruta, snapshot_label, mode)
    return pdf_bytes, snapshot_label


def _build_pdf(rutas: list[dict], pdvs_by_ruta: dict, snapshot_label: str, mode: str) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
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
    title = "Cartera de hoy" if mode == "hoy" else "Cartera general"
    story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    story.append(Paragraph(f"<i>{snapshot_label}</i>", styles["Normal"]))
    story.append(Spacer(1, 10))

    if not rutas:
        story.append(Paragraph("Sin rutas asignadas para el período.", styles["Normal"]))
    else:
        for ruta in rutas:
            dia = ruta.get("dia_semana", "—")
            pdvs = pdvs_by_ruta.get(ruta["id_ruta"], [])
            activos = sum(1 for p in pdvs if p.get("es_activo"))
            proximos = sum(1 for p in pdvs if p.get("es_proximo_caer"))
            inactivos = len(pdvs) - activos - proximos

            story.append(
                Paragraph(
                    f"<b>{dia}</b> — {len(pdvs)} PDVs | Activos: {activos} | Próx. caer: {proximos} | Inactivos: {inactivos}",
                    styles["Heading3"],
                )
            )

            if pdvs:
                data = [["PDV", "ERP", "FUC", "Estado"]]
                for pdv in pdvs:
                    if pdv.get("es_activo"):
                        estado = "✓ Activo"
                    elif pdv.get("es_proximo_caer"):
                        estado = "⚠ Próx."
                    else:
                        estado = "✗ Inactivo"
                    fuc = (pdv.get("fecha_ultima_compra") or "—")[:10]
                    nombre = pdv.get("_nombre_display", "—")[:35]
                    data.append([nombre, str(pdv.get("id_cliente_erp", "—")), fuc, estado])

                t = Table(data, colWidths=[200, 60, 70, 70])
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ]))
                story.append(t)
            story.append(Spacer(1, 8))

    doc.build(story)
    return buf.getvalue()
