# -*- coding: utf-8 -*-
"""
ShelfMind — Visor de Evaluación (Streamlit)
============================================
Ejecutar:
    streamlit run app.py
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import streamlit as st

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
DB_PATH = Path(__file__).resolve().parent.parent.parent / "base_datos" / "centermind.db"

# ─── CSS ──────────────────────────────────────────────────────────────────────
STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── CSS Variables — Paleta ShelfMind Tobacco/Amber ────────── */
:root {
    --bg-darkest:   #1A1311;    
    --bg-dark:      #211510;    
    --bg-card:      rgba(42, 30, 24, 0.8);
    --bg-card-alt:  rgba(33, 21, 16, 0.9);

    --accent-amber: #D9A76A;    
    --accent-sand:  #D9BD9C;    

    --status-approved: #7DAF6B; 
    --status-rejected: #C0584A; 
    --status-featured: #FFC107; 

    --text-primary:    #F0E6D8;
    --text-muted:      rgba(240, 230, 216, 0.5);
    --border-soft:     rgba(217, 167, 106, 0.15);
    --border-light:    rgba(255, 255, 255, 0.06);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}

[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"], section[data-testid="stSidebar"] { display: none !important; }

/* ── Centrado absoluto en PC ──────────────────────────────── */
[data-testid="stMainBlockContainer"], .block-container { 
    padding: 24px 16px !important; 
    max-width: 1100px !important; /* Limita el ancho máximo */
    margin: 0 auto !important;    /* Lo centra en la pantalla */
}

/* ── Fondo con textura ────────────────────────────────────── */
[data-testid="stAppViewContainer"]::before {
    content: ''; position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(217,167,106,0.05) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Header bar ───────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 24px; background: rgba(26, 19, 17, 0.95);
    border-bottom: 1px solid var(--border-soft); border-radius: 16px;
    position: sticky; top: 0; z-index: 100; margin-bottom: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
.topbar-logo { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 3px; color: var(--accent-amber); }
.topbar-meta { font-size: 12px; color: var(--text-muted); }

@media (max-width: 640px) {
    .topbar { padding: 10px 16px; border-radius: 0; margin-bottom: 12px; }
    .topbar-logo { font-size: 20px; }
    .topbar > div:last-child { display: none; }
}

/* ── Evaluador Maestro (El ancla) ─────────────────────────── */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    background: var(--bg-card); border: 1px solid var(--border-soft); border-radius: 12px; padding: 18px; gap: 12px !important;
}

.floating-info {
    display: grid; grid-template-columns: 1fr; gap: 8px;
    margin-bottom: 8px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.f-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f-icon { font-size: 16px; color: var(--accent-amber); flex-shrink: 0; }
.f-muted { color: var(--text-muted); font-size: 11px; }

/* ── "TINDER MODE": Contenedor Flotante en Móvil ───────────── */
@media (max-width: 768px) {
    [data-testid="stMainBlockContainer"] { padding-bottom: 280px !important; }
    
    .photo-frame-wrapper {
        height: calc(100dvh - 280px) !important;
        border-radius: 12px !important; border: 1px solid var(--border-light) !important;
    }

    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
        position: fixed !important; bottom: 0 !important; left: 0 !important; width: 100% !important;
        background: rgba(18, 12, 10, 0.98) !important; padding: 16px 16px 24px 16px !important;
        z-index: 9999 !important; border: none !important; border-top: 1px solid rgba(217, 167, 106, 0.3) !important;
        border-radius: 24px 24px 0 0 !important; box-shadow: 0 -10px 40px rgba(0,0,0,0.9) !important; margin: 0 !important;
    }

    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) div[data-testid="stHorizontalBlock"] {
        display: flex !important; flex-direction: row !important; gap: 10px !important;
    }
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) div[data-testid="column"] {
        width: 33.333% !important; flex: 1 1 0% !important; min-width: 0 !important;
    }

    .floating-info { grid-template-columns: 1fr 1fr; gap: 6px; padding-bottom: 8px; margin-bottom: 4px; }
    .f-item { font-size: 11px; }
    div[data-testid="stTextArea"] textarea { min-height: 48px !important; height: 48px !important; font-size: 13px !important; padding-top: 12px !important; }
}

/* ── Botones de Evaluación y Textos ────────────────────────────── */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important; letter-spacing: 1px !important; font-size: 14px !important;
    border-radius: 10px !important; height: 48px !important; transition: all 0.15s ease !important; width: 100% !important; border: none !important;
    white-space: nowrap !important; /* Fuerza a que no se rompa la palabra */
}
div[data-testid="stButton"] button p {
    white-space: nowrap !important; /* Fuerza a que no se rompa la palabra */
    margin: 0 !important;
}

@media (max-width: 768px) {
    div[data-testid="stButton"] button {
        height: 56px !important; font-size: 13px !important; display: flex !important; flex-direction: column !important; justify-content: center !important;
    }
}

/* Colores de los 3 botones principales */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor) [data-testid="column"]:nth-child(1) div[data-testid="stButton"] button { background: linear-gradient(135deg, #5A8E52, #7DAF6B) !important; color: white !important; font-size: 13px !important; }
[data-testid="stVerticalBlock"]:has(#eval-master-anchor) [data-testid="column"]:nth-child(2) div[data-testid="stButton"] button { background: linear-gradient(135deg, #C99552, #D9A76A) !important; color: #1A1311 !important; font-weight: 800 !important; font-size: 13px !important;}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor) [data-testid="column"]:nth-child(3) div[data-testid="stButton"] button { background: linear-gradient(135deg, #A64A35, #C0584A) !important; color: white !important; font-size: 13px !important;}

/* ── Extras ──────────────────────────────────────────────────────── */
div[data-testid="stTextArea"] textarea { background: var(--bg-darkest) !important; border: 1px solid var(--border-soft) !important; border-radius: 8px !important; color: var(--text-primary) !important; font-family: 'DM Sans', sans-serif !important; }
div[data-testid="stTextArea"] textarea:focus { border-color: var(--accent-amber) !important; }
.stTextArea label { display: none !important; }
.card { background: var(--bg-card); border: 1px solid var(--border-soft); border-radius: 12px; padding: 18px; margin-bottom: 12px; }
.card-title { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent-amber); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
.card-title::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }

/* Grid de Stats para PC (4 columnas) y Móvil (2 columnas) */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr 1fr; } }

.stat-box { background: rgba(217,167,106,0.04); border: 1px solid var(--border-soft); border-radius: 10px; padding: 16px 10px; text-align: center; }
.stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 32px; line-height: 1; margin-bottom: 4px; font-weight: bold; }
.stat-lbl { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-dim); font-weight: 600; }
.stat-green { color: var(--status-approved); } .stat-amber { color: var(--accent-amber); } .stat-red { color: var(--status-rejected); } .stat-white { color: var(--text-primary); }

.rafaga-badge { position: absolute; top: 12px; right: 12px; z-index: 10; display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 20px; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; background: rgba(18, 12, 10, 0.85); color: var(--accent-amber); border: 1px solid var(--border-soft); font-weight: 600; backdrop-filter: blur(4px); }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-icon { font-size: 48px; margin-bottom: 20px; }
.empty-title { font-family: 'Bebas Neue', sans-serif; font-size: 28px; color: var(--text-primary); letter-spacing: 2px; margin-bottom: 8px; }
.thumbs-strip { display: flex; gap: 8px; padding: 10px 0; overflow-x: auto; }
.thumb-wrap { flex-shrink: 0; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 2px solid transparent; cursor: pointer; }
.thumb-wrap.active { border-color: var(--accent-amber); box-shadow: 0 0 12px rgba(217,167,106,0.35); }
.thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }
.flash-msg { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 14px 28px; border-radius: 50px; font-size: 12px; font-weight: 600; z-index: 10000; animation: fadeup 0.3s ease, fadeout 0.4s ease 2s forwards; }
@keyframes fadeup { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes fadeout { to { opacity: 0; } }

div[data-testid="stExpander"] { background: transparent !important; border: 1px solid var(--border-soft) !important; border-radius: 10px !important; margin: 4px 0 12px 0 !important; }
div[data-testid="stExpander"] summary { font-family: 'Bebas Neue', sans-serif !important; font-size: 14px !important; letter-spacing: 1.5px !important; color: var(--accent-amber) !important; padding: 10px 14px !important; }
::-webkit-scrollbar { width: 0px; height: 0px; }
</style>
"""

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

def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> bool:
    try:
        with get_conn() as c:
            for id_ex in ids_exhibicion:
                c.execute("UPDATE exhibiciones SET estado=?, supervisor_nombre=?, comentarios=?, evaluated_at=CURRENT_TIMESTAMP, synced_telegram=0 WHERE id_exhibicion=?", (estado, supervisor, comentario or None, id_ex))
            c.commit()
        return True
    except:
        return False

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
    defaults = {"logged_in": False, "user": None, "pendientes": [], "idx": 0, "foto_idx": 0, "flash": None, "flash_type": "green", "filtro_vendedor": "Todos"}
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
    if HAS_AUTOREFRESH:
        count = st_autorefresh(interval=30000, limit=None, key="visor_autorefresh")
        if count > 0:
            reload_pendientes_silent()

    st.markdown(STYLE, unsafe_allow_html=True)
    
    u = st.session_state.user
    dist = u.get("nombre_empresa", "")
    n_pend = len(st.session_state.pendientes)

    topbar_html = (
        '<div class="topbar">'
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
    if pend_filtrada and idx >= len(pend_filtrada): st.session_state.idx = len(pend_filtrada) - 1; idx = st.session_state.idx

    if st.session_state.flash:
        colors_flash = {"green": ("rgba(20,80,40,0.95)", "#4ade80", "1px solid rgba(74,222,128,0.4)"), "red": ("rgba(80,20,20,0.95)", "#f87171", "1px solid rgba(248,113,113,0.4)"), "amber": ("rgba(80,60,10,0.95)", "#fbbf24", "1px solid rgba(251,191,36,0.4)")}
        bg, tc, bdr = colors_flash.get(st.session_state.flash_type, colors_flash["green"])
        st.markdown(f'<div class="flash-msg" style="background:{bg};color:{tc};border:{bdr};">{st.session_state.flash}</div>', unsafe_allow_html=True)
        st.session_state.flash = None

    # Columna izquierda un poco más ancha para que la derecha tenga el espacio justo
    left_col, right_col = st.columns([2.4, 1], gap="medium")

    # ── COLUMNA IZQUIERDA: FOTO + STATS ────────────────────────────────────────
    with left_col:
        if not pend_filtrada:
            st.markdown('<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">TODO AL DÍA</div><div class="empty-sub">No hay exhibiciones pendientes para evaluar.</div></div>', unsafe_allow_html=True)
            st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)
            c1, c2, c3 = st.columns([1, 2, 1])
            with c2:
                if st.button("↺ BUSCAR NUEVAS EXHIBICIONES", key="btn_reload_empty", use_container_width=True):
                    reload_pendientes(); st.rerun()
                st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)
                if st.button("SALIR DEL SISTEMA", key="btn_logout_empty", type="secondary", use_container_width=True):
                    for k in list(st.session_state.keys()): del st.session_state[k]
                    st.rerun()
        else:
            ex = pend_filtrada[idx]
            fotos = ex.get("fotos", [])
            n_fotos = len(fotos)
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos: foto_idx = 0; st.session_state.foto_idx = 0

            drive_url = fotos[foto_idx]["drive_link"] if fotos else ""
            embed_url = drive_embed_url(drive_url)

            rafaga_html = f'<div class="rafaga-badge">📸 Ráfaga · {n_fotos} fotos</div>' if n_fotos > 1 else ""

            iframe_html = (
                '<div class="photo-frame-wrapper" style="background:#000; overflow:hidden; position:relative; height:58vh;">'
                f'{rafaga_html}'
                f'<iframe src="{embed_url}" style="width:100%;height:100%;border:none;" allow="autoplay" loading="lazy"></iframe>'
                '</div>'
            )
            st.markdown(iframe_html, unsafe_allow_html=True)

            if n_fotos > 1:
                thumbs_html = '<div class="thumbs-strip">'
                for i, f in enumerate(fotos):
                    thumb_url = drive_thumbnail_url(f["drive_link"], size=128)
                    active_cls = "active" if i == foto_idx else ""
                    thumbs_html += f'<div class="thumb-wrap {active_cls}"><img src="{thumb_url}"></div>'
                thumbs_html += '</div>'
                st.markdown(thumbs_html, unsafe_allow_html=True)
                
                cols = st.columns(min(n_fotos, 8))
                for i, col in enumerate(cols[:n_fotos]):
                    with col:
                        if st.button(f"F{i+1}", key=f"tmb_{i}", use_container_width=True):
                            st.session_state.foto_idx = i; st.rerun()

            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            c_prev, c_txt, c_next = st.columns([1, 2, 1])
            with c_prev:
                if st.button("← ANTERIOR", key="btn_prev", disabled=(idx == 0)):
                    st.session_state.idx -= 1; st.session_state.foto_idx = 0; st.rerun()
            with c_txt:
                st.markdown(f'<div style="text-align:center;font-size:11px;color:var(--text-muted);padding-top:14px;font-family:monospace;">EXHIBICIÓN {idx+1} / {len(pend_filtrada)}</div>', unsafe_allow_html=True)
            with c_next:
                if st.button("SIGUIENTE →", key="btn_next", disabled=(idx >= len(pend_filtrada) - 1)):
                    st.session_state.idx += 1; st.session_state.foto_idx = 0; st.rerun()

            # ── STATS MOVIDAS DEBAJO DE LA FOTO ──
            st.markdown("<div style='height:30px'></div>", unsafe_allow_html=True)
            if st.session_state.user:
                stats = get_stats_hoy(st.session_state.user["id_distribuidor"])
                st.markdown(
                    '<div class="card"><div class="card-title">Estadísticas de Hoy</div><div class="stats-grid">'
                    + render_stats_box(str(stats.get("pendientes", 0)), "Pendientes", "stat-amber")
                    + render_stats_box(str(stats.get("aprobadas", 0)), "Aprobadas", "stat-green")
                    + render_stats_box(str(stats.get("destacadas", 0)), "Destacadas", "stat-amber")
                    + render_stats_box(str(stats.get("rechazadas", 0)), "Rechazadas", "stat-red")
                    + "</div></div>", unsafe_allow_html=True
                )

    # ── COLUMNA DERECHA: EVALUACIÓN ────────────────────────────────────────────
    with right_col:
        if pend_filtrada:
            ex = pend_filtrada[idx]
            ids_exhibicion = [f["id_exhibicion"] for f in ex.get("fotos", [])]
            fecha_fmt = ex.get("fecha_hora", "")[:16]

            # ── EL BLOQUE MÁGICO DE EVALUACIÓN ──
            eval_container = st.container()
            with eval_container:
                st.markdown('<div id="eval-master-anchor"></div>', unsafe_allow_html=True)
                
                info_html = (
                    '<div class="floating-info">'
                    f'<div class="f-item" title="Vendedor"><span class="f-icon">👤</span> {ex.get("vendedor", "—")}</div>'
                    f'<div class="f-item" title="Cliente"><span class="f-icon">🏪</span> C: {ex.get("nro_cliente", "—")}</div>'
                    f'<div class="f-item" title="Tipo PDV"><span class="f-icon">📍</span> {ex.get("tipo_pdv", "—")}</div>'
                    f'<div class="f-item" title="Fecha"><span class="f-icon">🕐</span> <span class="f-muted">{fecha_fmt}</span></div>'
                    '</div>'
                )
                st.markdown(info_html, unsafe_allow_html=True)

                comentario = st.text_area("C", placeholder="Escribe un comentario opcional...", key="comentario_field", label_visibility="collapsed")

                cb1, cb2, cb3 = st.columns(3)
                supervisor = u.get("usuario_login", "supervisor")
                
                with cb1:
                    if st.button("✅ APROBAR", key="b_ap"):
                        if evaluar(ids_exhibicion, "Aprobado", supervisor, comentario): set_flash("✅ Aprobada", "green"); reload_pendientes(); st.rerun()
                with cb2:
                    if st.button("🔥 DESTACAR", key="b_dest"):
                        if evaluar(ids_exhibicion, "Destacado", supervisor, comentario): set_flash("🔥 Destacada", "amber"); reload_pendientes(); st.rerun()
                with cb3:
                    if st.button("❌ RECHAZAR", key="b_rej"):
                        if evaluar(ids_exhibicion, "Rechazado", supervisor, comentario): set_flash("❌ Rechazada", "red"); reload_pendientes(); st.rerun()

            # Botones de Sistema en la columna derecha debajo de la evaluación
            st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)
            if st.button("↺ RECARGAR PANTALLA", key="btn_reload_full", use_container_width=True):
                reload_pendientes(); st.rerun()
            st.markdown("<div style='height:4px'></div>", unsafe_allow_html=True)
            if st.button("SALIR DEL SISTEMA", key="btn_logout_full", type="secondary", use_container_width=True):
                for k in list(st.session_state.keys()): del st.session_state[k]
                st.rerun()

def main():
    init_state()
    if not st.session_state.logged_in: st.switch_page("app.py")
    else: render_visor()

if __name__ == "__main__":
    main()