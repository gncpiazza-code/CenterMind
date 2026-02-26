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
import base64
import sqlite3
import urllib.request as _urllib_req
from datetime import datetime
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

# ─── Paths ────────────────────────────────────────────────────────────────────
DB_PATH        = Path(__file__).resolve().parent.parent.parent / "base_datos" / "centermind.db"
CENTERMIND_ROOT = DB_PATH.parent.parent   # CenterMind/

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

/* ── Desktop: forzar side-by-side sin wrap ──────────────
   Streamlit tiene CSS responsive interno que apila columnas
   en pantallas intermedias. Estos overrides lo anulan.   */
@media (min-width: 641px) {
    [data-testid="stHorizontalBlock"] {
        flex-wrap:     nowrap !important;
        align-items:   flex-start !important; /* habilita position:sticky */
    }
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        min-width: 0 !important; /* evita overflow implícito que causa wrap */
    }
}

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
    /* Sticky: el panel se queda visible mientras la izquierda scrollea */
    position: sticky !important;
    top: 72px !important;
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

/* ── Botones de acción (APROBAR / DESTACAR / RECHAZAR) ──────────────────────
   Desktop: apilados verticalmente (full-width del panel)
   Mobile:  fila de 3 (override en @media) */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] {
    flex-direction: column !important;
    gap: 7px !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 0 0 auto !important;
    width: 100% !important;
    min-width: 100% !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button {
    width: 100% !important;
    font-family: 'Bebas Neue', sans-serif !important;
    font-size: 16px !important;
    letter-spacing: 2px !important;
    padding: 14px 8px !important;
    min-height: 52px !important;
    height: auto !important;
    border: none !important;
    border-radius: 12px !important;
    white-space: nowrap !important;
    transition: filter .15s, transform .15s, box-shadow .15s !important;
}
/* APROBAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(1)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#2E5A28,#5EA852) !important; color:#fff !important;
}
/* DESTACAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(2)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#9A6E2A,#D9A76A) !important;
    color:#1A1311 !important; font-weight:800 !important;
}
/* RECHAZAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="stColumn"]:nth-child(3)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#6A2318,#C0584A) !important; color:#fff !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:hover {
    filter: brightness(1.18) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45) !important;
}

/* ── Acciones secundarias (RECARGAR / SALIR): ghost ─── */
div[data-testid="stVerticalBlock"]:has(#secondary-actions-anchor)
    div[data-testid="stButton"] button {
    background: transparent !important;
    border: 1px solid rgba(240,230,216,0.10) !important;
    color: rgba(240,230,216,0.30) !important;
    font-size: 10px !important;
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 1.5px !important;
    padding: 6px 10px !important;
    min-height: 32px !important;
    height: auto !important;
    border-radius: 8px !important;
    transition: all .15s !important;
}
div[data-testid="stVerticalBlock"]:has(#secondary-actions-anchor)
    div[data-testid="stButton"] button:hover {
    border-color: rgba(240,230,216,0.25) !important;
    color: rgba(240,230,216,0.60) !important;
    background: rgba(240,230,216,0.04) !important;
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

/* ══════════════════════════════════════════════════
   MÓVIL — PANEL FIJO INFERIOR
   ══════════════════════════════════════════════════ */
@media (max-width: 640px) {
    /* Ocultar stat pills en topbar (sin espacio) */
    .topbar-stat-pill { display: none; }

    /* Las dos columnas del layout se apilan */
    [data-testid="stHorizontalBlock"] { flex-wrap: wrap !important; }
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        flex: 0 0 100% !important;
        min-width: 100% !important;
        width: 100% !important;
    }

    /* Panel fijo inferior */
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
        position: fixed !important;
        bottom: 0 !important; left: 0 !important; right: 0 !important;
        top: auto !important;
        z-index: 9000 !important; margin: 0 !important;
        border-radius: 22px 22px 0 0 !important;
        padding: 4px 14px 22px !important; gap: 6px !important;
        background: rgba(14,9,7,0.97) !important;
        backdrop-filter: blur(28px) !important;
        -webkit-backdrop-filter: blur(28px) !important;
        border-top: 1px solid rgba(217,167,106,0.22) !important;
        border-left: none !important; border-right: none !important; border-bottom: none !important;
        box-shadow: 0 -12px 50px rgba(0,0,0,0.75) !important;
    }
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor)::before {
        content:'' !important; display:block !important;
        width:38px; height:4px;
        background:rgba(240,230,216,0.15); border-radius:2px;
        margin:6px auto 8px;
    }

    /* Info items en fila */
    .floating-info {
        flex-direction: row !important; flex-wrap: wrap !important;
        gap: 2px 10px !important; padding-bottom: 6px !important;
        margin-bottom: 4px !important;
    }
    .f-item { font-size: 11px !important; gap: 4px !important; }
    .f-icon { font-size: 12px !important; }
    .f-name { font-size: 12px !important; }
    .f-num  { font-size: 14px !important; }

    /* TextArea compacto */
    div[data-testid="stTextArea"] textarea {
        min-height: 36px !important; height: 36px !important; font-size: 13px !important;
    }

    /* Acciones: fila de 3 en móvil */
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        [data-testid="stHorizontalBlock"] {
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        gap: 8px !important;
    }
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        flex: 1 1 0 !important;
        min-width: 0 !important;
        width: auto !important;
    }
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        div[data-testid="stButton"] button {
        min-height: 52px !important;
        border-radius: 14px !important;
        font-size: 13px !important;
        letter-spacing: 1px !important;
        padding: 8px 2px !important;
        white-space: normal !important;
    }

    /* Acciones secundarias ocultas en móvil */
    div[data-testid="stVerticalBlock"]:has(#secondary-actions-anchor) {
        display: none !important;
    }

    /* Padding inferior para que el contenido no quede tapado */
    [data-testid="stMainBlockContainer"],
    .block-container { padding-bottom: 240px !important; }
}
</style>
"""

STYLE = BASE_CSS + VISOR_CSS

# ─── Funciones Auxiliares ──────────────────────────────────────────────────────

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def get_pendientes(distribuidor_id: int) -> List[Dict]:
    with get_conn() as c:
        rows = c.execute(
            """SELECT e.id_exhibicion,
                      e.numero_cliente_local  AS nro_cliente,
                      e.comentarios_telegram  AS tipo_pdv,
                      e.url_foto_drive        AS drive_link,
                      e.timestamp_subida      AS fecha_hora,
                      e.estado,
                      e.telegram_msg_id,
                      i.nombre_integrante     AS vendedor
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente'
               ORDER BY e.timestamp_subida ASC""",
            (distribuidor_id,),
        ).fetchall()

    grupos: Dict[str, Dict] = {}
    for r in rows:
        d   = dict(r)
        key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{d['id_exhibicion']}"
        if key not in grupos:
            grupos[key] = {
                "vendedor":    d["vendedor"],
                "nro_cliente": d["nro_cliente"],
                "tipo_pdv":    d["tipo_pdv"],
                "fecha_hora":  d["fecha_hora"],
                "fotos":       [],
            }
        grupos[key]["fotos"].append({
            "id_exhibicion": d["id_exhibicion"],
            "drive_link":    d["drive_link"],
        })
    return list(grupos.values())

def get_stats_hoy(distribuidor_id: int) -> Dict:
    hoy = datetime.now().strftime("%Y-%m-%d")
    with get_conn() as c:
        row = c.execute(
            """SELECT COUNT(*) total,
               SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END)  pendientes,
               SUM(CASE WHEN estado='Aprobado'  THEN 1 ELSE 0 END)  aprobadas,
               SUM(CASE WHEN estado='Rechazado' THEN 1 ELSE 0 END)  rechazadas,
               SUM(CASE WHEN estado='Destacado' THEN 1 ELSE 0 END)  destacadas
               FROM exhibiciones
               WHERE id_distribuidor=? AND DATE(timestamp_subida)=?""",
            (distribuidor_id, hoy),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}

def get_vendedores_pendientes(distribuidor_id: int) -> List[str]:
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT i.nombre_integrante
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor=? AND e.estado='Pendiente'
               ORDER BY i.nombre_integrante ASC""",
            (distribuidor_id,),
        ).fetchall()
    return [r["nombre_integrante"] for r in rows if r["nombre_integrante"]]

def evaluar(ids_exhibicion: List[int], estado: str, supervisor: str, comentario: str) -> int:
    """
    Race-condition safe: AND estado='Pendiente' en el WHERE
    garantiza que solo el primer evaluador escribe.
    Retorna: filas actualizadas (>0 OK | 0 ya evaluada | -1 error)
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


def _get_dist_cred_path(distribuidor_id: int) -> str:
    """Devuelve la ruta relativa del credencial Drive del distribuidor."""
    with get_conn() as c:
        row = c.execute(
            "SELECT ruta_credencial_drive FROM distribuidores WHERE id_distribuidor=?",
            (distribuidor_id,),
        ).fetchone()
    return (row[0] or "") if row else ""


@st.cache_data(ttl=600, show_spinner=False)
def fetch_drive_b64(file_id: str, cred_path_rel: str = "", sz: int = 1000) -> str:
    """
    Obtiene imagen de Drive como data URI base64 para renderizado sin auth en browser.

    Estrategia:
    1. Thumbnail URL pública (Google Drive) — con User-Agent de browser real
    2. Service Account (archivos privados del bot)
    3. Retorna "" → el viewer JS mostrará placeholder
    """
    if not file_id:
        return ""

    # 1. URL pública de thumbnail
    thumb_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w{sz}"
    result = _get_image_b64(thumb_url)
    if result:
        return result

    # 2. Service Account
    if not cred_path_rel or not HAS_GOOGLE_AUTH:
        return ""
    cred_path = CENTERMIND_ROOT / cred_path_rel
    if not cred_path.exists():
        return ""
    try:
        creds = _SACreds.from_service_account_file(
            str(cred_path),
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
        creds.refresh(_ga_tr.Request())
        api_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        result  = _get_image_b64(api_url, {"Authorization": f"Bearer {creds.token}"})
        return result
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
    """
    n_fotos   = len(fotos)
    counter   = f"{idx+1}/{n_pend}" + (f" · F{foto_idx+1}/{n_fotos}" if n_fotos > 1 else "")
    show_prev = foto_idx > 0 or idx > 0
    show_next = foto_idx < n_fotos - 1 or idx < n_pend - 1

    fid = drive_file_id(fotos[foto_idx]["drive_link"]) or ""

    # Fallback si no llegó img_src
    if not img_src and fid:
        img_src = f"https://drive.google.com/thumbnail?id={fid}&sz=w1000"

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
html,body{{background:transparent;overflow:hidden;height:100%;font-family:sans-serif}}
#vw{{position:relative;width:100%;height:calc(100% - {65 if n_fotos > 1 else 0}px);
     background:#0a0705;display:flex;align-items:center;justify-content:center;overflow:hidden}}
#mi{{width:100%;height:100%;object-fit:contain;display:block;
     touch-action:pinch-zoom;user-select:none;-webkit-user-drag:none;pointer-events:none;
     transition:opacity .2s}}
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
  <div class="chev L{' h' if not show_prev else ''}" id="bp"><span>&#8249;</span></div>
  <img id="mi" src="{img_src}" alt="exhibición" draggable="false" loading="eager">
  <div class="chev R{' h' if not show_next else ''}" id="bn"><span>&#8250;</span></div>
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

    # ── Layout 70 / 30 ───────────────────────────────────────────────────────
    left_col, right_col = st.columns([7, 3], gap="medium")

    # ══════════════════════════════════════════════════════════════════════════
    # COLUMNA IZQUIERDA — VISOR DE FOTOS + NAVEGACIÓN
    # ══════════════════════════════════════════════════════════════════════════
    with left_col:
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

            # ── Fetch imagen server-side ─────────────────────────────────────
            cred_path = _get_dist_cred_path(u["id_distribuidor"])
            main_fid  = drive_file_id(fotos[foto_idx]["drive_link"]) or ""
            img_src   = fetch_drive_b64(main_fid, cred_path, sz=1000)

            thumb_srcs: List[str] = []
            if n_fotos > 1:
                for f in fotos:
                    tid = drive_file_id(f["drive_link"]) or ""
                    thumb_srcs.append(fetch_drive_b64(tid, cred_path, sz=150))

            # ── Viewer ───────────────────────────────────────────────────────
            viewer_height = 480 + (65 if n_fotos > 1 else 0)
            components.html(
                build_viewer_html(
                    fotos, foto_idx, idx, n_pend,
                    img_src=img_src, thumb_srcs=thumb_srcs,
                ),
                height=viewer_height,
                scrolling=False,
            )

            # ── Navegación ANTERIOR / SIGUIENTE ──────────────────────────────
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

            # Botones F1…Fn: solo en DOM para JS del viewer
            if n_fotos > 1:
                st.markdown('<div id="foto-nav-hidden"></div>', unsafe_allow_html=True)
                cols_f = st.columns(n_fotos)
                for i, col in enumerate(cols_f):
                    with col:
                        if st.button(f"F{i+1}", key=f"tmb_{i}"):
                            st.session_state.foto_idx = i; st.rerun()

    # ══════════════════════════════════════════════════════════════════════════
    # COLUMNA DERECHA — PANEL DE EVALUACIÓN (sticky en desktop)
    # ══════════════════════════════════════════════════════════════════════════
    with right_col:
        if pend_filtrada:
            ex             = pend_filtrada[idx]
            ids_exhibicion = [f["id_exhibicion"] for f in ex.get("fotos", [])]
            fecha_fmt      = ex.get("fecha_hora", "")[:16]
            supervisor     = u.get("usuario_login", "supervisor")

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

                comentario = st.text_area(
                    "C", placeholder="Comentario opcional...",
                    key="comentario_field", label_visibility="collapsed",
                )

                # Botones acción (3 col → CSS los apila en desktop / fila en móvil)
                cb1, cb2, cb3 = st.columns(3)
                with cb1:
                    if st.button("✅ APROBAR", key="b_ap", use_container_width=True):
                        n = evaluar(ids_exhibicion, "Aprobado", supervisor, comentario)
                        if n > 0:    set_flash("✅ Aprobada", "green")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()
                with cb2:
                    if st.button("🔥 DESTACAR", key="b_dest", use_container_width=True):
                        n = evaluar(ids_exhibicion, "Destacado", supervisor, comentario)
                        if n > 0:    set_flash("🔥 Destacada", "amber")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()
                with cb3:
                    if st.button("❌ RECHAZAR", key="b_rej", use_container_width=True):
                        n = evaluar(ids_exhibicion, "Rechazado", supervisor, comentario)
                        if n > 0:    set_flash("❌ Rechazada", "red")
                        elif n == 0: set_flash("⚡ Ya evaluada", "amber")
                        reload_pendientes(); st.rerun()

            # Acciones secundarias (ghost, bajo el panel)
            st.markdown(
                "<div style='height:12px'></div>"
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
