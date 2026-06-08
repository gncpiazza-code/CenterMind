# -*- coding: utf-8 -*-
"""
Genera el PDF maestro del proyecto Shelfy / ShelfMind.
Ejecutar: python generate_master_doc.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import datetime

OUTPUT = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\Shelfy_Master_Doc_2026.pdf"

# ── Colores ────────────────────────────────────────────────────────────────────
C_BG       = colors.HexColor("#0f172a")   # slate-900
C_PRIMARY  = colors.HexColor("#3b82f6")   # blue-500
C_ACCENT   = colors.HexColor("#10b981")   # emerald-500
C_WARN     = colors.HexColor("#f59e0b")   # amber-500
C_DANGER   = colors.HexColor("#ef4444")   # red-500
C_MUTED    = colors.HexColor("#94a3b8")   # slate-400
C_TEXT     = colors.HexColor("#1e293b")   # slate-800
C_SURFACE  = colors.HexColor("#f1f5f9")   # slate-100
C_BORDER   = colors.HexColor("#cbd5e1")   # slate-300
C_CODE_BG  = colors.HexColor("#1e293b")
C_CODE_FG  = colors.HexColor("#e2e8f0")

W, H = A4

# ── Estilos ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def sty(name, **kw):
    return ParagraphStyle(name, **kw)

S_TITLE = sty("S_TITLE",
    fontName="Helvetica-Bold", fontSize=28, leading=34,
    textColor=colors.white, alignment=TA_LEFT)

S_SUBTITLE = sty("S_SUBTITLE",
    fontName="Helvetica", fontSize=13, leading=18,
    textColor=colors.HexColor("#94a3b8"), alignment=TA_LEFT)

S_SECTION = sty("S_SECTION",
    fontName="Helvetica-Bold", fontSize=16, leading=22,
    textColor=C_PRIMARY, spaceBefore=18, spaceAfter=6)

S_SUBSECTION = sty("S_SUBSECTION",
    fontName="Helvetica-Bold", fontSize=12, leading=16,
    textColor=C_TEXT, spaceBefore=12, spaceAfter=4)

S_BODY = sty("S_BODY",
    fontName="Helvetica", fontSize=9.5, leading=15,
    textColor=C_TEXT, spaceAfter=5)

S_BULLET = sty("S_BULLET",
    fontName="Helvetica", fontSize=9.5, leading=14,
    textColor=C_TEXT, leftIndent=14, spaceAfter=3)

S_CODE = sty("S_CODE",
    fontName="Courier", fontSize=8, leading=12,
    textColor=C_CODE_FG, backColor=C_CODE_BG,
    leftIndent=10, rightIndent=10, spaceAfter=6,
    borderPadding=(6,8,6,8))

S_NOTE = sty("S_NOTE",
    fontName="Helvetica-Oblique", fontSize=8.5, leading=13,
    textColor=colors.HexColor("#64748b"), spaceAfter=4)

S_TAG = sty("S_TAG",
    fontName="Helvetica-Bold", fontSize=8, leading=10,
    textColor=colors.white)

S_TOC = sty("S_TOC",
    fontName="Helvetica", fontSize=10, leading=16,
    textColor=C_TEXT, leftIndent=0)

S_TOC_SUB = sty("S_TOC_SUB",
    fontName="Helvetica", fontSize=9, leading=14,
    textColor=C_MUTED, leftIndent=16)

# ── Helpers ────────────────────────────────────────────────────────────────────
def H1(text): return Paragraph(text, S_SECTION)
def H2(text): return Paragraph(text, S_SUBSECTION)
def P(text):  return Paragraph(text, S_BODY)
def B(text):  return Paragraph(f"<bullet>&bull;</bullet> {text}", S_BULLET)
def N(text):  return Paragraph(f"<i>Nota: {text}</i>", S_NOTE)
def SP(n=1):  return Spacer(1, n * 0.4 * cm)
def HR():     return HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8, spaceBefore=4)

def code(txt):
    lines = txt.strip().split("\n")
    safe = "<br/>".join(l.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace(" ","&nbsp;") for l in lines)
    return Paragraph(safe, S_CODE)

def badge(text, color=C_PRIMARY):
    return Paragraph(
        f'<font name="Helvetica-Bold" color="white" size="7">&nbsp;{text}&nbsp;</font>',
        ParagraphStyle("badge", backColor=color, borderRadius=3, fontSize=7,
                       leading=11, textColor=colors.white, leftIndent=2))

def table(data, col_widths=None, header_color=C_PRIMARY):
    t = Table(data, colWidths=col_widths, hAlign="LEFT")
    n_cols = len(data[0])
    style = TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), header_color),
        ("TEXTCOLOR",     (0,0), (-1,0), colors.white),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("BOTTOMPADDING", (0,0), (-1,0), 6),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,1), (-1,-1), 5),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [C_SURFACE, colors.white]),
        ("GRID",          (0,0), (-1,-1), 0.4, C_BORDER),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",     (0,1), (-1,-1), C_TEXT),
    ])
    t.setStyle(style)
    return t

# ── Cover page ─────────────────────────────────────────────────────────────────
class CoverPage(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = W, H

    def wrap(self, availWidth, availHeight):
        return (availWidth, availHeight)

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(C_BG)
        c.rect(0, 0, W, H, fill=1, stroke=0)

        # Accent stripe
        c.setFillColor(C_PRIMARY)
        c.rect(0, H - 1.2*cm, W, 1.2*cm, fill=1, stroke=0)

        # Bottom stripe
        c.setFillColor(C_PRIMARY)
        c.rect(0, 0, W, 0.6*cm, fill=1, stroke=0)

        # Decorative circle
        c.setFillColor(colors.HexColor("#1e3a5f"))
        c.circle(W - 3*cm, H/2 + 3*cm, 6*cm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#0f2d4a"))
        c.circle(W - 2*cm, H/2 - 2*cm, 4*cm, fill=1, stroke=0)

        # Logo text
        c.setFillColor(C_PRIMARY)
        c.setFont("Helvetica-Bold", 52)
        c.drawString(2*cm, H - 6*cm, "SHELFY")

        # Tagline
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 14)
        c.drawString(2*cm, H - 7.2*cm, "Plataforma SaaS de Supervisión Comercial — Documentación Técnica Completa")

        # Horizontal rule
        c.setStrokeColor(C_PRIMARY)
        c.setLineWidth(1.5)
        c.line(2*cm, H - 7.8*cm, W - 2*cm, H - 7.8*cm)

        # Metadata block
        items = [
            ("Versión",    "2026.03"),
            ("Fecha",      datetime.now().strftime("%d/%m/%Y")),
            ("Repositorio","github.com/gncpiazza-code/CenterMind"),
            ("Frontend",   "shelfycenter.com (Vercel)"),
            ("Backend",    "api.shelfycenter.com (Railway)"),
            ("Base de datos", "Supabase — PostgreSQL 15"),
        ]
        y = H - 9*cm
        for label, val in items:
            c.setFillColor(C_MUTED)
            c.setFont("Helvetica", 9)
            c.drawString(2*cm, y, label)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(6*cm, y, val)
            y -= 0.65*cm

        # Stack badges row
        badge_items = ["FastAPI", "Next.js 16", "React 19", "Supabase", "Railway", "Vercel", "Playwright"]
        c.setFillColor(C_PRIMARY)
        c.setFont("Helvetica-Bold", 8)
        x = 2*cm
        for btext in badge_items:
            bw = len(btext) * 5.5 + 10
            c.roundRect(x, H - 14.5*cm, bw, 0.55*cm, 3, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.drawString(x + 5, H - 14.5*cm + 6, btext)
            c.setFillColor(C_PRIMARY)
            x += bw + 6

        # Footer
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 8)
        c.drawString(2*cm, 1.2*cm, "Documento confidencial — Uso interno. Migracion a macOS — 2026.")


def page_header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFillColor(C_BG)
        canvas.rect(0, H - 1.1*cm, W, 1.1*cm, fill=1, stroke=0)
        canvas.setFillColor(C_PRIMARY)
        canvas.rect(0, H - 1.1*cm, 0.4*cm, 1.1*cm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(1*cm, H - 0.7*cm, "SHELFY — Documentación Técnica 2026")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(C_MUTED)
        canvas.drawRightString(W - 1*cm, H - 0.7*cm, f"Página {doc.page}")
        # Footer
        canvas.setStrokeColor(C_BORDER)
        canvas.setLineWidth(0.3)
        canvas.line(1*cm, 1.1*cm, W - 1*cm, 1.1*cm)
        canvas.setFillColor(C_MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(1*cm, 0.5*cm, "github.com/gncpiazza-code/CenterMind · api.shelfycenter.com · shelfycenter.com")
        canvas.drawRightString(W - 1*cm, 0.5*cm, datetime.now().strftime("%d/%m/%Y"))
    canvas.restoreState()

# ── Build document ─────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=1.8*cm, bottomMargin=1.8*cm,
    onFirstPage=lambda c,d: None,
    onLaterPages=page_header_footer,
)

story = []

# ═══════════════════════════════════════════════════════════════════════════════
# COVER
# ═══════════════════════════════════════════════════════════════════════════════
story.append(CoverPage())
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# TABLE OF CONTENTS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("Índice de Contenidos"))
toc_items = [
    ("1.", "Visión General del Proyecto"),
    ("2.", "Arquitectura del Sistema"),
    ("3.", "Repositorio y Estructura de Archivos"),
    ("4.", "Backend API — FastAPI (CenterMind)"),
    ("5.", "Base de Datos — Supabase / PostgreSQL"),
    ("6.", "Frontend — Next.js / React (shelfy-frontend)"),
    ("7.", "Motores RPA — ShelfMind-RPA"),
    ("8.", "Panel de Supervisión — Detalle Técnico"),
    ("9.", "Autenticación y Multi-Tenancy"),
    ("10.", "Despliegue — Railway, Vercel, Cloudflare"),
    ("11.", "Variables de Entorno"),
    ("12.", "Guía de Migración a macOS"),
    ("13.", "Roadmap y Tareas Pendientes"),
]
for num, title in toc_items:
    story.append(Paragraph(f"<font color='#3b82f6'><b>{num}</b></font>&nbsp;&nbsp;{title}", S_TOC))
story.append(SP(2))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 1. VISIÓN GENERAL
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("1. Visión General del Proyecto"))
story.append(P(
    "SHELFY (también referenciado internamente como 'CenterMind' en el repo) es una plataforma SaaS multi-tenant "
    "para la supervisión comercial de distribuidoras de consumo masivo en Argentina. Nació como un bot de "
    "Telegram para evaluar exhibiciones en puntos de venta (PDV), y evolucionó a una plataforma web completa "
    "con panel de supervisión, mapa interactivo de rutas, ingesta automática de datos ERP, y motores RPA que "
    "automatizan la descarga de reportes desde sistemas propietarios (CHESS, Nextbyn/Sigo)."
))
story.append(SP())
story.append(H2("Productos y funcionalidades activas"))
features = [
    ["Módulo", "Descripción", "Estado"],
    ["Bot Telegram", "Evaluación de exhibiciones en PDV con foto + criterios", "Activo"],
    ["Panel Admin Web", "Gestión de usuarios, padrón, mapeo vendedores, ERP", "Activo"],
    ["Panel Supervisión", "Mapa interactivo rutas/vendedores/PDV con toggle 3 niveles", "Activo"],
    ["Motor RPA Ventas", "Descarga automática comprobantes CHESS → ventas_v2", "Activo"],
    ["Motor RPA Cuentas", "Descarga saldos CHESS → cuentas_corrientes_data", "Activo"],
    ["Scheduler RPA", "APScheduler en Railway — ventas 3x/día, cuentas 1x/día", "Activo"],
    ["Ingesta Padrón", "Excel multi-tenant → tablas _v2 de Supabase", "Activo (manual)"],
    ["Alertas PDV", "Inactivos > 90 días, rutas sin clientes activos", "Pendiente"],
    ["Notif. Telegram", "Push al vendedor cuando PDV inactivo o deuda alta", "Pendiente"],
]
story.append(table(features, col_widths=[4.5*cm, 9*cm, 3*cm]))
story.append(SP())

story.append(H2("Tenants activos (distribuidoras)"))
tenants = [
    ["tenant_id", "id_dist", "Nombre real", "URL CHESS", "Sucursal", "Estado"],
    ["tabaco", "1", "Tabaco & Hnos S.R.L.",              "tabacohermanos.chesserp.com/AR1149",  "Todas",         "Activo"],
    ["aloma",  "2", "Aloma Distribuidores Oficiales",    "alomasrl.chesserp.com/AR1252",        "Casa Central",  "Activo"],
    ["liver",  "3", "Liver SRL",                         "liversrl.chesserp.com/AR1274",        "Casa Central",  "Activo"],
    ["real",   "4", "Real Tabacalera de Santiago S.A.",  "realtabacalera.chesserp.com/AR1272",  "UEQUIN RODRIGO","Activo"],
]
story.append(table(tenants, col_widths=[1.8*cm, 1.5*cm, 5*cm, 5.5*cm, 2.5*cm, 1.8*cm]))
story.append(SP())
story.append(N("El tenant_id es el string usado en los motores RPA (Vault, logs, TENANTS dict). El id_dist es el FK entero en Supabase (id_distribuidor). "
               "La columna Sucursal indica el filtro aplicado en CHESS al descargar Excel; 'Todas' = sin filtro de sucursal. "
               "Credenciales almacenadas en Supabase Vault: chess_{tenant_id}_usuario / chess_{tenant_id}_password."))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 2. ARQUITECTURA
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("2. Arquitectura del Sistema"))
story.append(P(
    "El sistema sigue una arquitectura de tres capas desacopladas, con comunicación exclusiva via API REST "
    "y autenticación JWT. No hay servidor de estado compartido: toda la persistencia pasa por Supabase."
))
story.append(SP())

arch_data = [
    ["Capa", "Tecnología", "Hosting", "URL"],
    ["Frontend SPA", "Next.js 16 / React 19 / Tailwind 4", "Vercel", "shelfycenter.com"],
    ["Backend API", "FastAPI / Python 3.11 / Uvicorn", "Railway", "api.shelfycenter.com"],
    ["Motores RPA", "Playwright / Python / APScheduler", "Railway (servicio separado)", "N/A (interno)"],
    ["Base de datos", "Supabase (PostgreSQL 15 + Storage)", "Supabase Cloud", "supabase.co"],
    ["Bot Telegram", "python-telegram-bot 20 / Webhooks", "Railway (mismo proyecto)", "Webhook HTTPS"],
    ["Túnel local", "Cloudflare Tunnel (dev)", "Local PC / Railway", "dev solo"],
]
story.append(table(arch_data, col_widths=[3.5*cm, 5.5*cm, 4*cm, 3.5*cm]))
story.append(SP())

story.append(H2("Flujo de datos — Panel de Supervisión"))
story.append(code("""
[Browser]  →  GET /api/supervision/vendedores/{dist_id}  →  [FastAPI]
                                                              ↓
                                                    fn_supervision_vendedores()
                                                    (SQL function en Supabase)
                                                              ↓
                                                    vendedores_v2 JOIN rutas_v2
                                                    JOIN clientes_pdv_v2
                                                              ↓
[Browser]  ←  [{id_vendedor, nombre, total_pdv, pdv_activos, ...}]
"""))

story.append(H2("Flujo de datos — Motor RPA → DB"))
story.append(code("""
[CHESS ERP Web]
     ↓  Playwright (headless Chromium)
[ShelfMind-RPA Motor]
     ↓  file_bytes (Excel .xlsx)
POST /api/motor/ventas  (multipart form-data)
     ↓  ventas_ingestion_service.ingest()
     ↓  parse Excel → build_cliente_map() → batch upsert 500 rows
[Supabase ventas_v2]  +  UPDATE clientes_pdv_v2.fecha_ultima_compra
"""))

story.append(H2("Autenticación"))
story.append(P(
    "El frontend usa JWT (python-jose) con Bearer tokens. El backend valida el token en cada request via "
    "<b>verify_auth()</b> (FastAPI Depends). Los tokens incluyen: sub (usuario), rol, id_distribuidor, "
    "is_superadmin, feature flags, y exp (24hs). Los motores RPA usan una API key fija (X-Api-Key header) "
    "que actúa como superadmin interno."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 3. REPOSITORIO
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("3. Repositorio y Estructura de Archivos"))
story.append(P(
    "Un único repositorio Git en <b>github.com/gncpiazza-code/CenterMind</b>. "
    "La rama principal es <b>main</b>, de donde Railway y Vercel hacen deploy automático. "
    "Los worktrees de Claude Code están en <b>.claude/worktrees/</b> y son temporales."
))
story.append(SP())
story.append(code("""
BOT-SQL/                         ← raíz del repo git
├── CenterMind/                  ← Backend FastAPI (deploy a Railway)
│   ├── api.py                   ← 2900+ líneas — entrada principal
│   ├── requirements.txt
│   └── services/
│       ├── padron_ingestion_service.py
│       ├── ventas_ingestion_service.py
│       ├── cuentas_corrientes_service.py
│       ├── erp_ingestion_service.py
│       ├── erp_summary_service.py
│       └── system_monitoring_service.py
│
├── shelfy-frontend/             ← Frontend Next.js (deploy a Vercel)
│   ├── src/
│   │   ├── app/                 ← App Router (Next.js 13+)
│   │   │   ├── admin/page.tsx   ← Panel Admin (superadmin + admin)
│   │   │   ├── supervision/page.tsx ← Panel Supervisión (admin+supervisor)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── reportes/page.tsx
│   │   │   ├── visor/page.tsx
│   │   │   └── login/page.tsx
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── TabSupervision.tsx ← Mapa + Rutas + Ventas + Cuentas
│   │   │   │   ├── MapaRutas.tsx      ← React-Leaflet (SSR off)
│   │   │   │   ├── TabPadron.tsx
│   │   │   │   ├── TabUsuarios.tsx
│   │   │   │   ├── TabMapeoVendedores.tsx
│   │   │   │   └── TabERP.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Topbar.tsx
│   │   │       └── BottomNav.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts       ← JWT decode + localStorage
│   │   └── lib/
│   │       ├── api.ts           ← Todos los fetch functions + interfaces TS
│   │       └── constants.ts
│   ├── package.json
│   └── next.config.js
│
├── ShelfMind-RPA/               ← Motores RPA (deploy a Railway)
│   ├── scheduler.py             ← APScheduler — proceso siempre activo
│   ├── runner.py                ← CLI manual: python runner.py ventas
│   ├── Dockerfile               ← playwright/python:v1.51.0-jammy
│   ├── requirements.txt
│   ├── motores/
│   │   ├── ventas.py            ← Motor CHESS ventas
│   │   └── cuentas_corrientes.py
│   └── lib/
│       ├── api_client.py        ← Upload a FastAPI
│       └── vault_client.py      ← Secrets (env vars → Supabase Vault)
│
├── SHELFY_SUPERVISION_ROADMAP.md
└── .claude/
    └── launch.json              ← Dev server config (MCP preview)
"""))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 4. BACKEND API
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("4. Backend API — FastAPI (CenterMind)"))
story.append(P(
    "El archivo <b>CenterMind/api.py</b> es el núcleo del backend. ~2900 líneas. "
    "Corre con Uvicorn en Railway. Expone endpoints REST con autenticación JWT + API Key. "
    "Usa el cliente Python de Supabase (supabase-py v2) con service role key (bypassa RLS)."
))
story.append(SP())

story.append(H2("Librerías principales (requirements.txt)"))
libs_be = [
    ["Librería", "Versión", "Uso"],
    ["fastapi", ">=0.100.0", "Framework web async"],
    ["uvicorn", ">=0.22.0", "Servidor ASGI"],
    ["supabase", ">=2.3.0", "Cliente Supabase (PostgreSQL)"],
    ["python-jose[cryptography]", ">=3.3.0", "JWT encode/decode"],
    ["python-telegram-bot", ">=20.0", "Bot Telegram (webhooks)"],
    ["pandas", ">=2.0.0", "Procesamiento Excel/CSV"],
    ["openpyxl", ">=3.1.0", "Leer .xlsx"],
    ["python-multipart", ">=0.0.6", "Upload de archivos (Form)"],
    ["httpx", ">=0.25.0", "HTTP client async"],
    ["apscheduler", ">=3.10.0", "Scheduler interno (deprecated, usar RPA)"],
    ["psutil", ">=5.9.0", "Monitoreo de procesos"],
    ["certifi", ">=2023.0.0", "SSL cert fix Windows"],
    ["python-dotenv", ">=1.0.0", "Variables de entorno"],
]
story.append(table(libs_be, col_widths=[5.5*cm, 3*cm, 8*cm]))
story.append(SP())

story.append(H2("Endpoints principales"))
eps = [
    ["Método", "Path", "Descripción", "Auth"],
    ["POST", "/auth/login", "Login → JWT token", "Ninguna"],
    ["GET", "/api/dashboard/kpis/{dist_id}", "KPIs principales", "JWT"],
    ["GET", "/api/stats/{dist_id}", "Stats hoy", "JWT"],
    ["GET", "/api/supervision/vendedores/{dist_id}", "Vendedores con stats", "JWT"],
    ["GET", "/api/supervision/rutas/{id_vendedor}", "Rutas de un vendedor", "JWT"],
    ["GET", "/api/supervision/clientes/{id_ruta}", "PDVs de una ruta", "JWT"],
    ["GET", "/api/supervision/ventas/{dist_id}", "Ventas por vendedor (7/30/90d)", "JWT"],
    ["GET", "/api/supervision/cuentas/{dist_id}", "Cuentas corrientes por vendedor", "JWT"],
    ["POST", "/api/motor/ventas", "Recibe Excel ventas del RPA", "API Key"],
    ["POST", "/api/motor/cuentas", "Recibe Excel cuentas del RPA", "API Key"],
    ["GET", "/api/padron/upload", "Subir padrón Excel multi-tenant", "JWT"],
    ["GET", "/api/admin/distribuidoras", "Lista de distribuidoras", "JWT"],
    ["GET/POST", "/api/admin/usuarios", "CRUD usuarios portal", "JWT"],
    ["POST", "/api/evaluar", "Evaluar exhibición", "JWT"],
    ["GET", "/api/erp/contexto-cliente/{dist}/{nro}", "Contexto ERP de un cliente", "JWT"],
]
story.append(table(eps, col_widths=[1.8*cm, 6.5*cm, 6*cm, 2.2*cm]))
story.append(SP())

story.append(H2("check_dist_permission — Lógica de aislamiento de tenant"))
story.append(code("""
def check_dist_permission(payload: dict, required_dist_id: int):
    if payload.get("is_superadmin"):
        return True                    # Superadmin ve todo
    user_dist_id = payload.get("id_distribuidor")
    if user_dist_id != required_dist_id:
        raise HTTPException(403, "No tienes permisos para esta distribuidora")
    check_distributor_status(required_dist_id, payload)  # Estado Activo/Bloqueado
    return True
"""))
story.append(SP())

story.append(H2("Servicios (CenterMind/services/)"))
svcs = [
    ["Servicio", "Función principal"],
    ["padron_ingestion_service.py", "Parsea Excel multi-tenant → upsert sucursales/vendedores/rutas/clientes _v2"],
    ["ventas_ingestion_service.py", "Parsea Excel CHESS → upsert ventas_v2 + update fecha_ultima_compra"],
    ["cuentas_corrientes_service.py", "Parsea Excel CHESS saldos → JSON estructurado → cuentas_corrientes_data"],
    ["erp_ingestion_service.py", "Ingesta archivos ERP (clientes, sucursales, vendedores, ventas legacy)"],
    ["erp_summary_service.py", "Genera resúmenes y reportes desde datos ERP"],
    ["system_monitoring_service.py", "Health checks, monitoreo de procesos y estado del sistema"],
]
story.append(table(svcs, col_widths=[6.5*cm, 10*cm]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 5. BASE DE DATOS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("5. Base de Datos — Supabase / PostgreSQL"))
story.append(P(
    "Supabase con PostgreSQL 15. El cliente Python usa service_role key (bypassa RLS). "
    "El frontend NO accede a Supabase directamente — todo va a través del FastAPI backend. "
    "Las funciones SQL (fn_*) están definidas en Supabase directamente."
))
story.append(SP())

story.append(H2("Tablas principales — Serie _v2 (supervisión)"))
story.append(code("""
sucursales_v2
  id_sucursal     BIGSERIAL PK
  id_distribuidor BIGINT FK → distribuidores(id_distribuidor)
  id_sucursal_erp TEXT                    -- ID del ERP
  nombre_erp      TEXT                    -- Nombre en CHESS
  UNIQUE(id_distribuidor, id_sucursal_erp)

vendedores_v2
  id_vendedor     BIGSERIAL PK
  id_distribuidor BIGINT FK → distribuidores
  id_sucursal     BIGINT FK → sucursales_v2
  nombre_erp      TEXT
  id_vendedor_erp TEXT
  UNIQUE(id_distribuidor, id_sucursal, id_vendedor_erp)

rutas_v2
  id_ruta         BIGSERIAL PK
  id_vendedor     BIGINT FK → vendedores_v2
  nombre_ruta     TEXT
  id_ruta_erp     TEXT
  dia_semana      TEXT        -- Lunes / Martes / ... / Variable
  UNIQUE(id_vendedor, id_ruta_erp)

clientes_pdv_v2
  id_cliente           BIGSERIAL PK
  id_ruta              BIGINT FK → rutas_v2
  id_distribuidor      BIGINT FK → distribuidores
  id_cliente_erp       TEXT
  nombre_fantasia      TEXT
  nombre_razon_social  TEXT
  domicilio, localidad, provincia  TEXT
  canal                TEXT
  latitud, longitud    NUMERIC
  fecha_ultima_compra  DATE    -- ← actualizada por motor RPA ventas
  fecha_alta           DATE    -- ← desde el padrón Excel
  es_limbo             BOOLEAN DEFAULT false
  UNIQUE(id_distribuidor, id_cliente_erp)
"""))
story.append(SP())

story.append(H2("Tablas de datos de motores"))
story.append(code("""
ventas_v2
  id              BIGSERIAL PK
  id_distribuidor BIGINT FK
  tenant_id       TEXT        -- "tabaco" | "aloma" | "liver" | "real"
  tipo_archivo    TEXT        -- "resumido" | "detallado"
  fecha           DATE
  sucursal, vendedor, cliente  TEXT
  id_cliente      BIGINT FK → clientes_pdv_v2   (nullable)
  canal, subcanal, comprobante, numero, tipo_operacion  TEXT
  es_anulado      BOOLEAN DEFAULT false
  es_devolucion   BOOLEAN DEFAULT false
  monto_total, monto_contado, monto_ctacte      NUMERIC
  monto_recibo, monto_recaudado                 NUMERIC
  UNIQUE(id_distribuidor, fecha, numero, comprobante)

cuentas_corrientes_data
  id              BIGSERIAL PK
  tenant_id       TEXT
  id_distribuidor BIGINT
  fecha           DATE
  data            JSONB    -- {metadatos: {...}, detalle_cuentas: [...]}
  file_b64        TEXT     -- Excel original en base64

  -- data.metadatos: {total_deuda, clientes_deudores, promedio_dias_retraso}
  -- data.detalle_cuentas[]: {sucursal, vendedor, cliente, deuda_total,
  --   antiguedad, rango_antiguedad, cantidad_comprobantes, es_valido}
  -- rango_antiguedad: "1-7 Días" | "8-15 Días" | "16-21 Días" | "22-30 Días" | "+30 Días"
"""))
story.append(SP())

story.append(H2("Tablas de sistema"))
sys_tables = [
    ["Tabla", "Descripción"],
    ["distribuidores", "Registro de cada tenant: nombre, token_bot, feature_flags, estado_operativo"],
    ["usuarios_portal", "Usuarios web: usuario_login, rol, id_distribuidor, activo, hashed_password"],
    ["integrantes_grupo", "Miembros del grupo Telegram: id_vendedor_v2 (vínculo mapeo vendedores)"],
    ["exhibiciones", "Evaluaciones de exhibiciones (legacy, sigue activo)"],
    ["clientes_pdv (legacy)", "Tabla original de PDV — NO usar para supervisión, usar _v2"],
    ["motor_runs", "Log de ejecuciones de motores RPA (estado, duracion, errores)"],
]
story.append(table(sys_tables, col_widths=[5*cm, 11.5*cm]))
story.append(SP())

story.append(H2("SQL Functions en Supabase"))
story.append(code("""
fn_supervision_vendedores(p_dist_id BIGINT)
  → RETURNS TABLE(id_vendedor, nombre_vendedor, sucursal_nombre (usa s.nombre_erp),
                  total_rutas, total_pdv, pdv_activos, pdv_inactivos)
  → Criterio activo: clientes_pdv_v2.fecha_ultima_compra >= CURRENT_DATE - 90

fn_supervision_rutas(p_id_vendedor BIGINT)
  → RETURNS TABLE(id_ruta, nombre_ruta, dia_semana, total_pdv)

fn_login(p_usuario TEXT, p_password TEXT)
  → Valida credenciales, retorna perfil de usuario con id_distribuidor, rol, is_superadmin

leer_secreto_vault(secret_name TEXT)
  → Lee un secreto del Supabase Vault (usado por vault_client.py)
"""))
story.append(SP())
story.append(N("IMPORTANTE: sucursales_v2 usa 'nombre_erp' (NO 'nombre'). "
               "Si se recrea fn_supervision_vendedores hay que usar s.nombre_erp."))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 6. FRONTEND
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("6. Frontend — Next.js 16 / React 19"))
story.append(P(
    "SPA deployada en Vercel. Usa App Router (Next.js 13+). Sin SSR en producción para componentes "
    "con estado de auth. El mapa (react-leaflet) siempre se importa con <b>dynamic(..., ssr: false)</b> "
    "para evitar errores de hydration."
))
story.append(SP())

story.append(H2("Stack frontend"))
fe_stack = [
    ["Librería", "Versión", "Uso"],
    ["next", "16.1.6", "Framework React con App Router"],
    ["react / react-dom", "19.2.3", "UI library"],
    ["typescript", "5.9.3", "Tipado estático"],
    ["tailwindcss", "4.x", "Estilos utility-first"],
    ["lucide-react", "0.575.0", "Iconos SVG"],
    ["react-leaflet", "5.0.0", "Mapa interactivo (OpenStreetMap tiles)"],
    ["leaflet", "1.9.4", "Engine del mapa"],
    ["recharts", "3.7.0", "Gráficos (pendiente uso en cuentas)"],
    ["react-hot-toast / sonner", "latest", "Notificaciones toast"],
    ["react-hook-form", "7.x", "Formularios"],
    ["@tanstack/react-query", "5.x", "Data fetching / caché (parcial)"],
    ["framer-motion", "12.x", "Animaciones"],
    ["xlsx", "0.18.5", "Export Excel desde frontend"],
    ["date-fns", "4.x", "Formateo de fechas"],
]
story.append(table(fe_stack, col_widths=[5*cm, 3*cm, 8.5*cm]))
story.append(SP())

story.append(H2("Rutas (App Router)"))
routes = [
    ["Ruta", "Acceso", "Descripción"],
    ["/login", "Público", "Login con usuario/contraseña → JWT"],
    ["/dashboard", "Todos los roles", "KPIs, ranking vendedores, evolución temporal"],
    ["/admin", "superadmin, admin", "Panel: Supervisión, Padrón, Usuarios, ERP, etc."],
    ["/supervision", "superadmin, admin, supervisor", "Panel supervisión: mapa + ventas + cuentas"],
    ["/reportes", "superadmin, admin", "Reportes: Exhibición, Cuentas Corrientes, SIGO"],
    ["/visor", "Todos", "Visor de evaluaciones de exhibición"],
    ["/bonos", "Todos", "Módulo de bonos (en construcción)"],
    ["/academy", "Todos", "Material de capacitación"],
],
story.append(table(*routes, col_widths=[4*cm, 4*cm, 8.5*cm]))
story.append(SP())

story.append(H2("Componentes clave"))
story.append(code("""
src/components/admin/
├── TabSupervision.tsx    ← Mapa + Panel cascada + Ventas + Cuentas (~800 líneas)
│     Estados: selectedDist, selectedSucursal, vendedores, rutas, clientes
│              visibleVends, visibleRutas, visibleClientes (3-level toggle)
│              ventasData, cuentasData, ventasDias (7|30|90)
│     Lazy loading: rutas/clientes se cargan on-demand por accordion
│     Cache: Set de IDs en memory, no se re-fetcha hasta refresh manual
│
├── MapaRutas.tsx         ← React-Leaflet, CartoDB dark tiles, no API key
│     Props: pines: PinCliente[]  {id, lat, lng, nombre, color, activo, ...}
│     Activos: color del vendedor, tamaño normal
│     Inactivos: gris, smaller, opacity 0.25
│     Popup: nombre, vendedor, ultima compra, badge "Inactivo" si corresponde
│
├── TabPadron.tsx         ← Upload Excel padrón multi-tenant
├── TabMapeoVendedores.tsx← Vincular vendedor_v2 ↔ integrante Telegram
├── TabUsuarios.tsx       ← CRUD usuarios portal web
└── TabERP.tsx            ← Upload de archivos ERP / mapeo

src/hooks/
└── useAuth.ts            ← parseStoredUser() del localStorage/cookie
                             switchDistributor() para superadmin
                             shelfy_active_dist en localStorage

src/lib/
└── api.ts                ← Todas las interfaces TypeScript + fetch functions
                             apiFetch() con Authorization: Bearer {token}
"""))
story.append(SP())

story.append(H2("Variables CSS (theming)"))
story.append(code("""
/* globals.css — variables Shelfy dark theme */
--shelfy-bg:      #0f172a   /* slate-900 */
--shelfy-panel:   #1e293b   /* slate-800 */
--shelfy-border:  #334155   /* slate-700 */
--shelfy-text:    #f1f5f9   /* slate-100 */
--shelfy-muted:   #94a3b8   /* slate-400 */
--shelfy-primary: #3b82f6   /* blue-500  */
"""))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 7. MOTORES RPA
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("7. Motores RPA — ShelfMind-RPA"))
story.append(P(
    "Servicio Python independiente que automatiza la descarga de reportes desde el ERP CHESS "
    "(sistema web propietario) usando Playwright (Chromium headless). "
    "Corre en Railway como un servicio 'always-on' separado del API. "
    "El scheduler usa APScheduler con BackgroundScheduler en zona horaria Argentina."
))
story.append(SP())

story.append(H2("Stack RPA"))
rpa_stack = [
    ["Librería", "Versión", "Uso"],
    ["playwright", "1.51.0", "Automatización browser (Chromium headless)"],
    ["apscheduler", "3.10.4", "Scheduler de jobs con cron triggers"],
    ["httpx", "0.27.0", "Upload de archivos a la API (multipart)"],
    ["pandas", "2.2.3", "Parseo de Excel descargados"],
    ["openpyxl", "3.1.5", "Engine de pandas para .xlsx"],
    ["numpy", "1.26.4", "Dependencia de pandas"],
    ["python-dotenv", "1.0.1", "Cargar .env local"],
    ["supabase", "2.15.0", "Fallback para leer secretos del Vault"],
    ["pytz", "2024.1", "Timezone Argentina para el scheduler"],
]
story.append(table(rpa_stack, col_widths=[4.5*cm, 2.5*cm, 9.5*cm]))
story.append(SP())

story.append(H2("Tenants configurados en los motores"))
story.append(code("""
# ventas.py y cuentas_corrientes.py — TENANTS dict
TENANTS = {
    "tabaco": {"activo": True, "url": "...", "usuario": "...", "password": "...",
               "sucursal_target": "UEQUIN RODRIGO",   # solo esta sucursal
               "sucursal_idx": 8},                    # posición en el listado CHESS
    "aloma":  {"activo": True, ...},
    "liver":  {"activo": True, ...},
    "real":   {"activo": True, ...},
}
"""))
story.append(SP())

story.append(H2("Schedule de ejecución"))
sched = [
    ["Job ID", "Hora (AR)", "Motor", "Frecuencia"],
    ["ventas_0700", "07:00", "Motor Ventas", "Diario"],
    ["ventas_1500", "15:00", "Motor Ventas", "Diario"],
    ["ventas_2300", "23:00", "Motor Ventas", "Diario"],
    ["cuentas_0700", "07:00", "Motor Cuentas Corrientes", "Diario"],
    ["padron_0400", "04:00", "Trigger HTTP → /api/motor/padron-trigger", "Diario"],
]
story.append(table(sched, col_widths=[3.5*cm, 3*cm, 6*cm, 4*cm]))
story.append(SP())

story.append(H2("Flujo Motor Ventas"))
story.append(code("""
run() [async]:
  para cada tenant activo:
    1. abrir_chess() — login con Playwright
    2. navegar a /#/ventas/reportes/comprobantes
    3. _configurar_sucursal() — seleccionar sucursal correcta
       *** FIX CRÍTICO: usar while True + nth(0).click() ***
       *** NO usar for i in range(n): nth(i).click()     ***
       *** El NodeList es live → al clickear nth(0) desaparece →  ***
       *** nth(1) se convierte en nuevo nth(0) → se saltea items   ***
    4. _configurar_fechas(fecha_desde, fecha_hasta)
    5. esperar descarga → file_bytes
    6. subir_ventas(tenant_id, "resumido", filename, file_bytes)
       → POST /api/motor/ventas [multipart]
    7. ventas_ingestion_service.ingest() → upsert ventas_v2
"""))
story.append(SP())

story.append(H2("Bug crítico corregido: shifting index"))
story.append(code("""
# INCORRECTO (saltea items):
opciones = page.locator('mat-option')
count = await opciones.count()
for i in range(count):
    await opciones.nth(i).click()

# CORRECTO (while con nth(0)):
while True:
    marcadas = page.locator('mat-option[aria-selected="true"]')
    if await marcadas.count() == 0:
        break
    await marcadas.nth(0).click()
    await page.wait_for_timeout(150)
"""))
story.append(SP())

story.append(H2("Dockerfile (Railway)"))
story.append(code("""
FROM mcr.microsoft.com/playwright/python:v1.51.0-jammy
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium --with-deps
COPY . .
ENV RPA_HEADLESS=true
ENV PYTHONUNBUFFERED=1
CMD ["python", "scheduler.py"]
"""))
story.append(SP())

story.append(H2("Runner manual (desarrollo)"))
story.append(code("""
python runner.py ventas             # corre motor ventas para todos los tenants
python runner.py ventas 2026-03-01  # con fecha desde
python runner.py cuentas            # motor cuentas corrientes
python runner.py padron             # trigger HTTP del padrón
python runner.py todos              # todos los motores
"""))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 8. PANEL DE SUPERVISIÓN
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("8. Panel de Supervisión — Detalle Técnico"))
story.append(SP())

story.append(H2("Layout general"))
story.append(code("""
TabSupervision (flex-col gap-4):
│
├── Top bar: título "Rutas de Venta" + selector dist (superadmin) + refresh
│
├── Grid xl:5cols (altura fija 680px):
│   ├── Mapa (3 cols) — react-leaflet, CartoDB dark tiles
│   │   ├── Badge: "N PDV visibles"
│   │   └── Leyenda: ● activo  ● sin actividad
│   │
│   └── Panel derecho (2 cols, overflow-y scroll):
│       ├── Selector sucursal (tabs por sucursal)
│       └── Cards vendedor (por cada uno en sucursal seleccionada):
│           ├── Avatar + Nombre + Sucursal     [👁 toggle mapa]
│           ├── Stats: N PDV · N rutas
│           ├── Barra activos (color vendedor, %)
│           └── Accordion: Rutas
│               └── Por cada ruta:
│                   ├── DiaBadge + nombre + total PDV  [👁]
│                   └── Accordion: Clientes PDV
│                       └── Por cada cliente:
│                           ├── Dot (color/gris) + nombre  [👁]
│                           └── Accordion detail: dirección, canal, fechas
│
├── Sección Ventas (card full-width):
│   ├── Header: ⬆ Ventas + range (7d/30d/90d) + ↓CSV
│   ├── Stats: Facturado | Recaudado | Comprobantes
│   └── Accordion por vendedor → tabla transacciones
│
└── Sección Cuentas Corrientes (card full-width):
    ├── Header: 💳 Cuentas + "Al DD/MM/YYYY" + ↓CSV
    ├── Stats: Deuda Total | Clientes Deudores | Prom. Días Atraso
    └── Accordion por vendedor → tabla clientes deudores (rango aging)
"""))
story.append(SP())

story.append(H2("Visibilidad 3 niveles (map pins)"))
story.append(P(
    "Cada PDV aparece en el mapa <b>si y solo si</b> los 3 niveles están ON: "
    "<b>visibleVends</b> ∩ <b>visibleRutas</b> ∩ <b>visibleClientes</b>. "
    "Los 3 estados son Sets independientes de IDs. El pin es del color del vendedor si está activo "
    "(fecha_ultima_compra ≤ 90 días), gris con opacidad 0.25 si inactivo."
))
story.append(SP())

story.append(H2("Isolamiento de tenant en el frontend"))
story.append(code("""
// TabSupervision.tsx — fix crítico para auth asíncrona
// useState(distId) se inicializa UNA SOLA VEZ → si user carga async,
// distId empieza en 0 y selectedDist queda en 0 para siempre.

useEffect(() => {
  // Sync selectedDist cuando distId cambia (después de que carga el auth)
  if (!isSuperadmin && distId > 0 && distId !== selectedDist) {
    setSelectedDist(distId);
  }
}, [distId, isSuperadmin]);

// Además, limpiar datos al cambiar de distribuidor (evitar flicker cross-tenant)
useEffect(() => {
  if (!selectedDist) return;
  setVentasData(null);   // ← limpiar antes de fetch
  fetchVentasSupervision(selectedDist, ventasDias).then(setVentasData)...
}, [selectedDist, ventasDias]);
"""))
story.append(SP())

story.append(H2("Datos de ventas_v2 en producción (al 2026-03-27)"))
ventas_data = [
    ["Tenant", "Registros en ventas_v2", "id_distribuidor"],
    ["tabaco — Tabaco & Hnos S.R.L.",            "1.470", "1"],
    ["aloma  — Aloma Distribuidores Oficiales",   "221",   "2"],
    ["liver  — Liver SRL",                        "144",   "3"],
    ["real   — Real Tabacalera de Santiago S.A.", "37",    "4"],
    ["TOTAL", "1.872", "—"],
]
story.append(table(ventas_data, col_widths=[6*cm, 3.5*cm, 7*cm]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 9. AUTENTICACIÓN Y MULTI-TENANCY
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("9. Autenticación y Multi-Tenancy"))
story.append(SP())

story.append(H2("Roles del sistema"))
roles = [
    ["Rol", "Acceso", "id_distribuidor en JWT"],
    ["superadmin", "Todo. Puede cambiar de distribuidor con selector", "null (usa shelfy_active_dist en localStorage)"],
    ["admin", "Su distribuidora: Admin panel + Supervisión", "Fijo al suyo"],
    ["supervisor", "Solo Supervisión + Dashboard", "Fijo al suyo"],
    ["usuario", "Solo Dashboard + Visor", "Fijo al suyo"],
]
story.append(table(roles, col_widths=[3*cm, 5.5*cm, 8*cm]))
story.append(SP())

story.append(H2("JWT payload"))
story.append(code("""
{
  "sub":                "usuario_login",
  "id_usuario":         42,
  "rol":                "admin",           // superadmin | admin | supervisor | usuario
  "id_distribuidor":    1,                 // null para superadmin puro
  "nombre_empresa":     "Real Tabacalera",
  "is_superadmin":      false,
  "usa_quarentena":     true,              // feature flag
  "usa_contexto_erp":   false,
  "usa_mapeo_vendedores": true,
  "exp":                1711234567         // 24 horas
}
"""))
story.append(SP())

story.append(H2("useAuth.ts — flujo de autenticación"))
story.append(code("""
1. login(usuario, password) → POST /auth/login → recibe JWT
2. setToken(token) → localStorage + cookie (24hs, SameSite=Lax)
3. parseStoredUser() → JSON.parse(atob(token.split('.')[1]))
4. user.id_distribuidor → usado en todos los fetch como parámetro de ruta
5. switchDistributor(id, nombre) → solo superadmin
   → actualiza user state en memoria + shelfy_active_dist en localStorage
   → window.location.reload()
"""))
story.append(SP())

story.append(H2("Multi-tenancy en la API"))
story.append(P(
    "Todo endpoint que accede a datos de una distribuidora llama a "
    "<b>check_dist_permission(user_payload, dist_id)</b>. Los superadmin bypassen el check. "
    "Los non-superadmin reciben 403 si intentan acceder a otro dist_id. "
    "El query siempre incluye .eq('id_distribuidor', dist_id) para filtro adicional."
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 10. DESPLIEGUE
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("10. Despliegue — Railway, Vercel, Cloudflare"))
story.append(SP())

story.append(H2("Railway (Backend API + RPA)"))
story.append(P(
    "Railway detecta el repositorio de GitHub y auto-deploya en cada push a main. "
    "Hay dos servicios en el mismo proyecto Railway:"
))
deploy_rail = [
    ["Servicio", "Root dir", "Start command", "URL"],
    ["CenterMind API", "CenterMind/", "uvicorn api:app --host 0.0.0.0 --port $PORT", "api.shelfycenter.com"],
    ["ShelfMind RPA", "ShelfMind-RPA/", "docker build + CMD python scheduler.py", "No expuesto"],
]
story.append(table(deploy_rail, col_widths=[4*cm, 3.5*cm, 6.5*cm, 3.5*cm]))
story.append(SP())
story.append(P("Railway provee las variables de entorno definidas en el dashboard. "
               "El servicio RPA usa un Dockerfile (playwright/python image) para tener Chromium disponible."))
story.append(SP())

story.append(H2("Vercel (Frontend)"))
story.append(P(
    "Vercel auto-deploya el directorio shelfy-frontend/ en cada push a main. "
    "Framework preset: Next.js. Build command: next build. Output dir: .next. "
    "Variables de entorno definidas en Vercel dashboard."
))
story.append(SP())

story.append(H2("Cloudflare Tunnel (desarrollo local)"))
story.append(code("""
# Ejecutar en PC local para exponer el API local via HTTPS
cloudflared tunnel run <nombre-tunel>
# Apunta a localhost:8000 → url pública HTTPS
# Usado SOLO en desarrollo — en producción el API corre directo en Railway
"""))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 11. VARIABLES DE ENTORNO
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("11. Variables de Entorno"))
story.append(SP())

story.append(H2("CenterMind API (Railway)"))
env_api = [
    ["Variable", "Descripción", "Ejemplo"],
    ["SUPABASE_URL", "URL del proyecto Supabase", "https://xxx.supabase.co"],
    ["SUPABASE_SERVICE_KEY", "Service role key (bypassa RLS)", "eyJh..."],
    ["SHELFY_API_KEY", "API key para motores RPA (X-Api-Key)", "shelfy_xxxxx"],
    ["JWT_SECRET", "Secret para firmar JWT tokens", "supersecret_xxx"],
    ["JWT_EXPIRE_HOURS", "Expiración de tokens (default 24)", "24"],
    ["SUPABASE_KEY", "Fallback de SUPABASE_SERVICE_KEY", "eyJh..."],
    ["PORT", "Puerto (lo asigna Railway automático)", "8000"],
]
story.append(table(env_api, col_widths=[5*cm, 7*cm, 4.5*cm]))
story.append(SP())

story.append(H2("ShelfMind RPA (Railway)"))
env_rpa = [
    ["Variable", "Descripción"],
    ["SHELFY_API_URL", "URL del backend: https://api.shelfycenter.com"],
    ["SHELFY_API_KEY", "Misma API key que el backend espera"],
    ["RPA_HEADLESS", "'true' en Railway, 'false' para debug local con ventana visible"],
    ["SUPABASE_URL", "Para vault_client.py (fallback de secrets)"],
    ["SUPABASE_SERVICE_KEY", "Para vault_client.py"],
    ["CHESS_USER_tabaco", "Usuario CHESS para tenant tabaco"],
    ["CHESS_PASS_tabaco", "Contraseña CHESS para tenant tabaco"],
    ["CHESS_USER_aloma", "Usuario CHESS para tenant aloma"],
    ["CHESS_PASS_aloma", "Contraseña CHESS para tenant aloma"],
    ["... (mismo patrón para liver y real)", ""],
]
story.append(table(env_rpa, col_widths=[6*cm, 10.5*cm]))
story.append(SP())

story.append(H2("shelfy-frontend (Vercel)"))
env_fe = [
    ["Variable", "Descripción"],
    ["NEXT_PUBLIC_API_URL", "URL del backend: https://api.shelfycenter.com"],
]
story.append(table(env_fe, col_widths=[6*cm, 10.5*cm]))
story.append(SP())
story.append(N("En desarrollo local el frontend usa .env.local con NEXT_PUBLIC_API_URL=http://localhost:8000 "
               "o la URL del tunnel de Cloudflare."))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 12. MIGRACIÓN A macOS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("12. Guía de Migración a macOS"))
story.append(P(
    "Esta sección es una guía paso a paso para levantar el entorno de desarrollo completo en macOS. "
    "Todos los componentes son compatibles con macOS (Apple Silicon y Intel)."
))
story.append(SP())

story.append(H2("1. Herramientas base"))
story.append(code("""
# Homebrew (gestor de paquetes macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Python 3.11+ (recomendado usar pyenv)
brew install pyenv
pyenv install 3.11.9
pyenv global 3.11.9

# Node.js 20+ (recomendado nvm)
brew install nvm
nvm install 20
nvm use 20

# Git
brew install git

# Cloudflare Tunnel (para desarrollo local)
brew install cloudflare/cloudflare/cloudflared
"""))
story.append(SP())

story.append(H2("2. Clonar el repositorio"))
story.append(code("""
git clone https://github.com/gncpiazza-code/CenterMind.git BOT-SQL
cd BOT-SQL
"""))
story.append(SP())

story.append(H2("3. Backend API (CenterMind)"))
story.append(code("""
cd CenterMind

# Crear entorno virtual
python -m venv .venv
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo de variables de entorno
cat > .env << 'EOF'
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=eyJh...tu_service_key...
SHELFY_API_KEY=shelfy_tu_api_key
JWT_SECRET=tu_jwt_secret_muy_largo
JWT_EXPIRE_HOURS=24
EOF

# Iniciar servidor de desarrollo
uvicorn api:app --host 0.0.0.0 --port 8000 --reload

# El API estará en http://localhost:8000
# Docs interactivas: http://localhost:8000/docs
"""))
story.append(SP())
story.append(N("En macOS NO es necesario el fix de certifi (era específico para Windows). "
               "El bloque try/except en api.py maneja esto de forma silenciosa."))
story.append(SP())

story.append(H2("4. Frontend (shelfy-frontend)"))
story.append(code("""
cd shelfy-frontend

# Instalar dependencias
npm install

# Variables de entorno locales
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

# Iniciar servidor de desarrollo
npm run dev

# Frontend en http://localhost:3000
"""))
story.append(SP())

story.append(H2("5. Motores RPA (ShelfMind-RPA)"))
story.append(code("""
cd ShelfMind-RPA

# Crear entorno virtual separado (recomendado)
python -m venv .venv
source .venv/bin/activate

# Instalar dependencias (incluyendo Playwright)
pip install -r requirements.txt

# Instalar Chromium para Playwright
playwright install chromium

# Variables de entorno
cat > .env << 'EOF'
SHELFY_API_URL=http://localhost:8000
SHELFY_API_KEY=shelfy_tu_api_key
RPA_HEADLESS=false       # false = ventana visible (útil para debug)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=eyJh...

# Credenciales CHESS por tenant (pedir al equipo)
CHESS_USER_tabaco=...
CHESS_PASS_tabaco=...
CHESS_URL_tabaco=https://chess.realtabacalera.com.ar
# ...etc para aloma, liver, real
EOF

# Correr un motor manualmente
python runner.py ventas
python runner.py cuentas

# Iniciar scheduler completo
python scheduler.py
"""))
story.append(SP())
story.append(N("En macOS, Playwright descarga automáticamente Chromium en ~/Library/Caches/ms-playwright/. "
               "No se necesita instalar Chrome por separado."))
story.append(SP())

story.append(H2("6. Cloudflare Tunnel (exponer API local)"))
story.append(code("""
# Autenticar con Cloudflare (solo primera vez)
cloudflared tunnel login

# Crear tunnel (solo primera vez)
cloudflared tunnel create shelfy-dev

# Configurar routing (solo primera vez)
cloudflared tunnel route dns shelfy-dev dev-api.shelfycenter.com

# Iniciar tunnel apuntando al backend local
cloudflared tunnel run --url http://localhost:8000 shelfy-dev

# Actualizar NEXT_PUBLIC_API_URL en shelfy-frontend/.env.local
# NEXT_PUBLIC_API_URL=https://dev-api.shelfycenter.com
"""))
story.append(SP())

story.append(H2("7. Verificación del entorno"))
story.append(code("""
# ✅ Backend
curl http://localhost:8000/health          # debe retornar {"status":"ok"}
open http://localhost:8000/docs            # Swagger UI

# ✅ Frontend
open http://localhost:3000/login           # Login page

# ✅ RPA (test sin subir archivos)
cd ShelfMind-RPA && python -c "
from lib.vault_client import verificar_vault
print('Vault OK:', verificar_vault())
"

# ✅ Motor ventas (test conexión CHESS)
python runner.py ventas --dry-run          # si implementado, o simplemente:
python runner.py ventas                    # corre real
"""))
story.append(SP())

story.append(H2("8. Diferencias Windows → macOS"))
mac_diff = [
    ["Aspecto", "Windows", "macOS"],
    ["Python", "Instalador .exe / py launcher", "pyenv (recomendado)"],
    ["Node", "nvm-windows / instalador", "nvm via brew"],
    ["Rutas de archivo", "C:\\Users\\...\\archivo.txt", "~/Documents/archivo.txt"],
    ["Variables de entorno", "$env:VAR = 'value' (PowerShell)", "export VAR=value (bash/zsh)"],
    ["Playwright Chromium", "~/AppData/Local/ms-playwright", "~/Library/Caches/ms-playwright"],
    ["certifi fix", "Necesario (REQUESTS_CA_BUNDLE)", "No necesario (manejo automático)"],
    ["vault_client .env path", "Hardcodeado a C:/Users/cigar/...", "Cambiar a ruta macOS o usar env vars"],
    ["Preview MCP server", "cmd.exe spawn falla (bug conocido)", "Debería funcionar correctamente"],
    ["Rutas en código", "Verificar backslashes hardcodeados", "Usar Path() o forward slashes"],
],
story.append(table(*mac_diff, col_widths=[4*cm, 5*cm, 7.5*cm]))
story.append(SP())

story.append(H2("9. Archivo crítico a modificar en macOS"))
story.append(code("""
# lib/vault_client.py — LÍNEA 4: path hardcodeado de Windows
# CAMBIAR:
load_dotenv(dotenv_path="C:/Users/cigar/OneDrive/Desktop/BOT-SQL/antigravity/...")

# POR (usar variable de entorno o ruta relativa):
from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")
# O simplemente:
load_dotenv()  # busca .env en el directorio actual y parents
"""))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# 13. ROADMAP
# ═══════════════════════════════════════════════════════════════════════════════
story.append(H1("13. Roadmap y Tareas Pendientes"))
story.append(SP())

story.append(H2("Estado actual de fases (al 27/03/2026)"))
roadmap = [
    ["Fase", "Descripción", "Estado"],
    # ─ Fundación ─────────────────────────────────────────────────────────────
    ["1",        "Padrón multi-tenant: ingesta Excel multi-hoja → sucursales/vendedores/rutas/clientes_v2", "✓ COMPLETA"],
    ["2",        "Mapeo Vendedor ERP ↔ Integrante Telegram (tab UI + fuzzy match)", "✓ COMPLETA"],
    # ─ Panel de Supervisión ───────────────────────────────────────────────────
    ["3A",       "Rutas de Venta: accordion animado con clientes PDV por ruta", "✓ COMPLETA"],
    ["3B",       "Mapa Leaflet interactivo: toggle vendedor/ruta/PDV (CartoDB tiles)", "✓ COMPLETA"],
    ["3B+",      "Stats activos/inactivos/limbo en tarjetas por vendedor", "✓ COMPLETA"],
    ["3C",       "Control de acceso por rol: /supervision visible para admin+supervisor", "✓ COMPLETA"],
    ["3D",       "Alertas PDV inactivos > 90 días, agrupados por vendedor + exportar CSV", "PENDIENTE"],
    # ─ Motores RPA ───────────────────────────────────────────────────────────
    ["4A-back",  "Motor RPA Ventas: login CHESS → descarga Excel → ingesta ventas_v2", "✓ COMPLETA"],
    ["4B-back",  "Motor RPA Cuentas: login CHESS → saldos → JSON → cuentas_corrientes_data", "✓ COMPLETA"],
    ["4C-back",  "Scheduler APScheduler en Railway: ventas 07/15/23h, cuentas 07h, padrón 04h (AR tz)", "✓ COMPLETA"],
    # ─ Panel Supervisión — secciones de datos ─────────────────────────────────
    ["4A-front", "Sección Ventas: stats globales + accordion por vendedor + tabla transacciones (max 100) + CSV", "✓ COMPLETA"],
    ["4B-front", "Sección Cuentas Corrientes: deuda total + aging badges + clientes por vendedor + CSV", "✓ COMPLETA"],
    ["4D",       "Notificaciones Telegram push al vendedor (PDV inactivo, deuda alta)", "PENDIENTE"],
    # ─ Automatización y evolución ─────────────────────────────────────────────
    ["5A",       "Padrón automático: endpoint /api/motor/padron-trigger + scheduler, sin carga manual", "PENDIENTE"],
    ["5B",       "Gráficos recharts en sección Ventas: evolución diaria/semanal por vendedor", "PENDIENTE"],
    ["5C",       "Exportación Excel (.xlsx) además de CSV en Ventas y Cuentas", "PENDIENTE"],
    ["5D",       "Paginación en tabla de transacciones (actualmente límite hard 100 comprobantes)", "PENDIENTE"],
    # ─ Nuevos tenants / escala ────────────────────────────────────────────────
    ["6A",       "Motor RPA Nextbyn/Sigo: soporte tercer ERP para distribuidoras no-CHESS", "PENDIENTE"],
    ["6B",       "Dashboard ejecutivo superadmin: vista cross-tenant con KPIs globales", "PENDIENTE"],
    ["6C",       "Demo tenant (id_dist=5): datos sintéticos para demos y onboarding", "PENDIENTE"],
]
story.append(table(roadmap, col_widths=[1.8*cm, 11.5*cm, 3.2*cm]))
story.append(SP())
story.append(N(
    "Las fases 1–4B-front están 100% en producción (Railway + Vercel). "
    "El scheduler corre 24/7 en Railway. "
    "La carga de padrón sigue siendo manual (Excel desde Google Drive) hasta que se implemente Fase 5A. "
    "El fix de tenant isolation (useState hydration timing) ya está aplicado en TabSupervision.tsx."
))
story.append(SP())

story.append(H2("Próximos pasos inmediatos (post-migración macOS)"))
next_steps = [
    ("Alta prioridad", [
        "Fase 3D: Sección 'Alertas' en TabSupervision — GET /api/supervision/alertas/{dist_id}?dias=90 "
        "agrupa PDV con fecha_ultima_compra > 90 días por vendedor, exportable CSV",
        "Fix vault_client.py: eliminar path hardcodeado C:/Users/cigar/..., reemplazar con load_dotenv() "
        "relativo para que funcione en macOS sin modificaciones",
        "Verificar preview MCP en macOS (error cmd.exe es Windows-only — debería resolverse solo al migrar)",
    ]),
    ("Media prioridad", [
        "Fase 5A: Endpoint /api/motor/padron-trigger + integración con scheduler (job_padron ya hace el HTTP POST, "
        "solo falta el handler en api.py que dispare padron_ingestion_service)",
        "Fase 5B: Recharts en sección Ventas — endpoint /api/supervision/ventas/{dist_id}/evolucion "
        "para datos agrupados por día (last 30d) y renderizado como LineChart por vendedor",
        "Fase 5C: Export xlsx — usar openpyxl en el frontend o endpoint dedicado para generación server-side",
    ]),
    ("Baja prioridad / futuro", [
        "Fase 6A: Motor Sigo/Nextbyn — estructura similar a ventas.py pero con otro ERP",
        "Fase 6B: Dashboard superadmin cross-tenant con totales globales y comparativa entre distribuidoras",
        "Fase 6C: Tenant demo con datos sintéticos para onboarding de nuevas distribuidoras",
        "Fase 4D: Telegram push — evaluar bot polling vs webhook, tabla de suscripciones por vendedor",
    ]),
]
for priority, items in next_steps:
    story.append(H2(priority))
    for item in items:
        story.append(B(item))
story.append(SP())

story.append(H2("Notas y decisiones de arquitectura importantes"))
notes = [
    ("Tablas legacy vs _v2", "Las tablas sin sufijo (clientes_pdv, rutas, etc.) son las legacy del "
     "bot de exhibiciones. NO modificar. Usar exclusivamente las _v2 para todo lo nuevo."),
    ("RLS en Supabase", "El backend usa service_role key → bypassa RLS. La tenant isolation "
     "se hace a nivel de código Python (check_dist_permission) + filtros .eq('id_distribuidor', x)."),
    ("CartoDB tiles", "El mapa usa CartoDB dark_all tiles, gratuitos y sin API key. "
     "Si se necesita más detalle o satelital, evaluar Mapbox (requiere API key y tiene costo)."),
    ("Shifting index bug", "Bug crítico de Playwright resuelto en ambos motores. "
     "NUNCA usar nth(i) en un for loop sobre un NodeList live. Usar while + nth(0)."),
    ("Auth hydration timing", "useState(distId) en React solo captura el valor inicial. "
     "Si distId viene de useAuth() que carga async, selectedDist queda en 0. "
     "Siempre agregar useEffect de sync para non-superadmin."),
    ("Padrón manual por ahora", "El padrón todavía se sube manualmente (archivo Excel desde Drive). "
     "El scheduler tiene el trigger HTTP preparado (job_padron → POST /api/motor/padron-trigger) pero el endpoint "
     "aún no existe en api.py. Esto es Fase 5A."),
    ("vault_client.py y macOS", "vault_client.py tiene hardcodeado C:/Users/cigar/... para Windows. "
     "En macOS fallará. Fix: reemplazar la línea problemática por load_dotenv() sin path absoluto. "
     "Usar python-dotenv con find_dotenv() o simplemente load_dotenv() desde el directorio del script."),
    ("Nombre oficial del proyecto", "El nombre oficial y definitivo es SHELFY. "
     "El repo se llama CenterMind (histórico). La API corre en api.shelfycenter.com. "
     "El frontend en shelfycenter.com. Internamente el módulo Python se llama ShelfMind-RPA."),
    ("Shifting index bug (Playwright)", "Bug crítico resuelto: NUNCA iterar con nth(i) sobre un NodeList live. "
     "El DOM se refresca entre clicks → los índices se desplazan. Solución: while + nth(0) siempre."),
]
for title, desc in notes:
    story.append(Paragraph(f"<b>{title}:</b> {desc}", S_BODY))
    story.append(SP(0.5))

story.append(HR())
story.append(SP())
story.append(Paragraph(
    "Documento generado automáticamente el " + datetime.now().strftime("%d/%m/%Y %H:%M") +
    " · github.com/gncpiazza-code/CenterMind",
    ParagraphStyle("footer_note", fontName="Helvetica", fontSize=8,
                   textColor=C_MUTED, alignment=TA_CENTER)
))

# ── Build ──────────────────────────────────────────────────────────────────────
doc.build(story, onFirstPage=lambda c,d: None, onLaterPages=page_header_footer)
print(f"PDF generado: {OUTPUT}")
