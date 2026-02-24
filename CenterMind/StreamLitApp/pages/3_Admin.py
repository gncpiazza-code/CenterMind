# -*- coding: utf-8 -*-
"""
CenterMind — Panel Admin
========================
Solo accesible para usuarios con rol 'superadmin'.

Secciones:
  - Usuarios del portal (CRUD)
  - Integrantes de Telegram (ver + cambiar rol)
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

import streamlit as st

# ─── Guard de sesión ──────────────────────────────────────────────────────────
if "logged_in" not in st.session_state or not st.session_state.logged_in:
    st.switch_page("app.py")

if st.session_state.user.get("rol") != "superadmin":
    st.switch_page("app.py")

# ─── Configuración de página ──────────────────────────────────────────────────
st.set_page_config(
    page_title="CenterMind · Admin",
    page_icon="⚙️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = BASE_DIR.parent.parent / "base_datos" / "centermind.db"

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
[data-testid="stDecoration"]        { display: none !important; }
[data-testid="stMainBlockContainer"]{ padding: 0 !important; max-width: 100% !important; }
section[data-testid="stSidebar"]    { display: none !important; }
.block-container { padding: 0 !important; max-width: 100% !important; }

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

/* ── Topbar ───────────────────────────────────────────────── */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 32px;
    background: rgba(10,12,22,0.9);
    border-bottom: 1px solid rgba(251,191,36,0.12);
    backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 100;
    margin-bottom: 28px;
}
.topbar-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 26px; letter-spacing: 3px; color: #fbbf24;
}
.topbar-meta { font-size: 12px; color: rgba(226,232,240,0.4); letter-spacing: 1px; }
.superadmin-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; border-radius: 999px;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    background: rgba(139,92,246,0.15);
    border: 1px solid rgba(139,92,246,0.35);
    color: #a78bfa;
}

/* ── Tabs ─────────────────────────────────────────────────── */
div[data-testid="stTabs"] [role="tablist"] {
    background: rgba(15,17,30,0.6) !important;
    border-radius: 12px !important;
    padding: 4px !important;
    border: 1px solid rgba(255,255,255,0.06) !important;
    gap: 4px !important;
}
div[data-testid="stTabs"] [role="tab"] {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important;
    font-size: 15px !important;
    color: rgba(226,232,240,0.4) !important;
    border-radius: 8px !important;
    padding: 8px 20px !important;
    border: none !important;
}
div[data-testid="stTabs"] [role="tab"][aria-selected="true"] {
    background: rgba(251,191,36,0.12) !important;
    color: #fbbf24 !important;
    border: 1px solid rgba(251,191,36,0.25) !important;
}
div[data-testid="stTabs"] [role="tabpanel"] {
    padding-top: 24px !important;
}

/* ── Cards ────────────────────────────────────────────────── */
.card {
    background: rgba(20,23,40,0.8);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 16px;
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

/* ── Table ────────────────────────────────────────────────── */
.admin-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
}
.admin-table th {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: rgba(226,232,240,0.35);
    padding: 8px 12px; text-align: left;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
.admin-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: #e2e8f0;
    vertical-align: middle;
}
.admin-table tr:last-child td { border-bottom: none; }
.admin-table tr:hover td { background: rgba(255,255,255,0.02); }

/* ── Role badges ──────────────────────────────────────────── */
.role-badge {
    display: inline-flex; align-items: center;
    padding: 2px 10px; border-radius: 20px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    font-weight: 600;
}
.role-superadmin { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
.role-admin      { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); }
.role-evaluador  { background: rgba(34,211,238,0.1);  color: #22d3ee; border: 1px solid rgba(34,211,238,0.2); }
.role-vendedor   { background: rgba(74,222,128,0.1);  color: #4ade80; border: 1px solid rgba(74,222,128,0.2); }
.role-observador { background: rgba(148,163,184,0.1); color: #94a3b8; border: 1px solid rgba(148,163,184,0.2); }

/* ── Form ─────────────────────────────────────────────────── */
div[data-testid="stTextInput"] input {
    background: rgba(20,23,40,0.9) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
    font-family: 'DM Sans', sans-serif !important;
}
div[data-testid="stTextInput"] input:focus {
    border-color: rgba(251,191,36,0.4) !important;
    box-shadow: 0 0 0 3px rgba(251,191,36,0.08) !important;
}
div[data-testid="stSelectbox"] > div > div {
    background: rgba(20,23,40,0.9) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 10px !important;
    color: #e2e8f0 !important;
}
div[data-testid="stButton"] button {
    font-family: 'Bebas Neue', sans-serif !important;
    letter-spacing: 2px !important; font-size: 14px !important;
    border-radius: 10px !important; height: 44px !important;
    transition: all 0.15s ease !important;
}
div[data-testid="stAlert"] {
    background: rgba(248,113,113,0.1) !important;
    border: 1px solid rgba(248,113,113,0.3) !important;
    border-radius: 10px !important; color: #f87171 !important;
}
div[data-testid="stSuccess"] {
    background: rgba(74,222,128,0.1) !important;
    border: 1px solid rgba(74,222,128,0.3) !important;
    border-radius: 10px !important; color: #4ade80 !important;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
</style>
"""

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_distribuidoras() -> List[Dict]:
    with get_conn() as c:
        rows = c.execute(
            """SELECT id_distribuidor AS id, nombre_empresa AS nombre
               FROM distribuidores WHERE estado = 'activo'
               ORDER BY nombre_empresa"""
        ).fetchall()
    return [dict(r) for r in rows]


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
                          i.rol_telegram, i.telegram_group_id, i.nombre_grupo,
                          d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d ON d.id_distribuidor = i.id_distribuidor
                   WHERE i.id_distribuidor = ?
                   ORDER BY i.rol_telegram, i.nombre_integrante""",
                (distribuidor_id,)
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT i.id_integrante, i.nombre_integrante, i.telegram_user_id,
                          i.rol_telegram, i.telegram_group_id, i.nombre_grupo,
                          d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d ON d.id_distribuidor = i.id_distribuidor
                   ORDER BY d.nombre_empresa, i.rol_telegram, i.nombre_integrante"""
            ).fetchall()
    return [dict(r) for r in rows]


def set_rol_integrante(id_integrante: int, rol: str) -> bool:
    try:
        with get_conn() as c:
            c.execute(
                "UPDATE integrantes_grupo SET rol_telegram=? WHERE id_integrante=?",
                (rol, id_integrante)
            )
            c.commit()
        return True
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
    st.markdown(f"""
    <div class="topbar">
        <div style="display:flex;align-items:center;gap:20px;">
            <span class="topbar-logo">CENTERMIND · ADMIN</span>
            <span class="topbar-meta">Panel de Administración</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <span class="superadmin-badge">&#x2605; {u.get('usuario_login','')}</span>
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

    # ── Tabla de usuarios ─────────────────────────────────────────────────────
    st.markdown('<div class="card"><div class="card-title">Usuarios Registrados</div>', unsafe_allow_html=True)

    if not usuarios:
        st.markdown('<p style="color:rgba(226,232,240,0.3);font-size:13px;">No hay usuarios registrados.</p>', unsafe_allow_html=True)
    else:
        for u in usuarios:
            col_nombre, col_dist, col_rol, col_edit, col_del = st.columns([2, 2, 1.5, 0.8, 0.8])
            with col_nombre:
                st.markdown(
                    f'<div style="font-size:14px;font-weight:600;color:#e2e8f0;padding-top:8px;">'
                    f'{u["usuario_login"]}</div>',
                    unsafe_allow_html=True,
                )
            with col_dist:
                st.markdown(
                    f'<div style="font-size:12px;color:rgba(226,232,240,0.5);padding-top:9px;">'
                    f'{u["nombre_empresa"]}</div>',
                    unsafe_allow_html=True,
                )
            with col_rol:
                st.markdown(
                    f'<div style="padding-top:6px;">{role_badge(u["rol"])}</div>',
                    unsafe_allow_html=True,
                )
            with col_edit:
                if st.button("EDITAR", key=f"edit_usr_{u['id_usuario']}", use_container_width=True):
                    st.session_state["editando_usuario"] = u
                    st.rerun()
            with col_del:
                # Proteger: no puede eliminarse a sí mismo
                yo = st.session_state.user.get("id_usuario")
                disabled = (u["id_usuario"] == yo)
                if st.button("BORRAR", key=f"del_usr_{u['id_usuario']}",
                             use_container_width=True, disabled=disabled):
                    st.session_state["confirmar_borrar_usr"] = u
                    st.rerun()

            st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.04);margin:2px 0;">', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)

    # ── Confirmación de borrado ───────────────────────────────────────────────
    if "confirmar_borrar_usr" in st.session_state:
        u_del = st.session_state["confirmar_borrar_usr"]
        st.warning(f"¿Eliminar al usuario **{u_del['usuario_login']}**? Esta acción no se puede deshacer.")
        c1, c2, _ = st.columns([1, 1, 4])
        with c1:
            if st.button("SI, ELIMINAR", key="confirm_del_usr"):
                if eliminar_usuario(u_del["id_usuario"]):
                    st.success("Usuario eliminado.")
                    del st.session_state["confirmar_borrar_usr"]
                    st.rerun()
        with c2:
            if st.button("CANCELAR", key="cancel_del_usr"):
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


# ─── Tab 2: Integrantes de Telegram ──────────────────────────────────────────

def tab_integrantes():
    distribuidoras = get_distribuidoras()
    dist_opciones  = {d["nombre"]: d["id"] for d in distribuidoras}
    dist_opciones_con_todos = {"Todas": None, **dist_opciones}

    filtro_dist = st.selectbox(
        "Filtrar por distribuidora",
        list(dist_opciones_con_todos.keys()),
        key="int_filtro_dist",
    )
    dist_id_filtro = dist_opciones_con_todos[filtro_dist]
    integrantes    = get_integrantes(dist_id_filtro)

    st.markdown('<div class="card"><div class="card-title">Integrantes de Telegram</div>', unsafe_allow_html=True)

    if not integrantes:
        st.markdown('<p style="color:rgba(226,232,240,0.3);font-size:13px;">No hay integrantes registrados.</p>', unsafe_allow_html=True)
    else:
        for ig in integrantes:
            col_nom, col_dist, col_grupo, col_tg, col_rol = st.columns([2, 2, 1.5, 1.5, 1.5])
            with col_nom:
                st.markdown(
                    f'<div style="font-size:14px;font-weight:600;color:#e2e8f0;padding-top:8px;">'
                    f'{ig["nombre_integrante"] or "Sin nombre"}</div>',
                    unsafe_allow_html=True,
                )
            with col_dist:
                st.markdown(
                    f'<div style="font-size:12px;color:rgba(226,232,240,0.5);padding-top:9px;">'
                    f'{ig["nombre_empresa"]}</div>',
                    unsafe_allow_html=True,
                )
            with col_grupo:
                grupo = ig.get("nombre_grupo") or f"ID {ig.get('telegram_group_id','—')}"
                st.markdown(
                    f'<div style="font-size:11px;color:rgba(226,232,240,0.4);padding-top:9px;">'
                    f'{grupo}</div>',
                    unsafe_allow_html=True,
                )
            with col_tg:
                st.markdown(
                    f'<div style="font-family:\'DM Mono\',monospace;font-size:11px;'
                    f'color:rgba(34,211,238,0.6);padding-top:9px;">'
                    f'{ig["telegram_user_id"]}</div>',
                    unsafe_allow_html=True,
                )
            with col_rol:
                rol_actual = ig["rol_telegram"] or "vendedor"
                nuevo_rol  = "observador" if rol_actual == "vendedor" else "vendedor"
                label      = "-> OBSERVADOR" if rol_actual == "vendedor" else "-> VENDEDOR"
                if st.button(label, key=f"rol_ig_{ig['id_integrante']}", use_container_width=True):
                    if set_rol_integrante(ig["id_integrante"], nuevo_rol):
                        st.rerun()

            st.markdown(
                f'<div style="display:flex;align-items:center;gap:8px;padding:2px 0 6px 0;">'
                f'{role_badge(rol_actual)}'
                f'</div>',
                unsafe_allow_html=True,
            )
            st.markdown('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.04);margin:2px 0;">', unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    st.markdown(STYLE, unsafe_allow_html=True)
    render_topbar()

    st.markdown("<div style='padding:0 24px 24px;'>", unsafe_allow_html=True)

    tab1, tab2 = st.tabs(["USUARIOS DEL PORTAL", "INTEGRANTES TELEGRAM"])

    with tab1:
        tab_usuarios()

    with tab2:
        tab_integrantes()

    # Botón volver al menú
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    if st.button("← VOLVER AL MENU", key="btn_volver"):
        st.switch_page("app.py")

    st.markdown("</div>", unsafe_allow_html=True)


main()
