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
from typing import Dict, List, Optional

import streamlit as st
import streamlit.components.v1 as components

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
DB_PATH = Path(__file__).resolve().parent.parent.parent / "base_datos" / "centermind.db"

# ─── CSS ──────────────────────────────────────────────────────────────────────
VISOR_CSS = """
<style>
/* ── Stats grid ──────────────────────────────────── */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
}
.stat-box {
    background: rgba(217,167,106,0.04);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 14px 8px;
    text-align: center;
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
    margin: 4px 0 12px !important;
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
   PANEL DE EVALUACIÓN
   ══════════════════════════════════════════════════ */
div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 16px !important;
    gap: 10px !important;
}

.floating-info {
    display: flex; flex-direction: column; gap: 6px;
    margin-bottom: 8px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.f-item {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.f-icon { font-size: 15px; color: var(--accent-amber); flex-shrink: 0; }

/* Botones acción: apilados en desktop → sin corte de texto */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button {
    width: 100% !important;
    font-size: 12px !important;
    letter-spacing: 1px !important;
    padding: 10px 6px !important;
    min-height: 42px !important;
    height: auto !important;
    border: none !important;
    border-radius: 10px !important;
    white-space: nowrap !important;
}
/* APROBAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(1)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#3A6B33,#7DAF6B) !important; color:#fff !important;
}
/* DESTACAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(2)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#B8853E,#D9A76A) !important;
    color:#1A1311 !important; font-weight:800 !important;
}
/* RECHAZAR */
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    [data-testid="column"]:nth-child(3)
    div[data-testid="stButton"] button {
    background: linear-gradient(135deg,#7A2D1E,#C0584A) !important; color:#fff !important;
}
[data-testid="stVerticalBlock"]:has(#eval-master-anchor)
    div[data-testid="stButton"] button:hover {
    filter: brightness(1.15) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 16px rgba(0,0,0,0.40) !important;
}

/* ── Botones F1/F2 (navegación fotos interna): ocultos visualmente ── */
/* El JS del viewer los necesita en el DOM pero no deben verse */
div[data-testid="stVerticalBlock"]:has(#foto-nav-hidden) {
    height: 0 !important; overflow: hidden !important;
    opacity: 0 !important; pointer-events: none !important;
    margin: 0 !important; padding: 0 !important;
}

/* ── Stats móvil: 2 cols ─────────────────────────── */
@media (max-width: 640px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
}

/* ══════════════════════════════════════════════════
   MÓVIL — PANEL FIJO INFERIOR
   ══════════════════════════════════════════════════ */
@media (max-width: 640px) {
    /* Las dos columnas del layout se apilan */
    [data-testid="stHorizontalBlock"] { flex-wrap: wrap !important; }
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        flex: 0 0 100% !important;
        min-width: 100% !important;
        width: 100% !important;
    }

    /* Panel fijo en la parte inferior */
    div[data-testid="stVerticalBlock"]:has(#eval-master-anchor) {
        position: fixed !important;
        bottom: 0 !important; left: 0 !important; right: 0 !important;
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

    /* TextArea compacto */
    div[data-testid="stTextArea"] textarea {
        min-height: 36px !important; height: 36px !important; font-size: 13px !important;
    }

    /* Botones: 3 cols horizontales 33% c/u */
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        [data-testid="stHorizontalBlock"] { flex-wrap: nowrap !important; gap: 8px !important; }
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        flex: 1 1 0 !important; min-width: 0 !important;
    }
    [data-testid="stVerticalBlock"]:has(#eval-master-anchor)
        div[data-testid="stButton"] button {
        min-height: 52px !important;
        border-radius: 14px !important;
        font-size: 12px !important;
        letter-spacing: 0.8px !important;
        padding: 8px 2px !important;
        white-space: normal !important;
    }

    /* Padding inferior para que el contenido no quede tapado */
    [data-testid="stMainBlockContainer"],
    .block-container { padding-bottom: 230px !important; }
}
</style>
"""

STYLE = BASE_CSS + VISOR_CSS

# ─── Funciones Auxiliares ──────────────────────────────────────────────────────

def render_stats_box(num: str, label: str, color_class: str) -> str:
    return (
        f'<div class="stat-box">'
        f'<div class="stat-num {color_class}">{num}</div>'
        f'<div class="stat-lbl">{label}</div>'
        f'</div>'
    )

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

# ─── Custom image viewer component ────────────────────────────────────────────

def build_viewer_html(fotos: List[Dict], foto_idx: int, idx: int, n_pend: int) -> str:
    """
    Genera el HTML completo del visualizador.
    Renderizado via st.components.v1.html() (mismo origen que Streamlit).
    - Usa <img> con thumbnail URL → funciona en móvil (no más iframe de Drive)
    - Flechas superpuestas izquierda / derecha
    - Swipe táctil con JS
    - Puntos indicadores para ráfaga
    - Miniaturas clickeables
    - El JS propaga clicks a los botones Streamlit del DOM padre
    """
    n_fotos  = len(fotos)
    foto     = fotos[foto_idx]
    fid      = drive_file_id(foto["drive_link"]) or ""
    img_src  = f"https://drive.google.com/thumbnail?id={fid}&sz=w1200" if fid else foto["drive_link"]
    img_fb   = f"https://drive.google.com/uc?export=view&id={fid}" if fid else ""

    counter  = f"{idx+1}/{n_pend}" + (f" · F{foto_idx+1}/{n_fotos}" if n_fotos > 1 else "")
    show_prev = foto_idx > 0 or idx > 0
    show_next = foto_idx < n_fotos - 1 or idx < n_pend - 1

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
            tid  = drive_file_id(f["drive_link"]) or ""
            tsrc = f"https://drive.google.com/thumbnail?id={tid}&sz=w200" if tid else ""
            thumbs += (
                f'<div class="th{"a" if i == foto_idx else ""}" data-i="{i}">'
                f'<img src="{tsrc}" onerror="this.style.opacity=.3" loading="lazy"></div>'
            )

    return f"""<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:transparent;overflow:hidden;height:100%;font-family:sans-serif}}
#vw{{position:relative;width:100%;height:100%;background:#0a0705;
     display:flex;align-items:center;justify-content:center;overflow:hidden}}
#mi{{width:100%;height:100%;object-fit:contain;display:block;
     touch-action:pinch-zoom;user-select:none;-webkit-user-drag:none;pointer-events:none}}
.ctr{{position:absolute;top:10px;left:12px;z-index:20;background:rgba(0,0,0,.65);
      color:#F0E6D8;font:10px/1 monospace;letter-spacing:1px;
      padding:3px 10px;border-radius:20px;backdrop-filter:blur(4px)}}
.raf{{position:absolute;top:10px;right:12px;z-index:20;background:rgba(18,12,10,.85);
      color:#D9A76A;border:1px solid rgba(217,167,106,.3);border-radius:20px;
      padding:3px 10px;font:600 10px sans-serif;letter-spacing:.5px;
      text-transform:uppercase;backdrop-filter:blur(4px)}}
.chev{{position:absolute;top:0;bottom:0;width:16%;z-index:15;
       display:flex;align-items:center;justify-content:center;
       cursor:pointer;transition:background .15s;-webkit-tap-highlight-color:transparent}}
.chev.L{{left:0;background:linear-gradient(90deg,rgba(0,0,0,.45),transparent)}}
.chev.R{{right:0;background:linear-gradient(270deg,rgba(0,0,0,.45),transparent)}}
.chev.h{{display:none}}
.chev span{{font-size:46px;color:rgba(255,255,255,.75);line-height:1;
            text-shadow:0 2px 8px rgba(0,0,0,.9);transition:transform .1s}}
.chev:hover span{{transform:scale(1.1)}}
.chev:active span{{transform:scale(.9)}}
.dots{{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
       display:flex;gap:6px;align-items:center;z-index:20}}
.d{{width:6px;height:6px;border-radius:50%;background:rgba(240,230,216,.3);transition:all .2s}}
.da{{width:10px;height:10px;background:rgba(217,167,106,.9)}}
#thumbs{{display:flex;gap:5px;padding:6px 4px;background:#0a0705;
         overflow-x:auto;scrollbar-width:thin;
         scrollbar-color:rgba(217,167,106,.3) transparent}}
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
  <img id="mi" src="{img_src}" alt="exhibición"
       onerror="this.onerror=null;this.src='{img_fb}';"
       draggable="false" loading="eager">
  <div class="chev R{' h' if not show_next else ''}" id="bn"><span>&#8250;</span></div>
  {dots}
</div>
{'<div id="thumbs">' + thumbs + '</div>' if n_fotos > 1 else ''}

<script>
(function(){{
  const isFoto = {str(n_fotos > 1).lower()};
  const fi     = {foto_idx};
  const nf     = {n_fotos};

  function stClick(txt){{
    const pd = window.parent.document;
    const b  = Array.from(pd.querySelectorAll('button'))
                    .find(b=>!b.disabled && b.innerText && b.innerText.includes(txt));
    if(b) b.click();
  }}
  function clickFoto(i){{
    const pd = window.parent.document;
    const b  = Array.from(pd.querySelectorAll('button'))
                    .find(b=>b.innerText && b.innerText.trim()==='F'+(i+1));
    if(b) b.click();
  }}
  function goPrev(){{ if(isFoto&&fi>0){{clickFoto(fi-1)}}else{{stClick('ANTERIOR')}} }}
  function goNext(){{ if(isFoto&&fi<nf-1){{clickFoto(fi+1)}}else{{stClick('SIGUIENTE')}} }}

  document.getElementById('bp').addEventListener('click',goPrev);
  document.getElementById('bn').addEventListener('click',goNext);

  /* Swipe táctil */
  let sx=0,sy=0,st=0;
  const vw=document.getElementById('vw');
  vw.addEventListener('touchstart',e=>{{sx=e.touches[0].clientX;sy=e.touches[0].clientY;st=Date.now();}},{{passive:true}});
  vw.addEventListener('touchend',e=>{{
    const dx=e.changedTouches[0].clientX-sx;
    const dy=e.changedTouches[0].clientY-sy;
    if(Date.now()-st>600||Math.abs(dx)<40||Math.abs(dy)>Math.abs(dx)*.8)return;
    if(dx<0)goNext();else goPrev();
  }},{{passive:true}});

  /* Miniaturas */
  document.querySelectorAll('.th,.tha').forEach(el=>{{
    el.addEventListener('click',()=>clickFoto(parseInt(el.dataset.i)));
  }});
}})();
</script>
</body></html>"""

# ─── State helpers ────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "logged_in":      False,
        "user":           None,
        "pendientes":     [],
        "idx":            0,
        "foto_idx":       0,
        "flash":          None,
        "flash_type":     "green",
        "filtro_vendedor": "Todos",
        "_visor_loaded":  False,
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
    # Carga inicial: UNA SOLA VEZ por sesión
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

    # ── Topbar ────────────────────────────────────────────────────────────────
    st.markdown(
        '<div class="topbar">'
        '<div style="display:flex;align-items:center;gap:16px;">'
        '<span class="topbar-logo">SHELFMIND</span>'
        f'<span class="topbar-meta">{dist}</span>'
        '</div>'
        '<div style="display:flex;align-items:center;gap:12px;">'
        f'<span class="topbar-meta" style="color:var(--accent-amber);font-weight:bold;">'
        f'{n_pend} Pendientes</span>'
        '</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    pend    = st.session_state.pendientes
    vends   = get_vendedores_pendientes(u["id_distribuidor"])
    opciones = ["Todos"] + vends
    filtro_actual = st.session_state.filtro_vendedor
    if filtro_actual not in opciones:
        opciones.append(filtro_actual)

    # ── Filtro vendedor ───────────────────────────────────────────────────────
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

    filtro        = st.session_state.filtro_vendedor
    pend_filtrada = [p for p in pend if p.get("vendedor") == filtro] if filtro != "Todos" else pend

    idx = st.session_state.idx
    if pend_filtrada and idx >= len(pend_filtrada):
        st.session_state.idx = len(pend_filtrada) - 1
        idx = st.session_state.idx

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

    # ── Layout ────────────────────────────────────────────────────────────────
    left_col, right_col = st.columns([2.6, 1], gap="medium")

    # ══════════════════════════════════════════════════════════════════════════
    # COLUMNA IZQUIERDA — FOTO + STATS
    # ══════════════════════════════════════════════════════════════════════════
    with left_col:
        if not pend_filtrada:
            st.markdown(
                '<div class="empty-state">'
                '<div class="empty-icon">🎯</div>'
                '<div class="empty-title">TODO AL DÍA</div>'
                '<div style="color:var(--text-muted);font-size:14px;">'
                'No hay exhibiciones pendientes.</div>'
                '</div>',
                unsafe_allow_html=True,
            )
            st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)
            _, c2, _ = st.columns([1, 2, 1])
            with c2:
                if st.button("↺ BUSCAR NUEVAS", key="btn_reload_empty", use_container_width=True):
                    reload_pendientes(); st.rerun()
                st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
                if st.button("SALIR", key="btn_logout_empty", type="secondary", use_container_width=True):
                    for k in list(st.session_state.keys()): del st.session_state[k]
                    st.rerun()
        else:
            ex      = pend_filtrada[idx]
            fotos   = ex.get("fotos", [])
            n_fotos = len(fotos)
            foto_idx = st.session_state.foto_idx
            if foto_idx >= n_fotos:
                foto_idx = 0; st.session_state.foto_idx = 0

            # ── Viewer personalizado ──────────────────────────────────────────
            # Altura: imagen (~380px) + strip de miniaturas si hay ráfaga (+65px)
            viewer_height = 380 + (65 if n_fotos > 1 else 0)
            components.html(
                build_viewer_html(fotos, foto_idx, idx, len(pend_filtrada)),
                height=viewer_height,
                scrolling=False,
            )

            # ── Navegación ANTERIOR / SIGUIENTE ──────────────────────────────
            # Existen en el DOM para que el JS del viewer pueda clickearlos.
            st.markdown("<div style='height:4px'></div>", unsafe_allow_html=True)
            c_prev, c_txt, c_next = st.columns([1, 2, 1])
            with c_prev:
                if st.button("← ANTERIOR", key="btn_prev", disabled=(idx == 0)):
                    st.session_state.idx -= 1
                    st.session_state.foto_idx = 0
                    st.rerun()
            with c_txt:
                st.markdown(
                    f'<div style="text-align:center;font-size:11px;color:var(--text-muted);'
                    f'padding-top:14px;font-family:monospace;">'
                    f'EXHIBICIÓN {idx+1} / {len(pend_filtrada)}</div>',
                    unsafe_allow_html=True,
                )
            with c_next:
                if st.button("SIGUIENTE →", key="btn_next",
                             disabled=(idx >= len(pend_filtrada) - 1)):
                    st.session_state.idx += 1
                    st.session_state.foto_idx = 0
                    st.rerun()

            # Botones F1…Fn: solo existen en el DOM para que el JS del viewer
            # los encuentre. CSS los oculta vía #foto-nav-hidden anchor.
            if n_fotos > 1:
                st.markdown('<div id="foto-nav-hidden"></div>', unsafe_allow_html=True)
                cols_f = st.columns(n_fotos)
                for i, col in enumerate(cols_f):
                    with col:
                        if st.button(f"F{i+1}", key=f"tmb_{i}"):
                            st.session_state.foto_idx = i; st.rerun()

            # ── Stats del día ─────────────────────────────────────────────────
            st.markdown("<div style='height:18px'></div>", unsafe_allow_html=True)
            stats = get_stats_hoy(u["id_distribuidor"])
            st.markdown(
                '<div class="card"><div class="card-title">Estadísticas de Hoy</div>'
                '<div class="stats-grid">'
                + render_stats_box(str(stats.get("pendientes", 0)), "Pendientes", "stat-amber")
                + render_stats_box(str(stats.get("aprobadas",  0)), "Aprobadas",  "stat-green")
                + render_stats_box(str(stats.get("destacadas", 0)), "Destacadas", "stat-amber")
                + render_stats_box(str(stats.get("rechazadas", 0)), "Rechazadas", "stat-red")
                + "</div></div>",
                unsafe_allow_html=True,
            )

    # ══════════════════════════════════════════════════════════════════════════
    # COLUMNA DERECHA — PANEL DE EVALUACIÓN
    # ══════════════════════════════════════════════════════════════════════════
    with right_col:
        if pend_filtrada:
            ex             = pend_filtrada[idx]
            ids_exhibicion = [f["id_exhibicion"] for f in ex.get("fotos", [])]
            fecha_fmt      = ex.get("fecha_hora", "")[:16]
            supervisor     = u.get("usuario_login", "supervisor")

            with st.container():
                st.markdown('<div id="eval-master-anchor"></div>', unsafe_allow_html=True)

                # Info del vendedor/cliente
                st.markdown(
                    '<div class="floating-info">'
                    f'<div class="f-item"><span class="f-icon">👤</span>'
                    f' {ex.get("vendedor","—")}</div>'
                    f'<div class="f-item"><span class="f-icon">🏪</span>'
                    f' C: {ex.get("nro_cliente","—")}</div>'
                    f'<div class="f-item"><span class="f-icon">📍</span>'
                    f' {ex.get("tipo_pdv","—")}</div>'
                    f'<div class="f-item"><span class="f-icon">🕐</span>'
                    f'<span style="color:var(--text-muted)">{fecha_fmt}</span></div>'
                    '</div>',
                    unsafe_allow_html=True,
                )

                comentario = st.text_area(
                    "C", placeholder="Comentario opcional...",
                    key="comentario_field", label_visibility="collapsed",
                )

                # Botones: 3 columnas en móvil (CSS) / col única en desktop
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

            # Recargar / Salir: peso visual mínimo, fuera del panel
            st.markdown(
                "<div style='height:18px'></div>"
                "<div style='opacity:0.35;'>",
                unsafe_allow_html=True,
            )
            if st.button("↺ RECARGAR", key="btn_reload_full", use_container_width=True):
                reload_pendientes(); st.rerun()
            if st.button("SALIR", key="btn_logout_full", type="secondary", use_container_width=True):
                for k in list(st.session_state.keys()): del st.session_state[k]
                st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)


def main():
    init_state()
    if not st.session_state.logged_in:
        st.switch_page("app.py")
    else:
        render_visor()

if __name__ == "__main__":
    main()
