# -*- coding: utf-8 -*-
"""
ShelfMind — Visor de Evaluación (Streamlit)
============================================
Ejecutar:
    streamlit run app.py
"""

from __future__ import annotations

import re
import sys
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import streamlit as st

# ── Shared styles ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _shared_styles import BASE_CSS

# Importamos la librería de Auto-Refresh (Requiere: pip install streamlit-autorefresh)
try:
    from streamlit_autorefresh import st_autorefresh
    HAS_AUTOREFRESH = True
except ImportError:
    HAS_AUTOREFRESH = False

if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="ShelfMind · Evaluación",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = Path(__file__).resolve().parent.parent.parent / "base_datos" / "centermind.db"

# ─── CSS ──────────────────────────────────────────────────────────────────────
# BASE_CSS  →  _shared_styles.py  (reset, paleta, topbar, card, sistema de botones)
# VISOR_CSS →  overrides específicos de esta página

VISOR_CSS = """
<style>
/* ── Panel de evaluación ────────────────────────────────────── */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    background:    var(--bg-card);
    border:        1px solid var(--border-soft);
    border-radius: 12px;
    padding:       16px;
    gap:           10px !important;
}

.floating-info {
    display: grid; grid-template-columns: 1fr; gap: 6px;
    margin-bottom: 8px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.f-item {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.f-icon { font-size: 15px; color: var(--accent-amber); flex-shrink: 0; }

/* ── Botones de acción: APROBAR / DESTACAR / RECHAZAR ──────── */
/*    Coloreados, full-width dentro del panel, sin overflow      */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button {
    width:          100% !important;
    /* evitar que se parta el texto pero respetar saltos de línea */
    white-space:    pre-wrap !important;
    /* icono arriba, texto abajo */
    display:       flex !important;
    flex-direction: column !important;
    align-items:   center !important;
    justify-content: center !important;

    font-size:      10px !important;
    letter-spacing: 0.4px !important;
    padding:        6px 6px !important;
    min-height:     42px !important;
    height:         auto !important;
    border:         none !important;
    border-radius:  10px !important;
}
/* Aprobar → verde */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(1)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #4A7D43, #7DAF6B) !important;
    color: #fff !important;
}
/* Destacar → ámbar */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(2)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #B8853E, #D9A76A) !important;
    color: #1A1311 !important;
    font-weight: 800 !important;
}
/* Rechazar → rojo */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(3)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #943D2B, #C0584A) !important;
    color: #fff !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:hover {
    filter:     brightness(1.12) !important;
    transform:  translateY(-2px) !important;
    box-shadow: 0 6px 14px rgba(0,0,0,0.35) !important;
}
/* pequeños iconos dentro del botón */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button span {
    display: block; /* permite el salto de línea entre emoji y texto */
    line-height: 1.1;
}

/* ── Stats grid ─────────────────────────────────────────────── */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
}
.stat-box {
    background:    rgba(217,167,106,0.04);
    border:        1px solid var(--border-soft);
    border-radius: 10px;
    padding:       14px 8px;
    text-align:    center;
}
.stat-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 30px; line-height: 1; margin-bottom: 4px;
}
.stat-lbl {
    font-size: 9px; letter-spacing: 1px;
    text-transform: uppercase; color: var(--text-dim); font-weight: 600;
}
.stat-green { color: var(--status-approved); }
.stat-amber { color: var(--accent-amber); }
.stat-red   { color: var(--status-rejected); }
.stat-white { color: var(--text-primary); }

/* ── Badge ráfaga ────────────────────────────────────────────── */
.rafaga-badge {
    position: absolute; top: 10px; right: 10px; z-index: 10;
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 20px;
    font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase;
    background: rgba(18, 12, 10, 0.85); color: var(--accent-amber);
    border: 1px solid var(--border-soft); font-weight: 600;
    backdrop-filter: blur(4px);
}

/* ── Fotograma principal (optimizado) ─────────────────────────── */
.photo-frame-wrapper {
    /* use page background so the container blends with the card */
    background: var(--bg-page);
    overflow: hidden;
    position: relative;
    width: 100%;
    max-height: 80vh;
    aspect-ratio: 4 / 3;
}
.photo-frame-wrapper iframe {
    width: 100%;
    height: 100%;
}

/* flechas de navegación superpuestas */
.photo-nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    background: rgba(0,0,0,0.4);
    border-radius: 20px;
    cursor: pointer;
    text-decoration: none;
    z-index: 11;
}
.prev-overlay { left: 8px; }
.next-overlay { right: 8px; }

/* contador discreto */
.photo-counter {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.6);
    color: #fff;
    padding: 2px 6px;
    font-size: 12px;
    border-radius: 8px;
    z-index: 12;
}

/* si por alguna razón el pie de página con los botones sigue presente, lo escondemos */
[data-testid="stColumn"]:has(button[key="btn_prev"]) {
    display: none !important;
}

@media (max-width: 640px) {
    .photo-frame-wrapper { width: 100vw; }
    .photo-nav-button { display: none !important; }
    /* force the two-column layout to stack vertically */
    .stColumns { flex-direction: column !important; }
}

/* utility buttons in the top bar */
.topbar + div [data-testid="stButton"] button {
    opacity: 0.6 !important;
    font-size: 14px !important;
    padding: 4px 6px !important;
}
.topbar + div [data-testid="stButton"] button:hover {
    opacity: 1 !important;
    color: var(--accent-amber) !important;
}

/* hover feedback for arrow overlays */
.photo-nav-button:hover {
    background: rgba(0,0,0,0.65);
}

/* ── Empty state ─────────────────────────────────────────────── */
.empty-state { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.empty-icon  { font-size: 48px; margin-bottom: 16px; }
.empty-title {
    font-family: 'Bebas Neue', sans-serif; font-size: 26px;
    color: var(--text-primary); letter-spacing: 2px; margin-bottom: 8px;
}

/* ── Miniaturas de ráfaga ────────────────────────────────────── */
.thumbs-strip { display: flex; gap: 6px; padding: 8px 0; overflow-x: auto; }
.thumb-wrap {
    flex-shrink: 0; width: 60px; height: 60px;
    border-radius: 8px; overflow: hidden;
    border: 2px solid transparent; cursor: pointer;
    transition: border-color 0.15s ease;
}
.thumb-wrap.active {
    border-color: var(--accent-amber);
    box-shadow: 0 0 10px rgba(217,167,106,0.35);
}
.thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }

/* ── Flash de feedback ───────────────────────────────────────── */
.flash-msg {
    position: fixed; bottom: 28px; left: 50%;
    transform: translateX(-50%);
    padding: 12px 26px; border-radius: 50px;
    font-size: 12px; font-weight: 600; z-index: 10000;
    animation: fadeup 0.3s ease, fadeout 0.4s ease 2s forwards;
    pointer-events: none;
}
@keyframes fadeup  { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
@keyframes fadeout { to   { opacity:0; } }

/* ── Expander de filtro ──────────────────────────────────────── */
div[data-testid="stExpander"] {
    background:    transparent !important;
    border:        1px solid var(--border-soft) !important;
    border-radius: 10px !important;
    margin:        4px 0 12px !important;
}
div[data-testid="stExpander"] summary {
    font-family:    'Bebas Neue', sans-serif !important;
    font-size:      13px !important;
    letter-spacing: 1.5px !important;
    color:          var(--accent-amber) !important;
    padding:        10px 14px !important;
}

/* ── TextArea del comentario ─────────────────────────────────── */
div[data-testid="stTextArea"] textarea {
    min-height: 52px !important;
    height:     52px !important;
    resize:     vertical !important;
}

/* ── Stats: 2 columnas en móvil ─────────────────────────────── */
@media (max-width: 640px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
}

/* ══════════════════════════════════════════════════════════════
   PANEL FLOTANTE MÓVIL — ESTILO TINDER
   El panel de evaluación (ancla #eval-master-anchor) se fija
   en la parte inferior de la pantalla como un bottom-sheet.
   La foto ocupa toda la pantalla por encima.
   ══════════════════════════════════════════════════════════════ */
@media (max-width: 640px) {

    /* ── Panel fijo al fondo ────────────────────────────────── */
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
        position:   fixed !important;
        bottom:     0    !important;
        left:       0    !important;
        right:      0    !important;
        z-index:    9000 !important;
        margin:     0    !important;

        border-radius: 22px 22px 0 0 !important;
        padding:    6px 16px 28px   !important;
        gap:        8px             !important;

        background: rgba(18, 12, 10, 0.97) !important;
        backdrop-filter:         blur(28px) !important;
        -webkit-backdrop-filter: blur(28px) !important;

        border-top:    1px solid rgba(217, 167, 106, 0.22) !important;
        border-left:   none !important;
        border-right:  none !important;
        border-bottom: none !important;

        box-shadow: 0 -10px 40px rgba(0,0,0,0.70),
                    0 -1px  0   rgba(217,167,106,0.10) !important;
    }

    /* Handle decorativo (la rayita de arrastre) */
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)::before {
        content:       '' !important;
        display:       block !important;
        width:         40px;
        height:        4px;
        background:    rgba(240, 230, 216, 0.18);
        border-radius: 2px;
        margin:        0 auto 12px;
    }

    /* ── Info items: fila compacta en vez de columna ────────── */
    .floating-info {
        display:        flex !important;
        flex-direction: row !important;
        flex-wrap:      wrap !important;
        gap:            2px 10px !important;
        padding-bottom: 8px !important;
        margin-bottom:  6px !important;
    }
    .f-item  { font-size: 11px !important; gap: 4px !important; }
    .f-icon  { font-size: 12px !important; }

    /* ── TextArea: compacto ─────────────────────────────────── */
    div[data-testid="stTextArea"] textarea {
        min-height: 38px !important;
        height:     38px !important;
        font-size:  13px !important;
    }

    /* ── Botones de acción: grandes y redondeados ───────────── */
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        div[data-testid="stButton"] button {
        min-height:     54px    !important;
        border-radius:  16px    !important;
        font-size:      13px    !important;
        letter-spacing: 1px     !important;
        padding:        10px 4px !important;
    }

    /* ── Padding inferior para que la foto no quede tapada ───── */
    [data-testid="stMainBlockContainer"],
    .block-container {
        padding-bottom: 220px !important;
    }
}
</style>
"""

STYLE = BASE_CSS + VISOR_CSS

# ─── Funciones Auxiliares (Components) ────────────────────────────────────────

def render_stats_box(num: str, label: str, color_class: str) -> str:
    return f'<div class="stat-box"><div class="stat-num {color_class}">{num}</div><div class="stat-lbl">{label}</div></div>'

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def get_pendientes(distribuidor_id: int) -> List[Dict]:
    with get_conn() as c:
        rows = c.execute(
            """SELECT e.id_exhibicion, e.numero_cliente_local AS nro_cliente, e.comentarios_telegram AS tipo_pdv, e.url_foto_drive AS drive_link, e.timestamp_subida AS fecha_hora, e.estado, e.telegram_msg_id, i.nombre_integrante AS vendedor
               FROM exhibiciones e LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente' ORDER BY e.timestamp_subida ASC""",
            (distribuidor_id,),
        ).fetchall()

    grupos_dict: Dict[str, Dict] = {}
    for r in rows:
        d = dict(r)
        key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{d['id_exhibicion']}"
        if key not in grupos_dict:
            grupos_dict[key] = {"vendedor": d["vendedor"], "nro_cliente": d["nro_cliente"], "tipo_pdv": d["tipo_pdv"], "fecha_hora": d["fecha_hora"], "fotos": []}
        grupos_dict[key]["fotos"].append({"id_exhibicion": d["id_exhibicion"], "drive_link": d["drive_link"]})
    return list(grupos_dict.values())

def get_stats_hoy(distribuidor_id: int) -> Dict:
    hoy = datetime.now().strftime("%Y-%m-%d")
    with get_conn() as c:
        row = c.execute(
            """SELECT COUNT(*) total, SUM(CASE WHEN estado = 'Pendiente' THEN 1 ELSE 0 END) pendientes,
               SUM(CASE WHEN estado = 'Aprobado' THEN 1 ELSE 0 END) aprobadas,
               SUM(CASE WHEN estado = 'Rechazado' THEN 1 ELSE 0 END) rechazadas,
               SUM(CASE WHEN estado = 'Destacado' THEN 1 ELSE 0 END) destacadas
               FROM exhibiciones WHERE id_distribuidor = ? AND DATE(timestamp_subida) = ?""",
            (distribuidor_id, hoy),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}

def get_vendedores_pendientes(distribuidor_id: int) -> List[str]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT DISTINCT i.nombre_integrante FROM exhibiciones e LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente' ORDER BY i.nombre_integrante ASC",
            (distribuidor_id,),
        ).fetchall()
    return [r["nombre_integrante"] for r in rows if r["nombre_integrante"]]

def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> int:
    """
    Evalúa las fotos de un grupo.
    Usa 'AND estado = Pendiente' en el WHERE para manejar race conditions:
    si dos evaluadores presionan al mismo tiempo, solo el primero en llegar
    escribe; el segundo recibe rowcount=0 y sabe que ya fue evaluada.
    Retorna: filas actualizadas (>0 OK, 0 = ya evaluada por otro, -1 = error)
    """
    try:
        affected = 0
        with get_conn() as c:
            for id_ex in ids_exhibicion:
                cur = c.execute(
                    "UPDATE exhibiciones "
                    "SET estado=?, supervisor_nombre=?, comentarios=?, "
                    "    evaluated_at=CURRENT_TIMESTAMP, synced_telegram=0 "
                    "WHERE id_exhibicion=? AND estado='Pendiente'",
                    (estado, supervisor, comentario or None, id_ex),
                )
                affected += cur.rowcount
            c.commit()
        return affected
    except Exception as e:
        print(f"[ERROR evaluar] {e}")
        return -1

# ─── Drive URL helpers ────────────────────────────────────────────────────────
_DRIVE_FILE_RE = re.compile(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)")
_DRIVE_UC_RE   = re.compile(r"drive\.google\.com/uc\?.*id=([a-zA-Z0-9_-]+)")

def drive_file_id(url: str) -> Optional[str]:
    for rx in (_DRIVE_FILE_RE, _DRIVE_UC_RE):
        m = rx.search(url or "")
        if m: return m.group(1)
    return None

def drive_embed_url(url: str) -> str:
    fid = drive_file_id(url)
    return f"https://drive.google.com/file/d/{fid}/preview" if fid else url

def drive_thumbnail_url(url: str, size: int = 800) -> str:
    fid = drive_file_id(url)
    return f"https://drive.google.com/thumbnail?id={fid}&sz=w{size}" if fid else url

# ─── State helpers ────────────────────────────────────────────────────────────
def init_state():
    defaults = {
        "logged_in": False, "user": None,
        "pendientes": [], "idx": 0, "foto_idx": 0,
        "flash": None, "flash_type": "green",
        "filtro_vendedor": "Todos",
        # Flag de carga inicial: False hasta que se haga el primer fetch real
        "_visor_loaded": False,
    }
    for k, v in defaults.items():
        if k not in st.session_state: st.session_state[k] = v

def reload_pendientes():
    u = st.session_state.user
    if u:
        st.session_state.pendientes = get_pendientes(u["id_distribuidor"])
        if st.session_state.idx >= len(st.session_state.pendientes): st.session_state.idx = max(0, len(st.session_state.pendientes) - 1)
        st.session_state.foto_idx = 0

def reload_pendientes_silent():
    u = st.session_state.user
    if u:
        nuevos = get_pendientes(u["id_distribuidor"])
        if len(nuevos) != len(st.session_state.pendientes):
            st.session_state.pendientes = nuevos
            if st.session_state.idx >= len(st.session_state.pendientes):
                st.session_state.idx = max(0, len(st.session_state.pendientes) - 1)

def set_flash(msg: str, tipo: str = "green"):
    st.session_state.flash = msg; st.session_state.flash_type = tipo

# ─── Main visor ───────────────────────────────────────────────────────────────

def render_visor():
    # ── Carga inicial: se ejecuta UNA SOLA VEZ por sesión al entrar al Visor ──
    if not st.session_state._visor_loaded:
        reload_pendientes()
        st.session_state._visor_loaded = True

    if HAS_AUTOREFRESH:
        count = st_autorefresh(interval=30000, limit=None, key="visor_autorefresh")
        if count > 0:
            reload_pendientes_silent()

    st.markdown(STYLE, unsafe_allow_html=True)

    u      = st.session_state.user
    dist   = u.get("nombre_empresa", "")
    n_pend = len(st.session_state.pendientes)

    # ----- top bar (logo + pending count) -----
    topbar_html = (
        '<div class="topbar" style="position:relative;">'
        '<div style="display:flex; align-items:center; gap:16px;">'
        '<span class="topbar-logo">SHELFMIND</span>'
        f'<span class="topbar-meta">{dist}</span>'
        '</div>'
        '<div style="display:flex; align-items:center; gap:12px;">'
        f'<span class="topbar-meta" style="color:var(--accent-amber);font-weight:bold;">{n_pend} Pendientes</span>'
        '</div>'
        '</div>'
    )
    st.markdown(topbar_html, unsafe_allow_html=True)

    # top-right utility buttons moved out of the evaluation panel
    c_tr1, c_tr2, c_tr3 = st.columns([4,1,1])
    with c_tr2:
        if st.button("↺", key="btn_reload_top", help="Buscar nuevas exhibiciones", type="secondary"):
            reload_pendientes(); st.rerun()
    with c_tr3:
        if st.button("⏏", key="btn_logout_top", help="Salir del sistema", type="secondary"):
            for k in list(st.session_state.keys()): del st.session_state[k]
            st.rerun()

    pend = st.session_state.pendientes
    vendedores_con_pend = get_vendedores_pendientes(u["id_distribuidor"])
    opciones = ["Todos"] + vendedores_con_pend
    filtro_actual = st.session_state.filtro_vendedor
    if filtro_actual not in opciones: opciones.append(filtro_actual)

    if pend or filtro_actual != "Todos":
        with st.expander(f"🔍 FILTRAR VENDEDOR: {filtro_actual.upper()}", expanded=False):
            sel = st.selectbox("Vendedor", opciones, index=opciones.index(filtro_actual), key="sel_vendedor", label_visibility="collapsed")
            col_aplicar, col_limpiar = st.columns([2, 1])
            with col_aplicar:
                if st.button("APLICAR FILTRO", key="btn_aplicar"):
                    st.session_state.filtro_vendedor = sel; st.session_state.idx = 0; st.rerun()
            with col_limpiar:
                if st.button("✕ LIMPIAR", key="btn_limpiar", disabled=(filtro_actual == "Todos")):
                    st.session_state.filtro_vendedor = "Todos"; st.session_state.idx = 0; st.rerun()

    filtro = st.session_state.filtro_vendedor
    pend_filtrada = [p for p in pend if p.get("vendedor") == filtro] if filtro != "Todos" else pend

    idx = st.session_state.idx
    # process navigation query param (used by overlay arrows)
    params = st.experimental_get_query_params()
    nav = params.get("nav", [None])[0]
    if nav == "prev" and pend_filtrada and idx > 0:
        st.session_state.idx -= 1; st.session_state.foto_idx = 0
        st.experimental_set_query_params()
        st.rerun()
    if nav == "next" and pend_filtrada and idx < len(pend_filtrada) - 1:
        st.session_state.idx += 1; st.session_state.foto_idx = 0
        st.experimental_set_query_params()
        st.rerun()
    if pend_filtrada and idx >= len(pend_filtrada): st.session_state.idx = len(pend_filtrada) - 1; idx = st.session_state.idx

    if st.session_state.flash:
        colors_flash = {
            "green": ("rgba(20,80,40,0.95)", "#4ade80", "1px solid rgba(74,222,128,0.4)"),
            "red":   ("rgba(80,20,20,0.95)", "#f87171", "1px solid rgba(248,113,113,0.4)"),
            "amber": ("rgba(80,60,10,0.95)", "#fbbf24", "1px solid rgba(251,191,36,0.4)"),
        }
        bg, tc, bdr = colors_flash.get(st.session_state.flash_type, colors_flash["green"])
        st.markdown(f'<div class="flash-msg" style="background:{bg};color:{tc};border:{bdr};">{st.session_state.flash}</div>', unsafe_allow_html=True)
        st.session_state.flash = None

    # Columna izquierda más ancha, derecha para evaluación
    left_col, right_col = st.columns([2.4, 1], gap="medium")

    # ── COLUMNA IZQUIERDA: FOTO + STATS ────────────────────────────────────────
    with left_col:
        if not pend_filtrada:
            st.markdown(
                '<div class="empty-state">'
                '<div class="empty-icon">🎯</div>'
                '<div class="empty-title">TODO AL DÍA</div>'
                '<div style="color:var(--text-muted);font-size:14px;">No hay exhibiciones pendientes para evaluar.</div>'
                '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Usá el botón ↺ en la cabecera para refrescar o ⏏ para salir.</div>'
                '</div>',
                unsafe_allow_html=True,
            )
            # reload/logout now in topbar
        else:
            ex      = pend_filtrada[idx]
            fotos   = ex.get("fotos", [])
            n_fotos = len(fotos)
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos: foto_idx = 0; st.session_state.foto_idx = 0

            drive_url = fotos[foto_idx]["drive_link"] if fotos else ""
            embed_url = drive_embed_url(drive_url)

            rafaga_html = f'<div class="rafaga-badge">📸 Ráfaga · {n_fotos} fotos</div>' if n_fotos > 1 else ""

            # container now adapts to image ratio and includes overlay arrows/counter
            iframe_html = (
                '<div class="photo-frame-wrapper" style="overflow:hidden; position:relative; max-height:80vh; width:100%;">'
                f'{rafaga_html}'
                # navigation overlays
                '<a href="?nav=prev" class="photo-nav-button prev-overlay">←</a>'
                '<a href="?nav=next" class="photo-nav-button next-overlay">→</a>'
                # counter badge
                f'<div class="photo-counter">{idx+1} / {len(pend_filtrada)}</div>'
                f'<iframe src="{embed_url}" style="width:100%;height:100%;border:none;" allow="autoplay" loading="lazy"></iframe>'
                '</div>'
            )
            st.markdown(iframe_html, unsafe_allow_html=True)

            if n_fotos > 1:
                thumbs_html = '<div class="thumbs-strip">'
                for i, f in enumerate(fotos):
                    thumb_url  = drive_thumbnail_url(f["drive_link"], size=128)
                    active_cls = "active" if i == foto_idx else ""
                    thumbs_html += f'<div class="thumb-wrap {active_cls}"><img src="{thumb_url}"></div>'
                thumbs_html += '</div>'
                st.markdown(thumbs_html, unsafe_allow_html=True)

                cols = st.columns(min(n_fotos, 8))
                for i, col in enumerate(cols[:n_fotos]):
                    with col:
                        if st.button(f"F{i+1}", key=f"tmb_{i}", use_container_width=True):
                            st.session_state.foto_idx = i; st.rerun()

            # hide original navigation row (now handled by overlay arrows)
            # st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            # nav buttons removed

            # ── Stats debajo de la foto ──
            st.markdown("<div style='height:24px'></div>", unsafe_allow_html=True)
            if st.session_state.user:
                stats = get_stats_hoy(st.session_state.user["id_distribuidor"])
                st.markdown(
                    '<div class="card"><div class="card-title">Estadísticas de Hoy</div><div class="stats-grid">'
                    + render_stats_box(str(stats.get("pendientes", 0)), "Pendientes", "stat-amber")
                    + render_stats_box(str(stats.get("aprobadas",  0)), "Aprobadas",  "stat-green")
                    + render_stats_box(str(stats.get("destacadas", 0)), "Destacadas", "stat-amber")
                    + render_stats_box(str(stats.get("rechazadas", 0)), "Rechazadas", "stat-red")
                    + "</div></div>",
                    unsafe_allow_html=True,
                )

    # ── COLUMNA DERECHA: EVALUACIÓN ────────────────────────────────────────────
    with right_col:
        if pend_filtrada:
            ex             = pend_filtrada[idx]
            ids_exhibicion = [f["id_exhibicion"] for f in ex.get("fotos", [])]
            fecha_fmt      = ex.get("fecha_hora", "")[:16]
            supervisor     = u.get("usuario_login", "supervisor")

            eval_container = st.container()
            with eval_container:
                st.markdown('<div id="eval-master-anchor"></div>', unsafe_allow_html=True)

                info_html = (
                    '<div class="floating-info">'
                    f'<div class="f-item" title="Vendedor"><span class="f-icon">👤</span> {ex.get("vendedor", "—")}</div>'
                    f'<div class="f-item" title="Cliente"><span class="f-icon">🏪</span> C: {ex.get("nro_cliente", "—")}</div>'
                    f'<div class="f-item" title="Tipo PDV"><span class="f-icon">📍</span> {ex.get("tipo_pdv", "—")}</div>'
                    f'<div class="f-item" title="Fecha"><span class="f-icon">🕐</span> <span style="color:var(--text-muted)">{fecha_fmt}</span></div>'
                    '</div>'
                )
                st.markdown(info_html, unsafe_allow_html=True)

                comentario = st.text_area(
                    "C", placeholder="Comentario opcional...",
                    key="comentario_field", label_visibility="collapsed",
                )

                cb1, cb2, cb3 = st.columns(3)
                with cb1:
                    # label uses newline so icon and text are in separate rows
                    if st.button("✅\nAPROBAR", key="b_ap"):
                        n = evaluar(ids_exhibicion, "Aprobado", supervisor, comentario)
                        if n > 0:   set_flash("✅ Aprobada", "green")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()
                with cb2:
                    if st.button("🔥\nDESTACAR", key="b_dest"):
                        n = evaluar(ids_exhibicion, "Destacado", supervisor, comentario)
                        if n > 0:   set_flash("🔥 Destacada", "amber")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()
                with cb3:
                    if st.button("❌\nRECHAZAR", key="b_rej"):
                        n = evaluar(ids_exhibicion, "Rechazado", supervisor, comentario)
                        if n > 0:   set_flash("❌ Rechazada", "red")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()

            # bottom reload/logout removed (topbar provides access)


def main():
    init_state()
    if not st.session_state.logged_in: st.switch_page("app.py")
    else: render_visor()

if __name__ == "__main__":
    main()
