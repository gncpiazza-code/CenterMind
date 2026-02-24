# -*- coding: utf-8 -*-
"""
CenterMind — Visor de Evaluación (Streamlit)
============================================
Ejecutar:
    streamlit run visor_streamlit.py

Requiere:
    pip install streamlit
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import streamlit as st

if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="CenterMind · Evaluación",
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

/* ── Reset & base ─────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: #07080f !important;
    color: #e2e8f0 !important;
    font-family: 'DM Sans', sans-serif !important;
}

[data-testid="stHeader"] { display: none !important; }
[data-testid="stToolbar"] { display: none !important; }
[data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { display: none !important; }
.block-container { padding: 0 !important; max-width: 100% !important; }

/* ── Fondo con textura ────────────────────────────────────── */
[data-testid="stAppViewContainer"]::before {
    content: '';
    position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(251,191,36,0.04) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 90% 80%, rgba(34,211,238,0.03) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.015) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.015) 40px);
    pointer-events: none;
}

/* ── Login ────────────────────────────────────────────────── */
.login-wrap {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 40px 20px;
}
.login-card {
    background: rgba(15,17,30,0.95);
    border: 1px solid rgba(251,191,36,0.25);
    border-radius: 20px;
    padding: 52px 48px 44px;
    width: 100%; max-width: 420px;
    box-shadow: 0 0 60px rgba(251,191,36,0.08), 0 24px 64px rgba(0,0,0,0.6);
    backdrop-filter: blur(12px);
}
.login-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 48px; letter-spacing: 4px;
    color: #fbbf24; text-align: center;
    line-height: 1; margin-bottom: 4px;
    text-shadow: 0 0 30px rgba(251,191,36,0.4);
}
.login-sub {
    font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
    color: rgba(226,232,240,0.4); text-align: center; margin-bottom: 40px;
}
.login-label {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: rgba(226,232,240,0.5); margin-bottom: 8px; display: block;
}

/* ── Header bar ───────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 32px;
    background: rgba(10,12,22,0.9);
    border-bottom: 1px solid rgba(251,191,36,0.12);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 100;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px; letter-spacing: 3px; color: #fbbf24;
}
.topbar-meta { font-size: 12px; color: rgba(226,232,240,0.4); letter-spacing: 1px; }
.topbar-user {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: rgba(226,232,240,0.6);
}
.user-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
}

/* ── Main layout ──────────────────────────────────────────── */
.main-grid {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 0;
    height: calc(100vh - 57px);
    overflow: hidden;
}
.photo-panel {
    background: #07080f;
    display: flex; flex-direction: column;
    border-right: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
}
.right-panel {
    background: rgba(10,12,22,0.8);
    display: flex; flex-direction: column;
    overflow-y: auto;
    padding: 24px 20px;
    gap: 20px;
}

/* ── Photo frame ──────────────────────────────────────────── */
.photo-frame {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
    padding: 16px;
}
.photo-frame img {
    max-width: 100%; max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    transition: opacity 0.2s ease;
}
.photo-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid rgba(255,255,255,0.05);
}
.nav-counter {
    font-family: 'DM Mono', monospace;
    font-size: 13px; color: rgba(226,232,240,0.4);
    letter-spacing: 1px;
}

/* ── Cards ────────────────────────────────────────────────── */
.card {
    background: rgba(20,23,40,0.8);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 20px;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: rgba(226,232,240,0.35); margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
}
.card-title::after {
    content: ''; flex: 1; height: 1px;
    background: rgba(255,255,255,0.06);
}

/* ── Detail rows ──────────────────────────────────────────── */
.detail-row {
    display: flex; align-items: flex-start;
    gap: 12px; padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.detail-row:last-child { border-bottom: none; padding-bottom: 0; }
.detail-icon { font-size: 16px; line-height: 1.4; flex-shrink: 0; }
.detail-label {
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    color: rgba(226,232,240,0.3); line-height: 1;
    margin-bottom: 3px;
}
.detail-value {
    font-size: 14px; color: #e2e8f0; font-weight: 500;
    line-height: 1.3;
}
.detail-value.accent { color: #22d3ee; }
.detail-value.muted { color: rgba(226,232,240,0.5); font-size: 12px; }

/* ── Estado badge ─────────────────────────────────────────── */
.badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 12px; border-radius: 20px;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    font-weight: 600;
}
.badge-pending   { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.badge-aprobado  { background: rgba(74,222,128,0.15); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.badge-rechazado { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
.badge-destacado { background: rgba(251,191,36,0.2);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.5); }

/* ── Stats grid ───────────────────────────────────────────── */
.stats-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.stat-box {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 12px 14px;
    text-align: center;
}
.stat-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px; line-height: 1;
    margin-bottom: 4px;
}
.stat-lbl { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(226,232,240,0.35); }
.stat-green  { color: #4ade80; }
.stat-amber  { color: #fbbf24; }
.stat-red    { color: #f87171; }
.stat-cyan   { color: #22d3ee; }
.stat-white  { color: #e2e8f0; }

/* ── Action buttons ───────────────────────────────────────── */
.action-row { display: flex; gap: 10px; margin-top: 4px; }

/* Streamlit button overrides */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important;
    font-size: 16px !important;
    border-radius: 10px !important;
    height: 52px !important;
    transition: all 0.15s ease !important;
    width: 100% !important;
    border: none !important;
}

/* Aprobar */
div[data-testid="stButton"][aria-label="aprobar"] button,
.btn-aprobar button {
    background: linear-gradient(135deg, #15803d, #16a34a) !important;
    color: white !important;
    box-shadow: 0 4px 20px rgba(22,163,74,0.3) !important;
}
div[data-testid="stButton"][aria-label="aprobar"] button:hover {
    background: linear-gradient(135deg, #16a34a, #22c55e) !important;
    box-shadow: 0 4px 28px rgba(34,197,94,0.45) !important;
    transform: translateY(-2px) !important;
}

/* Streamlit inputs */
div[data-testid="stTextInput"] input,
div[data-testid="stTextInput"] input:focus {
    background: rgba(20,23,40,0.9) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
    font-family: 'DM Sans', sans-serif !important;
    font-size: 14px !important;
}
div[data-testid="stTextInput"] input:focus {
    border-color: rgba(251,191,36,0.4) !important;
    box-shadow: 0 0 0 3px rgba(251,191,36,0.08) !important;
}

div[data-testid="stTextArea"] textarea {
    background: rgba(20,23,40,0.9) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
    font-family: 'DM Sans', sans-serif !important;
    font-size: 13px !important;
    resize: vertical !important;
}
div[data-testid="stTextArea"] textarea:focus {
    border-color: rgba(251,191,36,0.4) !important;
    box-shadow: 0 0 0 3px rgba(251,191,36,0.08) !important;
}

div[data-testid="stAlert"] {
    background: rgba(248,113,113,0.1) !important;
    border: 1px solid rgba(248,113,113,0.3) !important;
    border-radius: 10px !important;
    color: #f87171 !important;
}

/* hide streamlit default labels when custom ones used */
.stTextInput label, .stTextArea label { display: none !important; }

/* Nav buttons */
div[data-testid="stButton"] button[kind="secondary"] {
    background: rgba(255,255,255,0.05) !important;
    color: rgba(226,232,240,0.7) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    font-size: 13px !important;
    height: 40px !important;
    letter-spacing: 1px !important;
}
div[data-testid="stButton"] button[kind="secondary"]:hover {
    background: rgba(255,255,255,0.1) !important;
    color: white !important;
}

/* Scrollbar */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(251,191,36,0.4); }

/* Empty state */
.empty-state {
    text-align: center; padding: 60px 20px;
    color: rgba(226,232,240,0.3);
}
.empty-icon { font-size: 64px; margin-bottom: 20px; }
.empty-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px; color: rgba(226,232,240,0.5);
    letter-spacing: 3px; margin-bottom: 8px;
}
.empty-sub { font-size: 14px; }

/* Drive iframe container */
.drive-embed {
    width: 100%; height: 100%;
    border: none; border-radius: 8px;
    background: #111;
}

/* Toast-like flash */
.flash-msg {
    position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
    padding: 12px 28px; border-radius: 50px;
    font-size: 13px; font-weight: 600; letter-spacing: 1px;
    z-index: 9999;
    animation: fadeup 0.3s ease, fadeout 0.4s ease 2s forwards;
}
@keyframes fadeup {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes fadeout {
    to { opacity: 0; }
}

/* Progress thin bar at top */
.progress-bar-wrap {
    height: 3px; background: rgba(255,255,255,0.05);
    border-radius: 2px; overflow: hidden; margin-top: 12px;
}
.progress-bar-fill {
    height: 100%; border-radius: 2px;
    background: linear-gradient(90deg, #fbbf24, #22d3ee);
    transition: width 0.4s ease;
}

/* Hotkey badge */
.hotkey {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 5px;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    font-family: 'DM Mono', monospace; font-size: 11px;
    color: rgba(226,232,240,0.6);
}

/* Section divider */
.sec-div {
    height: 1px; background: rgba(255,255,255,0.05);
    margin: 4px 0;
}

div[data-testid="stHorizontalBlock"] { gap: 8px !important; }
div[data-testid="column"] { padding: 0 !important; }

/* ── Expander (panel de filtros) ──────────────────────── */
div[data-testid="stExpander"] {
    background: rgba(20,23,40,0.7) !important;
    border: 1px solid rgba(251,191,36,0.15) !important;
    border-radius: 10px !important;
    margin: 8px 0 4px 0 !important;
}
div[data-testid="stExpander"] summary {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 15px !important;
    letter-spacing: 2px !important;
    color: rgba(251,191,36,0.8) !important;
    padding: 10px 16px !important;
}
div[data-testid="stExpander"] summary:hover {
    color: #fbbf24 !important;
}
div[data-testid="stExpander"] > div[data-testid="stExpanderDetails"] {
    padding: 4px 16px 14px 16px !important;
}

/* ── Selectbox ────────────────────────────────────────── */
div[data-testid="stSelectbox"] > div > div {
    background: rgba(20,23,40,0.9) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
}
div[data-testid="stSelectbox"] > div > div:focus-within {
    border-color: rgba(251,191,36,0.4) !important;
    box-shadow: 0 0 0 3px rgba(251,191,36,0.08) !important;
}
div[data-testid="stSelectbox"] label { display: none !important; }

/* ── Miniaturas de ráfaga ─────────────────────────────── */
.thumbs-strip {
    display: flex; gap: 8px;
    padding: 10px 16px;
    overflow-x: auto;
    border-top: 1px solid rgba(255,255,255,0.05);
    background: rgba(7,8,15,0.6);
}
.thumb-wrap {
    flex-shrink: 0;
    width: 64px; height: 64px;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.08);
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
}
.thumb-wrap.active {
    border-color: #fbbf24;
    box-shadow: 0 0 10px rgba(251,191,36,0.35);
}
.thumb-wrap img {
    width: 100%; height: 100%;
    object-fit: cover;
}
.foto-nav-bar {
    display: flex; align-items: center; justify-content: center;
    gap: 16px; padding: 6px 0 2px 0;
}
.foto-counter {
    font-family: 'DM Mono', monospace;
    font-size: 12px; color: rgba(226,232,240,0.5);
    letter-spacing: 1px;
}
.rafaga-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 10px; border-radius: 20px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    background: rgba(251,191,36,0.12);
    color: #fbbf24;
    border: 1px solid rgba(251,191,36,0.25);
}
</style>
"""

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def login_check(usuario: str, password: str) -> Optional[Dict]:
    with get_conn() as c:
        row = c.execute(
            """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                      d.nombre_empresa
               FROM usuarios_portal u
               JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
               WHERE u.usuario_login = ? AND u.password = ?""",
            (usuario.strip(), password.strip()),
        ).fetchone()
    return dict(row) if row else None


def get_pendientes(distribuidor_id: int) -> List[Dict]:
    """
    Devuelve una lista de GRUPOS (ráfaga = varias fotos con el mismo
    telegram_msg_id). Cada grupo tiene:
      - vendedor, nro_cliente, tipo_pdv, fecha_hora, distribuidora
      - fotos: [{ id_exhibicion, drive_link }, ...]
      - telegram_msg_id, telegram_chat_id
      - grupo_key: str usado como identificador único de grupo
    Las exhibiciones sin telegram_msg_id se tratan como grupo individual.
    """
    with get_conn() as c:
        rows = c.execute(
            """SELECT
                   e.id_exhibicion,
                   e.numero_cliente_local      AS nro_cliente,
                   e.comentarios_telegram      AS tipo_pdv,
                   e.url_foto_drive            AS drive_link,
                   e.timestamp_subida          AS fecha_hora,
                   e.estado,
                   e.telegram_msg_id,
                   e.telegram_chat_id,
                   i.nombre_integrante         AS vendedor,
                   d.nombre_empresa            AS distribuidora
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i
                   ON i.id_integrante = e.id_integrante
               LEFT JOIN distribuidores d
                   ON d.id_distribuidor = e.id_distribuidor
               WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente'
               ORDER BY e.timestamp_subida ASC""",
            (distribuidor_id,),
        ).fetchall()

    # Agrupar por telegram_msg_id (None → grupo propio por id)
    grupos_dict: Dict[str, Dict] = {}
    for r in rows:
        d = dict(r)
        msg_id = d.get("telegram_msg_id")
        # Clave de grupo: msg_id si existe, sino el id propio
        key = str(msg_id) if msg_id else f"solo_{d['id_exhibicion']}"

        if key not in grupos_dict:
            grupos_dict[key] = {
                "grupo_key":       key,
                "vendedor":        d["vendedor"],
                "nro_cliente":     d["nro_cliente"],
                "tipo_pdv":        d["tipo_pdv"],
                "fecha_hora":      d["fecha_hora"],
                "distribuidora":   d["distribuidora"],
                "telegram_msg_id": d["telegram_msg_id"],
                "telegram_chat_id":d["telegram_chat_id"],
                "fotos":           [],
            }
        grupos_dict[key]["fotos"].append({
            "id_exhibicion": d["id_exhibicion"],
            "drive_link":    d["drive_link"],
        })

    return list(grupos_dict.values())


def get_stats_hoy(distribuidor_id: int) -> Dict:
    hoy = datetime.now().strftime("%Y-%m-%d")
    with get_conn() as c:
        row = c.execute(
            """SELECT
                   COUNT(*) total,
                   SUM(CASE WHEN estado = 'Pendiente'  THEN 1 ELSE 0 END) pendientes,
                   SUM(CASE WHEN estado = 'Aprobado'   THEN 1 ELSE 0 END) aprobadas,
                   SUM(CASE WHEN estado = 'Rechazado'  THEN 1 ELSE 0 END) rechazadas,
                   SUM(CASE WHEN estado = 'Destacado'  THEN 1 ELSE 0 END) destacadas
               FROM exhibiciones
               WHERE id_distribuidor = ?
                 AND DATE(timestamp_subida) = ?""",
            (distribuidor_id, hoy),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}


def get_vendedores_pendientes(distribuidor_id: int) -> List[str]:
    """Devuelve lista de nombres de vendedores que tienen al menos una exhibición Pendiente."""
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT i.nombre_integrante
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente'
               ORDER BY i.nombre_integrante ASC""",
            (distribuidor_id,),
        ).fetchall()
    return [r["nombre_integrante"] for r in rows if r["nombre_integrante"]]


def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> bool:
    """Evalúa todas las exhibiciones de un grupo (ráfaga) de una sola vez."""
    try:
        with get_conn() as c:
            for id_ex in ids_exhibicion:
                c.execute(
                    """UPDATE exhibiciones
                       SET estado = ?,
                           supervisor_nombre = ?,
                           comentarios = ?,
                           evaluated_at = CURRENT_TIMESTAMP,
                           synced_telegram = 0
                       WHERE id_exhibicion = ?""",
                    (estado, supervisor, comentario or None, id_ex),
                )
            c.commit()
        return True
    except Exception as e:
        st.error(f"Error al guardar: {e}")
        return False


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
    if fid:
        return f"https://drive.google.com/file/d/{fid}/preview"
    return url

def drive_thumbnail_url(url: str, size: int = 800) -> str:
    fid = drive_file_id(url)
    if fid:
        return f"https://drive.google.com/thumbnail?id={fid}&sz=w{size}"
    return url


# ─── State helpers ────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "logged_in":       False,
        "user":            None,
        "pendientes":      [],
        "idx":             0,
        "foto_idx":        0,   # foto activa dentro del grupo (ráfaga)
        "flash":           None,
        "flash_type":      "green",
        "reload_trigger":  0,
        "filtro_vendedor": "Todos",
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def reload_pendientes():
    u = st.session_state.user
    if u:
        st.session_state.pendientes = get_pendientes(u["id_distribuidor"])
        if st.session_state.idx >= len(st.session_state.pendientes):
            st.session_state.idx = max(0, len(st.session_state.pendientes) - 1)
        st.session_state.foto_idx = 0  # resetear foto interna al recargar


def set_flash(msg: str, tipo: str = "green"):
    st.session_state.flash = msg
    st.session_state.flash_type = tipo


# ─── Components ───────────────────────────────────────────────────────────────

def render_topbar():
    u = st.session_state.user
    dist = u.get("nombre_empresa", "") if u else ""
    user_name = u.get("usuario_login", "") if u else ""
    n_pend = len(st.session_state.pendientes)

    st.markdown(f"""
    <div class="topbar">
        <div style="display:flex; align-items:center; gap:20px;">
            <span class="topbar-logo">CENTERMIND</span>
            <span class="topbar-meta">{dist}</span>
        </div>
        <div style="display:flex; align-items:center; gap:24px;">
            <span class="topbar-meta">{n_pend} pendientes</span>
            <div class="topbar-user">
                <div class="user-dot"></div>
                <span>{user_name}</span>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_login():
    st.markdown(STYLE, unsafe_allow_html=True)
    st.markdown('<div class="login-wrap">', unsafe_allow_html=True)
    st.markdown("""
    <div class="login-card">
        <div class="login-logo">CENTERMIND</div>
        <div class="login-sub">Panel de Evaluación</div>
    </div>
    """, unsafe_allow_html=True)

    with st.form("login_form"):
        st.markdown('<span class="login-label">Usuario</span>', unsafe_allow_html=True)
        usuario = st.text_input("u", placeholder="tu usuario", label_visibility="collapsed")
        st.markdown('<span class="login-label" style="margin-top:16px;display:block">Contraseña</span>', unsafe_allow_html=True)
        password = st.text_input("p", type="password", placeholder="••••••••", label_visibility="collapsed")
        st.markdown("<br>", unsafe_allow_html=True)
        submitted = st.form_submit_button("INGRESAR →", use_container_width=True)

        if submitted:
            if not usuario or not password:
                st.error("Completá ambos campos")
            else:
                user = login_check(usuario, password)
                if user:
                    st.session_state.logged_in = True
                    st.session_state.user = user
                    reload_pendientes()
                    st.rerun()
                else:
                    st.error("Usuario o contraseña incorrectos")

    st.markdown('</div>', unsafe_allow_html=True)


def render_empty_state():
    st.markdown("""
    <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <div class="empty-title">TODO AL DÍA</div>
        <div class="empty-sub">No hay exhibiciones pendientes en este momento.</div>
    </div>
    """, unsafe_allow_html=True)


def badge_html(estado: str) -> str:
    cls = {
        "Pendiente": "badge-pending",
        "Aprobado":  "badge-aprobado",
        "Rechazado": "badge-rechazado",
        "Destacado": "badge-destacado",
    }.get(estado, "badge-pending")
    icons = {"Pendiente": "⏳", "Aprobado": "✅", "Rechazado": "❌", "Destacado": "🔥"}
    return f'<span class="badge {cls}">{icons.get(estado, "")} {estado}</span>'


def render_detail_row(icon: str, label: str, value: str, accent: bool = False, muted: bool = False) -> str:
    cls = "accent" if accent else ("muted" if muted else "")
    return f"""
    <div class="detail-row">
        <span class="detail-icon">{icon}</span>
        <div>
            <div class="detail-label">{label}</div>
            <div class="detail-value {cls}">{value or '—'}</div>
        </div>
    </div>"""


def render_stats_box(num: str, label: str, color_class: str) -> str:
    return f"""
    <div class="stat-box">
        <div class="stat-num {color_class}">{num}</div>
        <div class="stat-lbl">{label}</div>
    </div>"""


# ─── Main visor ───────────────────────────────────────────────────────────────

def render_visor():
    st.markdown(STYLE, unsafe_allow_html=True)
    render_topbar()

    u    = st.session_state.user
    pend = st.session_state.pendientes

    # ── Panel de filtros (colapsable) ──────────────────────────────────────────
    vendedores_con_pend = get_vendedores_pendientes(u["id_distribuidor"])
    opciones = ["Todos"] + vendedores_con_pend

    # Si el vendedor filtrado ya no tiene pendientes, lo mantenemos en la lista
    # igual (mostrará lista vacía, que es el comportamiento deseado).
    # Pero si la opción ya no existe en el dropdown la agregamos de todas formas
    # para que no explote el index.
    filtro_actual = st.session_state.filtro_vendedor
    if filtro_actual not in opciones:
        opciones.append(filtro_actual)

    filtro_label = (
        f'<span class="filtro-activo">👤 {filtro_actual}</span>'
        if filtro_actual != "Todos" else ""
    )

    with st.expander(f"🔍  FILTRAR {filtro_label}", expanded=False):
        sel = st.selectbox(
            "Vendedor",
            opciones,
            index=opciones.index(filtro_actual),
            key="sel_vendedor",
            label_visibility="collapsed",
        )
        col_aplicar, col_limpiar = st.columns([2, 1])
        with col_aplicar:
            if st.button("APLICAR FILTRO", key="btn_aplicar_filtro", use_container_width=True):
                if sel != st.session_state.filtro_vendedor:
                    st.session_state.filtro_vendedor = sel
                    st.session_state.idx = 0
                st.rerun()
        with col_limpiar:
            if st.button("✕ LIMPIAR", key="btn_limpiar_filtro", use_container_width=True,
                         disabled=(filtro_actual == "Todos")):
                st.session_state.filtro_vendedor = "Todos"
                st.session_state.idx = 0
                st.rerun()

    # ── Aplicar filtro a la lista ──────────────────────────────────────────────
    filtro = st.session_state.filtro_vendedor
    if filtro and filtro != "Todos":
        pend_filtrada = [p for p in pend if p.get("vendedor") == filtro]
    else:
        pend_filtrada = pend

    # Clamp idx al tamaño de la lista filtrada
    idx = st.session_state.idx
    if pend_filtrada and idx >= len(pend_filtrada):
        st.session_state.idx = len(pend_filtrada) - 1
        idx = st.session_state.idx
    elif not pend_filtrada:
        idx = 0

    # ── Flash message ──────────────────────────────────────────────────────────
    if st.session_state.flash:
        colors_flash = {
            "green":  ("rgba(20,80,40,0.95)", "#4ade80", "1px solid rgba(74,222,128,0.4)"),
            "red":    ("rgba(80,20,20,0.95)", "#f87171", "1px solid rgba(248,113,113,0.4)"),
            "amber":  ("rgba(80,60,10,0.95)", "#fbbf24", "1px solid rgba(251,191,36,0.4)"),
        }
        bg, tc, bdr = colors_flash.get(st.session_state.flash_type, colors_flash["green"])
        st.markdown(
            f'<div class="flash-msg" style="background:{bg};color:{tc};border:{bdr};">'
            f'{st.session_state.flash}</div>',
            unsafe_allow_html=True,
        )
        st.session_state.flash = None

    # ── Layout principal ───────────────────────────────────────────────────────
    left_col, right_col = st.columns([3, 1], gap="small")

    # ── COLUMNA IZQUIERDA: foto + navegación ───────────────────────────────────
    with left_col:
        if not pend_filtrada:
            render_empty_state()
        else:
            ex       = pend_filtrada[idx]
            total    = len(pend_filtrada)
            fotos    = ex.get("fotos", [])
            n_fotos  = len(fotos)

            # Clamp foto_idx
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos:
                foto_idx = 0
                st.session_state.foto_idx = 0

            drive_url  = fotos[foto_idx]["drive_link"] if fotos else ""
            embed_url  = drive_embed_url(drive_url)

            # Badge de ráfaga (solo si hay más de 1 foto)
            rafaga_html = ""
            if n_fotos > 1:
                rafaga_html = f'<span class="rafaga-badge">📸 Ráfaga · {n_fotos} fotos</span>'

            # Foto principal
            st.markdown(
                f"""
                <div style="background:#07080f; border-radius:12px; overflow:hidden;
                            border:1px solid rgba(255,255,255,0.06); height:58vh; position:relative;">
                    <iframe src="{embed_url}"
                            style="width:100%;height:100%;border:none;"
                            allow="autoplay"
                            loading="lazy">
                    </iframe>
                    <div style="position:absolute;bottom:0;left:0;right:0;
                                background:linear-gradient(transparent,rgba(7,8,15,0.8));
                                padding:12px 16px; pointer-events:none;
                                display:flex; align-items:center; gap:10px;">
                        <span style="font-family:'DM Mono',monospace;font-size:11px;
                                     color:rgba(226,232,240,0.4);letter-spacing:1px;">
                            {ex.get('tipo_pdv','').upper()} · {ex.get('vendedor','').upper()} · CLIENTE {ex.get('nro_cliente','')}
                        </span>
                        {rafaga_html}
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            # ── Navegación interna del grupo (ráfaga) ──────────────────────
            if n_fotos > 1:
                # Barra de flechas + contador
                fn1, fn2, fn3 = st.columns([1, 3, 1])
                with fn1:
                    if st.button("← Foto", key="btn_foto_prev",
                                 use_container_width=True, disabled=(foto_idx == 0)):
                        st.session_state.foto_idx -= 1
                        st.rerun()
                with fn2:
                    st.markdown(
                        f'<div class="foto-nav-bar">'
                        f'<span class="foto-counter">FOTO {foto_idx + 1} / {n_fotos}</span>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
                with fn3:
                    if st.button("Foto →", key="btn_foto_next",
                                 use_container_width=True, disabled=(foto_idx >= n_fotos - 1)):
                        st.session_state.foto_idx += 1
                        st.rerun()

                # Tira de miniaturas clickeables
                thumbs_html = '<div class="thumbs-strip">'
                for i, f in enumerate(fotos):
                    thumb_url = drive_thumbnail_url(f["drive_link"], size=128)
                    active_cls = "active" if i == foto_idx else ""
                    thumbs_html += (
                        f'<div class="thumb-wrap {active_cls}" '
                        f'title="Foto {i+1}">'
                        f'<img src="{thumb_url}" loading="lazy">'
                        f'</div>'
                    )
                thumbs_html += '</div>'

                # Botones invisibles para cada miniatura (Streamlit workaround)
                st.markdown(thumbs_html, unsafe_allow_html=True)
                thumb_cols = st.columns(min(n_fotos, 8))
                for i, col in enumerate(thumb_cols[:n_fotos]):
                    with col:
                        if st.button(f"{i+1}", key=f"thumb_{idx}_{i}",
                                     use_container_width=True):
                            st.session_state.foto_idx = i
                            st.rerun()

            # ── Barra de progreso entre grupos ─────────────────────────────
            pct = (idx + 1) / total * 100
            st.markdown(
                f"""
                <div style="display:flex;align-items:center;gap:12px;margin-top:8px;padding:0 2px;">
                    <span style="font-family:'DM Mono',monospace;font-size:11px;
                                 color:rgba(226,232,240,0.35);white-space:nowrap;">
                        GRUPO {idx+1} / {total}
                    </span>
                    <div class="progress-bar-wrap" style="flex:1;">
                        <div class="progress-bar-fill" style="width:{pct:.1f}%;"></div>
                    </div>
                    <a href="{drive_url}" target="_blank"
                       style="font-size:11px;color:rgba(34,211,238,0.6);
                              text-decoration:none;white-space:nowrap;letter-spacing:1px;">
                        ↗ DRIVE
                    </a>
                </div>
                """,
                unsafe_allow_html=True,
            )

            # Navegación anterior / siguiente grupo
            st.markdown("<div style='margin-top:8px;'>", unsafe_allow_html=True)
            nav1, nav2, nav3 = st.columns([1, 4, 1])
            with nav1:
                if st.button("← ANTERIOR", key="btn_prev", use_container_width=True,
                             disabled=(idx == 0)):
                    st.session_state.idx -= 1
                    st.session_state.foto_idx = 0
                    st.rerun()
            with nav3:
                if st.button("SIGUIENTE →", key="btn_next", use_container_width=True,
                             disabled=(idx >= total - 1)):
                    st.session_state.idx += 1
                    st.session_state.foto_idx = 0
                    st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)

    # ── COLUMNA DERECHA: detalles + acciones + stats ───────────────────────────
    with right_col:
        if not pend_filtrada:
            # Panel de stats cuando no hay pendientes
            pass
        else:
            ex = pend_filtrada[idx]
            fotos = ex.get("fotos", [])
            ids_exhibicion = [f["id_exhibicion"] for f in fotos]
            n_fotos = len(fotos)

            # Fecha formateada
            fecha_raw = ex.get("fecha_hora") or ""
            try:
                dt = datetime.strptime(fecha_raw[:16], "%Y-%m-%d %H:%M")
                fecha_fmt = dt.strftime("%d/%m/%Y %H:%M")
            except Exception:
                fecha_fmt = fecha_raw

            # ── Card: Detalles de la exhibición ───────────────────────────────
            fotos_line = (
                render_detail_row("📸", "Fotos en ráfaga", str(n_fotos), accent=True)
                if n_fotos > 1 else ""
            )
            detalles_html = (
                '<div class="card">'
                '<div class="card-title">Exhibición</div>'
                + render_detail_row("👤", "Vendedor",    ex.get("vendedor") or "—")
                + render_detail_row("🏪", "Cliente",     ex.get("nro_cliente") or "—")
                + render_detail_row("📍", "Tipo PDV",    ex.get("tipo_pdv") or "—", accent=True)
                + render_detail_row("🕐", "Fecha / Hora",fecha_fmt, muted=True)
                + render_detail_row("🏢", "Distribuidora",ex.get("distribuidora") or "—", muted=True)
                + fotos_line
                + f'<div style="margin-top:14px;">{badge_html("Pendiente")}</div>'
                + "</div>"
            )
            st.markdown(detalles_html, unsafe_allow_html=True)

            st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)

            # ── Card: Evaluar ─────────────────────────────────────────────────
            evaluar_titulo = (
                f"Evaluar ({n_fotos} fotos)" if n_fotos > 1 else "Evaluar"
            )
            st.markdown(
                f'<div class="card"><div class="card-title">{evaluar_titulo}</div>',
                unsafe_allow_html=True,
            )

            comentario = st.text_area(
                "Comentario",
                placeholder="Comentario opcional para el vendedor...",
                height=80,
                key="comentario_field",
                label_visibility="collapsed",
            )

            c1, c2, c3 = st.columns(3)
            supervisor = u.get("usuario_login", "supervisor")

            with c1:
                if st.button("✅\nAPROBAR", key="btn_ap", use_container_width=True,
                             help="Aprobar esta exhibición"):
                    if evaluar(ids_exhibicion, "Aprobado", supervisor, comentario):
                        set_flash("✅  Exhibición Aprobada", "green")
                        reload_pendientes()
                        st.rerun()

            with c2:
                if st.button("🔥\nDESTACAR", key="btn_dest", use_container_width=True,
                             help="Marcar como destacada"):
                    if evaluar(ids_exhibicion, "Destacado", supervisor, comentario):
                        set_flash("🔥  Marcada como Destacada", "amber")
                        reload_pendientes()
                        st.rerun()

            with c3:
                if st.button("❌\nRECHAZAR", key="btn_rej", use_container_width=True,
                             help="Rechazar esta exhibición"):
                    if evaluar(ids_exhibicion, "Rechazado", supervisor, comentario):
                        set_flash("❌  Exhibición Rechazada", "red")
                        reload_pendientes()
                        st.rerun()

            st.markdown("</div>", unsafe_allow_html=True)

            st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)

        # ── Card: Stats del día ────────────────────────────────────────────────
        stats = get_stats_hoy(u["id_distribuidor"])

        stats_html = (
            '<div class="card"><div class="card-title">Hoy</div>'
            '<div class="stats-grid">'
            + render_stats_box(str(stats.get("pendientes",  0)), "Pendientes", "stat-amber")
            + render_stats_box(str(stats.get("aprobadas",   0)), "Aprobadas",  "stat-green")
            + render_stats_box(str(stats.get("destacadas",  0)), "Destacadas", "stat-amber")
            + render_stats_box(str(stats.get("rechazadas",  0)), "Rechazadas", "stat-red")
            + render_stats_box(str(stats.get("total",       0)), "Total día",  "stat-white")
            + render_stats_box(
                str(stats.get("aprobadas",0) + stats.get("destacadas",0)),
                "Aprobadas+",
                "stat-cyan",
              )
            + "</div></div>"
        )
        st.markdown(stats_html, unsafe_allow_html=True)

        st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)

        # ── Recarga + cerrar sesión ────────────────────────────────────────────
        col_r, col_l = st.columns(2)
        with col_r:
            if st.button("↺ RECARGAR", key="btn_reload", use_container_width=True):
                reload_pendientes()
                st.rerun()
        with col_l:
            if st.button("SALIR →", key="btn_logout", use_container_width=True):
                for k in list(st.session_state.keys()):
                    del st.session_state[k]
                st.rerun()


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    init_state()
    if not st.session_state.logged_in:
        render_login()
    else:
        render_visor()


main()