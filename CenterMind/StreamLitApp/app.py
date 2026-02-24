# -*- coding: utf-8 -*-
"""
CenterMind — Entry Point
========================
Login unificado + menú de servicios.

Estructura de carpetas:
    streamlit_app/
    ├── app.py              ← este archivo
    └── pages/
        ├── 1_Visor.py
        └── 2_Dashboard.py

Ejecutar:
    streamlit run app.py
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, Optional

import streamlit as st

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="CenterMind",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(__file__).resolve().parent.parent / "base_datos" / "centermind.db"

# ─── CSS ──────────────────────────────────────────────────────────────────────
STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: #07080f !important;
    color: #e2e8f0 !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"]       { display: none !important; }
[data-testid="stMainBlockContainer"]{ padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"]   { display: none !important; }
.block-container { padding: 0 !important; max-width: 100% !important; }

/* Fondo textura */
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

/* ── Login ─────────────────────────────────────────────── */
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
    font-size: 52px; letter-spacing: 4px;
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

/* ── Menú de servicios ─────────────────────────────────── */
.menu-wrap {
    min-height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 40px 20px;
    gap: 32px;
}
.menu-header {
    text-align: center;
}
.menu-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 56px; letter-spacing: 5px;
    color: #fbbf24;
    text-shadow: 0 0 30px rgba(251,191,36,0.35);
    line-height: 1;
}
.menu-empresa {
    font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
    color: rgba(226,232,240,0.4); margin-top: 6px;
}
.menu-user {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 14px;
    padding: 5px 16px; border-radius: 999px;
    background: rgba(74,222,128,0.08);
    border: 1px solid rgba(74,222,128,0.2);
    font-size: 12px; color: #4ade80;
    letter-spacing: 1px;
}
.menu-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #4ade80; box-shadow: 0 0 8px #4ade80;
    display: inline-block;
}

/* Tarjetas de servicio */
.service-grid {
    display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;
    width: 100%; max-width: 760px;
}
.service-card {
    flex: 1; min-width: 280px; max-width: 340px;
    background: rgba(15,17,30,0.9);
    border-radius: 20px; padding: 36px 32px;
    border: 1px solid rgba(255,255,255,0.07);
    text-align: center;
    transition: border-color 0.2s, box-shadow 0.2s;
    cursor: pointer;
}
.service-card:hover {
    border-color: rgba(251,191,36,0.3);
    box-shadow: 0 0 40px rgba(251,191,36,0.07);
}
.service-icon { font-size: 48px; margin-bottom: 16px; }
.service-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; letter-spacing: 3px; color: #e2e8f0;
    margin-bottom: 8px;
}
.service-desc {
    font-size: 13px; color: rgba(226,232,240,0.4);
    line-height: 1.5;
}
.service-tag {
    display: inline-block; margin-top: 18px;
    padding: 4px 14px; border-radius: 999px;
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
}
.tag-visor    { background: rgba(34,211,238,0.1);  color: #22d3ee; border: 1px solid rgba(34,211,238,0.25); }
.tag-dashboard{ background: rgba(251,191,36,0.1);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); }
.tag-admin    { background: rgba(139,92,246,0.1);  color: #a78bfa; border: 1px solid rgba(139,92,246,0.25); }

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
.stTextInput label { display: none !important; }

/* Botones */
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 16px !important;
    border-radius: 10px !important; height: 52px !important;
    width: 100% !important; border: none !important;
    transition: all 0.15s ease !important;
}
div[data-testid="stAlert"] {
    background: rgba(248,113,113,0.1) !important;
    border: 1px solid rgba(248,113,113,0.3) !important;
    border-radius: 10px !important; color: #f87171 !important;
}

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(251,191,36,0.4); }
</style>
"""

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    print("DB_PATH:", DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
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


# ─── State ────────────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "logged_in": False,
        "user":      None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


# ─── Render: Login ────────────────────────────────────────────────────────────

def render_login():
    st.markdown(STYLE, unsafe_allow_html=True)
    st.markdown('<div class="login-wrap">', unsafe_allow_html=True)
    st.markdown("""
    <div class="login-card">
        <div class="login-logo">CENTERMIND</div>
        <div class="login-sub">Sistema de Exhibiciones</div>
    </div>
    """, unsafe_allow_html=True)

    with st.form("login_form"):
        st.markdown('<span class="login-label">Usuario</span>', unsafe_allow_html=True)
        usuario = st.text_input("u", placeholder="tu usuario", label_visibility="collapsed")
        st.markdown('<span class="login-label" style="margin-top:16px;display:block;">Contraseña</span>', unsafe_allow_html=True)
        password = st.text_input("p", type="password", placeholder="••••••••", label_visibility="collapsed")
        st.markdown("<br>", unsafe_allow_html=True)
        submitted = st.form_submit_button("INGRESAR →", use_container_width=True)

        if submitted:
            if not usuario or not password:
                st.error("Completá ambos campos.")
            else:
                user = login_check(usuario, password)
                if user:
                    st.session_state.logged_in = True
                    st.session_state.user      = user
                    st.rerun()
                else:
                    st.error("Usuario o contraseña incorrectos.")

    st.markdown('</div>', unsafe_allow_html=True)


# ─── Render: Menú de servicios ────────────────────────────────────────────────

def render_menu():
    st.markdown(STYLE, unsafe_allow_html=True)

    u        = st.session_state.user
    empresa  = u.get("nombre_empresa", "").upper()
    login    = u.get("usuario_login", "")
    rol      = u.get("rol", "").upper()
    es_super = u.get("rol") == "superadmin"

    # ── Header ────────────────────────────────────────────────────────────────
    st.markdown(f"""
    <div style="text-align:center;padding:60px 20px 40px;">
        <div class="menu-logo">CENTERMIND</div>
        <div class="menu-empresa">{empresa}</div>
        <div style="display:flex;justify-content:center;margin-top:14px;">
            <div class="menu-user">
                <span class="menu-dot"></span>
                {login} &nbsp;&middot;&nbsp; {rol}
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── Cards clicables ────────────────────────────────────────────────────────
    # Cada card es un st.button con CSS que lo convierte en un card grande
    n_cols   = 3 if es_super else 2
    # Centramos las columnas dejando espacios vacíos a los lados
    if es_super:
        cols = st.columns([0.5, 2, 2, 2, 2, 0.5])
        col_visor, col_dash, col_rep, col_admin = cols[1], cols[2], cols[3], cols[4]
    else:
        cols = st.columns([1, 2, 2, 2, 1])
        col_visor, col_dash, col_rep = cols[1], cols[2], cols[3]

    # CSS para los botones-card
    st.markdown("""
    <style>
    div[data-testid="stButton"].card-btn button {
        height: 260px !important;
        border-radius: 20px !important;
        background: rgba(15,17,30,0.9) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 13px !important;
        color: rgba(226,232,240,0.6) !important;
        letter-spacing: 1px !important;
        transition: border-color 0.2s, box-shadow 0.2s, background 0.2s !important;
        white-space: pre-line !important;
        line-height: 1.6 !important;
        padding: 28px !important;
    }
    div[data-testid="stButton"].card-btn button:hover {
        border-color: rgba(251,191,36,0.35) !important;
        background: rgba(251,191,36,0.04) !important;
        box-shadow: 0 0 40px rgba(251,191,36,0.08) !important;
        color: #e2e8f0 !important;
    }
    </style>
    """, unsafe_allow_html=True)

    with col_visor:
        st.markdown('<div class="card-btn">', unsafe_allow_html=True)
        if st.button(
            "🎯\n\nVISOR\n\nEvaluá exhibiciones pendientes.\nAprobá, rechazá o destacá\nfotos de tus vendedores.\n\n— EVALUACIÓN —",
            key="go_visor", use_container_width=True
        ):
            st.switch_page("pages/1_Visor.py")
        st.markdown('</div>', unsafe_allow_html=True)

    with col_dash:
        st.markdown('<div class="card-btn">', unsafe_allow_html=True)
        if st.button(
            "🏆\n\nDASHBOARD\n\nRanking del mes en tiempo real.\nPensado para pantalla\nen la oficina.\n\n— MODO TV —",
            key="go_dashboard", use_container_width=True
        ):
            st.switch_page("pages/2_Dashboard.py")
        st.markdown('</div>', unsafe_allow_html=True)

    with col_rep:
        st.markdown('<div class="card-btn">', unsafe_allow_html=True)
        if st.button(
            "📊\n\nREPORTES\n\nAnalizá el período que quieras.\nFiltros, tabla, gráficos\ny exportar a Excel.\n\n— ANÁLISIS —",
            key="go_reportes", use_container_width=True
        ):
            st.switch_page("pages/4_Reportes.py")
        st.markdown('</div>', unsafe_allow_html=True)

    if es_super:
        with col_admin:
            st.markdown('<div class="card-btn">', unsafe_allow_html=True)
            if st.button(
                "⚙️\n\nADMIN\n\nGestioná usuarios del portal\ny vendedores de Telegram.\n\n— SUPERADMIN —",
                key="go_admin", use_container_width=True
            ):
                st.switch_page("pages/3_Admin.py")
            st.markdown('</div>', unsafe_allow_html=True)

    # ── Botón salir ───────────────────────────────────────────────────────────
    st.markdown("<div style='height:32px'></div>", unsafe_allow_html=True)
    _, col_s, _ = st.columns([4, 1, 4])
    with col_s:
        if st.button("SALIR →", key="logout", use_container_width=True):
            for k in list(st.session_state.keys()):
                del st.session_state[k]
            st.rerun()


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    init_state()
    if not st.session_state.logged_in:
        render_login()
    else:
        render_menu()


main()