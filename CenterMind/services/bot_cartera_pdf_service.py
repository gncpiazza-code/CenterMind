"""
PDF de cartera para el bot Telegram.
Fuente: rutas_v2 + clientes_pdv_v2 + padron_cliente_vitalidad.
Modos: 'general' (toda la semana) | 'hoy' (solo día actual AR).
"""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from supabase import Client

from core.bot_snapshot_meta import resolve_snapshot_label
from core.padron_cliente_vitalidad import DIAS_ACTIVO_COMERCIAL, activo_comercial_por_fecha
from core.tenant_tables import tenant_table_name

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# Mapeo día semana Python (0=lunes) → label cartera
DIA_MAP = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado"}

DIA_SORT_ORDER = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
    "sabado": 5,
}

# Inactivo comercial = más de DIAS_ACTIVO_COMERCIAL sin compra (día 31+).
# Por caer = aún activo pero cae a inactivo dentro de los próximos N días.
DIAS_PROXIMO_CAER = 10


def _norm_dia(value: str) -> str:
    s = (value or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        s = s.replace(a, b)
    return s


def _parse_fecha(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _sort_rutas_semana(rutas: list[dict]) -> list[dict]:
    return sorted(
        rutas,
        key=lambda r: (
            DIA_SORT_ORDER.get(_norm_dia(r.get("dia_semana") or ""), 99),
            r.get("id_ruta") or 0,
        ),
    )


def _pdv_display_name(pdv: dict) -> str:
    fantasia = (pdv.get("nombre_fantasia") or "").strip()
    razon = (pdv.get("nombre_razon_social") or "").strip()
    if fantasia and razon and fantasia.casefold() != razon.casefold():
        return f"{fantasia} — {razon}"
    return fantasia or razon or "—"


def _dias_desde_compra(fuc: date, ref: date) -> int:
    return max(0, (ref - fuc).days)


def _dias_hasta_inactivo(fuc: date, ref: date) -> int | None:
    """
    Días hasta quedar inactivo por +30d sin compra.
    None si ya está inactivo hoy.
    """
    dias = _dias_desde_compra(fuc, ref)
    restantes = (DIAS_ACTIVO_COMERCIAL + 1) - dias
    if restantes <= 0:
        return None
    return restantes


def _es_proximo_a_caer(fuc: date | None, ref: date, es_activo: bool) -> bool:
    """Activo hoy y pasa a inactivo dentro de los próximos 10 días."""
    if not es_activo or fuc is None:
        return False
    restantes = _dias_hasta_inactivo(fuc, ref)
    return restantes is not None and 1 <= restantes <= DIAS_PROXIMO_CAER


def _format_fecha_compra_label(
    fecha_ultima_compra: str | None,
    *,
    ref: date,
    es_activo: bool,
    es_proximo_caer: bool,
) -> str:
    fuc = _parse_fecha(fecha_ultima_compra)
    if fuc is None:
        return "Sin compra registrada"

    fecha_txt = fuc.strftime("%d/%m/%Y")
    dias = max(0, (ref - fuc).days)
    if dias == 0:
        rel = "Hoy"
    elif dias == 1:
        rel = "Hace 1 día"
    else:
        rel = f"Hace {dias} días"

    if es_proximo_caer:
        restantes = _dias_hasta_inactivo(fuc, ref)
        if restantes == 1:
            extra = "por caer mañana"
        else:
            extra = f"por caer en {restantes} días"
        return f"{fecha_txt} ({rel} — {extra})"

    if es_activo:
        return f"{fecha_txt} ({rel})"

    return f"{fecha_txt} ({rel} — inactivo)"


def build_cartera_pdf(sb: Client, dist_id: int, id_vendedor: int, mode: str = "general") -> tuple[bytes, str]:
    """
    Genera PDF de cartera.
    mode: 'general' | 'hoy'
    Retorna (pdf_bytes, snapshot_label)
    """
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas = (
        sb.table(rutas_table)
        .select("id_ruta,dia_semana")
        .eq("id_vendedor", id_vendedor)
        .execute().data or []
    )

    if mode == "hoy":
        hoy_nombre = DIA_MAP.get(datetime.now(AR_TZ).weekday(), "")
        hoy_norm = _norm_dia(hoy_nombre)
        rutas = [r for r in rutas if _norm_dia(r.get("dia_semana") or "") == hoy_norm]

    rutas = _sort_rutas_semana(rutas)

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    ruta_ids = [r["id_ruta"] for r in rutas]

    pdvs_by_ruta: dict[int, list[dict]] = {}
    ref = datetime.now(AR_TZ).date()
    ref_iso = ref.isoformat()

    if ruta_ids:
        PAGE = 1000
        offset = 0
        all_pdvs: list[dict] = []
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

        for pdv in all_pdvs:
            rid = pdv.get("id_ruta")
            if rid is None:
                continue
            fuc = pdv.get("fecha_ultima_compra")
            fuc_date = _parse_fecha(fuc)
            es_activo = activo_comercial_por_fecha(fuc, ref_iso=ref_iso)
            es_proximo_caer = _es_proximo_a_caer(fuc_date, ref, es_activo)
            pdv["es_activo"] = es_activo
            pdv["es_proximo_caer"] = es_proximo_caer
            pdv["_nombre_display"] = _pdv_display_name(pdv)
            pdv["_fecha_label"] = _format_fecha_compra_label(
                fuc,
                ref=ref,
                es_activo=es_activo,
                es_proximo_caer=es_proximo_caer,
            )
            pdvs_by_ruta.setdefault(int(rid), []).append(pdv)

        for rid in pdvs_by_ruta:
            pdvs_by_ruta[rid].sort(
                key=lambda p: (
                    p.get("_nombre_display", "").casefold(),
                    str(p.get("id_cliente_erp") or ""),
                )
            )

    snapshot_label = resolve_snapshot_label(sb, dist_id, "padron")
    pdf_bytes = _build_pdf(rutas, pdvs_by_ruta, snapshot_label, mode)
    return pdf_bytes, snapshot_label


def _build_pdf(rutas: list[dict], pdvs_by_ruta: dict, snapshot_label: str, mode: str) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise RuntimeError("reportlab no disponible")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20, rightMargin=20, topMargin=30, bottomMargin=20)
    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        "CarteraCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
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
                    f"<b>{dia}</b> — {len(pdvs)} PDVs | Activos: {activos} | "
                    f"Próx. a caer: {proximos} | Inactivos: {inactivos}",
                    styles["Heading3"],
                )
            )

            if pdvs:
                data = [[
                    Paragraph("<b>Cliente</b>", cell_style),
                    Paragraph("<b>Nro ERP</b>", cell_style),
                    Paragraph("<b>Fecha última compra</b>", cell_style),
                    Paragraph("<b>Estado</b>", cell_style),
                ]]
                for pdv in pdvs:
                    if pdv.get("es_activo"):
                        estado = "Activo"
                    elif pdv.get("es_proximo_caer"):
                        estado = "Por caer"
                    else:
                        estado = "Inactivo"
                    data.append([
                        Paragraph(pdv.get("_nombre_display", "—"), cell_style),
                        Paragraph(str(pdv.get("id_cliente_erp", "—")), cell_style),
                        Paragraph(pdv.get("_fecha_label", "—"), cell_style),
                        Paragraph(estado, cell_style),
                    ])

                t = Table(data, colWidths=[195, 48, 175, 58], repeatRows=1)
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t)
            story.append(Spacer(1, 8))

    doc.build(story)
    return buf.getvalue()
