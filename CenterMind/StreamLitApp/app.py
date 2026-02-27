# -*- coding: utf-8 -*-
"""
ShelfMind — Entry Point
========================
Login unificado + Selección de Dispositivo + Menú de servicios.

Estructura de carpetas actual:
    streamlit_app/
    ├── app.py              ← este archivo
    └── pages/
        ├── 1a_Visor_pc.py
        ├── 1b_Visor_mobile.py
        ├── 2a_Dashboard_pc.py
        ├── 2b_Dashboard_mobile.py
        ├── 3a_Admin_pc.py
        ├── 3b_Admin_mobile.py
        ├── 4a_Reportes_pc.py
        └── 4b_Reportes_mobile.py

Ejecutar:
    streamlit run app.py
"""

from __future__ import annotations

import os
from typing import Dict, Optional

# ── Fix SSL: PostgreSQL 18 setea REQUESTS_CA_BUNDLE a una ruta inválida.
# Sobreescribimos con el bundle correcto de certifi antes de importar requests.
try:
    import certifi as _certifi
    os.environ["REQUESTS_CA_BUNDLE"] = _certifi.where()
    os.environ["SSL_CERT_FILE"]      = _certifi.where()
except ImportError:
    pass

import requests
import streamlit as st

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="ShelfMind",
    page_icon="🛒",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── CSS ──────────────────────────────────────────────────────────────────────
STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

:root {
    --sm-bg: #1A1311;
    --sm-panel: rgba(42, 30, 24, 0.65);
    --sm-border: rgba(74, 51, 38, 0.5);
    --sm-text: #F0E6D8;
    --sm-text-muted: #B8A392;
    --sm-accent: #D9A76A;
    --sm-accent-hover: #FBBF24;
    --sm-green: #7DAF6B;
    --sm-red: #C0584A;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
    background: var(--sm-bg) !important;
    color: var(--sm-text) !important;
    font-family: 'DM Sans', sans-serif !important;
    overflow: hidden !important; 
    margin: 0; height: 100vh;
}

[data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: transparent !important;
    overflow: hidden !important;
    height: 100vh !important;
}

[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"], footer { 
    display: none !important; 
}

[data-testid="stMainBlockContainer"] { 
    padding: 0 !important; 
    max-width: 100% !important;
    height: 100vh !important;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
section[data-testid="stSidebar"] { display: none !important; }

[data-testid="stAppViewContainer"]::before {
    content: '';
    position: fixed; inset: 0; z-index: -1;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(217, 167, 106, 0.04) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(240, 230, 216, 0.015) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(240, 230, 216, 0.015) 40px);
    pointer-events: none;
}

/* ── Formulario de Login ───────── */
[data-testid="stForm"] {
    background: var(--sm-panel) !important;
    border: 1px solid var(--sm-border) !important;
    border-radius: 20px !important;
    padding: 48px 40px 40px !important;
    width: 100% !important; 
    max-width: 400px !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    margin: 0 auto !important;
}

.login-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 56px; letter-spacing: 4px;
    text-align: center; line-height: 1; margin-bottom: 4px;
    background: linear-gradient(90deg, #8C5A1F 0%, #D9A76A 20%, #FFE8B0 50%, #D9A76A 80%, #8C5A1F 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 4px rgba(217,167,106,0.25));
    animation: sm-logo-shimmer 5s ease-in-out infinite, sm-logo-glow 5s ease-in-out infinite;
}
.login-sub {
    font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--sm-text-muted); text-align: center; margin-bottom: 32px;
}
.login-label {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--sm-text-muted); margin-bottom: 6px; display: block;
}

/* ── Menú Principal Header ────────────────────── */
.menu-header { text-align: center; margin-bottom: 30px; width: 100%; }
.menu-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 64px; letter-spacing: 5px;
    line-height: 1;
    background: linear-gradient(90deg, #8C5A1F 0%, #D9A76A 20%, #FFE8B0 50%, #D9A76A 80%, #8C5A1F 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 4px rgba(217,167,106,0.25));
    animation: sm-logo-shimmer 5s ease-in-out infinite, sm-logo-glow 5s ease-in-out infinite;
}
.menu-empresa {
    font-size: 14px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--sm-text-muted); margin-top: 4px;
}
.menu-user {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 12px; padding: 4px 16px; border-radius: 999px;
    background: rgba(125, 175, 107, 0.1);
    border: 1px solid rgba(125, 175, 107, 0.25);
    font-size: 11px; color: var(--sm-green); letter-spacing: 1px;
}
.menu-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--sm-green); box-shadow: 0 0 8px var(--sm-green);
    display: inline-block;
}

div[data-testid="stTextInput"] input {
    background: rgba(0,0,0,0.3) !important;
    border: 1px solid var(--sm-border) !important;
    border-radius: 8px !important;
    color: var(--sm-text) !important;
    font-size: 15px !important;
    padding: 12px 14px !important;
}
div[data-testid="stTextInput"] input:focus {
    border-color: var(--sm-accent) !important;
    box-shadow: 0 0 0 2px rgba(217, 167, 106, 0.2) !important;
}
.stTextInput label { display: none !important; }

div[data-testid="stFormSubmitButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 18px !important;
    border-radius: 8px !important; height: 50px !important;
    width: 100% !important; border: none !important;
    background: var(--sm-accent) !important;
    color: #1A1311 !important; 
    transition: all 0.2s ease !important;
}
div[data-testid="stFormSubmitButton"] button:hover {
    background: var(--sm-accent-hover) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(217, 167, 106, 0.3) !important;
}

div[data-testid="column"] { padding: 0 10px !important; }

div[data-testid="stButton"] button[kind="primary"] {
    background: var(--sm-panel) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid var(--sm-border) !important;
    border-radius: 16px !important;
    min-height: 260px !important;
    height: auto !important;
    width: 100% !important;
    color: var(--sm-text-muted) !important;
    white-space: pre-wrap !important;
    font-size: 15px !important;
    line-height: 1.6 !important;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}

div[data-testid="stButton"] button[kind="primary"]:hover {
    background: rgba(217, 167, 106, 0.12) !important;
    border-color: var(--sm-accent-hover) !important;
    color: var(--sm-text) !important;
    transform: translateY(-10px) scale(1.04) !important;
    box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 30px rgba(217, 167, 106, 0.3) !important;
}

div[data-testid="stButton"] button[kind="secondary"] {
    min-height: 44px !important;
    height: 44px !important;
    background: transparent !important;
    border: 1px solid var(--sm-border) !important;
    border-radius: 8px !important;
    color: var(--sm-text-muted) !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important;
    font-size: 16px !important;
    transition: all 0.2s ease !important;
    margin-top: 10px !important;
}
div[data-testid="stButton"] button[kind="secondary"]:hover {
    color: var(--sm-text) !important;
    border-color: var(--sm-text) !important;
    background: rgba(255,255,255,0.05) !important;
}

@keyframes sm-logo-shimmer {
    0%   { background-position: 150% 0; }
    50%  { background-position: -50% 0; }
    100% { background-position: 150% 0; }
}
@keyframes sm-logo-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(217,167,106,0.20)); }
    45%      { filter: drop-shadow(0 0 14px rgba(255,215,120,0.80))
                        drop-shadow(0 0 32px rgba(217,167,106,0.45)); }
    65%      { filter: drop-shadow(0 0 18px rgba(255,225,140,0.95))
                        drop-shadow(0 0 42px rgba(217,167,106,0.55)); }
}

div[data-testid="stAlert"] {
    background: rgba(192, 88, 74, 0.1) !important;
    border: 1px solid rgba(192, 88, 74, 0.3) !important;
    border-radius: 8px !important; 
    color: var(--sm-red) !important;
    padding: 10px 14px !important;
}

@media (max-width: 768px) {
    div[data-testid="column"] { width: 100% !important; flex: 1 1 100% !important; padding: 0 !important; }
    [data-testid="stMainBlockContainer"] { justify-content: flex-start; padding: 20px 16px !important; overflow-y: auto !important;}
    html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] { overflow-y: auto !important; height: auto !important; }
    div[data-testid="stButton"] button[kind="primary"] { min-height: 180px !important; margin-bottom: 16px !important; }
}
</style>
"""

# ─── API helpers ──────────────────────────────────────────────────────────────

def _api_conf():
    """Lee la URL y API Key desde st.secrets (con fallback local para desarrollo)."""
    try:
        return st.secrets["API_URL"].rstrip("/"), st.secrets["API_KEY"]
    except Exception:
        return "http://localhost:8000", ""


def login_check(usuario: str, password: str) -> Optional[Dict]:
    base, key = _api_conf()
    try:
        r = requests.post(
            f"{base}/login",
            json={"usuario": usuario, "password": password},
            headers={"x-api-key": key},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()
        print(f"[login_check] 401 detail: {r.text}  | key_sent={repr(key[:6]+'...' if key else '(vacío)')}")
        return None
    except Exception as e:
        print(f"[login_check] API error: {e}")
        return None

# ─── State ────────────────────────────────────────────────────────────────────

def init_state():
    defaults = {"logged_in": False, "user": None, "device_type": None}
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

# ─── Render: Login (Paso 1) ───────────────────────────────────────────────────

def render_login():
    st.markdown(STYLE, unsafe_allow_html=True)
    
    with st.form("login_form"):
        st.markdown("""
        <div style="text-align: center;">
            <div class="login-logo">SHELFMIND</div>
            <div class="login-sub">Panel de Servicios</div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown('<span class="login-label">Usuario</span>', unsafe_allow_html=True)
        usuario = st.text_input("u", placeholder="Ingresa tu usuario", label_visibility="collapsed")
        
        st.markdown('<span class="login-label" style="margin-top:16px;">Contraseña</span>', unsafe_allow_html=True)
        password = st.text_input("p", type="password", placeholder="••••••••", label_visibility="collapsed")
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        submitted = st.form_submit_button("INGRESAR", use_container_width=True)

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

# ─── Render: Selección de Dispositivo (Paso 2) ────────────────────────────────

def render_seleccion_dispositivo():
    st.markdown(STYLE, unsafe_allow_html=True)
    
    u = st.session_state.user
    login = u.get("usuario_login", "")

    st.markdown(f"""
    <div class="menu-header">
        <div class="menu-logo">SHELFMIND</div>
        <div class="menu-empresa">SELECCIONA TU ENTORNO DE TRABAJO</div>
        <div style="display:flex;justify-content:center;">
            <div class="menu-user">
                <span class="menu-dot"></span>
                {login}
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    spacer_left, col_pc, col_mob, spacer_right = st.columns([1, 4, 4, 1])

    with col_pc:
        if st.button("💻\n\nVERSIÓN PC\n\nExperiencia completa\ny diseño extendido\npara monitores.", type="primary", key="btn_pc", use_container_width=True):
            st.session_state.device_type = "PC"
            st.rerun()
            
    with col_mob:
        if st.button("📱\n\nVERSIÓN MÓVIL\n\nInterfaz táctil,\nrápida y optimizada\npara celulares.", type="primary", key="btn_mobile", use_container_width=True):
            st.session_state.device_type = "Mobile"
            st.rerun()

    st.markdown("<br>", unsafe_allow_html=True)
    _, col_s, _ = st.columns([4, 2, 4])
    with col_s:
        if st.button("SALIR DEL SISTEMA", type="secondary", key="logout_seleccion", use_container_width=True):
            for k in list(st.session_state.keys()):
                del st.session_state[k]
            st.rerun()

# ─── Render: Menú de servicios (Paso 3) ───────────────────────────────────────

def render_menu():
    st.markdown(STYLE, unsafe_allow_html=True)

    u        = st.session_state.user
    empresa  = u.get("nombre_empresa", "").upper()
    login    = u.get("usuario_login", "")
    rol_raw  = (u.get("rol") or "").strip().lower()
    rol      = rol_raw.upper()
    es_super = rol_raw == "superadmin"
    es_admin = rol_raw == "admin"
    es_eval  = rol_raw == "evaluador"
    puede_admin = es_super or es_admin

    device_label = "🖥️ MODO PC" if st.session_state.device_type == "PC" else "📱 MODO MÓVIL"

    st.markdown(f"""
    <div class="menu-header">
        <div class="menu-logo">SHELFMIND</div>
        <div class="menu-empresa">{empresa} &nbsp;|&nbsp; {device_label}</div>
        <div style="display:flex;justify-content:center;">
            <div class="menu-user">
                <span class="menu-dot"></span>
                {login} &nbsp;&middot;&nbsp; {rol}
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    spacer_left, content, spacer_right = st.columns([1, 10, 1])

    with content:
        if puede_admin:
            cols = st.columns(4)
            col_visor, col_dash, col_rep, col_admin = cols[0], cols[1], cols[2], cols[3]
        else:
            cols = st.columns(3)
            col_visor, col_dash, col_rep = cols[0], cols[1], cols[2]

        # ── ENRUTAMIENTO EXACTO (Basado en la captura) ──
        with col_visor:
            if st.button("🎯\n\nVISOR\n\nEvaluá exhibiciones pendientes.\nAprobá, rechazá o destacá\nfotos de tus vendedores.", type="primary", key="go_visor", use_container_width=True):
                if st.session_state.device_type == "PC":
                    st.switch_page("pages/1a_Visor_pc.py")
                else:
                    st.switch_page("pages/1b_Visor_mobile.py")

        with col_dash:
            if st.button("📺\n\nDASHBOARD\n\nRanking en tiempo real.\nPensado para pantalla\nen la oficina.", type="primary", key="go_dashboard", use_container_width=True):
                if st.session_state.device_type == "PC":
                    st.switch_page("pages/2a_Dashboard_pc.py")
                else:
                    st.switch_page("pages/2b_Dashboard_mobile.py")

        with col_rep:
            if st.button("📊\n\nREPORTES\n\nAnalizá el historial.\nFiltros, gráficos interactivos\ny exportación Excel.", type="primary", key="go_reportes", use_container_width=True):
                if st.session_state.device_type == "PC":
                    st.switch_page("pages/4a_Reportes_pc.py")
                else:
                    st.switch_page("pages/4b_Reportes_mobile.py")

        if puede_admin:
            with col_admin:
                label_admin = (
                    "⚙️\n\nADMIN\n\nGestioná usuarios web\ny vendedores de Telegram.\n(Solo Superadmin)"
                    if es_super
                    else "⚙️\n\nADMIN\n\nGestioná roles de grupos\ny vendedores de Telegram."
                )
                if st.button(label_admin, type="primary", key="go_admin", use_container_width=True):
                    if st.session_state.device_type == "PC":
                        st.switch_page("pages/3a_Admin_pc.py")
                    else:
                        st.switch_page("pages/3b_Admin_mobile.py")

    st.markdown("<br>", unsafe_allow_html=True)
    _, col_change, col_logout, _ = st.columns([3, 2, 2, 3])
    
    with col_change:
        if st.button("🔄 CAMBIAR VISTA", type="secondary", key="change_view", use_container_width=True):
            st.session_state.device_type = None
            st.rerun()
            
    with col_logout:
        if st.button("SALIR DEL SISTEMA", type="secondary", key="logout", use_container_width=True):
            for k in list(st.session_state.keys()):
                del st.session_state[k]
            st.rerun()

# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    init_state()
    
    if not st.session_state.logged_in:
        render_login()
    elif not st.session_state.device_type:
        render_seleccion_dispositivo()
    else:
        render_menu()

if __name__ == "__main__":
    main()