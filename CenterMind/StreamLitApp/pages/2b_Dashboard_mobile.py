# -*- coding: utf-8 -*-
import streamlit as st

# Seguridad: Si no está logueado, lo mandamos al login
if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

st.set_page_config(page_title="ShelfMind · En Construcción", page_icon="🚧", layout="centered")

STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400&display=swap');
html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: #1A1311 !important;
    color: #F0E6D8 !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"], [data-testid="stToolbar"], section[data-testid="stSidebar"] { display: none !important; }

.menu-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 64px; letter-spacing: 5px;
    text-align: center; margin-bottom: 10px;
    background: linear-gradient(90deg, #8C5A1F 0%, #D9A76A 20%, #FFE8B0 50%, #D9A76A 80%, #8C5A1F 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 5s ease-in-out infinite;
}
@keyframes shimmer { 0% { background-position: 150% 0; } 50% { background-position: -50% 0; } 100% { background-position: 150% 0; } }

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 16px !important;
    background: transparent !important;
    border: 1px solid rgba(217, 167, 106, 0.5) !important;
    color: #D9A76A !important;
    border-radius: 8px !important; width: 100% !important; height: 44px !important;
}
div[data-testid="stButton"] button:hover { background: rgba(217, 167, 106, 0.1) !important; }
</style>
"""
st.markdown(STYLE, unsafe_allow_html=True)

st.markdown('<div style="margin-top: 20vh;"></div>', unsafe_allow_html=True)
st.markdown('<div class="menu-logo">SHELFMIND</div>', unsafe_allow_html=True)
st.markdown('<h3 style="text-align:center; color:#B8A392;">🚧 Módulo en Construcción 🚧</h3>', unsafe_allow_html=True)
st.markdown('<p style="text-align:center; color:rgba(240, 230, 216, 0.5);">Esta interfaz está siendo adaptada para tu dispositivo.</p>', unsafe_allow_html=True)

st.markdown("<br><br>", unsafe_allow_html=True)
_, col_btn, _ = st.columns([1, 1, 1])
with col_btn:
    if st.button("← VOLVER AL MENÚ"):
        st.switch_page("app.py")