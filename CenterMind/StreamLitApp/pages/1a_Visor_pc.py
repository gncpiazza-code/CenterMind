# -*- coding: utf-8 -*-
"""
ShelfMind — Visor de Evaluación (Streamlit)
============================================
Ejecutar:
    streamlit run app.py

CAMBIOS v2:
  FIX-1  Sin flash negro al navegar — se eliminó transition:opacity del <img>
         y se fijó fondo oscuro persistente en el contenedor del iframe.
  FIX-2  Ráfaga obligatoria — los botones de evaluación se desbloquean
         automáticamente cuando foto_idx llega a la última foto de la ráfaga.
  FIX-3  APROBAR verde vivo con glow verde en hover.
         DESTACAR con animación de retroiluminación ámbar sutil y continua.
"""

from __future__ import annotations

import re
import sys
import base64
import urllib.request as _urllib_req
from pathlib import Path
from typing import Dict, List, Optional

import streamlit as st
import streamlit.components.v1 as components

try:
    import requests as _req
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from google.oauth2.service_account import Credentials as _SACreds
    import google.auth.transport.requests as _ga_tr
    HAS_GOOGLE_AUTH = True
except ImportError:
    HAS_GOOGLE_AUTH = False

# ── Shared styles ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _shared_styles import BASE_CSS

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

# ─── CSS ──────────────────────────────────────────────────────────────────────
VISOR_CSS = """
<style>
/* ══════════════════════════════════════════════════
   LAYOUT — ANCHO COMPLETO (override shared styles)
   Sin max-width: 1100px para que las columnas 70/30
   puedan usar todo el viewport disponible.
   ══════════════════════════════════════════════════ */
[data-testid="stMainBlockContainer"],
.block-container {
    max-width: 100% !important;
    padding: 12px 16px !important;
}
section[data-testid="stSidebar"] { display: none !important; }

/* ── Desktop: layout nativo con columnas ───────────────────
   Ahora el ajuste de ancho se maneja usando st.columns([7,3]) en
   el código de Python. El CSS ya no fija ni restringe el ancho del
   panel; solo queda activo cuando se detecta un dispositivo móvil
   (<640px) para convertir esa columna en bottom-sheet. */

/* Force 70/30 layout ONLY on the main content block that has the eval panel */
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) {
    display: grid !important;
    grid-template-columns: 1fr 0.428fr !important;
    gap: 16px !important;
    width: 100% !important;
    align-items: start !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div,
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"] {
    min-width: 0 !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div:nth-of-type(1),
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"]:nth-of-type(1) {
    grid-column: 1 !important;
}

[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > div:nth-of-type(2),
[data-testid="stHorizontalBlock"]:has(div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)) > [data-testid="stColumn"]:nth-of-type(2) {
    grid-column: 2 !important;
}

/* keep the panel visible as the user scrolls */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    position: sticky !important;
    top: 90px !important;
    align-self: flex-start !important;
    z-index: 50 !important;
}

/* ══════════════════════════════════════════════════
   FIX-1: Evitar flash negro / overlay oscuro al navegar
   Streamlit recarga el iframe del componente en cada rerun.
   Durante ese instante el contenedor queda en blanco o negro.
   Forzamos el mismo fondo oscuro del visor en el wrapper del
   iframe para que el cambio sea imperceptible.
   ══════════════════════════════════════════════════ */
[data-testid="stCustomComponentV1"],
[data-testid="stCustomComponentV1"] iframe,
div[class*="stIFrame"],
div[class*="stIFrame"] iframe {
    background: #0a0705 !important;
}

/* Ocultar el spinner/overlay de "running" de Streamlit que oscurece
   la pantalla entera durante cada rerun de navegación */
[data-testid="stStatusWidget"]       { display: none !important; }
[data-testid="stDecoration"]         { display: none !important; }
div[class*="StatusWidget"]           { display: none !important; }

/* ══════════════════════════════════════════════════
   TOPBAR — STAT PILLS
   ══════════════════════════════════════════════════ */
.topbar-stat-pill {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 13px; line-height: 1;
    padding: 3px 10px; border-radius: 20px;
    border: 1px solid transparent; white-space: nowrap;
}
.top-stat-pend { color: var(--accent-amber);      border-color: rgba(217,167,106,.25); background: rgba(217,167,106,.07); }
.top-stat-apro { color: var(--status-approved);   border-color: rgba(94,168,82,.25);   background: rgba(94,168,82,.07);   }
.top-stat-dest { color: #F4A227;                  border-color: rgba(244,162,39,.25);  background: rgba(244,162,39,.07);  }
.top-stat-rech { color: var(--status-rejected);   border-color: rgba(192,88,74,.25);   background: rgba(192,88,74,.07);   }

/* ── Empty state ─────────────────────────────────── */
.empty-state { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.empty-icon  { font-size: 48px; margin-bottom: 16px; }
.empty-title {
    font-family: 'Bebas Neue', sans-serif; font-size: 26px;
    color: var(--text-primary); letter-spacing: 2px; margin-bottom: 8px;
}

/* ── Flash de feedback ───────────────────────────── */
.flash-msg {
    position: fixed; bottom: 28px; left: 50%;
    transform: translateX(-50%);
    padding: 12px 26px; border-radius: 50px;
    font-size: 12px; font-weight: 600; z-index: 10000;
    animation: fadeup 0.3s ease, fadeout 0.4s ease 2s forwards;
    pointer-events: none;
}
@keyframes fadeup  { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
@keyframes fadeout { to{opacity:0} }

/* ── Expander filtro ─────────────────────────────── */
div[data-testid="stExpander"] {
    background: transparent !important;
    border: 1px solid var(--border-soft) !important;
    border-radius: 10px !important;
    margin: 4px 0 10px !important;
}
div[data-testid="stExpander"] summary {
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 13px !important; letter-spacing: 1.5px !important;
    color: var(--accent-amber) !important; padding: 10px 14px !important;
}

/* ── TextArea ────────────────────────────────────── */
div[data-testid="stTextArea"] textarea {
    min-height: 52px !important; height: 52px !important; resize: vertical !important;
}

/* ══════════════════════════════════════════════════
   PANEL DE EVALUACIÓN (columna derecha)
   ══════════════════════════════════════════════════ */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    padding: 18px !important;
    gap: 10px !important;
}

/* Info del cliente / vendedor */
.floating-info {
    display: flex; flex-direction: column; gap: 7px;
    margin-bottom: 8px; padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.f-item {
    display: flex; align-items: center; gap: 8px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.f-icon { font-size: 14px; color: var(--accent-amber); flex-shrink: 0; }
.f-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.f-num  { font-family: 'Bebas Neue', sans-serif; font-size: 17px;
          letter-spacing: 1px; color: var(--accent-amber); }
.f-dim  { font-size: 10px; color: var(--text-dim); margin-right: 2px; flex-shrink: 0; }
.f-pdv  { font-size: 13px; color: var(--text-primary); }
.f-date { font-size: 11px; color: var(--text-dim); font-family: monospace; letter-spacing: 0.5px; }

/* ── FIX-2: Hint ráfaga — aviso de fotos pendientes de ver ──────── */
.rafaga-hint {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: rgba(217,167,106,.08);
    border: 1px solid rgba(217,167,106,.22);
    border-radius: 8px;
    padding: 8px 10px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 12px; letter-spacing: 1.2px;
    color: var(--accent-amber);
    text-align: center;
}

/* ══════════════════════════════════════════════════
   BOTONES DE ACCIÓN — APROBAR / DESTACAR / RECHAZAR
   FIX-3: Verde vivo para APROBAR, glow ámbar animado para DESTACAR
   ══════════════════════════════════════════════════ */

/* Animación sutil para DESTACAR — retroiluminación ámbar que pulsa */
@keyframes destacar-glow {
  0%,  100% {
    box-shadow: 0 4px 10px rgba(217,167,106,0.15),
                0 0  0px  0px rgba(217,167,106,0.0);
  }
  50% {
    box-shadow: 0 4px 18px rgba(217,167,106,0.40),
                0 0  14px  3px rgba(217,167,106,0.18);
  }
}

[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 7px !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button {
    width: 100% !important;
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 13px !important;
    letter-spacing: 1px !important;
    padding: 12px 4px !important;
    min-height: 48px !important;
    height: auto !important;
    border: none !important;
    border-radius: 10px !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    transition: filter .15s, transform .15s, box-shadow .15s !important;
}

/* ── APROBAR — verde vivo, glow verde en hover ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(1)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #1b6612, #3ec234) !important;
    color: #fff !important;
    box-shadow: 0 4px 12px rgba(62,194,52,0.20) !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(1)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.12) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 22px rgba(62,194,52,0.48) !important;
}

/* ── DESTACAR — ámbar clásico + pulso de retroiluminación sutil ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(2)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #9A6E2A, #D9A76A) !important;
    color: #1A1311 !important;
    font-weight: 800 !important;
    animation: destacar-glow 2.8s ease-in-out infinite !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(2)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.15) !important;
    transform: translateY(-2px) !important;
}

/* ── RECHAZAR — rojo oscuro original ── */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(3)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg, #6A2318, #C0584A) !important;
    color: #fff !important;
}

/* hover genérico para los tres (solo cuando están habilitados) */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:hover:not(:disabled) {
    filter: brightness(1.18) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45) !important;
}

/* Estado deshabilitado — botones grises, sin animación */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:disabled {
    background: rgba(255,255,255,0.07) !important;
    color: rgba(240,230,216,0.30) !important;
    box-shadow: none !important;
    animation: none !important;
    cursor: not-allowed !important;
    transform: none !important;
    filter: none !important;
}

/* ── Acciones secundarias (RECARGAR / SALIR) dentro del panel ───
   Se usan botones type="secondary" (kind="secondary") para el ghost look.         */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button[kind="secondary"] {
    font-size: 9px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    padding: 6px 8px !important;
    min-height: 32px !important;
    height: auto !important;
    border-radius: 8px !important;
    white-space: normal !important;
    animation: none !important;
}

/* ── Botones de navegación ANTERIOR / SIGUIENTE: ghost ─ */
div[data-testid="stVerticalBlock"]:has(#nav-anchor)
    div[data-testid="stButton"] button {
    background: transparent !important;
    border: 1px solid rgba(240,230,216,0.12) !important;
    color: var(--text-muted) !important;
    font-size: 11px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.2px !important;
    padding: 8px 10px !important;
    min-height: 36px !important;
    height: auto !important;
    border-radius: 8px !important;
    transition: all .15s !important;
    animation: none !important;
}
div[data-testid="stVerticalBlock"]:has(#nav-anchor)
    div[data-testid="stButton"] button:hover {
    border-color: rgba(217,167,106,0.35) !important;
    color: var(--accent-amber) !important;
    background: rgba(217,167,106,0.06) !important;
}
div[data-testid="stVerticalBlock"]:has(#nav-anchor)
    div[data-testid="stButton"] button:disabled {
    opacity: 0.2 !important;
}

/* ── Botones F1/F2 (ocultos en DOM, solo para JS) ── */
div[data-testid="stVerticalBlock"]:has(#foto-nav-hidden) {
    height: 0 !important; overflow: hidden !important;
    opacity: 0 !important; pointer-events: none !important;
    margin: 0 !important; padding: 0 !important;
}

/* mobile styles removed – application now targets desktop only */</style>
"""

STYLE = BASE_CSS + VISOR_CSS

# ─── Funciones Auxiliares ──────────────────────────────────────────────────────

# ─── API helpers ──────────────────────────────────────────────────────────────

def _api_conf():
    """Lee URL y API Key desde st.secrets (con fallback local para desarrollo)."""
    try:
        return st.secrets["API_URL"].rstrip("/"), st.secrets["API_KEY"]
    except Exception:
        return "http://localhost:8000", ""


def _api_get(path: str):
    if not HAS_REQUESTS:
        return None
    base, key = _api_conf()
    try:
        r = _req.get(f"{base}{path}", headers={"x-api-key": key}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[API GET] {path}: {e}")
        return None


def _api_post(path: str, data: dict):
    if not HAS_REQUESTS:
        return None
    base, key = _api_conf()
    try:
        r = _req.post(f"{base}{path}", json=data, headers={"x-api-key": key}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[API POST] {path}: {e}")
        return None


def get_pendientes(distribuidor_id: int) -> List[Dict]:
    result = _api_get(f"/pendientes/{distribuidor_id}")
    return result if isinstance(result, list) else []


def get_stats_hoy(distribuidor_id: int) -> Dict:
    result = _api_get(f"/stats/{distribuidor_id}")
    return result if isinstance(result, dict) else {}


def get_vendedores_pendientes(distribuidor_id: int) -> List[str]:
    result = _api_get(f"/vendedores/{distribuidor_id}")
    return result if isinstance(result, list) else []


def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> int:
    """
    Race-condition safe: el WHERE estado='Pendiente' en la API
    garantiza que solo el primer evaluador escribe.
    Retorna: filas actualizadas (>0 OK | 0 ya evaluada | -1 error)
    """
    result = _api_post("/evaluar", {
        "ids_exhibicion": ids_exhibicion,
        "estado": estado,
        "supervisor": supervisor,
        "comentario": comentario or "",
    })
    if result is None:
        return -1
    return result.get("affected", 0)

# ─── Drive URL helpers ────────────────────────────────────────────────────────
_DRIVE_PATTERNS = [
    re.compile(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)"),
    re.compile(r"drive\.google\.com/(?:uc|open)\?.*?id=([a-zA-Z0-9_-]+)"),
    re.compile(r"id=([a-zA-Z0-9_-]{25,})"),          # id= genérico (fallback)
]

def drive_file_id(url: str) -> Optional[str]:
    for rx in _DRIVE_PATTERNS:
        m = rx.search(url or "")
        if m: return m.group(1)
    return None

# ─── Image fetch (server-side, con User-Agent para evitar bloqueos) ───────────

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

def _get_image_b64(url: str, extra_headers: Optional[Dict] = None) -> str:
    """
    Descarga la URL con User-Agent de browser real y devuelve data URI base64.
    Prueba primero 'requests' (más robusto), luego 'urllib' (siempre disponible).
    Retorna '' si falla.
    """
    hdrs = {"User-Agent": _UA}
    if extra_headers:
        hdrs.update(extra_headers)

    # ── Intento 1: requests ───────────────────────────────────────────────────
    if HAS_REQUESTS:
        try:
            r  = _req.get(url, timeout=12, allow_redirects=True, headers=hdrs)
            ct = r.headers.get("content-type", "")
            if r.ok and ct.startswith("image/"):
                b64 = base64.b64encode(r.content).decode()
                return f"data:{ct.split(';')[0]};base64,{b64}"
        except Exception:
            pass

    # ── Intento 2: urllib (siempre disponible, built-in) ─────────────────────
    try:
        req = _urllib_req.Request(url, headers=hdrs)
        with _urllib_req.urlopen(req, timeout=12) as resp:
            ct = resp.headers.get("Content-Type", "")
            if ct.startswith("image/"):
                data = resp.read()
                b64  = base64.b64encode(data).decode()
                return f"data:{ct.split(';')[0]};base64,{b64}"
    except Exception:
        pass

    return ""


@st.cache_data(ttl=600, show_spinner=False)
def fetch_drive_b64(file_id: str, sz: int = 1000) -> str:
    """
    Obtiene imagen de Drive como data URI base64 para renderizado sin auth en browser.

    Estrategia (en orden de confiabilidad):
    1. CDN directa lh3.googleusercontent.com — sin página de confirmación antivirus
    2. Thumbnail URL pública (Drive) — funciona para imágenes pequeñas
    3. Service Account vía st.secrets["google_credentials"] (archivos privados)
    4. Retorna "" → el viewer JS mostrará placeholder
    """
    if not file_id:
        return ""

    # 1. CDN directa de Google (no muestra página de confirmación antivirus)
    cdn_url = f"https://lh3.googleusercontent.com/d/{file_id}"
    result = _get_image_b64(cdn_url)
    if result:
        return result

    # 2. Thumbnail URL pública
    thumb_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w{sz}"
    result = _get_image_b64(thumb_url)
    if result:
        return result

    # 3. Service Account desde Streamlit Secrets
    if not HAS_GOOGLE_AUTH:
        return ""
    try:
        cred_info = dict(st.secrets.get("google_credentials", {}))
        if not cred_info:
            return ""
        creds = _SACreds.from_service_account_info(
            cred_info,
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
        creds.refresh(_ga_tr.Request())
        api_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        return _get_image_b64(api_url, {"Authorization": f"Bearer {creds.token}"})
    except Exception as e:
        print(f"[fetch_drive_b64] SA failed for {file_id}: {e}")

    return ""

# ─── Custom image viewer component ────────────────────────────────────────────

def build_viewer_html(
    fotos: List[Dict],
    foto_idx: int,
    idx: int,
    n_pend: int,
    img_src: str = "",
    thumb_srcs: Optional[List[str]] = None,
) -> str:
    """
    Genera el HTML completo del visualizador.
    - img_src:    data URI base64 (server-side) o URL pública
    - thumb_srcs: lista de data URIs para miniaturas
    - Fallback JS: prueba múltiples URLs si img_src falla en browser
    - Flechas superpuestas, swipe táctil, dots, miniaturas

    FIX-1: Se eliminó 'transition:opacity .2s' del #mi para evitar el
    efecto de difuminado/fade que disparaba el flash oscuro al navegar.
    """
    n_fotos   = len(fotos)
    counter   = f"{idx+1}/{n_pend}" + (f" · F{foto_idx+1}/{n_fotos}" if n_fotos > 1 else "")
    show_prev = foto_idx > 0 or idx > 0
    show_next = foto_idx < n_fotos - 1 or idx < n_pend - 1

    fid = drive_file_id(fotos[foto_idx]["drive_link"]) or ""

    # Fallback si no llegó img_src: usar CDN lh3 (más confiable que thumbnail)
    if not img_src and fid:
        img_src = f"https://lh3.googleusercontent.com/d/{fid}"

    # Dots
    dots = ""
    if n_fotos > 1:
        d = "".join(
            f'<div class="d{"a" if i == foto_idx else ""}"></div>'
            for i in range(n_fotos)
        )
        dots = f'<div class="dots">{d}</div>'

    # Thumbnails
    thumbs = ""
    if n_fotos > 1:
        for i, f in enumerate(fotos):
            tsrc = (thumb_srcs[i] if thumb_srcs and i < len(thumb_srcs) else "") or ""
            if not tsrc:
                tid  = drive_file_id(f["drive_link"]) or ""
                tsrc = f"https://drive.google.com/thumbnail?id={tid}&sz=w150" if tid else ""
            thumbs += (
                f'<div class="th{"a" if i == foto_idx else ""}" data-i="{i}">'
                f'<img src="{tsrc}" onerror="this.style.opacity=.3" loading="lazy"></div>'
            )

    # JS fallback URLs (browser-side, si server-side falló)
    # Orden: CDN directa lh3 → thumbnail → uc export=view
    fb_urls_js = "[]"
    if fid:
        fb_urls_js = (
            f'["https://lh3.googleusercontent.com/d/{fid}",'
            f'"https://drive.google.com/thumbnail?id={fid}&sz=w800",'
            f'"https://drive.google.com/uc?export=view&id={fid}"]'
        )

    return f"""<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:#0a0705;overflow:hidden;height:100%;font-family:sans-serif}}
#vw{{position:relative;width:100%;height:calc(100% - {65 if n_fotos > 1 else 0}px);
     background:#0a0705;display:flex;align-items:center;justify-content:center;overflow:hidden}}
#mi{{width:100%;height:100%;object-fit:contain;display:block;
     touch-action:pinch-zoom;user-select:none;-webkit-user-drag:none;pointer-events:none}}
/* SIN transition:opacity — evita el difuminado/flash al navegar (FIX-1) */
/* placeholder si no hay imagen */
#img-ph{{display:none;position:absolute;inset:0;flex-direction:column;
         align-items:center;justify-content:center;gap:8px;pointer-events:none}}
#img-ph .ph-icon{{font-size:52px;opacity:.3}}
#img-ph .ph-txt{{font-size:10px;letter-spacing:2px;color:rgba(217,167,106,.35);
                 text-transform:uppercase}}
.ctr{{position:absolute;top:10px;left:12px;z-index:20;background:rgba(0,0,0,.65);
      color:#F0E6D8;font:10px/1 monospace;letter-spacing:1px;
      padding:3px 10px;border-radius:20px;backdrop-filter:blur(4px)}}
.raf{{position:absolute;top:10px;right:12px;z-index:20;background:rgba(18,12,10,.85);
      color:#D9A76A;border:1px solid rgba(217,167,106,.3);border-radius:20px;
      padding:3px 10px;font:600 10px sans-serif;letter-spacing:.5px;
      text-transform:uppercase;backdrop-filter:blur(4px)}}
.chev{{position:absolute;top:0;bottom:0;width:15%;z-index:15;
       display:flex;align-items:center;justify-content:center;
       cursor:pointer;transition:background .15s;-webkit-tap-highlight-color:transparent}}
.chev.L{{left:0;background:linear-gradient(90deg,rgba(0,0,0,.5),transparent)}}
.chev.R{{right:0;background:linear-gradient(270deg,rgba(0,0,0,.5),transparent)}}
.chev.h{{display:none}}
.chev span{{font-size:50px;color:rgba(255,255,255,.80);line-height:1;
            text-shadow:0 2px 10px rgba(0,0,0,.9);transition:transform .1s}}
.chev:hover span{{transform:scale(1.12)}}
.chev:active span{{transform:scale(.9)}}
.dots{{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
       display:flex;gap:6px;align-items:center;z-index:20}}
.d{{width:6px;height:6px;border-radius:50%;background:rgba(240,230,216,.3);transition:all .2s}}
.da{{width:10px;height:10px;background:rgba(217,167,106,.9)}}
#thumbs{{display:flex;gap:5px;padding:6px 4px;background:#0a0705;
         overflow-x:auto;scrollbar-width:thin;
         scrollbar-color:rgba(217,167,106,.3) transparent;
         height:{65 if n_fotos > 1 else 0}px}}
.th,.tha{{flex-shrink:0;width:52px;height:52px;border-radius:6px;overflow:hidden;
          border:2px solid transparent;cursor:pointer;transition:border-color .15s}}
.th img,.tha img{{width:100%;height:100%;object-fit:cover}}
.th:hover{{border-color:rgba(217,167,106,.5)}}
.tha{{border-color:#D9A76A;box-shadow:0 0 8px rgba(217,167,106,.4)}}
</style></head>
<body>
<div id="vw">
  <div class="ctr">{counter}</div>
  {'<div class="raf">📸 ' + str(n_fotos) + ' fotos</div>' if n_fotos > 1 else ''}
  <div class="chev L{' h' if not show_prev else ''}" id="bp"><span>‹</span></div>
  <img id="mi" src="{img_src}" alt="exhibición" draggable="false" loading="eager">
  <div class="chev R{' h' if not show_next else ''}" id="bn"><span>›</span></div>
  {dots}
  <div id="img-ph">
    <div class="ph-icon">📷</div>
    <div class="ph-txt">Sin imagen</div>
  </div>
</div>
{'<div id="thumbs">' + thumbs + '</div>' if n_fotos > 1 else ''}

<script>
(function(){{
  const isFoto = {str(n_fotos > 1).lower()};
  const fi     = {foto_idx};
  const nf     = {n_fotos};

  /* ── Fallback de imagen browser-side ─────────────────────────────────── */
  const mi = document.getElementById('mi');
  const fbUrls = {fb_urls_js};
  let fbIdx = 0;
  mi.onerror = function() {{
    if (fbIdx < fbUrls.length) {{
      mi.src = fbUrls[fbIdx++];
    }} else {{
      mi.style.opacity = '0.08';
      mi.onerror = null;
      const ph = document.getElementById('img-ph');
      if (ph) ph.style.display = 'flex';
    }}
  }};

  /* ── Navegación ──────────────────────────────────────────────────────── */
  function stClick(txt) {{
    const pd = window.parent.document;
    const b  = Array.from(pd.querySelectorAll('button'))
                    .find(b => !b.disabled && b.innerText && b.innerText.includes(txt));
    if (b) b.click();
  }}
  function clickFoto(i) {{
    const pd = window.parent.document;
    const b  = Array.from(pd.querySelectorAll('button'))
                    .find(b => b.innerText && b.innerText.trim() === 'F' + (i + 1));
    if (b) b.click();
  }}
  function goPrev() {{ if (isFoto && fi > 0) {{ clickFoto(fi - 1); }} else {{ stClick('ANTERIOR'); }} }}
  function goNext() {{ if (isFoto && fi < nf - 1) {{ clickFoto(fi + 1); }} else {{ stClick('SIGUIENTE'); }} }}

  document.getElementById('bp').addEventListener('click', goPrev);
  document.getElementById('bn').addEventListener('click', goNext);

  /* ── Swipe táctil ────────────────────────────────────────────────────── */
  let sx = 0, sy = 0, st = 0;
  const vw = document.getElementById('vw');
  vw.addEventListener('touchstart', e => {{ sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }}, {{ passive: true }});
  vw.addEventListener('touchend', e => {{
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Date.now() - st > 600 || Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * .8) return;
    if (dx < 0) goNext(); else goPrev();
  }}, {{ passive: true }});

  /* ── Miniaturas ──────────────────────────────────────────────────────── */
  document.querySelectorAll('.th,.tha').forEach(el => {{
    el.addEventListener('click', () => clickFoto(parseInt(el.dataset.i)));
  }});
}})();
</script>
</body></html>"""

# ─── State helpers ────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "logged_in":       False,
        "user":            None,
        "pendientes":      [],
        "idx":             0,
        "foto_idx":        0,
        "flash":           None,
        "flash_type":      "green",
        "filtro_vendedor": "Todos",
        "_visor_loaded":   False,
        # FIX-2: tracking de fotos vistas por ráfaga.
        # Dict[int, int] → idx_exhibicion → max foto_idx que llegó a ver el evaluador.
        # Se limpia al recargar pendientes para evitar datos viejos.
        "fotos_vistas":    {},
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
        st.session_state.foto_idx   = 0
        st.session_state.fotos_vistas = {}   # FIX-2: resetear al recargar

def reload_pendientes_silent():
    u = st.session_state.user
    if u:
        nuevos = get_pendientes(u["id_distribuidor"])
        if len(nuevos) != len(st.session_state.pendientes):
            st.session_state.pendientes = nuevos
            if st.session_state.idx >= len(st.session_state.pendientes):
                st.session_state.idx = max(0, len(st.session_state.pendientes) - 1)
            st.session_state.fotos_vistas = {}   # FIX-2: resetear al recargar silencioso

def set_flash(msg: str, tipo: str = "green"):
    st.session_state.flash = msg
    st.session_state.flash_type = tipo

# ─── Main visor ───────────────────────────────────────────────────────────────

def render_visor():
    # Carga inicial
    if not st.session_state._visor_loaded:
        reload_pendientes()
        st.session_state._visor_loaded = True

    if HAS_AUTOREFRESH:
        count = st_autorefresh(interval=30000, limit=None, key="visor_autorefresh")
        if count > 0:
            reload_pendientes_silent()

    st.markdown(STYLE, unsafe_allow_html=True)

    u    = st.session_state.user
    dist = u.get("nombre_empresa", "")

    # ── Calcular estado ANTES del topbar (para incluir stats y counter) ───────
    pend   = st.session_state.pendientes
    filtro = st.session_state.filtro_vendedor
    pend_filtrada = (
        [p for p in pend if p.get("vendedor") == filtro]
        if filtro != "Todos" else pend
    )
    idx = st.session_state.idx
    if pend_filtrada and idx >= len(pend_filtrada):
        st.session_state.idx = len(pend_filtrada) - 1
        idx = st.session_state.idx
    n_pend = len(pend_filtrada)

    # Stats del día para topbar
    stats = get_stats_hoy(u["id_distribuidor"])

    # ── Topbar con stats integradas ───────────────────────────────────────────
    counter_str = f"{idx+1}/{n_pend}" if pend_filtrada else "—"
    st.markdown(
        '<div class="topbar">'
        '<div style="display:flex;align-items:center;gap:10px;">'
        '<span class="topbar-logo">SHELFMIND</span>'
        f'<span class="topbar-meta">{dist}</span>'
        '<span class="topbar-meta" style="opacity:.3;">·</span>'
        f'<span class="topbar-meta" style="color:var(--accent-amber);font-weight:700;">'
        f'{counter_str}</span>'
        '</div>'
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">'
        f'<span class="topbar-stat-pill top-stat-pend">⏳ {stats.get("pendientes",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-apro">✅ {stats.get("aprobadas",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-dest">🔥 {stats.get("destacadas",0)}</span>'
        f'<span class="topbar-stat-pill top-stat-rech">❌ {stats.get("rechazadas",0)}</span>'
        '</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Filtro vendedor ───────────────────────────────────────────────────────
    vends    = get_vendedores_pendientes(u["id_distribuidor"])
    opciones = ["Todos"] + vends
    filtro_actual = st.session_state.filtro_vendedor
    if filtro_actual not in opciones:
        opciones.append(filtro_actual)

    if pend or filtro_actual != "Todos":
        with st.expander(f"🔍 FILTRAR: {filtro_actual.upper()}", expanded=False):
            sel = st.selectbox(
                "Vendedor", opciones,
                index=opciones.index(filtro_actual),
                key="sel_vendedor", label_visibility="collapsed",
            )
            ca, cl = st.columns([2, 1])
            with ca:
                if st.button("APLICAR FILTRO", key="btn_aplicar"):
                    st.session_state.filtro_vendedor = sel
                    st.session_state.idx = 0
                    st.rerun()
            with cl:
                if st.button("✕ LIMPIAR", key="btn_limpiar", disabled=(filtro_actual == "Todos")):
                    st.session_state.filtro_vendedor = "Todos"
                    st.session_state.idx = 0
                    st.rerun()

    # ── Flash ─────────────────────────────────────────────────────────────────
    if st.session_state.flash:
        cf = {
            "green": ("rgba(20,80,40,.95)",  "#4ade80", "1px solid rgba(74,222,128,.4)"),
            "red":   ("rgba(80,20,20,.95)",  "#f87171", "1px solid rgba(248,113,113,.4)"),
            "amber": ("rgba(80,60,10,.95)",  "#fbbf24", "1px solid rgba(251,191,36,.4)"),
        }
        bg, tc, bdr = cf.get(st.session_state.flash_type, cf["green"])
        st.markdown(
            f'<div class="flash-msg" style="background:{bg};color:{tc};border:{bdr};">'
            f'{st.session_state.flash}</div>',
            unsafe_allow_html=True,
        )
        st.session_state.flash = None

    # ══════════════════════════════════════════════════════════════════════════
    # VISOR DE FOTOS + NAVEGACIÓN (ancho completo) + PANEL DE EVALUACIÓN
    # ══════════════════════════════════════════════════════════════════════════
    col_visor, col_panel = st.columns([7, 3])

    with col_visor:
        if not pend_filtrada:
            # Estado vacío
            st.markdown(
                '<div class="empty-state">'
                '<div class="empty-icon">🎯</div>'
                '<div class="empty-title">TODO AL DÍA</div>'
                '<div style="color:var(--text-muted);font-size:14px;">'
                'No hay exhibiciones pendientes.</div>'
                '</div>',
                unsafe_allow_html=True,
            )
            st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
            _, c2, _ = st.columns([1, 2, 1])
            with c2:
                if st.button("↺ BUSCAR NUEVAS", key="btn_reload_empty", use_container_width=True):
                    reload_pendientes(); st.rerun()
                st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
                if st.button("SALIR", key="btn_logout_empty", type="secondary", use_container_width=True):
                    for k in list(st.session_state.keys()): del st.session_state[k]
                    st.rerun()
        else:
            ex       = pend_filtrada[idx]
            fotos    = ex.get("fotos", [])
            n_fotos  = len(fotos)
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos:
                foto_idx = 0; st.session_state.foto_idx = 0

            # ── FIX-2: Actualizar el máximo de fotos vistas para esta exhibición ──
            # El dict usa el idx como clave. Cada vez que foto_idx avanza lo registramos.
            fv = st.session_state.fotos_vistas
            if foto_idx > fv.get(idx, 0):
                fv[idx] = foto_idx
                st.session_state.fotos_vistas = fv

            # ── Fetch imagen server-side ──────────────────────────────────────
            main_fid = drive_file_id(fotos[foto_idx]["drive_link"]) or ""
            img_src  = fetch_drive_b64(main_fid, sz=1000)

            thumb_srcs: List[str] = []
            if n_fotos > 1:
                for f in fotos:
                    tid = drive_file_id(f["drive_link"]) or ""
                    thumb_srcs.append(fetch_drive_b64(tid, sz=150))

            # ── Viewer (más alto ahora que ocupa el ancho completo) ───────────
            viewer_height = 540 + (65 if n_fotos > 1 else 0)
            components.html(
                build_viewer_html(
                    fotos, foto_idx, idx, n_pend,
                    img_src=img_src, thumb_srcs=thumb_srcs,
                ),
                height=viewer_height,
                scrolling=False,
            )

            # ── Navegación ANTERIOR / SIGUIENTE (AHORA ENVUELTO EN st.container) ──
            with st.container():
                st.markdown('<div id="nav-anchor"></div>', unsafe_allow_html=True)
                c_prev, c_txt, c_next = st.columns([1, 2, 1])
                with c_prev:
                    if st.button("← ANTERIOR", key="btn_prev", disabled=(idx == 0)):
                        st.session_state.idx -= 1
                        st.session_state.foto_idx = 0
                        st.rerun()
                with c_txt:
                    st.markdown(
                        f'<div style="text-align:center;font-size:11px;'
                        f'color:var(--text-dim);padding-top:12px;font-family:monospace;'
                        f'letter-spacing:1px;">'
                        f'EXHIBICIÓN {idx+1} / {n_pend}</div>',
                        unsafe_allow_html=True,
                    )
                with c_next:
                    if st.button("SIGUIENTE →", key="btn_next",
                                 disabled=(idx >= n_pend - 1)):
                        st.session_state.idx += 1
                        st.session_state.foto_idx = 0
                        st.rerun()

            # Botones F1…Fn (AHORA ENVUELTOS EN st.container Y CON CLAVES DINÁMICAS)
            if n_fotos > 1:
                with st.container():
                    st.markdown('<div id="foto-nav-hidden"></div>', unsafe_allow_html=True)
                    cols_f = st.columns(n_fotos)
                    for i, col in enumerate(cols_f):
                        with col:
                            if st.button(f"F{i+1}", key=f"tmb_{idx}_{i}"):
                                st.session_state.foto_idx = i; st.rerun()

    with col_panel:
            if pend_filtrada:
                ex             = pend_filtrada[idx]
                fotos          = ex.get("fotos", [])
                n_fotos        = len(fotos)
                foto_idx       = st.session_state.foto_idx
                ids_exhibicion = [f["id_exhibicion"] for f in fotos]
                fecha_fmt      = ex.get("fecha_hora", "")[:16]
                supervisor     = u.get("usuario_login", "supervisor")

                # ── FIX-2: Calcular si el evaluador ya vio todas las fotos ──────
                # Una exhibición de foto única siempre está "vista".
                # Una ráfaga requiere que foto_idx haya llegado al final al menos una vez.
                max_vista   = st.session_state.fotos_vistas.get(idx, foto_idx)
                todas_vistas = (n_fotos <= 1) or (max_vista >= n_fotos - 1)
                fotos_faltan = (n_fotos - 1 - max_vista) if not todas_vistas else 0

                with st.container():
                    st.markdown('<div id="eval-master-anchor"></div>', unsafe_allow_html=True)

                    # Info del vendedor / cliente
                    st.markdown(
                        '<div class="floating-info">'
                        f'<div class="f-item">'
                        f'  <span class="f-icon">👤</span>'
                        f'  <span class="f-name">{ex.get("vendedor","—")}</span>'
                        f'</div>'
                        f'<div class="f-item">'
                        f'  <span class="f-icon">🏪</span>'
                        f'  <span class="f-dim">C·</span>'
                        f'  <span class="f-num">{ex.get("nro_cliente","—")}</span>'
                        f'</div>'
                        f'<div class="f-item">'
                        f'  <span class="f-icon">📍</span>'
                        f'  <span class="f-pdv">{ex.get("tipo_pdv","—")}</span>'
                        f'</div>'
                        f'<div class="f-item">'
                        f'  <span class="f-icon">🕐</span>'
                        f'  <span class="f-date">{fecha_fmt}</span>'
                        f'</div>'
                        '</div>',
                        unsafe_allow_html=True,
                    )

                    # CLAVE DINÁMICA: evita arrastrar comentarios a la siguiente exhibición
                    comentario = st.text_area(
                        "C", placeholder="Comentario opcional...",
                        key=f"comentario_field_{idx}", label_visibility="collapsed",
                    )

                    # ── FIX-2: Hint visual cuando quedan fotos de ráfaga por ver ──
                    if not todas_vistas:
                        faltan_txt = f"F{max_vista + 2}" if fotos_faltan == 1 else f"F{max_vista + 2}–F{n_fotos}"
                        st.markdown(
                            f'<div class="rafaga-hint">'
                            f'📸 Ver {faltan_txt} para desbloquear evaluación'
                            f'</div>',
                            unsafe_allow_html=True,
                        )

                    # Botones de acción CON CLAVES DINÁMICAS
                    # disabled=not todas_vistas bloquea hasta ver la última foto (FIX-2)
                    cb1, cb2, cb3 = st.columns(3)
                    with cb1:
                        if st.button(
                            "✅ APROBAR", key=f"b_ap_{idx}",
                            use_container_width=True,
                            disabled=not todas_vistas,
                        ):
                            n = evaluar(ids_exhibicion, "Aprobado", supervisor, comentario)
                            if n > 0:    set_flash("✅ Aprobada", "green")
                            elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                            reload_pendientes(); st.rerun()
                    with cb2:
                        if st.button(
                            "🔥 DESTACAR", key=f"b_dest_{idx}",
                            use_container_width=True,
                            disabled=not todas_vistas,
                        ):
                            n = evaluar(ids_exhibicion, "Destacado", supervisor, comentario)
                            if n > 0:    set_flash("🔥 Destacada", "amber")
                            elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                            reload_pendientes(); st.rerun()
                    with cb3:
                        if st.button(
                            "❌ RECHAZAR", key=f"b_rej_{idx}",
                            use_container_width=True,
                            disabled=not todas_vistas,
                        ):
                            n = evaluar(ids_exhibicion, "Rechazado", supervisor, comentario)
                            if n > 0:    set_flash("❌ Rechazada", "red")
                            elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                            reload_pendientes(); st.rerun()

                    # Acciones secundarias
                    st.markdown(
                        "<div style='height:10px'></div>"
                        '<div id="secondary-actions-anchor"></div>',
                        unsafe_allow_html=True,
                    )
                    sa1, sa2 = st.columns(2)
                    with sa1:
                        if st.button("↺ RECARGAR", key="btn_reload_full", use_container_width=True):
                            reload_pendientes(); st.rerun()
                    with sa2:
                        if st.button("SALIR", key="btn_logout_full", use_container_width=True):
                            for k in list(st.session_state.keys()): del st.session_state[k]
                            st.rerun()

def main():
    init_state()
    if not st.session_state.logged_in:
        st.switch_page("app.py")
    else:
        render_visor()

if __name__ == "__main__":
    main()
