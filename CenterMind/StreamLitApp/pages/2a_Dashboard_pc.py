# -*- coding: utf-8 -*-
"""
CenterMind — Dashboard TV (Streamlit)
======================================
Ejecutar:
    streamlit run 02_dashboard.py

Pensado para estar en pantalla grande en la oficina.
Se actualiza solo cada 60 segundos.
"""

from __future__ import annotations

import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import streamlit as st

if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="ShelfMind · Dashboard TV",
    page_icon="🏆",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── Paths & constantes ───────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent
DB_PATH = Path(__file__).resolve().parent.parent.parent / "base_datos" / "centermind.db"
AR_TZ        = ZoneInfo("America/Argentina/Buenos_Aires")
REFRESH_SECS = 60        # auto-refresh del dashboard
CAROUSEL_MAX = 8         # máximo de fotos en el carrusel
TOP_N        = 15        # máximo de vendedores en el ranking

MESES_ES = {
    1:"Enero", 2:"Febrero", 3:"Marzo", 4:"Abril",
    5:"Mayo", 6:"Junio", 7:"Julio", 8:"Agosto",
    9:"Septiembre", 10:"Octubre", 11:"Noviembre", 12:"Diciembre",
}

# ─── CSS ──────────────────────────────────────────────────────────────────────
STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── CSS Variables — Paleta Tobacco/Amber ────────────────── */
:root {
    --bg-darkest:   #140E0C;
    --accent-amber: #D9A76A;
    --accent-sand:  #D9BD9C;
    --status-approved: #7DAF6B;
    --status-rejected: #C0584A;
    --text-primary:  #F0E6D8;
    --text-muted:    rgba(240, 230, 216, 0.5);
    --text-dim:      rgba(240, 230, 216, 0.3);
    --border-soft:   rgba(217, 167, 106, 0.15);
}

/* ── Animaciones ──────────────────────────────────────────── */
@keyframes fadeUpScale {
    from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes fadeInTop {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { display: none !important; }
.block-container { padding: 0 !important; max-width: 100% !important; }

/* ── Fondo con textura ────────────────────────────────────── */
[data-testid="stAppViewContainer"]::before {
    content: '';
    position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(217,167,106,0.04) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 90% 80%, rgba(217,167,106,0.03) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 28px;
    background: rgba(20, 14, 12, 0.95);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 100;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; letter-spacing: 4px; color: var(--accent-amber);
    text-shadow: 0 0 24px rgba(217,167,106,0.35);
}
.topbar-sub { font-size: 12px; color: var(--text-muted); letter-spacing: 2px; }
.topbar-right { display: flex; align-items: center; gap: 16px; }
.refresh-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 999px;
    font-family: 'DM Mono', monospace;
    font-size: 11px; letter-spacing: 1px;
    background: rgba(217,167,106,0.12);
    border: 1px solid var(--border-soft);
    color: var(--accent-amber);
}
.dot-live {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--status-approved); box-shadow: 0 0 8px var(--status-approved);
    display: inline-block;
}

/* ── Progress bar de refresh ──────────────────────────────── */
.refresh-bar-wrap {
    height: 3px; background: var(--border-soft);
    position: sticky; top: 57px; z-index: 99;
}
.refresh-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-amber), var(--status-approved));
    transition: width 1s linear;
}

/* ── Cards ────────────────────────────────────────────────── */
.card {
    background: rgba(42, 30, 24, 0.5);
    border: 1px solid rgba(217, 167, 106, 0.15);
    border-radius: 16px;
    backdrop-filter: blur(16px);
    padding: 20px 22px;
    height: 100%;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 18px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after {
    content: ''; flex: 1; height: 1px;
    background: var(--border-soft);
}

/* ── KPI cards ────────────────────────────────────────────── */
.kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
}
.kpi-card {
    background: rgba(42, 30, 24, 0.5);
    border: 1px solid rgba(217, 167, 106, 0.15);
    border-radius: 14px;
    backdrop-filter: blur(14px);
    padding: 18px 16px;
    display: flex; align-items: center; justify-content: space-between;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(217,167,106,0.15);
}
.kpi-card:nth-child(1) { animation-delay: 0.1s; }
.kpi-card:nth-child(2) { animation-delay: 0.2s; }
.kpi-card:nth-child(3) { animation-delay: 0.3s; }
.kpi-label {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--text-dim); margin-bottom: 4px; font-weight: 600;
}
.kpi-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 44px; line-height: 1;
}
.kpi-icon {
    width: 48px; height: 48px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
}
.kpi-green  .kpi-num { color: var(--status-approved); }
.kpi-green  .kpi-icon { background: rgba(125,175,107,0.12); border: 1px solid rgba(125,175,107,0.25); }
.kpi-amber  .kpi-num { color: var(--accent-amber); }
.kpi-amber  .kpi-icon { background: rgba(217,167,106,0.12); border: 1px solid var(--border-soft); }
.kpi-red    .kpi-num { color: var(--status-rejected); }
.kpi-red    .kpi-icon { background: rgba(192,88,74,0.12); border: 1px solid rgba(192,88,74,0.25); }

/* ── Período selector pills ───────────────────────────────── */
.period-bar {
    display: flex; gap: 8px; margin-bottom: 16px;
}
.period-pill {
    padding: 6px 16px; border-radius: 999px;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    border: 1px solid var(--border-soft);
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    transition: all 0.3s ease;
}
.period-pill.active {
    background: rgba(217,167,106,0.15);
    border-color: var(--border-soft);
    color: var(--accent-amber);
    font-weight: 700;
    transform: scale(1.05);
}
.period-pill.active:hover {
    transform: scale(1.1);
}

/* ── Ranking rows ─────────────────────────────────────────── */
.rank-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.02);
    margin-bottom: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.rank-row:hover {
    background: rgba(217,167,106,0.08);
    border-color: var(--border-soft);
    transform: translateX(6px);
    box-shadow: -4px 0 15px rgba(217,167,106,0.2);
}
.rank-pos {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; width: 32px; text-align: center; flex-shrink: 0;
}
.rank-pos.gold   { color: var(--accent-amber); }
.rank-pos.silver { color: var(--accent-sand); }
.rank-pos.bronze { color: #F97316; }
.rank-pos.rest   { color: var(--text-dim); }
.rank-name {
    flex: 1;
    font-size: 14px; font-weight: 600; color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rank-pts {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; color: var(--accent-amber);
    flex-shrink: 0;
}
.rank-pts-lbl {
    font-size: 9px; letter-spacing: 1px; color: var(--text-dim);
    text-transform: uppercase; text-align: right;
}
.rank-sub {
    font-size: 11px; color: var(--text-muted);
    white-space: nowrap;
}
.rank-row.top1 {
    background: rgba(217,167,106,0.08);
    border-color: var(--border-soft);
    box-shadow: inset -2px 0 8px rgba(217,167,106,0.15);
}
.rank-row.top1:hover {
    box-shadow: -4px 0 20px rgba(217,167,106,0.4), inset -2px 0 8px rgba(217,167,106,0.15);
}

/* ── Carrusel ─────────────────────────────────────────────── */
.carousel-frame {
    position: relative;
    background: var(--bg-darkest);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.06);
}
.carousel-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, var(--bg-darkest) 0%, rgba(20,14,12,0.7) 60%, transparent 100%);
    padding: 20px 20px 16px;
    pointer-events: none;
    animation: fadeInTop 0.6s ease-out;
}
.carousel-vendor {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; color: var(--text-primary); letter-spacing: 2px;
}
.carousel-meta {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: var(--text-muted);
    letter-spacing: 1px; margin-top: 2px;
}
.carousel-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 999px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    font-weight: 600; margin-top: 6px;
}
.badge-aprobado {
    background: rgba(125,175,107,0.15);
    color: var(--status-approved);
    border: 1px solid rgba(125,175,107,0.3);
}
.badge-destacado {
    background: rgba(217,167,106,0.2);
    color: var(--accent-amber);
    border: 1px solid var(--border-soft);
}

/* Dots del carrusel */
.carousel-dots {
    display: flex; gap: 6px; justify-content: center;
    padding: 10px 0 6px;
}
.dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--border-soft);
    transition: background 0.2s, width 0.2s;
}
.dot.active {
    background: var(--accent-amber); width: 18px; border-radius: 3px;
}

/* ── Líder banner ─────────────────────────────────────────── */
.leader-banner {
    background: rgba(217,167,106,0.12);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    padding: 12px 20px;
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 14px;
    animation: fadeUpScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.leader-crown { font-size: 28px; }
.leader-text { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: var(--accent-amber); letter-spacing: 2px; }
.leader-sub { font-size: 12px; color: var(--text-muted); }

/* ── Empty state ──────────────────────────────────────────── */
.empty-carousel {
    height: 380px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: var(--text-dim);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 24px; letter-spacing: 3px;
}

/* ── Streamlit overrides ──────────────────────────────────── */
div[data-testid="stHorizontalBlock"] { gap: 12px !important; }
div[data-testid="column"] { padding: 0 !important; }

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    font-size: 12px !important;
    border-radius: 999px !important;
    height: 36px !important;
    background: rgba(217,167,106,0.08) !important;
    border: 1px solid var(--border-soft) !important;
    color: var(--text-muted) !important;
    transition: all 0.2s ease !important;
}

div[data-testid="stButton"] button:hover {
    background: rgba(217,167,106,0.15) !important;
    border-color: var(--accent-amber) !important;
    color: var(--accent-amber) !important;
    transform: translateY(-2px) !important;
}

/* ── Scrollbar ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-soft); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(217,167,106,0.3); }

/* ── Media Queries — Tablet (768px - 1024px) ────────────– */
@media (max-width: 1024px) {
    .kpi-grid {
        grid-template-columns: 1fr 1fr;
    }
    .topbar-logo { font-size: 24px; }
    .topbar-sub { font-size: 11px; }
}

/* ── Media Queries — Móvil (<768px) ──────────────────────– */
@media (max-width: 768px) {
    .kpi-grid {
        grid-template-columns: 1fr;
    }
    .topbar {
        padding: 12px 16px;
        flex-wrap: wrap;
    }
    .topbar-logo { font-size: 20px; }
    .topbar-sub, .topbar-right { font-size: 10px; }
    .period-bar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
    }
    .period-bar::-webkit-scrollbar { display: none; }
    ::-webkit-scrollbar { width: 0; }
    .rank-name { font-size: 12px; }
    .rank-pts { font-size: 18px; }
}

/* ── Media Queries — Ultra-pequeño (<480px) ──────────–  */
@media (max-width: 480px) {
    .topbar { padding: 10px 12px; }
    .topbar-logo { font-size: 18px; letter-spacing: 2px; }
    .kpi-num { font-size: 32px; }
    .kpi-label { font-size: 9px; }
    .card { padding: 16px; }
    .leader-banner { padding: 10px 16px; }
}
</style>
"""

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def get_distribuidoras() -> List[Dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id_distribuidor AS id, nombre_empresa AS nombre FROM distribuidores WHERE estado='activo'"
        ).fetchall()
    return [dict(r) for r in rows]


def get_kpis(distribuidor_id: int, periodo: str) -> Dict:
    """KPIs según período: hoy / mes / historico."""
    where_extra = ""
    now = datetime.now(AR_TZ)
    if periodo == "hoy":
        hoy = now.strftime("%Y-%m-%d")
        where_extra = f" AND DATE(timestamp_subida) = '{hoy}'"
    elif periodo == "mes":
        mes_inicio = now.replace(day=1).strftime("%Y-%m-%d")
        where_extra = f" AND timestamp_subida >= '{mes_inicio}'"

    with get_conn() as c:
        row = c.execute(
            f"""SELECT
                   COUNT(*) total,
                   SUM(CASE WHEN estado='Aprobado'  THEN 1 ELSE 0 END) aprobadas,
                   SUM(CASE WHEN estado='Destacado' THEN 1 ELSE 0 END) destacadas,
                   SUM(CASE WHEN estado='Rechazado' THEN 1 ELSE 0 END) rechazadas,
                   SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) pendientes
               FROM exhibiciones
               WHERE id_distribuidor = ?{where_extra}""",
            (distribuidor_id,),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}


def get_ranking(distribuidor_id: int, periodo: str) -> List[Dict]:
    now = datetime.now(AR_TZ)
    where_extra = ""
    if periodo == "hoy":
        hoy = now.strftime("%Y-%m-%d")
        where_extra = f" AND DATE(e.timestamp_subida) = '{hoy}'"
    elif periodo == "mes":
        mes_inicio = now.replace(day=1).strftime("%Y-%m-%d")
        where_extra = f" AND e.timestamp_subida >= '{mes_inicio}'"

    with get_conn() as c:
        rows = c.execute(
            f"""SELECT
                   i.nombre_integrante                                         AS vendedor,
                   SUM(CASE WHEN e.estado IN ('Aprobado','Destacado') THEN 1 ELSE 0 END) aprobadas,
                   SUM(CASE WHEN e.estado = 'Destacado' THEN 1 ELSE 0 END)   destacadas,
                   SUM(CASE WHEN e.estado = 'Rechazado' THEN 1 ELSE 0 END)   rechazadas,
                   COUNT(*) total
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ?{where_extra}
               GROUP BY e.id_integrante
               ORDER BY aprobadas DESC, destacadas DESC
               LIMIT ?""",
            (distribuidor_id, TOP_N),
        ).fetchall()
    ranking = []
    for r in rows:
        puntos = r["aprobadas"] + r["destacadas"]
        ranking.append({
            "vendedor":   r["vendedor"] or "Sin nombre",
            "aprobadas":  r["aprobadas"],
            "destacadas": r["destacadas"],
            "rechazadas": r["rechazadas"],
            "total":      r["total"],
            "puntos":     puntos,
        })
    return ranking


def get_ultimas_evaluadas(distribuidor_id: int, n: int = CAROUSEL_MAX) -> List[Dict]:
    """Últimas N exhibiciones aprobadas o destacadas con su foto."""
    with get_conn() as c:
        rows = c.execute(
            """SELECT
                   e.url_foto_drive       AS drive_link,
                   e.estado,
                   e.evaluated_at,
                   c.numero_cliente_local AS nro_cliente,
                   e.tipo_pdv,
                   i.nombre_integrante    AS vendedor
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               LEFT JOIN clientes c          ON c.id_cliente    = e.id_cliente
               WHERE e.id_distribuidor = ?
                 AND e.estado IN ('Aprobado','Destacado')
                 AND e.url_foto_drive IS NOT NULL
               ORDER BY e.evaluated_at DESC
               LIMIT ?""",
            (distribuidor_id, n),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Drive URL helpers ────────────────────────────────────────────────────────

_DRIVE_FILE_RE = re.compile(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)")
_DRIVE_UC_RE   = re.compile(r"drive\.google\.com/uc\?.*id=([a-zA-Z0-9_-]+)")

def drive_file_id(url: str) -> Optional[str]:
    for rx in (_DRIVE_FILE_RE, _DRIVE_UC_RE):
        m = rx.search(url or "")
        if m:
            return m.group(1)
    return None

def drive_embed_url(url: str) -> str:
    fid = drive_file_id(url)
    return f"https://drive.google.com/file/d/{fid}/preview" if fid else url

def drive_thumbnail_url(url: str, size: int = 600) -> str:
    fid = drive_file_id(url)
    return f"https://drive.google.com/thumbnail?id={fid}&sz=w{size}" if fid else url


# ─── State ────────────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "distribuidor_id":      st.session_state.user["id_distribuidor"],
        "distribuidor_nombre":  st.session_state.user["nombre_empresa"],
        "periodo":           "mes",
        "carousel_idx":      0,
        "last_refresh":      0.0,
        "kpis":              {},
        "ranking":           [],
        "carousel_items":    [],
        "prev_leader":       None,
        "show_leader_banner": False,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def do_refresh():
    did = st.session_state.distribuidor_id
    if not did:
        return
    periodo = st.session_state.periodo
    st.session_state.kpis           = get_kpis(did, periodo)
    st.session_state.ranking        = get_ranking(did, periodo)
    st.session_state.carousel_items = get_ultimas_evaluadas(did)
    st.session_state.last_refresh   = time.time()

    # Detectar nuevo líder
    ranking = st.session_state.ranking
    nuevo_lider = ranking[0]["vendedor"] if ranking else None
    if nuevo_lider and nuevo_lider != st.session_state.prev_leader and st.session_state.prev_leader is not None:
        st.session_state.show_leader_banner = True
    else:
        st.session_state.show_leader_banner = False
    st.session_state.prev_leader = nuevo_lider


# ─── Render helpers ───────────────────────────────────────────────────────────

def render_topbar(nombre_dist: str, last_refresh: float):
    now = datetime.now(AR_TZ)
    hora = now.strftime("%H:%M:%S")
    elapsed = int(time.time() - last_refresh) if last_refresh else 0
    pct = min(100, int(elapsed / REFRESH_SECS * 100))

    st.markdown(f"""
    <div class="topbar">
        <div>
            <div class="topbar-logo">SHELFMIND · DASHBOARD</div>
            <div class="topbar-sub">{nombre_dist.upper()}</div>
        </div>
        <div class="topbar-right">
            <span class="refresh-badge">
                <span class="dot-live"></span>
                EN VIVO · {hora}
            </span>
        </div>
    </div>
    <div class="refresh-bar-wrap">
        <div class="refresh-bar-fill" style="width:{pct}%;"></div>
    </div>
    """, unsafe_allow_html=True)


def render_kpis(kpis: Dict, periodo: str):
    ap  = kpis.get("aprobadas",  0)
    dest= kpis.get("destacadas", 0)
    rej = kpis.get("rechazadas", 0)
    total = kpis.get("total", 0)
    pend  = kpis.get("pendientes", 0)

    periodo_label = {"hoy": "HOY", "mes": f"{MESES_ES[datetime.now(AR_TZ).month].upper()}", "historico": "HISTÓRICO"}.get(periodo, "MES")

    st.markdown(f"""
    <div class="card">
        <div class="card-title">KPIs · {periodo_label}</div>
        <div class="kpi-grid">
            <div class="kpi-card kpi-green">
                <div class="kpi-left">
                    <div class="kpi-label">Aprobadas</div>
                    <div class="kpi-num">{ap}</div>
                </div>
                <div class="kpi-icon">✅</div>
            </div>
            <div class="kpi-card kpi-amber">
                <div class="kpi-left">
                    <div class="kpi-label">Destacadas</div>
                    <div class="kpi-num">{dest}</div>
                </div>
                <div class="kpi-icon">🔥</div>
            </div>
            <div class="kpi-card kpi-red">
                <div class="kpi-left">
                    <div class="kpi-label">Rechazadas</div>
                    <div class="kpi-num">{rej}</div>
                </div>
                <div class="kpi-icon">❌</div>
            </div>
        </div>
        <div style="display:flex;gap:20px;margin-top:12px;padding:10px 2px 0;">
            <span style="font-size:12px;color:rgba(148,163,184,0.6);">
                Total: <b style="color:#F8FAFC;">{total}</b>
            </span>
            <span style="font-size:12px;color:rgba(148,163,184,0.6);">
                Pendientes: <b style="color:#FCD34D;">{pend}</b>
            </span>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_ranking(ranking: List[Dict], show_leader: bool):
    st.markdown(
        f'<div class="card"><div class="card-title">Ranking &middot; Top {min(len(ranking), TOP_N) if ranking else 0}</div></div>',
        unsafe_allow_html=True,
    )

    if not ranking:
        st.markdown(
            '<p style="color:rgba(248,250,252,0.3);font-size:13px;padding:8px 0;">Sin datos aún.</p>',
            unsafe_allow_html=True,
        )
        return

    # Banner nuevo líder
    if show_leader:
        lider = ranking[0]["vendedor"]
        st.markdown(f"""
        <div class="leader-banner">
            <span class="leader-crown">&#x1F451;</span>
            <div>
                <div class="leader-text">NUEVO LIDER</div>
                <div class="leader-sub">{lider} tom&oacute; el primer puesto</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

    for i, entry in enumerate(ranking):
        pos = i + 1
        if pos == 1:   pos_cls, pos_ico = "gold",   "#1"
        elif pos == 2: pos_cls, pos_ico = "silver", "#2"
        elif pos == 3: pos_cls, pos_ico = "bronze", "#3"
        else:          pos_cls, pos_ico = "rest",   f"#{pos}"

        top1_bg  = "rgba(252,211,77,0.07)" if pos == 1 else "rgba(255,255,255,0.02)"
        top1_bdr = "rgba(252,211,77,0.2)"  if pos == 1 else "rgba(255,255,255,0.04)"

        pos_color = {
            "gold":   "#FCD34D",
            "silver": "#94A3B8",
            "bronze": "#F97316",
            "rest":   "rgba(248,250,252,0.3)",
        }[pos_cls]

        dest_txt = f" &middot; DEST {entry['destacadas']}" if entry["destacadas"] > 0 else ""
        rej_txt  = f" &middot; REJ {entry['rechazadas']}"  if entry["rechazadas"] > 0 else ""

        st.markdown(f"""
        <div style="display:flex;align-items:center;gap:12px;
                    padding:10px 12px;border-radius:10px;margin-bottom:6px;
                    background:{top1_bg};border:1px solid {top1_bdr};">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;
                        width:36px;text-align:center;flex-shrink:0;color:{pos_color};">
                {pos_ico}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:#F8FAFC;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    {entry['vendedor']}
                </div>
                <div style="font-size:11px;color:rgba(148,163,184,0.7);">
                    AP {entry['aprobadas']}{dest_txt}{rej_txt}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#FCD34D;">
                    {entry['puntos']}
                </div>
                <div style="font-size:9px;letter-spacing:1px;color:rgba(248,250,252,0.3);">PTS</div>
            </div>
        </div>
        """, unsafe_allow_html=True)


def render_carousel(items: List[Dict]):
    if not items:
        st.markdown("""
        <div class="card">
            <div class="card-title">Últimas Evaluadas</div>
            <div class="empty-carousel">SIN FOTOS AÚN</div>
        </div>
        """, unsafe_allow_html=True)
        return

    n = len(items)
    idx = st.session_state.carousel_idx % n
    item = items[idx]

    embed_url = drive_embed_url(item["drive_link"])
    estado    = item.get("estado", "Aprobado")
    vendedor  = item.get("vendedor") or "—"
    cliente   = item.get("nro_cliente") or "—"
    tipo      = item.get("tipo_pdv") or "—"
    badge_cls = "badge-destacado" if estado == "Destacado" else "badge-aprobado"
    badge_ico = "🔥 DESTACADA" if estado == "Destacado" else "✅ APROBADA"

    # Dots
    dots_html = '<div class="carousel-dots">'
    for i in range(n):
        dots_html += f'<div class="dot {"active" if i == idx else ""}"></div>'
    dots_html += '</div>'

    st.markdown(f"""
    <div class="card">
        <div class="card-title">Últimas Evaluadas</div>
        <div class="carousel-frame" style="height:52vh;">
            <iframe src="{embed_url}"
                    style="width:100%;height:100%;border:none;"
                    loading="lazy">
            </iframe>
            <div class="carousel-overlay">
                <div class="carousel-vendor">{vendedor}</div>
                <div class="carousel-meta">CLIENTE {cliente} · {tipo.upper()}</div>
                <span class="carousel-badge {badge_cls}">{badge_ico}</span>
            </div>
        </div>
        {dots_html}
    </div>
    """, unsafe_allow_html=True)

    # Navegación del carrusel
    c1, c2, c3 = st.columns([1, 5, 1])
    with c1:
        if st.button("←", key="car_prev", use_container_width=True):
            st.session_state.carousel_idx = (idx - 1) % n
            st.rerun()
    with c2:
        st.markdown(
            f'<div style="text-align:center;font-family:\'DM Mono\',monospace;'
            f'font-size:11px;color:rgba(248,250,252,0.3);padding-top:8px;">'
            f'{idx+1} / {n}</div>',
            unsafe_allow_html=True,
        )
    with c3:
        if st.button("→", key="car_next", use_container_width=True):
            st.session_state.carousel_idx = (idx + 1) % n
            st.rerun()


def render_login():
    st.markdown(STYLE, unsafe_allow_html=True)
    st.markdown("""
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
    <div style="background:rgba(42, 30, 24, 0.95);border:1px solid rgba(217,167,106,0.2);
                border-radius:20px;padding:48px;width:100%;max-width:400px;box-shadow:0 0 60px rgba(217,167,106,0.12);backdrop-filter:blur(12px);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:4px;
                    color:#D9A76A;text-align:center;margin-bottom:4px;">SHELFMIND</div>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;
                    color:rgba(248,250,252,0.35);text-align:center;margin-bottom:36px;">
            Dashboard TV
        </div>
    </div>
    </div>
    """, unsafe_allow_html=True)

    distribuidoras = get_distribuidoras()
    if not distribuidoras:
        st.error("No hay distribuidoras activas en la base de datos.")
        return

    opciones = {d["nombre"]: d["id"] for d in distribuidoras}
    nombre_sel = st.selectbox("Distribuidora", list(opciones.keys()))

    if st.button("ENTRAR AL DASHBOARD →", use_container_width=True):
        st.session_state.distribuidor_id      = opciones[nombre_sel]
        st.session_state.distribuidor_nombre  = nombre_sel
        do_refresh()
        st.rerun()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    init_state()
    st.markdown(STYLE, unsafe_allow_html=True)

    # Sin distribuidora seleccionada → pantalla de selección
    if not st.session_state.distribuidor_id:
        render_login()
        return

    # Auto-refresh cada REFRESH_SECS segundos
    elapsed = time.time() - st.session_state.last_refresh
    if elapsed >= REFRESH_SECS or st.session_state.last_refresh == 0:
        do_refresh()

    nombre_dist = st.session_state.distribuidor_nombre
    kpis        = st.session_state.kpis
    ranking     = st.session_state.ranking
    carousel    = st.session_state.carousel_items
    show_leader = st.session_state.show_leader_banner

    # ── Topbar ────────────────────────────────────────────────────────────────
    render_topbar(nombre_dist, st.session_state.last_refresh)

    # ── Selector de período ───────────────────────────────────────────────────
    st.markdown("<div style='padding:12px 20px 0;'>", unsafe_allow_html=True)
    pc1, pc2, pc3, pc4, _, p_exit = st.columns([1, 1, 1, 1, 6, 1])
    periodo_changed = False
    with pc1:
        if st.button("HOY",       key="p_hoy",  use_container_width=True):
            st.session_state.periodo = "hoy";       periodo_changed = True
    with pc2:
        if st.button("MES",       key="p_mes",  use_container_width=True):
            st.session_state.periodo = "mes";       periodo_changed = True
    with pc3:
        if st.button("HISTÓRICO", key="p_hist", use_container_width=True):
            st.session_state.periodo = "historico"; periodo_changed = True
    with pc4:
        if st.button("↺ FORZAR",  key="p_ref",  use_container_width=True):
            periodo_changed = True
    with p_exit:
        if st.button("SALIR →",   key="p_exit", use_container_width=True):
            for k in list(st.session_state.keys()):
                del st.session_state[k]
            st.rerun()

    if periodo_changed:
        do_refresh()
        st.rerun()

    # Indicador de período activo
    periodo_label = {
        "hoy":      "📅 HOY",
        "mes":      f"🗓️ {MESES_ES[datetime.now(AR_TZ).month].upper()}",
        "historico":"🕘 HISTÓRICO",
    }.get(st.session_state.periodo, "MES")

    st.markdown(
        f'<div style="padding:6px 20px 10px;">'
        f'<span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;'
        f'color:#FCD34D;background:rgba(252,211,77,0.1);border:1px solid rgba(252,211,77,0.25);'
        f'border-radius:999px;padding:3px 12px;">{periodo_label}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Layout principal: carrusel izquierda | ranking+kpis derecha ───────────
    st.markdown("<div style='padding:0 16px 20px;'>", unsafe_allow_html=True)
    col_left, col_right = st.columns([3, 2], gap="medium")

    with col_left:
        render_carousel(carousel)

    with col_right:
        render_kpis(kpis, st.session_state.periodo)
        st.markdown("<div style='height:14px'></div>", unsafe_allow_html=True)
        render_ranking(ranking, show_leader)

    st.markdown("</div>", unsafe_allow_html=True)

    # ── Auto-refresh con st.rerun en loop ─────────────────────────────────────
    # Cada 5s revisamos si pasaron los REFRESH_SECS para refrescar datos
    time.sleep(5)
    st.rerun()


main()