# -*- coding: utf-8 -*-
"""
File: 1b_Visor_mobile.py

ShelfMind — Visor de Evaluación (Mobile / Streamlit)
---------------------------------------------------
Mobile-first minimalista:
- Topbar fijo (MENÚ + logo + contador)
- Viewer táctil (swipe) en el centro
- Bottom-sheet fijo con info + comentario + botones ✅🔥❌
"""

from __future__ import annotations

import base64
import re
import sys
import urllib.request as _urllib_req
from typing import Dict, List, Optional

import streamlit as st
import streamlit.components.v1 as components

try:
    import requests as _req

    HAS_REQUESTS = True
except Exception:
    HAS_REQUESTS = False

try:
    from google.oauth2.service_account import Credentials as _SACreds
    import google.auth.transport.requests as _ga_tr

    HAS_GOOGLE_AUTH = True
except Exception:
    HAS_GOOGLE_AUTH = False

try:
    from streamlit_autorefresh import st_autorefresh

    HAS_AUTOREFRESH = True
except Exception:
    HAS_AUTOREFRESH = False


# ──────────────────────────────────────────────────────────────────────────────
# Auth guard + Page config
# ──────────────────────────────────────────────────────────────────────────────

if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

st.set_page_config(
    page_title="ShelfMind · Evaluación (Mobile)",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

STATE_PREFIX = "m_"


def sk(name: str) -> str:
    return f"{STATE_PREFIX}{name}"


# ──────────────────────────────────────────────────────────────────────────────
# Optional shared styles (si existe)
# ──────────────────────────────────────────────────────────────────────────────

BASE_CSS = ""
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from _shared_styles import BASE_CSS as _BASE_CSS  # type: ignore

    BASE_CSS = _BASE_CSS
except Exception:
    BASE_CSS = ""


# ──────────────────────────────────────────────────────────────────────────────
# Mobile CSS
# ──────────────────────────────────────────────────────────────────────────────

MOBILE_CSS = """
<style>
:root{
  --bg: #140f0d;
  --panel: rgba(18,12,10,.92);
  --text: #F0E6D8;
  --muted: rgba(240,230,216,.62);
  --dim: rgba(240,230,216,.42);
  --accent: #D9A76A;

  --topbar-h: 56px;
  --sheet-h: 270px;
  --radius: 16px;
}

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"]{
  background: var(--bg) !important;
  color: var(--text) !important;
}

[data-testid="stHeader"], [data-testid="stToolbar"], footer{ display:none !important; }
section[data-testid="stSidebar"]{ display:none !important; }

[data-testid="stMainBlockContainer"], .block-container{
  max-width: 100% !important;
  padding: calc(var(--topbar-h) + 10px) 12px calc(var(--sheet-h) + env(safe-area-inset-bottom) + 12px) 12px !important;
}

/* ── Topbar (fixed) ─────────────────────────────────────────────────────── */
[data-testid="stHorizontalBlock"]:has(#mobile-topbar-anchor){
  position: fixed !important;
  top: 0; left: 0; right: 0;
  height: var(--topbar-h);
  z-index: 999;
  padding: 10px 12px;
  background: rgba(10,7,5,.92);
  border-bottom: 1px solid rgba(217,167,106,.16);
  backdrop-filter: blur(10px);
  align-items: center !important;
}

.mobile-logo{
  font-weight: 800;
  letter-spacing: 3px;
  font-size: 16px;
  text-align: center;
  color: var(--text);
}

.mobile-count{
  text-align: right;
  font: 700 12px/1.1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--accent);
  letter-spacing: 1px;
  padding-top: 2px;
}

div[data-testid="stButton"] button{
  border-radius: 12px !important;
  border: 1px solid rgba(217,167,106,.25) !important;
  background: rgba(217,167,106,.08) !important;
  color: var(--text) !important;
  height: 40px !important;
  font-weight: 800 !important;
}

/* ── Viewer: dynamic height ─────────────────────────────────────────────── */
div[data-testid="stVerticalBlock"]:has(#mobile-viewer-anchor) iframe{
  width: 100% !important;
  height: calc(100vh - var(--topbar-h) - var(--sheet-h) - env(safe-area-inset-bottom) - 26px) !important;
  height: calc(100dvh - var(--topbar-h) - var(--sheet-h) - env(safe-area-inset-bottom) - 26px) !important;
  min-height: 260px !important;
  border: 1px solid rgba(217,167,106,.14) !important;
  border-radius: var(--radius) !important;
  overflow: hidden !important;
}

/* ── Bottom sheet (fixed) ───────────────────────────────────────────────── */
div[data-testid="stVerticalBlock"]:has(#mobile-bottomsheet-anchor){
  position: fixed !important;
  left: 0; right: 0; bottom: 0;
  height: var(--sheet-h);
  z-index: 999;
  background: var(--panel);
  border-top: 1px solid rgba(217,167,106,.20);
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom)) 12px !important;
  backdrop-filter: blur(12px);
  overflow-y: auto !important;
}

div[data-testid="stVerticalBlock"]:has(#mobile-bottomsheet-anchor) .stMarkdown{ margin-bottom: 6px !important; }
div[data-testid="stVerticalBlock"]:has(#mobile-bottomsheet-anchor) label{ display:none !important; }

.bs-meta{
  display:flex;
  flex-wrap:wrap;
  gap: 8px 10px;
  align-items:center;
  justify-content:space-between;
}

.bs-left{
  display:flex;
  gap: 8px;
  flex-wrap:wrap;
  align-items:center;
}

.pill{
  display:inline-flex;
  gap: 6px;
  align-items:center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(217,167,106,.18);
  background: rgba(10,7,5,.55);
  color: var(--text);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.pill .k{ color: var(--dim); font-weight: 800; letter-spacing: .5px; }
.pill .v{ color: var(--text); font-weight: 900; }

.bs-date{
  color: var(--muted);
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  letter-spacing: .8px;
}

/* Action buttons */
div[data-testid="stVerticalBlock"]:has(#mobile-bottomsheet-anchor) div[data-testid="stButton"] button{
  height: 56px !important;
  border-radius: 14px !important;
  font-size: 14px !important;
  letter-spacing: .5px !important;
}

div[data-testid="stVerticalBlock"]:has(#mobile-bottomsheet-anchor) textarea{
  border-radius: 12px !important;
  border: 1px solid rgba(217,167,106,.18) !important;
  background: rgba(10,7,5,.55) !important;
  color: var(--text) !important;
}

/* Hidden nav buttons (for viewer JS) */
div[data-testid="stVerticalBlock"]:has(#mobile-hidden-nav){
  height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* Toast */
.toast{
  position: fixed;
  top: calc(var(--topbar-h) + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(217,167,106,.18);
  background: rgba(10,7,5,.88);
  color: var(--text);
  font-weight: 900;
  letter-spacing: .3px;
}
.toast.green{ border-color: rgba(74,222,128,.35); }
.toast.red{ border-color: rgba(248,113,113,.35); }
.toast.amber{ border-color: rgba(251,191,36,.35); }

.empty{
  border: 1px solid rgba(217,167,106,.14);
  border-radius: var(--radius);
  background: rgba(10,7,5,.55);
  padding: 18px 14px;
  text-align:center;
}
.empty .t{ font-weight: 900; letter-spacing: 2px; }
.empty .s{ color: var(--muted); font-size: 13px; margin-top: 6px; }
</style>
"""

STYLE = BASE_CSS + MOBILE_CSS


# ──────────────────────────────────────────────────────────────────────────────
# API helpers
# ──────────────────────────────────────────────────────────────────────────────

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


def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> int:
    result = _api_post("/evaluar", {
        "ids_exhibicion": ids_exhibicion,
        "estado": estado,
        "supervisor": supervisor,
        "comentario": comentario or "",
    })
    if result is None:
        return -1
    return result.get("affected", 0)


# ──────────────────────────────────────────────────────────────────────────────
# Drive helpers (sz reducido a w800)
# ──────────────────────────────────────────────────────────────────────────────

_DRIVE_FILE_RE = re.compile(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)")
_DRIVE_UC_RE = re.compile(r"drive\.google\.com/uc\?.*id=([a-zA-Z0-9_-]+)")

_UA = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)


def drive_file_id(url: str) -> Optional[str]:
    for rx in (_DRIVE_FILE_RE, _DRIVE_UC_RE):
        m = rx.search(url or "")
        if m:
            return m.group(1)
    return None


def _get_image_b64(url: str, extra_headers: Optional[Dict] = None) -> str:
    hdrs = {"User-Agent": _UA}
    if extra_headers:
        hdrs.update(extra_headers)

    if HAS_REQUESTS:
        try:
            r = _req.get(url, timeout=12, allow_redirects=True, headers=hdrs)
            ct = r.headers.get("content-type", "")
            if r.ok and ct.startswith("image/"):
                b64 = base64.b64encode(r.content).decode()
                return f"data:{ct.split(';')[0]};base64,{b64}"
        except Exception:
            pass

    try:
        req = _urllib_req.Request(url, headers=hdrs)
        with _urllib_req.urlopen(req, timeout=12) as resp:
            ct = resp.headers.get("Content-Type", "")
            if ct.startswith("image/"):
                data = resp.read()
                b64 = base64.b64encode(data).decode()
                return f"data:{ct.split(';')[0]};base64,{b64}"
    except Exception:
        pass

    return ""


@st.cache_data(ttl=600, show_spinner=False)
def fetch_drive_b64(file_id: str, sz: int = 800) -> str:
    """
    Obtiene imagen de Drive como data URI base64 para renderizado sin auth en browser.

    Estrategia:
    1. Thumbnail URL pública (Google Drive) — sin autenticación
    2. Service Account vía st.secrets["google_credentials"] (fallback para archivos privados)
    3. Retorna "" → el viewer JS mostrará placeholder
    """
    if not file_id:
        return ""

    thumb_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w{sz}"
    result = _get_image_b64(thumb_url)
    if result:
        return result

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


# ──────────────────────────────────────────────────────────────────────────────
# Viewer HTML (swipe)
# ──────────────────────────────────────────────────────────────────────────────

def build_viewer_html_mobile(
    fotos: List[Dict],
    foto_idx: int,
    idx: int,
    n_pend: int,
    img_src: str = "",
) -> str:
    n_fotos = len(fotos)
    counter = f"{idx + 1}/{n_pend}" + (f" · F{foto_idx + 1}/{n_fotos}" if n_fotos > 1 else "")
    show_prev = foto_idx > 0 or idx > 0
    show_next = foto_idx < n_fotos - 1 or idx < n_pend - 1

    fid = drive_file_id(fotos[foto_idx].get("drive_link", "")) or ""

    if not img_src and fid:
        img_src = f"https://drive.google.com/thumbnail?id={fid}&sz=w800"

    dots = ""
    if n_fotos > 1:
        d = "".join(f'<div class="d{" a" if i == foto_idx else ""}"></div>' for i in range(n_fotos))
        dots = f'<div class="dots">{d}</div>'

    fb_urls_js = "[]"
    if fid:
        fb_urls_js = (
            f'["https://drive.google.com/thumbnail?id={fid}&sz=w800",'
            f'"https://drive.google.com/uc?export=view&id={fid}"]'
        )

    return f"""<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:transparent;overflow:hidden;height:100%;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}}
#vw{{position:relative;width:100%;height:100%;
     background:#0a0705;display:flex;align-items:center;justify-content:center;overflow:hidden}}
#mi{{width:100%;height:100%;object-fit:contain;display:block;
     touch-action:pinch-zoom;user-select:none;-webkit-user-drag:none;pointer-events:none;
     transition:opacity .2s}}
#img-ph{{display:none;position:absolute;inset:0;flex-direction:column;
         align-items:center;justify-content:center;gap:8px;pointer-events:none}}
#img-ph .ph-icon{{font-size:52px;opacity:.3}}
#img-ph .ph-txt{{font-size:10px;letter-spacing:2px;color:rgba(217,167,106,.35);
                 text-transform:uppercase}}
.ctr{{position:absolute;top:10px;left:12px;z-index:20;background:rgba(0,0,0,.60);
      color:#F0E6D8;font:10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
      letter-spacing:1px;padding:4px 10px;border-radius:20px;backdrop-filter:blur(4px)}}
.chev{{position:absolute;top:0;bottom:0;width:18%;z-index:15;
       display:flex;align-items:center;justify-content:center;
       cursor:pointer;transition:background .15s;-webkit-tap-highlight-color:transparent}}
.chev.L{{left:0;background:linear-gradient(90deg,rgba(0,0,0,.45),transparent)}}
.chev.R{{right:0;background:linear-gradient(270deg,rgba(0,0,0,.45),transparent)}}
.chev.h{{display:none}}
.chev span{{font-size:46px;color:rgba(255,255,255,.78);line-height:1;
            text-shadow:0 2px 10px rgba(0,0,0,.9)}}
.dots{{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
       display:flex;gap:6px;align-items:center;z-index:20}}
.d{{width:6px;height:6px;border-radius:50%;background:rgba(240,230,216,.26);transition:all .2s}}
.d.a{{width:10px;height:10px;background:rgba(217,167,106,.92)}}
</style></head>
<body>
<div id="vw">
  <div class="ctr">{counter}</div>
  <div class="chev L{' h' if not show_prev else ''}" id="bp"><span>&#8249;</span></div>
  <img id="mi" src="{img_src}" alt="exhibición" draggable="false" loading="eager">
  <div class="chev R{' h' if not show_next else ''}" id="bn"><span>&#8250;</span></div>
  {dots}
  <div id="img-ph">
    <div class="ph-icon">📷</div>
    <div class="ph-txt">Sin imagen</div>
  </div>
</div>

<script>
(function(){{
  const isFoto = {str(n_fotos > 1).lower()};
  const fi     = {foto_idx};
  const nf     = {n_fotos};

  const mi = document.getElementById('mi');
  const ph = document.getElementById('img-ph');
  const fbUrls = {fb_urls_js};
  let fbIdx = 0;

  mi.onerror = function() {{
    if (fbIdx < fbUrls.length) {{
      mi.src = fbUrls[fbIdx++];
    }} else {{
      mi.style.opacity = '0.08';
      ph.style.display = 'flex';
    }}
  }};

  function stClick(txt) {{
    const pd = window.parent.document;
    const b = Array.from(pd.querySelectorAll('button'))
                   .find(b => (b.innerText || '').toUpperCase().includes(txt));
    if (b) b.click();
  }}
  function clickFoto(i) {{
    const pd = window.parent.document;
    const b  = Array.from(pd.querySelectorAll('button'))
                    .find(b => (b.innerText || '').trim() === 'F' + (i + 1));
    if (b) b.click();
  }}
  function goPrev() {{ if (isFoto && fi > 0) {{ clickFoto(fi - 1); }} else {{ stClick('ANTERIOR'); }} }}
  function goNext() {{ if (isFoto && fi < nf - 1) {{ clickFoto(fi + 1); }} else {{ stClick('SIGUIENTE'); }} }}

  document.getElementById('bp').addEventListener('click', goPrev);
  document.getElementById('bn').addEventListener('click', goNext);

  let sx = 0, sy = 0, stt = 0;
  const vw = document.getElementById('vw');
  vw.addEventListener('touchstart', e => {{
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; stt = Date.now();
  }}, {{ passive: true }});
  vw.addEventListener('touchend', e => {{
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Date.now() - stt > 650 || Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * .85) return;
    if (dx < 0) goNext(); else goPrev();
  }}, {{ passive: true }});
}})();
</script>
</body></html>"""


# ──────────────────────────────────────────────────────────────────────────────
# State + UX helpers (NAMESPACE MOBILE)
# ──────────────────────────────────────────────────────────────────────────────

def init_state() -> None:
    defaults = {
        sk("pendientes"): [],
        sk("idx"): 0,
        sk("foto_idx"): 0,
        sk("flash"): None,
        sk("flash_type"): "green",
        sk("loaded"): False,
        sk("comentario"): "",
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def set_flash(msg: str, tipo: str = "green") -> None:
    st.session_state[sk("flash")] = msg
    st.session_state[sk("flash_type")] = tipo


def clear_comment() -> None:
    st.session_state[sk("comentario")] = ""


def reload_pendientes() -> None:
    u = st.session_state.get("user")
    if not u:
        return
    st.session_state[sk("pendientes")] = get_pendientes(u["id_distribuidor"])
    if st.session_state[sk("idx")] >= len(st.session_state[sk("pendientes")]):
        st.session_state[sk("idx")] = max(0, len(st.session_state[sk("pendientes")]) - 1)
    st.session_state[sk("foto_idx")] = 0
    clear_comment()


def reload_pendientes_silent() -> None:
    u = st.session_state.get("user")
    if not u:
        return
    nuevos = get_pendientes(u["id_distribuidor"])
    if len(nuevos) != len(st.session_state[sk("pendientes")]):
        st.session_state[sk("pendientes")] = nuevos
        if st.session_state[sk("idx")] >= len(st.session_state[sk("pendientes")]):
            st.session_state[sk("idx")] = max(0, len(st.session_state[sk("pendientes")]) - 1)
        st.session_state[sk("foto_idx")] = 0


def goto_prev_group() -> None:
    if st.session_state[sk("idx")] > 0:
        st.session_state[sk("idx")] -= 1
        st.session_state[sk("foto_idx")] = 0
        clear_comment()


def goto_next_group() -> None:
    if st.session_state[sk("idx")] < len(st.session_state[sk("pendientes")]) - 1:
        st.session_state[sk("idx")] += 1
        st.session_state[sk("foto_idx")] = 0
        clear_comment()


# ──────────────────────────────────────────────────────────────────────────────
# Render
# ──────────────────────────────────────────────────────────────────────────────

def render_mobile() -> None:
    # Cargar SIEMPRE al entrar por primera vez a esta página (sin colisión con PC)
    if not st.session_state[sk("loaded")]:
        reload_pendientes()
        st.session_state[sk("loaded")] = True

    if HAS_AUTOREFRESH:
        count = st_autorefresh(interval=30000, limit=None, key="visor_mobile_autorefresh")
        if count and count > 0:
            reload_pendientes_silent()

    st.markdown(STYLE, unsafe_allow_html=True)

    pend = st.session_state[sk("pendientes")]
    idx = st.session_state[sk("idx")]
    n_pend = len(pend)

    # ── Topbar
    c1, c2, c3 = st.columns([1.2, 2.2, 1.2])
    with c1:
        st.markdown('<div id="mobile-topbar-anchor"></div>', unsafe_allow_html=True)
        if st.button("← MENÚ", key=sk("btn_menu")):
            st.switch_page("app.py")
    with c2:
        st.markdown('<div class="mobile-logo">SHELFMIND</div>', unsafe_allow_html=True)
    with c3:
        counter = f"{idx + 1}/{n_pend}" if n_pend else "—"
        st.markdown(f'<div class="mobile-count">{counter}</div>', unsafe_allow_html=True)

    # ── Toast
    if st.session_state[sk("flash")]:
        t = st.session_state[sk("flash_type")] or "green"
        msg = st.session_state[sk("flash")]
        st.markdown(f'<div class="toast {t}">{msg}</div>', unsafe_allow_html=True)
        st.session_state[sk("flash")] = None

    # ── Empty state
    if not pend:
        st.markdown(
            '<div class="empty">'
            '<div class="t">TODO AL DÍA</div>'
            '<div class="s">No hay exhibiciones pendientes.</div>'
            "</div>",
            unsafe_allow_html=True,
        )
        with st.container():
            st.markdown('<div id="mobile-bottomsheet-anchor"></div>', unsafe_allow_html=True)
            a, b = st.columns(2)
            with a:
                if st.button("↺ RECARGAR", key=sk("btn_reload_empty"), use_container_width=True):
                    reload_pendientes()
                    st.rerun()
            with b:
                if st.button("SALIR", key=sk("btn_logout_empty"), use_container_width=True):
                    for k in list(st.session_state.keys()):
                        del st.session_state[k]
                    st.rerun()
        return

    # ── Current group
    ex = pend[idx]
    fotos = ex.get("fotos", []) or []
    n_fotos = len(fotos)
    foto_idx = st.session_state[sk("foto_idx")]
    if foto_idx >= n_fotos:
        foto_idx = 0
        st.session_state[sk("foto_idx")] = 0

    # ── Server-side fetch (sz reducido)
    u = st.session_state.get("user")
    main_fid = drive_file_id(fotos[foto_idx].get("drive_link", "")) if fotos else None
    img_src = fetch_drive_b64(main_fid or "", sz=800)

    st.markdown('<div id="mobile-viewer-anchor"></div>', unsafe_allow_html=True)
    components.html(
        build_viewer_html_mobile(
            fotos=fotos,
            foto_idx=foto_idx,
            idx=idx,
            n_pend=n_pend,
            img_src=img_src,
        ),
        height=900,
        scrolling=False,
    )

    # ── Hidden nav buttons for viewer JS
    with st.container():
        st.markdown('<div id="mobile-hidden-nav"></div>', unsafe_allow_html=True)

        nav_prev, nav_next = st.columns(2)
        with nav_prev:
            if st.button("← ANTERIOR", key=sk("btn_prev"), disabled=(idx == 0)):
                goto_prev_group()
                st.rerun()
        with nav_next:
            if st.button("SIGUIENTE →", key=sk("btn_next"), disabled=(idx >= n_pend - 1)):
                goto_next_group()
                st.rerun()

        if n_fotos > 1:
            cols_f = st.columns(n_fotos)
            for i, col in enumerate(cols_f):
                with col:
                    if st.button(f"F{i+1}", key=sk(f"f_{i}")):
                        st.session_state[sk("foto_idx")] = i
                        st.rerun()

    # ── Bottom sheet
    ids_exhibicion = [f.get("id_exhibicion") for f in fotos if f.get("id_exhibicion")]
    fecha_fmt = (ex.get("fecha_hora") or "")[:16]
    supervisor = (u or {}).get("usuario_login", "supervisor")

    with st.container():
        st.markdown('<div id="mobile-bottomsheet-anchor"></div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="bs-meta">'
            '  <div class="bs-left">'
            f'    <span class="pill"><span class="k">👤</span><span class="v">{ex.get("vendedor") or "—"}</span></span>'
            f'    <span class="pill"><span class="k">🏪</span><span class="v">{ex.get("nro_cliente") or "—"}</span></span>'
            f'    <span class="pill"><span class="k">📍</span><span class="v">{ex.get("tipo_pdv") or "—"}</span></span>'
            "  </div>"
            f'  <div class="bs-date">{fecha_fmt}</div>'
            "</div>",
            unsafe_allow_html=True,
        )

        st.text_area(
            "C",
            placeholder="Comentario (opcional)…",
            key=sk("comentario"),
            height=60,
            label_visibility="collapsed",
        )

        b1, b2, b3 = st.columns(3)
        with b1:
            if st.button("✅ APROBAR", key=sk("b_ap"), use_container_width=True):
                n = evaluar(ids_exhibicion, "Aprobado", supervisor, st.session_state[sk("comentario")])
                set_flash("✅ Aprobada" if n > 0 else ("⚡ Ya evaluada" if n == 0 else "⚠️ Error"), "green" if n > 0 else ("amber" if n == 0 else "red"))
                reload_pendientes()
                st.rerun()

        with b2:
            if st.button("🔥 DESTACAR", key=sk("b_dest"), use_container_width=True):
                n = evaluar(ids_exhibicion, "Destacado", supervisor, st.session_state[sk("comentario")])
                set_flash("🔥 Destacada" if n > 0 else ("⚡ Ya evaluada" if n == 0 else "⚠️ Error"), "amber" if n >= 0 else "red")
                reload_pendientes()
                st.rerun()

        with b3:
            if st.button("❌ RECHAZAR", key=sk("b_rej"), use_container_width=True):
                n = evaluar(ids_exhibicion, "Rechazado", supervisor, st.session_state[sk("comentario")])
                set_flash("❌ Rechazada" if n > 0 else ("⚡ Ya evaluada" if n == 0 else "⚠️ Error"), "red" if n != 0 else "amber")
                reload_pendientes()
                st.rerun()


def main() -> None:
    init_state()
    render_mobile()


if __name__ == "__main__":
    main()