#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shelfy — Panel de Supervisión
Generador de documento PDF profesional
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas
import os

# ─── COLOR PALETTE ───────────────────────────────────────────────────────────
C_PRIMARY      = colors.HexColor('#4f8ef7')
C_PRIMARY_DARK = colors.HexColor('#1e3a8a')
C_SUCCESS      = colors.HexColor('#10b981')
C_WARNING      = colors.HexColor('#f59e0b')
C_DANGER       = colors.HexColor('#ef4444')
C_BG_DARK      = colors.HexColor('#1a1a2e')
C_BG_CARD      = colors.HexColor('#16213e')
C_ACCENT       = colors.HexColor('#0f3460')
C_TEXT_DARK    = colors.HexColor('#1f2937')
C_TEXT_LIGHT   = colors.HexColor('#6b7280')
C_ROW_ALT      = colors.HexColor('#f8fafc')
C_WHITE        = colors.white
C_BORDER       = colors.HexColor('#e5e7eb')
C_HEADING_BG   = colors.HexColor('#eff6ff')

OUTPUT_PATH = r'C:\Users\cigar\OneDrive\Desktop\BOT-SQL\Shelfy_Supervision_Documento.pdf'

PAGE_W, PAGE_H = A4


# ─── HEADER / FOOTER ─────────────────────────────────────────────────────────
def draw_cover(c, w, h):
    """Draw the cover page directly on the canvas."""
    # Full dark background
    c.setFillColor(C_BG_DARK)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Top decorative bar
    c.setFillColor(C_PRIMARY)
    c.rect(0, h - 8*mm, w, 8*mm, fill=1, stroke=0)

    # Upper section background
    c.setFillColor(colors.HexColor('#16213e'))
    c.rect(0, h * 0.38, w, h * 0.62 - 8*mm, fill=1, stroke=0)

    # Bottom bar
    c.setFillColor(C_PRIMARY_DARK)
    c.rect(0, 0, w, 20*mm, fill=1, stroke=0)

    # Decorative accent line
    c.setStrokeColor(C_PRIMARY)
    c.setLineWidth(3)
    c.line(20*mm, h * 0.38 + 1, w - 20*mm, h * 0.38 + 1)

    # Logo background circle
    c.setFillColor(colors.HexColor('#0f3460'))
    c.setFont('Helvetica-Bold', 130)
    c.drawCentredString(w / 2, h * 0.5, 'S')

    # Title
    c.setFillColor(C_WHITE)
    c.setFont('Helvetica-Bold', 52)
    c.drawCentredString(w / 2, h * 0.59, 'Shelfy')

    # Subtitle
    c.setFillColor(C_PRIMARY)
    c.setFont('Helvetica-Bold', 15)
    c.drawCentredString(w / 2, h * 0.53, 'Panel de Supervisión de Rutas de Venta')

    # Sub-subtitle
    c.setFillColor(colors.HexColor('#94a3b8'))
    c.setFont('Helvetica', 10)
    c.drawCentredString(w / 2, h * 0.495, 'Documentación Técnica  ·  Hoja de Ruta  ·  Progreso')

    # Horizontal rule
    c.setStrokeColor(colors.HexColor('#334155'))
    c.setLineWidth(0.8)
    c.line(40*mm, h * 0.47, w - 40*mm, h * 0.47)

    # Version badge
    c.setFillColor(C_PRIMARY)
    c.roundRect(w/2 - 15*mm, h * 0.43, 30*mm, 8*mm, 4, fill=1, stroke=0)
    c.setFillColor(C_WHITE)
    c.setFont('Helvetica-Bold', 10)
    c.drawCentredString(w / 2, h * 0.43 + 2.5*mm, 'Versión 3.1')

    # Date
    c.setFillColor(colors.HexColor('#64748b'))
    c.setFont('Helvetica', 9.5)
    c.drawCentredString(w / 2, h * 0.405, '26 de marzo de 2026')

    # Stats strip
    stats = [
        ('11', 'Fases totales'),
        ('7', 'Fases completadas'),
        ('~23.200', 'Clientes activos'),
        ('4', 'Distribuidoras'),
    ]
    box_w = (w - 40*mm) / len(stats)
    start_x = 20*mm
    box_y = h * 0.25

    for i, (val, label) in enumerate(stats):
        bx = start_x + i * box_w
        c.setFillColor(colors.HexColor('#0f3460'))
        c.roundRect(bx + 2*mm, box_y, box_w - 4*mm, 22*mm, 4, fill=1, stroke=0)
        c.setFillColor(C_PRIMARY)
        c.setFont('Helvetica-Bold', 18)
        c.drawCentredString(bx + box_w / 2, box_y + 12*mm, val)
        c.setFillColor(colors.HexColor('#94a3b8'))
        c.setFont('Helvetica', 7.5)
        c.drawCentredString(bx + box_w / 2, box_y + 5*mm, label)

    # Footer text
    c.setFillColor(colors.HexColor('#475569'))
    c.setFont('Helvetica', 8)
    c.drawCentredString(w / 2, 8*mm, 'CONFIDENCIAL — USO INTERNO')
    c.setFillColor(colors.HexColor('#334155'))
    c.setFont('Helvetica', 7.5)
    c.drawString(20*mm, 8*mm, 'shelfy.app')
    c.drawRightString(w - 20*mm, 8*mm, 'FastAPI · Next.js · Supabase')


class HeaderFooterCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        self._saved_page_states = []
        super().__init__(*args, **kwargs)

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_header_footer(self, page_count):
        page_num = self._pageNumber
        w, h = A4

        if page_num == 1:
            # Draw the full cover page
            draw_cover(self, w, h)
            return

        # Header bar
        self.setFillColor(C_PRIMARY_DARK)
        self.rect(0, h - 18*mm, w, 18*mm, fill=1, stroke=0)

        self.setFillColor(C_WHITE)
        self.setFont('Helvetica-Bold', 9)
        self.drawString(20*mm, h - 11*mm, 'Shelfy — Panel de Supervisión')
        self.setFont('Helvetica', 8)
        self.setFillColor(C_PRIMARY)
        self.drawRightString(w - 20*mm, h - 11*mm, 'Documentación Técnica · v3.1')

        # Footer bar
        self.setFillColor(colors.HexColor('#f1f5f9'))
        self.rect(0, 0, w, 13*mm, fill=1, stroke=0)

        self.setStrokeColor(C_PRIMARY)
        self.setLineWidth(0.5)
        self.line(20*mm, 13*mm, w - 20*mm, 13*mm)

        self.setFillColor(C_TEXT_LIGHT)
        self.setFont('Helvetica', 7.5)
        self.drawString(20*mm, 4.5*mm, '© 2026 Shelfy — Confidencial')
        self.setFillColor(C_PRIMARY_DARK)
        self.setFont('Helvetica-Bold', 8)
        self.drawCentredString(w / 2, 4.5*mm, f'Página {page_num} de {page_count}')
        self.setFillColor(C_TEXT_LIGHT)
        self.setFont('Helvetica', 7.5)
        self.drawRightString(w - 20*mm, 4.5*mm, '26 de marzo de 2026')


# ─── STYLES ──────────────────────────────────────────────────────────────────
def build_styles():
    styles = {}

    styles['body'] = ParagraphStyle(
        'body', fontName='Helvetica', fontSize=9.5,
        textColor=C_TEXT_DARK, leading=15, spaceAfter=6,
        alignment=TA_JUSTIFY
    )
    styles['body_small'] = ParagraphStyle(
        'body_small', fontName='Helvetica', fontSize=8.5,
        textColor=C_TEXT_DARK, leading=13, spaceAfter=4
    )
    styles['h1'] = ParagraphStyle(
        'h1', fontName='Helvetica-Bold', fontSize=20,
        textColor=C_PRIMARY_DARK, spaceBefore=12, spaceAfter=8,
        leading=26
    )
    styles['h2'] = ParagraphStyle(
        'h2', fontName='Helvetica-Bold', fontSize=14,
        textColor=C_PRIMARY_DARK, spaceBefore=10, spaceAfter=6,
        leading=20
    )
    styles['h3'] = ParagraphStyle(
        'h3', fontName='Helvetica-Bold', fontSize=11,
        textColor=C_PRIMARY, spaceBefore=8, spaceAfter=4,
        leading=16
    )
    styles['h4'] = ParagraphStyle(
        'h4', fontName='Helvetica-Bold', fontSize=10,
        textColor=C_TEXT_DARK, spaceBefore=6, spaceAfter=3,
        leading=14
    )
    styles['caption'] = ParagraphStyle(
        'caption', fontName='Helvetica-Oblique', fontSize=8,
        textColor=C_TEXT_LIGHT, spaceAfter=6, alignment=TA_CENTER
    )
    styles['toc_item'] = ParagraphStyle(
        'toc_item', fontName='Helvetica', fontSize=10,
        textColor=C_TEXT_DARK, leading=18, leftIndent=10
    )
    styles['toc_item_sub'] = ParagraphStyle(
        'toc_item_sub', fontName='Helvetica', fontSize=9,
        textColor=C_TEXT_LIGHT, leading=16, leftIndent=24
    )
    styles['badge_ok'] = ParagraphStyle(
        'badge_ok', fontName='Helvetica-Bold', fontSize=9,
        textColor=C_SUCCESS
    )
    styles['badge_warn'] = ParagraphStyle(
        'badge_warn', fontName='Helvetica-Bold', fontSize=9,
        textColor=C_WARNING
    )
    styles['code'] = ParagraphStyle(
        'code', fontName='Courier', fontSize=8.5,
        textColor=colors.HexColor('#0f172a'),
        backColor=colors.HexColor('#f1f5f9'),
        leading=14, spaceAfter=4, leftIndent=6, rightIndent=6,
        borderPadding=(4, 6, 4, 6)
    )
    styles['bullet'] = ParagraphStyle(
        'bullet', fontName='Helvetica', fontSize=9.5,
        textColor=C_TEXT_DARK, leading=15, leftIndent=16,
        spaceAfter=3, bulletIndent=4
    )
    return styles


# ─── HELPER FLOWABLES ─────────────────────────────────────────────────────────
def hr(color=C_BORDER, thickness=0.5, space_before=4, space_after=8):
    return HRFlowable(
        width='100%', thickness=thickness, color=color,
        spaceBefore=space_before, spaceAfter=space_after
    )


def section_title(text, styles, level='h2'):
    items = []
    items.append(Spacer(1, 4*mm))
    items.append(Paragraph(text, styles[level]))
    items.append(hr(C_PRIMARY, 1.5, 0, 8))
    return items


def info_box(text, styles, bg=C_HEADING_BG, border_color=C_PRIMARY):
    data = [[Paragraph(text, styles['body_small'])]]
    t = Table(data, colWidths=[165*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEAFTER', (0, 0), (0, -1), 3, border_color),
        ('LINEBEFORE', (0, 0), (0, -1), 3, border_color),
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, C_BORDER),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, C_BORDER),
    ]))
    return t


def std_table(headers, rows, col_widths, styles_obj):
    """Build a standard styled table."""
    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th', fontName='Helvetica-Bold', fontSize=8.5,
        textColor=C_WHITE, leading=12
    )) for h in headers]

    data = [header_cells]
    for row in rows:
        data.append([
            Paragraph(str(cell), ParagraphStyle(
                'td', fontName='Helvetica', fontSize=8.5,
                textColor=C_TEXT_DARK, leading=12
            )) for cell in row
        ])

    t = Table(data, colWidths=col_widths)
    ts = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [C_WHITE, C_ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
    ])
    t.setStyle(ts)
    return t


def bullet_list(items, styles):
    result = []
    for item in items:
        result.append(Paragraph(f'• {item}', styles['bullet']))
    return result




# ─── BUILD CONTENT ─────────────────────────────────────────────────────────
def build_story():
    styles = build_styles()
    story = []

    # ── PAGE 1: COVER ────────────────────────────────────────────────────────
    # The cover is drawn entirely via the HeaderFooterCanvas callback on page 1.
    # We just need a PageBreak to advance to page 2.
    story.append(Spacer(1, 1))
    story.append(PageBreak())

    # ── PAGE 2: TABLE OF CONTENTS ────────────────────────────────────────────
    for item in section_title('Índice de Contenidos', styles, 'h1'):
        story.append(item)
    story.append(Spacer(1, 4*mm))

    toc_data = [
        ('1.', 'Resumen Ejecutivo', '3'),
        ('2.', 'Stack Tecnológico', '4'),
        ('3.', 'Arquitectura de Datos', '5'),
        ('4.', 'Multi-Tenancy', '6'),
        ('5.', 'Fase 1: Padrón de Clientes (Completada)', '7'),
        ('6.', 'Fase 2: Mapeo Vendedor ↔ Telegram (Completada)', '8'),
        ('7.', 'Fase 3: Panel de Supervisión — Diseño', '9'),
        ('8.', 'Fase 3: Panel de Supervisión — Implementación', '10'),
        ('9.', 'Fase 3C: Apertura de Roles (Completada)', '11'),
        ('10.', 'Estado General de Fases', '12'),
        ('11.', 'Fase 3D: Alertas Básicas (Pendiente)', '13'),
        ('12.', 'Fase 4: Motores RPA (Pendiente)', '14'),
        ('13.', 'Aprendizajes y Decisiones Técnicas', '15'),
        ('14.', 'Próximos Pasos Recomendados', '16'),
        ('15.', 'Glosario y Notas Finales', '17'),
    ]

    for num, title, page in toc_data:
        row_data = [[
            Paragraph(f'<font color="#4f8ef7"><b>{num}</b></font>', ParagraphStyle(
                'toc_num', fontName='Helvetica-Bold', fontSize=10, textColor=C_PRIMARY, leading=18
            )),
            Paragraph(title, styles['toc_item']),
            Paragraph(f'<font color="#6b7280">{page}</font>', ParagraphStyle(
                'toc_pg', fontName='Helvetica', fontSize=9, textColor=C_TEXT_LIGHT,
                leading=18, alignment=TA_RIGHT
            )),
        ]]
        t = Table(row_data, colWidths=[12*mm, 140*mm, 13*mm])
        t.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, C_BORDER),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t)

    story.append(PageBreak())

    # ── PAGE 3: RESUMEN EJECUTIVO ────────────────────────────────────────────
    for item in section_title('1. Resumen Ejecutivo', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'Shelfy es una plataforma de supervisión comercial diseñada para distribuidoras de consumo masivo. '
        'El sistema permite a supervisores y administradores visualizar en tiempo real el estado de cobertura '
        'de sus rutas de venta: qué clientes (PDV) están activos, cuáles no reciben visitas, '
        'y dónde se encuentran geográficamente.',
        styles['body']
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'El proyecto se construyó en iteraciones rápidas sobre un stack moderno: <b>FastAPI</b> en Railway '
        '(backend), <b>Next.js</b> en Vercel (frontend), <b>Supabase</b> como base de datos PostgreSQL '
        'con REST API integrada. La arquitectura multi-tenant permite que múltiples distribuidoras '
        'compartan la misma plataforma de forma completamente aislada.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(info_box(
        '<b>Estado actual:</b> 7 de 11 fases completadas. El Panel de Supervisión está operativo con '
        'mapa interactivo, toggles de visibilidad en 3 niveles, y acceso diferenciado por roles '
        '(superadmin / admin / supervisor).',
        styles, bg=colors.HexColor('#eff6ff')
    ))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Objetivos Principales del Sistema', styles['h3']))
    story.append(Spacer(1, 2*mm))

    objectives = [
        'Visibilidad geográfica en tiempo real de todos los puntos de venta (PDV)',
        'Detección de clientes inactivos (sin compras en los últimos 90 días)',
        'Supervisión por jerarquía: distribuidora → sucursal → vendedor → ruta → PDV',
        'Integración automática con el ERP del distribuidor mediante archivos Excel',
        'Plataforma multi-tenant con aislamiento completo entre distribuidoras',
        'Acceso diferenciado según rol: superadmin, admin, supervisor',
    ]
    for obj in objectives:
        story.append(Paragraph(f'• {obj}', styles['bullet']))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Métricas de la Plataforma (26/03/2026)', styles['h3']))
    story.append(Spacer(1, 2*mm))

    metrics_data = [
        ['Distribuidoras activas', '4 (Dist 2, 3, 4, 5, 6)'],
        ['Total de clientes PDV', '~23.200'],
        ['Total de rutas de venta', '~291'],
        ['Total de vendedores', '~55'],
        ['Tiempo de sincronización total', '~43 segundos'],
        ['Fases completadas / total', '7 / 11'],
    ]
    t = std_table(['Métrica', 'Valor'], metrics_data, [95*mm, 70*mm], styles)
    story.append(t)

    story.append(PageBreak())

    # ── PAGE 4: STACK TECNOLÓGICO ─────────────────────────────────────────────
    for item in section_title('2. Stack Tecnológico', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'La selección tecnológica priorizó velocidad de desarrollo, costo operativo mínimo y '
        'escalabilidad para un producto B2B. Cada componente fue elegido por razones específicas '
        'que se detallan a continuación.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    stack_data = [
        ['FastAPI (Python)', 'Backend / API', 'Railway', 'Desarrollo rápido, tipado con Pydantic, async nativo, ideal para integraciones con ERP'],
        ['Next.js 14 / React', 'Frontend SPA', 'Vercel', 'App Router, SSR/CSR híbrido, deploy automático desde git, excelente DX'],
        ['PostgreSQL / Supabase', 'Base de datos', 'Supabase Cloud', 'REST API generada automáticamente, RPC para funciones SQL, free tier generoso'],
        ['react-leaflet', 'Mapas', 'CDN CartoDB', 'Sin API key, dark tiles profesionales, ligero y flexible para React'],
        ['python-telegram-bot', 'Bot Telegram', 'Railway Workers', 'Workers separados por distribuidor, webhooks o polling según entorno'],
        ['JWT Custom', 'Autenticación', 'FastAPI', 'Control total sobre claims, roles embebidos (superadmin/admin/supervisor)'],
    ]

    headers = ['Tecnología', 'Capa', 'Deploy', 'Justificación']
    col_widths = [30*mm, 25*mm, 28*mm, 82*mm]

    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th2', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, leading=11
    )) for h in headers]

    data = [header_cells]
    for row in stack_data:
        data.append([Paragraph(str(cell), ParagraphStyle(
            'td2', fontName='Helvetica', fontSize=8, textColor=C_TEXT_DARK, leading=12
        )) for cell in row])

    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [C_WHITE, C_ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 1), (0, -1), C_PRIMARY_DARK),
    ]))
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Principios de Arquitectura', styles['h3']))
    principles = [
        '<b>Serverless-first:</b> Railway y Vercel escalan automáticamente sin gestión de servidores',
        '<b>API-first:</b> FastAPI como única fuente de verdad; el frontend consume exclusivamente la API',
        '<b>Zero API keys para mapas:</b> CartoDB dark tiles son gratuitos y sin limitaciones para uso interno',
        '<b>Workers separados:</b> Los bots de Telegram corren en procesos independientes, no bloquean la API',
        '<b>SQL functions para queries complejas:</b> Las funciones fn_supervision_* encapsulan la lógica de negocio en la DB',
    ]
    for p in principles:
        story.append(Paragraph(f'• {p}', styles['bullet']))

    story.append(PageBreak())

    # ── PAGE 5: ARQUITECTURA DE DATOS ─────────────────────────────────────────
    for item in section_title('3. Arquitectura de Datos', styles, 'h1'):
        story.append(item)

    story.append(Paragraph('Estrategia de Tablas _v2', styles['h3']))
    story.append(Paragraph(
        'Las tablas con sufijo <b>_v2</b> son tablas paralelas y limpias creadas para el módulo de supervisión. '
        'Las tablas legacy contienen foreign keys de exhibiciones → clientes_pdv que no se pueden modificar '
        'sin romper el flujo activo de exhibiciones en producción. Las _v2 permiten evolucionar el esquema '
        'sin riesgos.',
        styles['body']
    ))
    story.append(Spacer(1, 3*mm))

    story.append(info_box(
        '<b>Decisión clave:</b> En lugar de modificar tablas legacy con FK críticas, se crearon tablas _v2 '
        'paralelas con esquema limpio y constraints correctos. Esto permite iterar sin afectar el sistema de exhibiciones.',
        styles, bg=colors.HexColor('#fefce8'), border_color=C_WARNING
    ))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Esquema Completo de Tablas _v2', styles['h3']))
    story.append(Spacer(1, 2*mm))

    schema_tables = [
        {
            'name': 'sucursales_v2',
            'fields': [
                ('id_sucursal', 'UUID', 'PK auto-generado'),
                ('id_distribuidor', 'UUID', 'FK → distribuidores'),
                ('id_sucursal_erp', 'TEXT', 'ID en el ERP del distribuidor'),
                ('nombre_erp', 'TEXT', 'Nombre tal como viene del ERP'),
            ]
        },
        {
            'name': 'vendedores_v2',
            'fields': [
                ('id_vendedor', 'UUID', 'PK auto-generado'),
                ('id_distribuidor', 'UUID', 'FK → distribuidores'),
                ('id_sucursal', 'UUID', 'FK → sucursales_v2'),
                ('nombre_erp', 'TEXT', 'Nombre tal como viene del ERP'),
                ('id_vendedor_erp', 'TEXT', 'ID en el ERP — UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp)'),
            ]
        },
        {
            'name': 'rutas_v2',
            'fields': [
                ('id_ruta', 'UUID', 'PK auto-generado'),
                ('id_vendedor', 'UUID', 'FK → vendedores_v2'),
                ('nombre_ruta', 'TEXT', 'Nombre de la ruta'),
                ('id_ruta_erp', 'TEXT', 'ID en el ERP — UNIQUE(id_vendedor, id_ruta_erp)'),
                ('dia_semana', 'TEXT', 'Detectado de columnas booleanas Lunes-Domingo'),
            ]
        },
        {
            'name': 'clientes_pdv_v2',
            'fields': [
                ('id_cliente', 'UUID', 'PK auto-generado'),
                ('id_ruta', 'UUID', 'FK → rutas_v2 (NULL si es limbo)'),
                ('id_distribuidor', 'UUID', 'FK → distribuidores'),
                ('id_cliente_erp', 'TEXT', 'ID en el ERP del distribuidor'),
                ('nombre_fantasia', 'TEXT', 'Nombre comercial del PDV'),
                ('nombre_razon_social', 'TEXT', 'Razón social legal'),
                ('domicilio / localidad / provincia', 'TEXT', 'Dirección completa'),
                ('canal', 'TEXT', 'Canal de distribución (supermercado, almacén, etc.)'),
                ('latitud / longitud', 'FLOAT', 'Coordenadas GPS del PDV'),
                ('fecha_ultima_compra', 'DATE', 'Última compra registrada — define activo/inactivo'),
                ('fecha_alta', 'DATE', 'Primera vez que apareció en el padrón ERP'),
                ('es_limbo', 'BOOLEAN', 'True si el cliente no tiene ruta asignada'),
            ]
        },
    ]

    for schema in schema_tables:
        story.append(Paragraph(schema['name'], ParagraphStyle(
            'schema_name', fontName='Courier-Bold', fontSize=10,
            textColor=C_PRIMARY_DARK, spaceBefore=6, spaceAfter=3,
            backColor=colors.HexColor('#f0f9ff'), borderPadding=(3, 6, 3, 6),
            leftIndent=0
        )))
        field_data = [['Campo', 'Tipo', 'Descripción']]
        for field in schema['fields']:
            field_data.append(list(field))

        ft = std_table(['Campo', 'Tipo', 'Descripción'], schema['fields'],
                       [52*mm, 20*mm, 93*mm], styles)
        story.append(ft)
        story.append(Spacer(1, 3*mm))

    story.append(PageBreak())

    # ── PAGE 6: MULTI-TENANCY ─────────────────────────────────────────────────
    for item in section_title('4. Multi-Tenancy', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'El archivo Excel del ERP contiene <b>todos los distribuidores</b> en un único .xlsx, '
        'identificados por la columna <font name="Courier">idempresa</font>. El servicio de ingesta '
        'agrupa los registros por idempresa, resuelve el id_distribuidor interno via '
        '<font name="Courier">distribuidores.id_empresa_erp</font>, y procesa cada tenant '
        'de forma secuencial con logging individual.',
        styles['body']
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Este enfoque es deliberadamente más simple que manejar múltiples archivos: '
        'una sola descarga, agrupación en código Python, procesamiento aislado por tenant. '
        'Cada distribuidor ve únicamente sus propios datos gracias al campo id_distribuidor '
        'presente en todas las tablas _v2.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('Resultados del Run — 26 de marzo de 2026', styles['h3']))
    story.append(Spacer(1, 2*mm))

    run_data = [
        ['Dist 2', '388', '25', '5', '1.0 s', 'OK'],
        ['Dist 3', '~4.900', '~70', '~12', '~8 s', 'OK'],
        ['Dist 4', '~5.200', '~80', '~14', '~9 s', 'OK'],
        ['Dist 5', '~4.100', '~65', '~11', '~8 s', 'OK'],
        ['Dist 6', '2.275', '51', '13', '2.6 s', 'OK'],
        ['TOTAL', '~23.200', '~291', '~55', '~43 s', '—'],
    ]

    headers = ['Distribuidor', 'Clientes', 'Rutas', 'Vendedores', 'Tiempo', 'Estado']
    col_widths = [28*mm, 28*mm, 22*mm, 28*mm, 22*mm, 18*mm]

    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th3', fontName='Helvetica-Bold', fontSize=8.5, textColor=C_WHITE, leading=12
    )) for h in headers]

    data = [header_cells]
    for i, row in enumerate(run_data):
        cells = []
        for j, cell in enumerate(row):
            style = ParagraphStyle('td3', fontName='Helvetica', fontSize=8.5,
                                   textColor=C_TEXT_DARK, leading=12)
            if j == 5:
                style = ParagraphStyle('td3ok', fontName='Helvetica-Bold', fontSize=8.5,
                                       textColor=C_SUCCESS if cell == 'OK' else C_TEXT_LIGHT, leading=12)
            if i == 5:  # Total row
                style = ParagraphStyle('td3tot', fontName='Helvetica-Bold', fontSize=8.5,
                                       textColor=C_PRIMARY_DARK, leading=12)
            cells.append(Paragraph(cell, style))
        data.append(cells)

    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [C_WHITE, C_ROW_ALT]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#eff6ff')),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
        ('LINEABOVE', (0, -1), (-1, -1), 1, C_PRIMARY),
    ]))
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Flujo de Procesamiento Multi-Tenant', styles['h3']))
    steps = [
        'Descarga del archivo Excel desde URL del ERP',
        'Carga en DataFrame → agrupación por columna idempresa',
        'Para cada empresa: resolución de id_distribuidor interno',
        'Sincronización secuencial: sucursales → vendedores → rutas → clientes PDV',
        'Lógica de adopción de limbo: clientes sin ruta previamente marcados como es_limbo=true',
        'Registro en motor_runs: estado, timestamps, conteos por entidad',
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'<b>{i}.</b>  {step}', styles['bullet']))

    story.append(PageBreak())

    # ── PAGE 7: FASE 1 ───────────────────────────────────────────────────────
    for item in section_title('5. Fase 1: Padrón de Clientes (Completada)', styles, 'h1'):
        story.append(item)

    story.append(info_box(
        '✅  Estado: COMPLETADA — Servicio de ingesta operativo con cobertura de 5 distribuidoras, '
        '~23.200 PDV sincronizados, fecha_alta y dia_semana poblados en el run del 26/03/2026.',
        styles, bg=colors.HexColor('#f0fdf4'), border_color=C_SUCCESS
    ))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Flujo Detallado del Servicio de Ingesta', styles['h3']))
    story.append(Spacer(1, 2*mm))

    flow_steps = [
        ('Descarga', 'GET al endpoint del ERP → archivo .xlsx en memoria (sin guardar a disco)'),
        ('Agrupación', 'DataFrame agrupado por idempresa → un sub-DataFrame por tenant'),
        ('Sucursales', 'UPSERT en sucursales_v2 por id_sucursal_erp — crea o actualiza nombre'),
        ('Vendedores', 'UPSERT con UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp) — maneja SIN VENDEDOR por sucursal'),
        ('Rutas', 'UPSERT con UNIQUE(id_vendedor, id_ruta_erp) — detecta dia_semana de columnas booleanas Lunes-Domingo'),
        ('Clientes PDV', 'UPSERT masivo con id_cliente_erp — setea fecha_alta en primer insert, actualiza coordenadas y canal'),
        ('Limbo', 'Clientes que aparecen sin ruta asignada se marcan es_limbo=true; si luego obtienen ruta, se adoptan'),
        ('motor_runs', 'Log por distribuidor: estado (completado/error/en_curso/sin_ejecuciones), timestamps, conteos'),
    ]

    t = std_table(['Paso', 'Descripción'], flow_steps, [28*mm, 137*mm], styles)
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Desafíos Técnicos Resueltos', styles['h3']))
    story.append(Spacer(1, 2*mm))

    challenges = [
        ('<b>URL demasiado larga con .in_() de 23k IDs</b> → Solución: filtrar primero en la DB '
         'con un SELECT por id_distribuidor, luego comparar en Python. Nunca enviar listas grandes por URL.'),
        ('<b>Duplicado "SIN VENDEDOR" en múltiples sucursales</b> → Solución: agregar id_sucursal '
         'al UNIQUE constraint. El constraint original (id_distribuidor, id_vendedor_erp) no era suficientemente discriminante.'),
        ('<b>CHECK constraint en motor_runs</b> → El enum original no incluía \'en_curso\' ni '
         '\'sin_ejecuciones\'. Extendido para soportar los nuevos estados del flujo.'),
        ('<b>fecha_alta y dia_semana en NULL</b> → Re-run completo el 26/03/2026 pobló todos los '
         'valores faltantes en los ~23.200 registros existentes.'),
    ]

    for i, ch in enumerate(challenges, 1):
        story.append(Paragraph(f'<b>{i}.</b>  {ch}', styles['bullet']))
        story.append(Spacer(1, 2*mm))

    story.append(PageBreak())

    # ── PAGE 8: FASE 2 ───────────────────────────────────────────────────────
    for item in section_title('6. Fase 2: Mapeo Vendedor ↔ Telegram (Completada)', styles, 'h1'):
        story.append(item)

    story.append(info_box(
        '✅  Estado: COMPLETADA — ~90% de los vendedores activos tienen mapeo Telegram configurado.',
        styles, bg=colors.HexColor('#f0fdf4'), border_color=C_SUCCESS
    ))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'El panel <b>TabMapeoVendedores</b> permite vincular cada vendedor del sistema '
        '(<font name="Courier">vendedores_v2.id_vendedor</font>) con un miembro de un grupo de Telegram '
        '(<font name="Courier">integrantes_grupo.id</font>). Esta vinculación es el puente entre el ERP '
        'y el canal de comunicación real con el vendedor.',
        styles['body']
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'El mapeo se almacena en <font name="Courier">integrantes_grupo.id_vendedor_v2</font>. '
        'Una vez vinculado, el sistema puede enviar notificaciones push directamente al vendedor '
        'a través de Telegram cuando se detectan alertas en sus rutas.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('Control de Acceso por Rol', styles['h3']))
    story.append(Spacer(1, 2*mm))

    access_data = [
        ['superadmin', 'Todas las distribuidoras', 'Dropdown selector de distribuidor en la UI'],
        ['admin', 'Solo su distribuidora', 'Vista filtrada automáticamente'],
        ['supervisor', 'Sin acceso a esta sección', 'Redirigido a /supervision'],
    ]
    t = std_table(['Rol', 'Alcance', 'Comportamiento UI'], access_data,
                  [28*mm, 45*mm, 92*mm], styles)
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Flujo de Vinculación', styles['h3']))
    link_steps = [
        'Superadmin/Admin abre TabMapeoVendedores en /admin',
        'Selecciona distribuidor (superadmin) o ve su distribuidora directamente (admin)',
        'Lista de vendedores_v2 sin mapeo aparece en panel izquierdo',
        'Lista de integrantes_grupo sin vincular aparece en panel derecho',
        'Click en vendedor → click en integrante → confirmar vinculación',
        'Se actualiza integrantes_grupo.id_vendedor_v2 en Supabase',
        'El vendedor queda disponible para recibir alertas automáticas',
    ]
    for i, step in enumerate(link_steps, 1):
        story.append(Paragraph(f'<b>{i}.</b>  {step}', styles['bullet']))

    story.append(PageBreak())

    # ── PAGE 9: FASE 3 DISEÑO ────────────────────────────────────────────────
    for item in section_title('7. Fase 3: Panel de Supervisión — Diseño', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'La filosofía de diseño del panel parte de un principio simple: <b>mostrar el mapa primero, '
        'los datos bajo demanda</b>. Un supervisor necesita primero orientarse geográficamente '
        'antes de profundizar en datos tabulares.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('Layout del Panel', styles['h3']))
    layout_items = [
        '<b>Área principal (izquierda/centro):</b> Mapa interactivo con CartoDB dark tiles — ocupa 65% del ancho',
        '<b>Panel derecho:</b> Tarjetas de vendedores con estructura en cascada (vendedor → ruta → PDV)',
        '<b>Barra superior:</b> Selector de sucursal (paso requerido antes de cargar datos)',
        '<b>Header con estadísticas:</b> Total PDV, % activos, % inactivos — actualizado dinámicamente',
    ]
    for item in layout_items:
        story.append(Paragraph(f'• {item}', styles['bullet']))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Sistema de Visibilidad de 3 Niveles', styles['h3']))
    story.append(Paragraph(
        'Cada pin en el mapa es visible únicamente si pasa los 3 filtros simultáneamente. '
        'La fórmula es: <b>pin visible = visibleVendedores ∩ visibleRutas ∩ visibleClientes</b>',
        styles['body']
    ))
    story.append(Spacer(1, 3*mm))

    vis_data = [
        ['Nivel 1 — Vendedor', 'Toggle en tarjeta de vendedor', 'Oculta/muestra TODAS sus rutas y clientes'],
        ['Nivel 2 — Ruta', 'Toggle dentro de vendedor activo', 'Oculta/muestra todos los PDV de esa ruta específica'],
        ['Nivel 3 — PDV', 'Toggle individual por cliente', 'Control granular de un punto de venta específico'],
    ]
    t = std_table(['Nivel', 'Control UI', 'Efecto'], vis_data,
                  [40*mm, 55*mm, 70*mm], styles)
    story.append(t)

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Codificación Visual de Clientes', styles['h3']))
    story.append(Spacer(1, 2*mm))

    color_data = [
        ['Activo', 'fecha_ultima_compra ≤ 90 días', 'Color del vendedor asignado (12 colores)', 'Radio normal, opacidad 100%'],
        ['Inactivo', 'fecha_ultima_compra > 90 días o NULL', 'Gris (#9ca3af)', 'Radio reducido, opacidad 25%'],
    ]
    t = std_table(['Estado', 'Criterio', 'Color', 'Estilo visual'],
                  color_data, [22*mm, 55*mm, 52*mm, 36*mm], styles)
    story.append(t)

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Popup de Información del PDV', styles['h3']))
    popup_items = [
        'Nombre fantasia del cliente',
        'Nombre del vendedor asignado',
        'Fecha de última compra',
        'Advertencia visual si está inactivo',
        'Canal de distribución',
    ]
    for item in popup_items:
        story.append(Paragraph(f'• {item}', styles['bullet']))

    story.append(PageBreak())

    # ── PAGE 10: FASE 3 IMPLEMENTACIÓN ──────────────────────────────────────
    for item in section_title('8. Fase 3: Panel de Supervisión — Implementación', styles, 'h1'):
        story.append(item)

    story.append(Paragraph('Estrategia de Carga de Datos', styles['h3']))
    load_items = [
        '<b>Lazy loading por nivel:</b> Los datos se cargan bajo demanda. Al seleccionar una sucursal se carga la lista de vendedores. Al expandir un vendedor se cargan sus rutas. Al expandir una ruta se cargan sus PDV.',
        '<b>Nunca se cargan los 23.200 clientes de golpe:</b> Cada request trae únicamente los datos del nivel expandido.',
        '<b>Cache en memoria:</b> Una vez cargados, los datos permanecen en el estado de React hasta que se recarga la página. Esto elimina requests repetidos al navegar entre vendedores.',
        '<b>FitBounds automático:</b> Al cargar el primer batch de pins, el mapa hace zoom automático para mostrar todos los puntos en pantalla.',
    ]
    for item in load_items:
        story.append(Paragraph(f'• {item}', styles['bullet']))
        story.append(Spacer(1, 2*mm))

    story.append(Spacer(1, 3*mm))
    story.append(Paragraph('Funciones SQL de Supervisión', styles['h3']))
    story.append(Spacer(1, 2*mm))

    story.append(Paragraph(
        'Las funciones SQL encapsulan la lógica de negocio en la base de datos, '
        'reduciendo el procesamiento en el backend y el volumen de datos transferidos.',
        styles['body']
    ))
    story.append(Spacer(1, 2*mm))

    sql_data = [
        ['fn_supervision_vendedores(p_dist_id)',
         'Lista vendedores de una distribuidora con sus métricas agregadas',
         'id_vendedor, nombre, sucursal, total_rutas, total_pdv, pdv_activos, pdv_inactivos'],
        ['fn_supervision_rutas(p_id_vendedor)',
         'Lista rutas de un vendedor específico',
         'id_ruta, nombre_ruta, dia_semana, total_pdv'],
        ['fn_supervision_clientes(p_id_ruta)',
         'Lista PDV de una ruta con estado activo/inactivo',
         'id_cliente, nombre_fantasia, latitud, longitud, fecha_ultima_compra, es_activo'],
    ]
    t = std_table(['Función', 'Propósito', 'Retorna'], sql_data,
                  [55*mm, 55*mm, 55*mm], styles)
    story.append(t)

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Detalles de Implementación Frontend', styles['h3']))
    impl_items = [
        '<b>Paleta de 12 colores por vendedor:</b> Asignados por índice, garantiza contraste en CartoDB dark tiles',
        '<b>Acordeón CSS puro:</b> Animación con gridTemplateRows: 0fr → 1fr + transition, sin librerías JS',
        '<b>Estado de visibilidad:</b> Sets de IDs en React state — O(1) lookup para decidir si mostrar un pin',
        '<b>react-leaflet CircleMarker:</b> Más performante que Marker para miles de puntos simultáneos',
        '<b>Threshold activo:</b> 90 días configurable desde constante — fácil de ajustar por cliente',
    ]
    for item in impl_items:
        story.append(Paragraph(f'• {item}', styles['bullet']))
        story.append(Spacer(1, 1*mm))

    story.append(PageBreak())

    # ── PAGE 11: FASE 3C ─────────────────────────────────────────────────────
    for item in section_title('9. Fase 3C: Apertura de Roles (Completada)', styles, 'h1'):
        story.append(item)

    story.append(info_box(
        '✅  Estado: COMPLETADA — Los 3 roles tienen acceso al panel de supervisión con alcance apropiado.',
        styles, bg=colors.HexColor('#f0fdf4'), border_color=C_SUCCESS
    ))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'La apertura de roles resuelve un requerimiento de negocio crítico: los supervisores de campo '
        'deben poder acceder al panel de supervisión sin tener acceso al panel de administración. '
        'Cada rol ve únicamente los datos de su distribuidora.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('Matriz de Acceso por Rol', styles['h3']))
    story.append(Spacer(1, 2*mm))

    access_matrix = [
        ['superadmin', '✅ Acceso completo', '✅ Acceso completo', 'Todas las distribuidoras'],
        ['admin', '✅ Acceso completo', '✅ Acceso completo', 'Solo su distribuidora'],
        ['supervisor', '❌ → Redirige a /supervision', '✅ Acceso completo', 'Solo su distribuidora'],
    ]

    headers = ['Rol', '/admin', '/supervision', 'Alcance de datos']

    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th4', fontName='Helvetica-Bold', fontSize=8.5, textColor=C_WHITE, leading=12
    )) for h in headers]

    data = [header_cells]
    for row in access_matrix:
        cells = []
        for j, cell in enumerate(row):
            if '✅' in cell:
                style = ParagraphStyle('td4ok', fontName='Helvetica-Bold', fontSize=8.5,
                                       textColor=C_SUCCESS, leading=12)
            elif '❌' in cell:
                style = ParagraphStyle('td4err', fontName='Helvetica-Bold', fontSize=8.5,
                                       textColor=C_DANGER, leading=12)
            else:
                style = ParagraphStyle('td4', fontName='Helvetica', fontSize=8.5,
                                       textColor=C_TEXT_DARK, leading=12)
            cells.append(Paragraph(cell, style))
        data.append(cells)

    t = Table(data, colWidths=[28*mm, 50*mm, 50*mm, 37*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [C_WHITE, C_ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
    ]))
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Cambios de Implementación', styles['h3']))
    changes = [
        'Ruta <font name="Courier">/supervision</font> creada en el App Router de Next.js',
        'Sidebar actualizado con enlace a Supervisión visible para los 3 roles',
        'Middleware de autenticación: supervisor en /admin es redirigido automáticamente',
        'La API filtra datos por id_distribuidor del JWT — sin posibilidad de cross-tenant',
        'Selector de distribuidora en UI visible solo para superadmin',
    ]
    for change in changes:
        story.append(Paragraph(f'• {change}', styles['bullet']))

    story.append(PageBreak())

    # ── PAGE 12: ESTADO GENERAL ──────────────────────────────────────────────
    for item in section_title('10. Estado General de Fases', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'El proyecto se ejecuta en fases iterativas, priorizando valor de negocio en cada entrega. '
        'A continuación se muestra el estado actual de las 11 fases planificadas.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    phases = [
        ('1', 'Padrón de Clientes (Ingesta ERP)', 'COMPLETADA', '✅'),
        ('2', 'Mapeo Vendedor ↔ Telegram', 'COMPLETADA', '✅'),
        ('3A', 'Panel de Supervisión — Mapa base', 'COMPLETADA', '✅'),
        ('3B', 'Panel de Supervisión — Toggles nivel vendedor', 'COMPLETADA', '✅'),
        ('3B+', 'Panel de Supervisión — Toggles nivel ruta', 'COMPLETADA', '✅'),
        ('3B++', 'Panel de Supervisión — Toggles nivel PDV', 'COMPLETADA', '✅'),
        ('3C', 'Apertura de Roles (supervisor)', 'COMPLETADA', '✅'),
        ('3D', 'Alertas Básicas (PDV inactivos, rutas sin activos)', 'PENDIENTE', '⏳'),
        ('4A', 'Motor de Ventas (actualiza fecha_ultima_compra)', 'PENDIENTE', '⏳'),
        ('4B', 'Motor Cuentas Corrientes', 'PENDIENTE', '⏳'),
        ('4C', 'Schedule Automático (Railway cron)', 'PENDIENTE', '⏳'),
    ]

    headers = ['Fase', 'Descripción', 'Estado', '']

    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th5', fontName='Helvetica-Bold', fontSize=8.5, textColor=C_WHITE, leading=12
    )) for h in headers]

    data = [header_cells]
    for phase, desc, status, icon in phases:
        if status == 'COMPLETADA':
            status_style = ParagraphStyle('s_ok', fontName='Helvetica-Bold', fontSize=8.5,
                                          textColor=C_SUCCESS, leading=12)
            row_bg = C_WHITE
        else:
            status_style = ParagraphStyle('s_warn', fontName='Helvetica-Bold', fontSize=8.5,
                                          textColor=C_WARNING, leading=12)
            row_bg = colors.HexColor('#fffbeb')

        data.append([
            Paragraph(f'<b>{phase}</b>', ParagraphStyle('ph', fontName='Helvetica-Bold',
                                                         fontSize=8.5, textColor=C_PRIMARY_DARK, leading=12)),
            Paragraph(desc, ParagraphStyle('td5', fontName='Helvetica', fontSize=8.5,
                                           textColor=C_TEXT_DARK, leading=12)),
            Paragraph(status, status_style),
            Paragraph(icon, ParagraphStyle('ic', fontName='Helvetica', fontSize=10, leading=12)),
        ])

    t = Table(data, colWidths=[15*mm, 115*mm, 28*mm, 7*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [C_WHITE, C_ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
        ('BACKGROUND', (0, 8), (-1, 11), colors.HexColor('#fffbeb')),
    ]))
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Resumen de Progreso', styles['h3']))
    story.append(Spacer(1, 2*mm))

    progress_data = [
        ['Fases completadas', '7', '63.6%'],
        ['Fases pendientes', '4', '36.4%'],
        ['Total planificadas', '11', '100%'],
    ]
    t = std_table(['Categoría', 'Cantidad', 'Porcentaje'], progress_data,
                  [80*mm, 40*mm, 45*mm], styles)
    story.append(t)

    story.append(PageBreak())

    # ── PAGE 13: FASE 3D ─────────────────────────────────────────────────────
    for item in section_title('11. Fase 3D: Alertas Básicas (Pendiente)', styles, 'h1'):
        story.append(item)

    story.append(info_box(
        '⏳  Estado: PENDIENTE — Estimación: 1-2 días de desarrollo. Alto valor de negocio.',
        styles, bg=colors.HexColor('#fffbeb'), border_color=C_WARNING
    ))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'La fase 3D agrega una subsección de alertas debajo del mapa en el panel de supervisión. '
        'Su objetivo es que el supervisor pueda identificar de forma inmediata qué vendedores '
        'tienen problemas de cobertura sin necesidad de revisar cliente por cliente.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('Funcionalidades a Desarrollar', styles['h3']))
    story.append(Spacer(1, 2*mm))

    alert_features = [
        ['Lista de PDV inactivos', 'PDV sin compras en 90+ días, agrupados por vendedor', 'Alta'],
        ['Rutas sin activos', 'Rutas donde el 100% de los clientes están inactivos', 'Alta'],
        ['Export a Excel', 'Descarga de lista de alertas para gestión offline', 'Media'],
        ['Push Telegram', 'Notificación automática al vendedor vinculado (requiere Fase 2)', 'Media-Alta'],
        ['Filtros por vendedor', 'Filtrar alertas por vendedor específico en el panel', 'Baja'],
    ]
    t = std_table(['Funcionalidad', 'Descripción', 'Prioridad'],
                  alert_features, [40*mm, 100*mm, 25*mm], styles)
    story.append(t)

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Criterio de Alerta', styles['h3']))
    alert_criteria = [
        '<b>PDV Inactivo:</b> fecha_ultima_compra es NULL o han pasado más de 90 días desde la última compra',
        '<b>Ruta crítica:</b> porcentaje de PDV activos en la ruta < 30%',
        '<b>Vendedor crítico:</b> porcentaje de PDV activos del vendedor < 50%',
        '<b>Sin visita reciente:</b> PDV sin ningún registro de compra en los últimos 180 días',
    ]
    for criterion in alert_criteria:
        story.append(Paragraph(f'• {criterion}', styles['bullet']))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Estimación de Desarrollo', styles['h3']))
    dev_est = [
        ['SQL query/function para alertas', '2-3 horas'],
        ['Componente React de lista de alertas', '3-4 horas'],
        ['Integración con el panel existente', '1-2 horas'],
        ['Export a Excel (xlsx)', '1-2 horas'],
        ['Testing y ajustes', '2-3 horas'],
        ['TOTAL', '9-14 horas (1-2 días)'],
    ]
    t = std_table(['Tarea', 'Estimación'], dev_est, [120*mm, 45*mm], styles)
    story.append(t)

    story.append(PageBreak())

    # ── PAGE 14: FASE 4 ──────────────────────────────────────────────────────
    for item in section_title('12. Fase 4: Motores RPA (Pendiente)', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'Los motores RPA son el corazón del sistema en su fase final. Sin estos motores, '
        'el campo <font name="Courier">fecha_ultima_compra</font> permanece estático y el panel '
        'de supervisión no refleja el estado real de actividad comercial.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('4A — Motor de Ventas (3-4 días)', styles['h3']))
    story.append(info_box(
        '⚡  Este es el motor crítico. Sin él, activos/inactivos no se actualizan automáticamente.',
        styles, bg=colors.HexColor('#fff7ed'), border_color=C_DANGER
    ))
    story.append(Spacer(1, 3*mm))

    motor_4a = [
        'Descarga el archivo de ventas desde el endpoint del ERP (mismo patrón que padrón)',
        'Mapea id_cliente_erp → id_cliente en clientes_pdv_v2',
        'Almacena registros en ventas_v2 (tabla a crear): fecha, monto, id_cliente, id_vendedor',
        'Auto-actualiza clientes_pdv_v2.fecha_ultima_compra con la fecha de venta más reciente',
        'Genera log en motor_runs con estadísticas del procesamiento',
    ]
    for step in motor_4a:
        story.append(Paragraph(f'• {step}', styles['bullet']))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('4B — Motor Cuentas Corrientes (2-3 días)', styles['h3']))

    motor_4b = [
        'Descarga saldos de cuenta corriente por cliente desde el ERP',
        'Tabla cuentas_corrientes_v2: saldo, fecha_vencimiento, id_cliente, fecha_actualizacion',
        'Vista en el panel: saldo pendiente por PDV al hacer click en el popup del mapa',
        'Alertas de vencimiento próximo integradas en Fase 3D',
    ]
    for step in motor_4b:
        story.append(Paragraph(f'• {step}', styles['bullet']))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('4C — Schedule Automático (1 día)', styles['h3']))

    motor_4c = [
        'Railway cron job configurado para ejecutar motores 1 vez por día (horario configurable)',
        'Log motor_runs por distribuidor y por tipo de motor',
        'Notificación Telegram al superadmin si algún motor falla',
        'Panel en /admin para ver historial de ejecuciones',
    ]
    for step in motor_4c:
        story.append(Paragraph(f'• {step}', styles['bullet']))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Resumen de Estimaciones Fase 4', styles['h3']))
    story.append(Spacer(1, 2*mm))

    phase4_est = [
        ['4A', 'Motor de Ventas', '3-4 días', 'Crítico'],
        ['4B', 'Motor Cuentas Corrientes', '2-3 días', 'Alto'],
        ['4C', 'Schedule Automático', '1 día', 'Alto'],
        ['Total Fase 4', '—', '6-8 días', '—'],
    ]
    t = std_table(['Sub-fase', 'Motor', 'Estimación', 'Impacto'],
                  phase4_est, [20*mm, 75*mm, 30*mm, 40*mm], styles)
    story.append(t)

    story.append(PageBreak())

    # ── PAGE 15: APRENDIZAJES ────────────────────────────────────────────────
    for item in section_title('13. Aprendizajes y Decisiones Técnicas', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'A lo largo del desarrollo del proyecto se acumularon aprendizajes técnicos concretos '
        'que pueden servir como referencia para proyectos similares con Supabase, FastAPI y Next.js.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    learnings = [
        {
            'num': '1',
            'title': 'Supabase .in_() con listas grandes rompe la URL',
            'detail': 'Al filtrar con .in_() listas de 1.000+ IDs, Supabase genera URLs que superan el límite del servidor. '
                      'Solución: siempre filtrar en la DB primero con un SELECT por id_distribuidor y comparar en Python. '
                      'Nunca construir URLs con listas de IDs largas.'
        },
        {
            'num': '2',
            'title': 'UNIQUE constraints necesitan todas las columnas discriminantes',
            'detail': 'Un constraint UNIQUE(id_distribuidor, id_vendedor_erp) falla cuando múltiples sucursales '
                      'tienen un vendedor llamado "SIN VENDEDOR". La solución correcta es UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp).'
        },
        {
            'num': '3',
            'title': 'CHECK constraints necesitan evolucionar con la lógica de negocio',
            'detail': 'El enum de estados en motor_runs no incluía los estados \'en_curso\' ni \'sin_ejecuciones\' que surgieron '
                      'durante el desarrollo. Siempre definir enums amplios o usar TEXT con validación en la capa de aplicación.'
        },
        {
            'num': '4',
            'title': 'FKs legacy son inamovibles — construir tablas paralelas',
            'detail': 'Las FK de exhibiciones → clientes_pdv no se pueden modificar sin romper el flujo activo. '
                      'La estrategia correcta es construir tablas _v2 paralelas y limpias en lugar de luchar contra constraints existentes.'
        },
        {
            'num': '5',
            'title': 'Multi-tenant en un archivo es más simple que múltiples archivos',
            'detail': 'Recibir todos los distribuidores en un único .xlsx y agrupar en código Python es más robusto '
                      'que gestionar múltiples URLs o archivos por distribuidor.'
        },
        {
            'num': '6',
            'title': 'CartoDB dark tiles: profesional, gratuito, sin API key',
            'detail': 'Para herramientas B2B internas, CartoDB tiles son una excelente opción: aspecto profesional, '
                      'compatibles con react-leaflet, y sin restricciones para uso interno.'
        },
        {
            'num': '7',
            'title': 'CSS grid trick para acordeones animados sin JS',
            'detail': 'Animar acordeones con gridTemplateRows: 0fr → 1fr + transition: grid-template-rows 0.3s ease '
                      'es más limpio y performante que calcular alturas máximas o usar librerías.'
        },
        {
            'num': '8',
            'title': 'Lazy loading + cache en memoria para datasets geográficos grandes',
            'detail': 'Para 23.000+ puntos geográficos, cargar todos al inicio satura la red y el DOM. '
                      'El patrón correcto es lazy load por nivel + cache en memoria de React state hasta refresh.'
        },
    ]

    for learning in learnings:
        story.append(KeepTogether([
            Paragraph(
                f'<b>{learning["num"]}.  {learning["title"]}</b>',
                ParagraphStyle('learn_title', fontName='Helvetica-Bold', fontSize=10,
                               textColor=C_PRIMARY_DARK, spaceBefore=5, spaceAfter=2, leading=14)
            ),
            Paragraph(learning['detail'], styles['body_small']),
            Spacer(1, 2*mm),
        ]))

    story.append(PageBreak())

    # ── PAGE 16: PRÓXIMOS PASOS ──────────────────────────────────────────────
    for item in section_title('14. Próximos Pasos Recomendados', styles, 'h1'):
        story.append(item)

    story.append(Paragraph(
        'Las siguientes acciones están ordenadas por prioridad, considerando el impacto de negocio '
        'y la dependencia entre módulos. Se recomienda seguir este orden para maximizar el valor '
        'entregado en cada iteración.',
        styles['body']
    ))
    story.append(Spacer(1, 4*mm))

    next_steps = [
        {
            'priority': '1',
            'action': 'Re-subir padrón regularmente',
            'time': 'Automatizable ya',
            'value': 'Alto',
            'detail': 'El script de ingesta ya funciona. Solo requiere configurar el schedule en Railway (Fase 4C). '
                      'Mantiene el padrón actualizado sin intervención manual.'
        },
        {
            'priority': '2',
            'action': 'Fase 3D: Alertas básicas',
            'time': '1-2 días',
            'value': 'Muy alto',
            'detail': 'Subsección de alertas en /supervision. Lista PDV inactivos, rutas críticas. '
                      'Alto valor operativo inmediato para los supervisores.'
        },
        {
            'priority': '3',
            'action': 'Fase 4A: Motor de Ventas',
            'time': '3-4 días',
            'value': 'Crítico',
            'detail': 'Hace que todo el sistema sea live. Sin este motor, fecha_ultima_compra es estática '
                      'y los datos de activos/inactivos se desactualizan rápidamente.'
        },
        {
            'priority': '4',
            'action': 'Fase 4C: Schedule automático',
            'time': '1 día',
            'value': 'Alto',
            'detail': 'Railway cron job que ejecuta los motores diariamente. Elimina la intervención manual '
                      'y asegura datos siempre frescos.'
        },
        {
            'priority': '5',
            'action': 'Fase 4B: Cuentas corrientes',
            'time': '2-3 días',
            'value': 'Medio',
            'detail': 'Agrega saldos de cuenta corriente por PDV. Complementa la vista del vendedor '
                      'con información financiera del cliente.'
        },
        {
            'priority': '6',
            'action': 'Script de datos de prueba para Dist 1',
            'time': 'Medio día',
            'value': 'Bajo',
            'detail': 'Genera datos sintéticos para la primera distribuidora para pruebas de carga '
                      'y demos del sistema.'
        },
    ]

    headers = ['#', 'Acción', 'Tiempo', 'Valor']
    col_widths = [10*mm, 95*mm, 22*mm, 22*mm]

    header_cells = [Paragraph(f'<b>{h}</b>', ParagraphStyle(
        'th6', fontName='Helvetica-Bold', fontSize=8.5, textColor=C_WHITE, leading=12
    )) for h in headers]

    data = [header_cells]
    for step in next_steps:
        value_color = C_DANGER if step['value'] == 'Crítico' else \
                      C_SUCCESS if step['value'] == 'Muy alto' else \
                      C_PRIMARY if step['value'] == 'Alto' else C_TEXT_LIGHT

        data.append([
            Paragraph(f'<b>{step["priority"]}</b>', ParagraphStyle(
                'pnum', fontName='Helvetica-Bold', fontSize=10,
                textColor=C_PRIMARY, leading=12, alignment=TA_CENTER
            )),
            Paragraph(f'<b>{step["action"]}</b><br/><font size="8" color="#6b7280">{step["detail"]}</font>',
                      ParagraphStyle('pact', fontName='Helvetica', fontSize=8.5,
                                     textColor=C_TEXT_DARK, leading=13)),
            Paragraph(step['time'], ParagraphStyle('ptime', fontName='Helvetica', fontSize=8.5,
                                                    textColor=C_TEXT_DARK, leading=12)),
            Paragraph(f'<b>{step["value"]}</b>', ParagraphStyle('pval', fontName='Helvetica-Bold',
                                                                  fontSize=8.5, textColor=value_color, leading=12)),
        ])

    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [C_WHITE, C_ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, C_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, C_PRIMARY),
    ]))
    story.append(t)

    story.append(PageBreak())

    # ── PAGE 17: GLOSARIO ────────────────────────────────────────────────────
    for item in section_title('15. Glosario y Notas Finales', styles, 'h1'):
        story.append(item)

    story.append(Paragraph('Glosario de Términos', styles['h3']))
    story.append(Spacer(1, 2*mm))

    glossary = [
        ('PDV', 'Punto de Venta — local comercial que compra productos al distribuidor'),
        ('ERP', 'Enterprise Resource Planning — sistema contable/operativo del distribuidor (fuente de datos maestra)'),
        ('Padrón', 'Archivo Excel con todos los clientes registrados en el ERP del distribuidor'),
        ('Limbo', 'Cliente que aparece en el padrón sin ruta asignada, guardado temporalmente hasta ser adoptado'),
        ('Tenant', 'Cada distribuidora opera de forma completamente aislada en la misma plataforma multi-tenant'),
        ('RPA', 'Robotic Process Automation — motor automático de descarga y procesamiento de archivos del ERP'),
        ('motor_runs', 'Tabla de log que registra cada ejecución de motor por distribuidora con estado y métricas'),
        ('Activo', 'PDV con fecha_ultima_compra dentro de los últimos 90 días'),
        ('Inactivo', 'PDV con fecha_ultima_compra hace más de 90 días o sin ninguna compra registrada'),
        ('Ruta', 'Conjunto de PDV asignados a un vendedor para visitar en un día de la semana específico'),
        ('Vendedor', 'Representante comercial del distribuidor, identificado en el ERP y potencialmente en Telegram'),
        ('Sucursal', 'Unidad organizativa del distribuidor que agrupa vendedores y rutas'),
    ]

    t = std_table(['Término', 'Definición'], glossary, [35*mm, 130*mm], styles)
    story.append(t)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Información del Documento', styles['h3']))
    story.append(Spacer(1, 2*mm))

    doc_info = [
        ['Título', 'Shelfy — Panel de Supervisión: Documentación Técnica y Hoja de Ruta'],
        ['Versión', 'v3.1'],
        ['Fecha de generación', '26 de marzo de 2026'],
        ['Autor', 'Equipo de Desarrollo Shelfy'],
        ['Stack', 'FastAPI · Next.js 14 · Supabase · react-leaflet · Railway · Vercel'],
        ['Clasificación', 'CONFIDENCIAL — Uso interno'],
        ['Total de fases', '11 (7 completadas, 4 pendientes)'],
        ['Clientes sincronizados', '~23.200 PDV en 5 distribuidoras'],
    ]
    t = std_table(['Campo', 'Valor'], doc_info, [45*mm, 120*mm], styles)
    story.append(t)

    story.append(Spacer(1, 6*mm))
    story.append(hr(C_PRIMARY, 1))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Este documento fue generado automáticamente a partir de la base de conocimiento del proyecto Shelfy. '
        'Refleja el estado al 26 de marzo de 2026. Para versiones actualizadas, regenerar desde el script oficial.',
        ParagraphStyle('footer_note', fontName='Helvetica-Oblique', fontSize=8,
                       textColor=C_TEXT_LIGHT, alignment=TA_CENTER, leading=12)
    ))

    return story


# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print(f'Generando PDF: {OUTPUT_PATH}')

    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=22*mm,
        bottomMargin=18*mm,
        title='Shelfy — Panel de Supervisión',
        author='Shelfy Development Team',
        subject='Documentación Técnica y Hoja de Ruta v3.1',
    )

    story = build_story()

    doc.build(story, canvasmaker=HeaderFooterCanvas)

    size = os.path.getsize(OUTPUT_PATH)
    print(f'PDF generado exitosamente.')
    print(f'Ruta: {OUTPUT_PATH}')
    print(f'Tamaño: {size:,} bytes ({size / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
