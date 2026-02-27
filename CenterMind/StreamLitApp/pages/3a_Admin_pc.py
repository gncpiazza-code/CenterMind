# -*- coding: utf-8 -*-
"""
ShelfMind — Panel Admin
========================
Acceso:
  - superadmin: todo (usuarios del portal + Telegram)
  - admin: solo gestión de roles de Telegram (su propia distribuidora)
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

import streamlit as st

# ─── Guard de sesión ──────────────────────────────────────────────────────────
if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

ROL_PORTAL = (st.session_state.user.get("rol") or "").lower()
IS_SUPER   = ROL_PORTAL == "superadmin"
IS_ADMIN   = ROL_PORTAL == "admin"

if ROL_PORTAL not in ("superadmin", "admin"):
    st.switch_page("app.py")

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="ShelfMind · Admin",
    page_icon="⚙️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Inyectar fondo oscuro inmediatamente para evitar el flash blanco
st.markdown(
    "<style>html,body,[data-testid='stAppViewContainer'],"
    "[data-testid='stMain']{background:#140E0C!important}"
    "section[data-testid='stSidebar']{display:none!important}</style>",
    unsafe_allow_html=True,
)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = BASE_DIR.parent.parent / "base_datos" / "centermind.db"

# ─── CSS ──────────────────────────────────────────────────────────────────────
STYLE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

/* ── CSS Variables — Paleta Tobacco/Amber ShelfMind ─────────────────────── */
:root {
    --bg-darkest:   #140E0C;
    --bg-card:      rgba(42, 30, 24, 0.5);
    --accent-amber: #D9A76A;
    --accent-sand:  #D9BD9C;
    
    --role-superadmin: #FFD700;
    --role-admin:      #D9BD9C;
    --role-evaluador:  #7DAF6B;
    --role-vendedor:   #CBD5E1;
    --role-observador: #94A3B8;

    --text-primary:    #F0E6D8;
    --text-muted:      rgba(240, 230, 216, 0.5);
    --text-dim:        rgba(240, 230, 216, 0.3);
    --border-soft:     rgba(217, 167, 106, 0.15);
    --border-light:    rgba(255, 255, 255, 0.04);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
    background: var(--bg-darkest) !important;
    color: var(--text-primary) !important;
    font-family: 'DM Sans', sans-serif !important;
}
[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"] { display: none !important; }
[data-testid="stMainBlockContainer"]{ padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { display: none !important; }

[data-testid="stAppViewContainer"]::before {
    content: ''; position: fixed; inset: 0; z-index: 0;
    background:
        radial-gradient(ellipse 80% 50% at 10% 20%, rgba(217,167,106,0.04) 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.008) 40px);
    pointer-events: none;
}

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 32px;
    background: rgba(20, 14, 12, 0.95);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 100;
    margin-bottom: 24px;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px; letter-spacing: 3px;
    background: linear-gradient(90deg, #8C5A1F 0%, #D9A76A 20%, #FFE8B0 50%, #D9A76A 80%, #8C5A1F 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    filter: drop-shadow(0 0 4px rgba(217,167,106,0.25));
    animation: sm-logo-shimmer 5s ease-in-out infinite, sm-logo-glow 5s ease-in-out infinite;
}
@keyframes sm-logo-shimmer {
    0%   { background-position: 150% 0; }
    50%  { background-position: -50% 0; }
    100% { background-position: 150% 0; }
}
@keyframes sm-logo-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(217,167,106,0.20)); }
    45%      { filter: drop-shadow(0 0 14px rgba(255,215,120,0.80)) drop-shadow(0 0 32px rgba(217,167,106,0.45)); }
    65%      { filter: drop-shadow(0 0 18px rgba(255,225,140,0.95)) drop-shadow(0 0 42px rgba(217,167,106,0.55)); }
}
.topbar-meta { font-size: 12px; color: rgba(240, 230, 216, 0.4); letter-spacing: 1px; }
.superadmin-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; border-radius: 999px;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    background: rgba(255, 215, 0, 0.12);
    border: 1px solid rgba(255, 215, 0, 0.3);
    color: var(--role-superadmin);
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.15);
}

/* ── Tabs ─────────────────────────────────────────────────── */
div[data-testid="stTabs"] [role="tablist"] {
    background: rgba(42, 30, 24, 0.4) !important;
    border-radius: 12px !important; padding: 4px !important;
    border: 1px solid var(--border-soft) !important; gap: 4px !important;
}
div[data-testid="stTabs"] [role="tab"] {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 15px !important;
    color: var(--text-dim) !important; border-radius: 8px !important;
    padding: 8px 20px !important; border: none !important;
    transition: all 0.2s ease !important;
}
div[data-testid="stTabs"] [role="tab"][aria-selected="true"] {
    background: rgba(217, 167, 106, 0.15) !important;
    color: var(--accent-amber) !important;
    border: 1px solid var(--border-soft) !important;
}

/* ── Cards & Formularios ──────────────────────────────────── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    backdrop-filter: blur(12px);
    padding: 20px 22px; margin-bottom: 16px;
}
.card-title {
    font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--accent-amber); margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px; font-weight: 600;
}
.card-title::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }

[data-testid="stForm"] {
    background: rgba(20, 14, 12, 0.8) !important;
    border: 1px solid var(--border-soft) !important;
    border-radius: 16px !important;
    padding: 24px !important;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important;
}

/* ── Role badges ──────────────────────────────────────────── */
.role-badge {
    display: inline-flex; align-items: center;
    padding: 4px 12px; border-radius: 20px;
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700;
}
.role-superadmin { background: rgba(255, 215, 0, 0.15); color: var(--role-superadmin); border: 1px solid rgba(255, 215, 0, 0.35); }
.role-admin { background: rgba(217, 189, 156, 0.12); color: var(--role-admin); border: 1px solid rgba(217, 189, 156, 0.25); }
.role-evaluador { background: rgba(125, 175, 107, 0.12); color: var(--role-evaluador); border: 1px solid rgba(125, 175, 107, 0.25); }
.role-vendedor { background: rgba(203, 213, 225, 0.08); color: var(--role-vendedor); border: 1px solid rgba(203, 213, 225, 0.2); }
.role-observador { background: rgba(148, 163, 184, 0.08); color: var(--role-observador); border: 1px solid rgba(148, 163, 184, 0.2); }

/* ── Inputs y Botones Generales ───────────────────────────── */
div[data-testid="stTextInput"] input, div[data-testid="stSelectbox"] > div > div {
    background: rgba(20, 15, 12, 0.8) !important;
    border: 1px solid rgba(217, 167, 106, 0.2) !important;
    border-radius: 10px !important; color: var(--text-primary) !important;
}
div[data-testid="stTextInput"] input:focus, div[data-testid="stSelectbox"] > div > div:focus-within {
    border-color: var(--accent-amber) !important;
    box-shadow: 0 0 0 3px rgba(217, 167, 106, 0.1) !important;
}

div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 14px !important;
    border-radius: 8px !important; height: 40px !important;
    background: rgba(217, 167, 106, 0.1) !important;
    border: 1px solid rgba(217, 167, 106, 0.25) !important;
    color: var(--accent-amber) !important;
    transition: all 0.2s ease !important;
}
div[data-testid="stButton"] button:hover {
    background: rgba(217, 167, 106, 0.2) !important;
    border-color: var(--accent-amber) !important;
    transform: translateY(-2px) !important;
}
div[data-testid="stAlert"] {
    background: rgba(220, 38, 38, 0.1) !important;
    border: 1px solid rgba(220, 38, 38, 0.3) !important;
    border-radius: 10px !important; color: #f87171 !important;
}
div[data-testid="stSuccess"] {
    background: rgba(22, 163, 74, 0.1) !important;
    border: 1px solid rgba(22, 163, 74, 0.3) !important;
    border-radius: 10px !important; color: #86EFAC !important;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(217, 167, 106, 0.15); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(217, 167, 106, 0.3); }

/* ── ESTILOS DEL LISTADO (TABLA EN DESKTOP, CARDS EN MÓVIL) ── */
.grid-header {
    display: grid; gap: 16px; padding: 0 16px 12px 16px;
    border-bottom: 1px solid var(--border-soft); margin-bottom: 8px;
    color: rgba(226,232,240,0.35); font-size: 10px; letter-spacing: 2px;
    text-transform: uppercase; font-weight: 600;
}
.row-divider { height: 1px; background: var(--border-light); margin: 6px 0; }
.cell-primary { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.cell-secondary { font-size: 13px; color: var(--text-muted); }
.cell-mono { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--accent-sand); }

/* Efecto hover en desktop para toda la fila */
div[data-testid="stHorizontalBlock"]:has(.admin-row) {
    align-items: center; padding: 4px 8px; border-radius: 8px;
    transition: background 0.2s;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row):hover {
    background: rgba(217, 167, 106, 0.05);
}

/* Botón Peligro (El 5to botón en Usuarios) */
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button {
    background: rgba(220, 38, 38, 0.1) !important;
    border: 1px solid rgba(220, 38, 38, 0.25) !important;
    color: #DC2626 !important;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button:hover {
    background: rgba(220, 38, 38, 0.25) !important; border-color: #DC2626 !important;
}
div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) div[data-testid="stButton"] button:disabled {
    opacity: 0.3 !important; cursor: not-allowed !important; transform: none !important;
}

/* ── RESPONSIVE MÓVIL (CARD STACKING) ─────────────────────── */
@media (max-width: 768px) {
    .grid-header, .row-divider { display: none; }
    
    div[data-testid="stButton"] button { height: 44px !important; }

    /* Transformar la fila en una tarjeta */
    div[data-testid="stHorizontalBlock"]:has(.admin-row) {
        display: grid !important;
        background: var(--bg-card) !important;
        border: 1px solid var(--border-soft) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        margin-bottom: 12px !important;
        gap: 8px !important;
        align-items: center !important;
    }
    div[data-testid="column"] { width: 100% !important; min-width: 100% !important; }

    /* Template Areas - Usuarios */
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) {
        grid-template-columns: 1fr auto !important;
        grid-template-areas:
            "name role"
            "dist dist"
            "btn1 btn2" !important;
    }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(1) { grid-area: name; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(2) { grid-area: dist; margin-bottom: 8px !important;}
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(3) { grid-area: role; text-align: right; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(4) { grid-area: btn1; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-user) > div:nth-child(5) { grid-area: btn2; }

    /* Template Areas - Integrantes */
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) {
        grid-template-columns: 1fr auto !important;
        grid-template-areas:
            "name role"
            "dist dist"
            "group group"
            "tgid tgid"
            "btn btn" !important;
    }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(1) { grid-area: name; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(2) { grid-area: dist; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(3) { grid-area: group; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(4) { grid-area: tgid; margin-bottom: 8px !important;}
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(5) { grid-area: role; text-align: right; }
    div[data-testid="stHorizontalBlock"]:has(.admin-row-int) > div:nth-child(6) { grid-area: btn; }

    /* Textos inyectados para móvil */
    .mobile-lbl-dist::before { content: "Distribuidora: "; font-weight: bold; color: var(--text-dim); }
    .mobile-lbl-grp::before { content: "Grupo: "; font-weight: bold; color: var(--text-dim); }
    .cell-primary { font-size: 16px; }
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


def get_distribuidoras(solo_activas: bool = True) -> List[Dict]:
    with get_conn() as c:
        if solo_activas:
            rows = c.execute(
                """SELECT id_distribuidor AS id, nombre_empresa AS nombre, estado
                   FROM distribuidores WHERE estado = 'activo'
                   ORDER BY nombre_empresa"""
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT id_distribuidor AS id, nombre_empresa AS nombre,
                          token_bot, ruta_credencial_drive, id_carpeta_drive, estado
                   FROM distribuidores ORDER BY nombre_empresa"""
            ).fetchall()
    return [dict(r) for r in rows]

def crear_distribuidora(nombre: str, token: str, carpeta_drive: str, ruta_cred: str) -> tuple[bool, str]:
    try:
        with get_conn() as c:
            c.execute(
                """INSERT INTO distribuidores
                   (nombre_empresa, token_bot, id_carpeta_drive, ruta_credencial_drive, estado)
                   VALUES (?,?,?,?,'activo')""",
                (nombre.strip(), token.strip(), carpeta_drive.strip(), ruta_cred.strip()),
            )
            c.commit()
        return True, ""
    except sqlite3.IntegrityError as e:
        msg = str(e)
        if "nombre_empresa" in msg:
            return False, "Ya existe una distribuidora con ese nombre."
        if "token_bot" in msg:
            return False, "Ese token de bot ya está registrado."
        return False, f"Error de integridad: {msg}"
    except Exception as e:
        return False, str(e)

def editar_distribuidora(dist_id: int, nombre: str, token: str, carpeta_drive: str, ruta_cred: str) -> tuple[bool, str]:
    try:
        with get_conn() as c:
            c.execute(
                """UPDATE distribuidores
                   SET nombre_empresa=?, token_bot=?, id_carpeta_drive=?, ruta_credencial_drive=?
                   WHERE id_distribuidor=?""",
                (nombre.strip(), token.strip(), carpeta_drive.strip(), ruta_cred.strip(), dist_id),
            )
            c.commit()
        return True, ""
    except sqlite3.IntegrityError as e:
        msg = str(e)
        if "nombre_empresa" in msg:
            return False, "Ya existe una distribuidora con ese nombre."
        if "token_bot" in msg:
            return False, "Ese token de bot ya está registrado."
        return False, f"Error de integridad: {msg}"
    except Exception as e:
        return False, str(e)

def toggle_distribuidora_estado(dist_id: int, nuevo_estado: str) -> bool:
    try:
        with get_conn() as c:
            c.execute(
                "UPDATE distribuidores SET estado=? WHERE id_distribuidor=?",
                (nuevo_estado, dist_id),
            )
            c.commit()
        return True
    except Exception:
        return False

# ── Usuarios del portal ────────────────────────────────────────────────────────

def get_usuarios(distribuidor_id: Optional[int] = None) -> List[Dict]:
    with get_conn() as c:
        if distribuidor_id:
            rows = c.execute(
                """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                          d.nombre_empresa
                   FROM usuarios_portal u
                   JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
                   WHERE u.id_distribuidor = ?
                   ORDER BY u.rol, u.usuario_login""",
                (distribuidor_id,)
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                          d.nombre_empresa
                   FROM usuarios_portal u
                   JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
                   ORDER BY d.nombre_empresa, u.rol, u.usuario_login"""
            ).fetchall()
    return [dict(r) for r in rows]

def crear_usuario(dist_id: int, login: str, password: str, rol: str) -> bool:
    try:
        with get_conn() as c:
            c.execute(
                "INSERT INTO usuarios_portal (id_distribuidor, usuario_login, password, rol) VALUES (?,?,?,?)",
                (dist_id, login.strip(), password.strip(), rol)
            )
            c.commit()
        return True
    except sqlite3.IntegrityError:
        return False

def editar_usuario(user_id: int, login: str, rol: str, password: Optional[str] = None) -> bool:
    try:
        with get_conn() as c:
            if password:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=?, password=? WHERE id_usuario=?",
                    (login.strip(), rol, password.strip(), user_id)
                )
            else:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=? WHERE id_usuario=?",
                    (login.strip(), rol, user_id)
                )
            c.commit()
        return True
    except sqlite3.IntegrityError:
        return False

def eliminar_usuario(user_id: int) -> bool:
    try:
        with get_conn() as c:
            c.execute("DELETE FROM usuarios_portal WHERE id_usuario=?", (user_id,))
            c.commit()
        return True
    except Exception:
        return False

# ── Integrantes de Telegram ────────────────────────────────────────────────────

def get_integrantes(distribuidor_id: Optional[int] = None) -> List[Dict]:
    with get_conn() as c:
        if distribuidor_id:
            rows = c.execute(
                """SELECT i.id_integrante, i.nombre_integrante, i.telegram_user_id,
                          i.rol_telegram, i.telegram_group_id, g.nombre_grupo,
                          d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d  ON d.id_distribuidor   = i.id_distribuidor
                   LEFT JOIN grupos g     ON g.telegram_chat_id  = i.telegram_group_id
                   WHERE i.id_distribuidor = ?
                   ORDER BY i.rol_telegram, i.nombre_integrante""",
                (distribuidor_id,)
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT i.id_integrante, i.nombre_integrante, i.telegram_user_id,
                          i.rol_telegram, i.telegram_group_id, g.nombre_grupo,
                          d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d  ON d.id_distribuidor   = i.id_distribuidor
                   LEFT JOIN grupos g     ON g.telegram_chat_id  = i.telegram_group_id
                   ORDER BY d.nombre_empresa, i.rol_telegram, i.nombre_integrante"""
            ).fetchall()
    return [dict(r) for r in rows]

def set_rol_integrante(id_integrante: int, rol: str, distribuidor_id: Optional[int] = None) -> bool:
    try:
        with get_conn() as c:
            if distribuidor_id is None:
                c.execute(
                    "UPDATE integrantes_grupo SET rol_telegram=? WHERE id_integrante=?",
                    (rol, id_integrante)
                )
            else:
                c.execute(
                    "UPDATE integrantes_grupo SET rol_telegram=? WHERE id_integrante=? AND id_distribuidor=?",
                    (rol, id_integrante, distribuidor_id)
                )
            changed = c.execute("SELECT changes()").fetchone()[0]
            c.commit()
        return bool(changed)
    except Exception:
        return False

# ─── Helpers de render ────────────────────────────────────────────────────────

def role_badge(rol: str) -> str:
    cls = {
        "superadmin": "role-superadmin",
        "admin":      "role-admin",
        "evaluador":  "role-evaluador",
        "vendedor":   "role-vendedor",
        "observador": "role-observador",
    }.get(rol, "role-evaluador")
    return f'<span class="role-badge {cls}">{rol}</span>'

def render_topbar():
    u = st.session_state.user
    badge = "\u2605" if IS_SUPER else "\u25CF"
    st.markdown(f"""
    <div class="topbar">
        <div style="display:flex;align-items:center;gap:20px;">
            <span class="topbar-logo">SHELFMIND · ADMIN</span>
            <span class="topbar-meta">Gestión de Accesos</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <span class="superadmin-badge">{badge} {u.get('usuario_login','')} · {u.get('rol','')}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)


# ─── Tab 1: Usuarios del portal ───────────────────────────────────────────────

def tab_usuarios():
    distribuidoras = get_distribuidoras()
    dist_opciones  = {d["nombre"]: d["id"] for d in distribuidoras}
    dist_opciones_con_todos = {"Todas": None, **dist_opciones}

    # ── Filtro ────────────────────────────────────────────────────────────────
    col_f, col_nuevo = st.columns([3, 1])
    with col_f:
        filtro_dist = st.selectbox(
            "Filtrar por distribuidora",
            list(dist_opciones_con_todos.keys()),
            key="usr_filtro_dist",
        )
    with col_nuevo:
        st.markdown("<div style='height:28px'></div>", unsafe_allow_html=True)
        nuevo = st.button("+ NUEVO USUARIO", key="btn_nuevo_usr", use_container_width=True)

    dist_id_filtro = dist_opciones_con_todos[filtro_dist]
    usuarios = get_usuarios(dist_id_filtro)

    # ── Listado de Usuarios (Grilla CSS + Columnas Streamlit) ─────────────────
    st.markdown('<div class="card"><div class="card-title">Usuarios Registrados</div>', unsafe_allow_html=True)

    if not usuarios:
        st.markdown('<p style="color:var(--text-dim);font-size:13px;">No hay usuarios registrados.</p>', unsafe_allow_html=True)
    else:
        # Encabezado (Visible solo en desktop)
        st.markdown("""
        <div class="grid-header" style="grid-template-columns: 3fr 3fr 2fr 2fr 2fr;">
            <div>USUARIO</div><div>DISTRIBUIDORA</div><div style="text-align:center;">ROL</div><div></div><div></div>
        </div>
        """, unsafe_allow_html=True)

        yo = st.session_state.user.get("id_usuario")

        # Filas nativas (OJO AQUÍ: Quité el vertical_alignment="center")
        for u in usuarios:
            c1, c2, c3, c4, c5 = st.columns([3, 3, 2, 2, 2])
            with c1:
                st.markdown(f'<span class="admin-row admin-row-user"></span><div class="cell-primary" style="margin-top:10px;">{u["usuario_login"]}</div>', unsafe_allow_html=True)
            with c2:
                st.markdown(f'<div class="cell-secondary mobile-lbl-dist" style="margin-top:10px;">{u["nombre_empresa"]}</div>', unsafe_allow_html=True)
            with c3:
                st.markdown(f'<div style="text-align:center;margin-top:10px;">{role_badge(u["rol"])}</div>', unsafe_allow_html=True)
            with c4:
                if st.button("EDITAR", key=f"edit_usr_{u['id_usuario']}", use_container_width=True):
                    st.session_state["editando_usuario"] = u
                    st.rerun()
            with c5:
                disabled = (u["id_usuario"] == yo)
                if st.button("BORRAR", key=f"del_usr_{u['id_usuario']}", use_container_width=True, disabled=disabled):
                    st.session_state["confirmar_borrar_usr"] = u
                    st.rerun()
            st.markdown('<div class="row-divider"></div>', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)

    # ── Confirmación de borrado ───────────────────────────────────────────────
    if "confirmar_borrar_usr" in st.session_state:
        u_del = st.session_state["confirmar_borrar_usr"]
        st.error(f"⚠️ ¿Eliminar permanentemente al usuario **{u_del['usuario_login']}**?")
        c1, c2, _ = st.columns([1, 1, 4])
        with c1:
            if st.button("SÍ, ELIMINAR", key="confirm_del_usr", use_container_width=True):
                if eliminar_usuario(u_del["id_usuario"]):
                    st.success("Usuario eliminado correctamente.")
                    del st.session_state["confirmar_borrar_usr"]
                    st.rerun()
        with c2:
            if st.button("CANCELAR", key="cancel_del_usr", use_container_width=True):
                del st.session_state["confirmar_borrar_usr"]
                st.rerun()

    # ── Formulario edición ────────────────────────────────────────────────────
    if "editando_usuario" in st.session_state:
        u_ed = st.session_state["editando_usuario"]
        st.markdown(f'<div class="card"><div class="card-title">Editando: {u_ed["usuario_login"]}</div>', unsafe_allow_html=True)
        with st.form("form_editar_usr"):
            nuevo_login = st.text_input("Usuario", value=u_ed["usuario_login"])
            nuevo_rol   = st.selectbox("Rol", ["evaluador", "admin", "superadmin"],
                                       index=["evaluador","admin","superadmin"].index(u_ed["rol"])
                                       if u_ed["rol"] in ["evaluador","admin","superadmin"] else 0)
            nueva_pass  = st.text_input("Nueva contraseña (dejar vacío para no cambiar)",
                                        type="password", placeholder="••••••••")
            st.markdown("<br>", unsafe_allow_html=True)
            c1, c2 = st.columns(2)
            with c1:
                guardar = st.form_submit_button("GUARDAR CAMBIOS", use_container_width=True)
            with c2:
                cancelar = st.form_submit_button("CANCELAR", use_container_width=True)

            if guardar:
                ok = editar_usuario(u_ed["id_usuario"], nuevo_login, nuevo_rol,
                                    nueva_pass if nueva_pass else None)
                if ok:
                    st.success("Usuario actualizado.")
                    del st.session_state["editando_usuario"]
                    st.rerun()
                else:
                    st.error("Error: ese nombre de usuario ya existe.")
            if cancelar:
                del st.session_state["editando_usuario"]
                st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Formulario nuevo usuario ──────────────────────────────────────────────
    if nuevo or st.session_state.get("mostrar_form_nuevo_usr"):
        st.session_state["mostrar_form_nuevo_usr"] = True
        st.markdown('<div class="card"><div class="card-title">Nuevo Usuario</div>', unsafe_allow_html=True)
        with st.form("form_nuevo_usr"):
            dist_sel    = st.selectbox("Distribuidora", list(dist_opciones.keys()), key="nu_dist")
            nuevo_login = st.text_input("Usuario", placeholder="nombre_usuario")
            nuevo_pass  = st.text_input("Contraseña", type="password", placeholder="••••••••")
            nuevo_rol   = st.selectbox("Rol", ["evaluador", "admin", "superadmin"])
            st.markdown("<br>", unsafe_allow_html=True)
            c1, c2 = st.columns(2)
            with c1:
                crear = st.form_submit_button("CREAR USUARIO", use_container_width=True)
            with c2:
                cerrar = st.form_submit_button("CANCELAR", use_container_width=True)

            if crear:
                if not nuevo_login or not nuevo_pass:
                    st.error("Completá todos los campos.")
                else:
                    ok = crear_usuario(dist_opciones[dist_sel], nuevo_login, nuevo_pass, nuevo_rol)
                    if ok:
                        st.success(f"Usuario '{nuevo_login}' creado.")
                        del st.session_state["mostrar_form_nuevo_usr"]
                        st.rerun()
                    else:
                        st.error("Error: ese nombre de usuario ya existe.")
            if cerrar:
                del st.session_state["mostrar_form_nuevo_usr"]
                st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)


# ─── Tab 2: Distribuidoras ────────────────────────────────────────────────────

def tab_distribuidoras():
    """CRUD de distribuidoras. Solo superadmin."""
    dists = get_distribuidoras(solo_activas=False)

    col_f, col_nuevo = st.columns([3, 1])
    with col_f:
        st.markdown(
            f'<div style="padding-top:6px;font-size:13px;color:var(--text-muted);">'
            f'{len(dists)} distribuidora(s) registradas</div>',
            unsafe_allow_html=True,
        )
    with col_nuevo:
        nueva = st.button("+ NUEVA DISTRIBUIDORA", key="btn_nueva_dist", use_container_width=True)

    # ── Listado ────────────────────────────────────────────────────────────────
    st.markdown('<div class="card"><div class="card-title">Distribuidoras Registradas</div>', unsafe_allow_html=True)

    if not dists:
        st.markdown('<p style="color:var(--text-dim);font-size:13px;">No hay distribuidoras registradas.</p>', unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="grid-header" style="grid-template-columns: 2.5fr 3fr 1.5fr 1.5fr 1.5fr;">
            <div>EMPRESA</div><div>TOKEN BOT</div><div style="text-align:center;">ESTADO</div><div></div><div></div>
        </div>
        """, unsafe_allow_html=True)

        for d in dists:
            estado_actual = d.get("estado", "activo")
            token_short   = (d.get("token_bot") or "—")[:28] + "…" if len(d.get("token_bot") or "") > 28 else (d.get("token_bot") or "—")
            estado_color  = "var(--status-approved, #7DAF6B)" if estado_actual == "activo" else "var(--text-dim)"
            c1, c2, c3, c4, c5 = st.columns([2.5, 3, 1.5, 1.5, 1.5])
            with c1:
                st.markdown(
                    f'<div class="cell-primary" style="margin-top:10px;">{d["nombre"]}</div>',
                    unsafe_allow_html=True,
                )
            with c2:
                st.markdown(
                    f'<div class="cell-mono" style="margin-top:10px;font-size:11px;">{token_short}</div>',
                    unsafe_allow_html=True,
                )
            with c3:
                st.markdown(
                    f'<div style="text-align:center;margin-top:10px;">'
                    f'<span style="color:{estado_color};font-size:11px;font-weight:600;letter-spacing:1px;">'
                    f'● {estado_actual.upper()}</span></div>',
                    unsafe_allow_html=True,
                )
            with c4:
                if st.button("EDITAR", key=f"edit_dist_{d['id']}", use_container_width=True):
                    st.session_state["editando_dist"] = d
                    st.rerun()
            with c5:
                nuevo_estado = "inactivo" if estado_actual == "activo" else "activo"
                lbl_toggle   = "DESACTIVAR" if estado_actual == "activo" else "ACTIVAR"
                if st.button(lbl_toggle, key=f"tog_dist_{d['id']}", use_container_width=True):
                    toggle_distribuidora_estado(d["id"], nuevo_estado)
                    st.rerun()
            st.markdown('<div class="row-divider"></div>', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)

    # ── Formulario edición ─────────────────────────────────────────────────────
    if "editando_dist" in st.session_state:
        d_ed = st.session_state["editando_dist"]
        st.markdown(f'<div class="card"><div class="card-title">Editando: {d_ed["nombre"]}</div>', unsafe_allow_html=True)
        with st.form("form_editar_dist"):
            nuevo_nombre  = st.text_input("Nombre empresa", value=d_ed.get("nombre", ""))
            nuevo_token   = st.text_input("Token bot Telegram", value=d_ed.get("token_bot", ""),
                                          type="password", placeholder="1234567890:ABCdef...")
            nueva_carpeta = st.text_input("ID Carpeta Drive", value=d_ed.get("id_carpeta_drive", "") or "",
                                          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms")
            nueva_cred    = st.text_input("Ruta credencial Drive (relativa)", value=d_ed.get("ruta_credencial_drive", "") or "",
                                          placeholder="credencial_drive.json")
            st.markdown("<br>", unsafe_allow_html=True)
            cg, cc = st.columns(2)
            with cg:
                guardar = st.form_submit_button("GUARDAR CAMBIOS", use_container_width=True)
            with cc:
                cancelar = st.form_submit_button("CANCELAR", use_container_width=True)

        if guardar:
            if not nuevo_nombre or not nuevo_token:
                st.error("Nombre y Token son obligatorios.")
            else:
                ok, err = editar_distribuidora(d_ed["id"], nuevo_nombre, nuevo_token, nueva_carpeta, nueva_cred)
                if ok:
                    st.success("Distribuidora actualizada.")
                    del st.session_state["editando_dist"]
                    st.rerun()
                else:
                    st.error(err)
        if cancelar:
            del st.session_state["editando_dist"]
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Formulario nueva distribuidora ─────────────────────────────────────────
    if nueva or st.session_state.get("mostrar_form_nueva_dist"):
        st.session_state["mostrar_form_nueva_dist"] = True
        st.markdown('<div class="card"><div class="card-title">Nueva Distribuidora</div>', unsafe_allow_html=True)

        st.markdown("""
        <div style="background:rgba(217,167,106,0.06);border:1px solid rgba(217,167,106,0.2);
                    border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:var(--text-muted);">
            💡 <strong style="color:var(--accent-amber);">Antes de crear:</strong>
            Asegurate de tener el token del bot de Telegram listo (<code>@BotFather</code>),
            el ID de la carpeta de Google Drive, y que la carpeta esté compartida con la Service Account.
        </div>
        """, unsafe_allow_html=True)

        with st.form("form_nueva_dist"):
            nuevo_nombre  = st.text_input("Nombre empresa *", placeholder="Distribuidora XYZ S.A.")
            nuevo_token   = st.text_input("Token bot Telegram *", type="password",
                                          placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ")
            nueva_carpeta = st.text_input("ID Carpeta Google Drive",
                                          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms")
            nueva_cred    = st.text_input("Ruta credencial Drive (relativa al bot)",
                                          placeholder="credencial_drive.json")
            st.markdown("<br>", unsafe_allow_html=True)
            cc, cn = st.columns(2)
            with cc:
                crear  = st.form_submit_button("CREAR DISTRIBUIDORA", use_container_width=True)
            with cn:
                cerrar = st.form_submit_button("CANCELAR", use_container_width=True)

        if crear:
            if not nuevo_nombre or not nuevo_token:
                st.error("Nombre y Token son obligatorios.")
            else:
                ok, err = crear_distribuidora(nuevo_nombre, nuevo_token, nueva_carpeta, nueva_cred)
                if ok:
                    st.success(f"✅ Distribuidora '{nuevo_nombre}' creada exitosamente.")
                    del st.session_state["mostrar_form_nueva_dist"]
                    st.rerun()
                else:
                    st.error(err)
        if cerrar:
            if "mostrar_form_nueva_dist" in st.session_state:
                del st.session_state["mostrar_form_nueva_dist"]
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)


# ─── Tab 3: Integrantes de Telegram ──────────────────────────────────────────

def tab_integrantes():
    dist_id_filtro: Optional[int]
    if IS_ADMIN:
        dist_id_filtro = st.session_state.user.get("id_distribuidor")
        st.info(f"Distribuidora: **{st.session_state.user.get('nombre_empresa','')}** (solo tu entorno)")
    else:
        distribuidoras = get_distribuidoras()
        dist_opciones  = {d["nombre"]: d["id"] for d in distribuidoras}
        dist_opciones_con_todos = {"Todas": None, **dist_opciones}

        filtro_dist = st.selectbox(
            "Filtrar por distribuidora",
            list(dist_opciones_con_todos.keys()),
            key="int_filtro_dist",
        )
        dist_id_filtro = dist_opciones_con_todos[filtro_dist]
        
    integrantes = get_integrantes(dist_id_filtro)

    st.markdown('<div class="card"><div class="card-title">Integrantes de Telegram</div>', unsafe_allow_html=True)

    if not integrantes:
        st.markdown('<p style="color:var(--text-dim);font-size:13px;">No hay integrantes registrados.</p>', unsafe_allow_html=True)
    else:
        # Encabezado (Visible solo en desktop)
        st.markdown("""
        <div class="grid-header" style="grid-template-columns: 2.5fr 2.5fr 2.5fr 2fr 1.5fr 2fr;">
            <div>NOMBRE</div><div>DISTRIBUIDORA</div><div>GRUPO</div><div>TELEGRAM ID</div><div style="text-align:center;">ROL</div><div style="text-align:center;">ACCIÓN</div>
        </div>
        """, unsafe_allow_html=True)

        for ig in integrantes:
            rol_actual = ig["rol_telegram"] or "vendedor"
            nuevo_rol  = "observador" if rol_actual == "vendedor" else "vendedor"
            label      = "→ OBSERVADOR" if rol_actual == "vendedor" else "→ VENDEDOR"

            # Filas nativas (OJO AQUÍ: Quité el vertical_alignment="center")
            c1, c2, c3, c4, c5, c6 = st.columns([2.5, 2.5, 2.5, 2, 1.5, 2])
            with c1:
                st.markdown(f'<span class="admin-row admin-row-int"></span><div class="cell-primary" style="margin-top:10px;">{ig["nombre_integrante"] or "Sin nombre"}</div>', unsafe_allow_html=True)
            with c2:
                st.markdown(f'<div class="cell-secondary mobile-lbl-dist" style="margin-top:10px;">{ig["nombre_empresa"]}</div>', unsafe_allow_html=True)
            with c3:
                # Mostrar nombre del grupo + ID del grupo en dos líneas
                nombre_grupo = ig.get("nombre_grupo")
                id_grupo = ig.get("telegram_group_id")
                grupo_html = '<div style="margin-top:10px;">'
                if nombre_grupo:
                    grupo_html += f'<div class="cell-primary" style="font-size:13px;margin-bottom:4px;">{nombre_grupo}</div>'
                if id_grupo:
                    grupo_html += f'<div class="cell-mono" style="font-size:11px;">ID: {id_grupo}</div>'
                if not nombre_grupo and not id_grupo:
                    grupo_html += '<div class="cell-secondary">—</div>'
                grupo_html += '</div>'
                st.markdown(grupo_html, unsafe_allow_html=True)
            with c4:
                st.markdown(f'<div class="cell-mono mobile-lbl-tg" style="margin-top:10px;">TG ID: {ig["telegram_user_id"]}</div>', unsafe_allow_html=True)
            with c5:
                st.markdown(f'<div style="text-align:center;margin-top:10px;">{role_badge(rol_actual)}</div>', unsafe_allow_html=True)
            with c6:
                if st.button(label, key=f"rol_ig_{ig['id_integrante']}", use_container_width=True):
                    if set_rol_integrante(
                        ig["id_integrante"], nuevo_rol,
                        st.session_state.user.get("id_distribuidor") if IS_ADMIN else None
                    ):
                        st.rerun()
                    else:
                        st.error("No tenés permisos para modificar este integrante.")
            st.markdown('<div class="row-divider"></div>', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    st.markdown(STYLE, unsafe_allow_html=True)
    render_topbar()

    st.markdown("<div style='padding:0 24px 24px;'>", unsafe_allow_html=True)

    if IS_SUPER:
        tab1, tab2, tab3 = st.tabs(["🏢 DISTRIBUIDORAS", "👤 USUARIOS PORTAL", "💬 INTEGRANTES TELEGRAM"])
        with tab1: tab_distribuidoras()
        with tab2: tab_usuarios()
        with tab3: tab_integrantes()
    else:
        tab_integrantes()

    # Botón volver al menú
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    if st.button("← VOLVER AL MENU", key="btn_volver"):
        st.switch_page("app.py")

    st.markdown("</div>", unsafe_allow_html=True)

if __name__ == "__main__":
    main()