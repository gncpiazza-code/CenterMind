# -*- coding: utf-8 -*-
"""
Shelfy — Backend API (FastAPI)
==================================
Se ejecuta en tu PC y expone la base de datos SQLite de forma segura.

Arrancar el servidor:
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Luego exponer al mundo con Cloudflare Tunnel (sin abrir router):
    cloudflared tunnel --url http://localhost:8000

La URL que te genere Cloudflare es la que pegas en st.secrets["API_URL"].
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, date, timedelta

# ── Fix: PostgreSQL setea REQUESTS_CA_BUNDLE a un path inválido en Windows.
# Forzamos certifi antes de cualquier import de requests/google-auth. ──────────
try:
    import certifi as _certifi
    os.environ["REQUESTS_CA_BUNDLE"] = _certifi.where()
    os.environ["SSL_CERT_FILE"]      = _certifi.where()
except ImportError:
    pass
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# JWT (python-jose) — opcional: si no está instalado, /auth/login no estará disponible
try:
    from jose import JWTError, jwt as _jwt
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False

# ─── Configuración ────────────────────────────────────────────────────────────
# Configura esta clave antes de usar. Puedes pasarla como variable de entorno:
#   set SHELFY_API_KEY=tu-clave-secreta   (Windows)
#   export SHELFY_API_KEY=tu-clave-secreta (Linux/Mac)
API_KEY = os.environ.get("SHELFY_API_KEY", "shelfy-clave-2025")

# JWT para el frontend React — cambiá esto en producción con una clave larga y aleatoria
JWT_SECRET    = os.environ.get("SHELFY_JWT_SECRET", "shelfy-jwt-secret-dev-2025")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8

DB_PATH = Path(__file__).resolve().parent / "base_datos" / "centermind.db"

app = FastAPI(title="Shelfy API", version="1.0.0")

# CORS: permite peticiones desde Streamlit Cloud (y cualquier origen)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── DB helper ────────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── Seguridad: API Key via header ───────────────────────────────────────────

def verify_key(x_api_key: str = Header(..., description="API Key secreta")):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API Key inválida")


# ─── Seguridad: JWT Bearer (para frontend React) ──────────────────────────────

def verify_jwt(authorization: str = Header(..., description="Bearer <token>")):
    """Dependencia para proteger endpoints con JWT.
    Uso: agregar  _=Depends(verify_jwt)  al endpoint.
    """
    if not JWT_AVAILABLE:
        raise HTTPException(status_code=503, detail="JWT no disponible")
    try:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Formato inválido. Usa: Bearer <token>")
        payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token JWT inválido o expirado")


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    usuario: str
    password: str


class EvaluarRequest(BaseModel):
    ids_exhibicion: List[int]
    estado: str
    supervisor: str
    comentario: str = ""


class RevertirRequest(BaseModel):
    ids_exhibicion: List[int]


class DistribuidoraRequest(BaseModel):
    nombre: str
    token: str
    carpeta_drive: str = ""
    ruta_cred: str = ""


class UsuarioRequest(BaseModel):
    dist_id: int
    login: str
    password: str
    rol: str


class UsuarioEditRequest(BaseModel):
    login: str
    rol: str
    password: str = ""


class IntegranteRolRequest(BaseModel):
    rol: str
    distribuidor_id: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    usuario: str
    rol: str
    id_usuario: int
    id_distribuidor: int
    nombre_empresa: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check")
def health():
    return {"status": "ok"}


@app.post("/login", summary="Autenticación de usuario")
def login(req: LoginRequest, _=Depends(verify_key)):
    with get_conn() as c:
        row = c.execute(
            """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                      d.nombre_empresa
               FROM usuarios_portal u
               JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
               WHERE u.usuario_login = ? AND u.password = ?""",
            (req.usuario.strip(), req.password.strip()),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return dict(row)


@app.post("/auth/login", summary="Login para frontend React — devuelve JWT", response_model=TokenResponse)
def auth_login(req: LoginRequest):
    """Endpoint de autenticación para el frontend React.
    No requiere API Key — devuelve un JWT con los datos del usuario.
    El JWT debe enviarse en los siguientes requests como: Authorization: Bearer <token>
    """
    if not JWT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="JWT no disponible. Instalá python-jose: pip install python-jose[cryptography]"
        )
    with get_conn() as c:
        row = c.execute(
            """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                      d.nombre_empresa
               FROM usuarios_portal u
               JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
               WHERE u.usuario_login = ? AND u.password = ?""",
            (req.usuario.strip(), req.password.strip()),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    user = dict(row)
    payload = {
        "sub":               user["usuario_login"],
        "id_usuario":        user["id_usuario"],
        "rol":               user["rol"],
        "id_distribuidor":   user["id_distribuidor"],
        "nombre_empresa":    user["nombre_empresa"],
        "exp":               datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        usuario=user["usuario_login"],
        rol=user["rol"],
        id_usuario=user["id_usuario"],
        id_distribuidor=user["id_distribuidor"],
        nombre_empresa=user["nombre_empresa"],
    )


@app.get("/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT e.id_exhibicion,
                      c.numero_cliente_local  AS nro_cliente,
                      e.tipo_pdv,
                      e.url_foto_drive        AS drive_link,
                      e.timestamp_subida      AS fecha_hora,
                      e.telegram_msg_id,
                      i.nombre_integrante     AS vendedor
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               LEFT JOIN clientes c          ON c.id_cliente    = e.id_cliente
               WHERE e.id_distribuidor = ? AND e.estado = 'Pendiente'
               ORDER BY e.timestamp_subida ASC""",
            (id_distribuidor,),
        ).fetchall()

    grupos: dict = {}
    for r in rows:
        d   = dict(r)
        key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{d['id_exhibicion']}"
        if key not in grupos:
            grupos[key] = {
                "vendedor":    d.get("vendedor"),
                "nro_cliente": d.get("nro_cliente"),
                "tipo_pdv":    d.get("tipo_pdv"),
                "fecha_hora":  d.get("fecha_hora"),
                "fotos":       [],
            }
        grupos[key]["fotos"].append({
            "id_exhibicion": d["id_exhibicion"],
            "drive_link":    d["drive_link"],
        })
    return list(grupos.values())


@app.get("/stats/{id_distribuidor}", summary="Estadísticas del día actual")
def get_stats(id_distribuidor: int, _=Depends(verify_key)):
    hoy = datetime.now().strftime("%Y-%m-%d")
    with get_conn() as c:
        row = c.execute(
            """SELECT COUNT(*) total,
               SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) pendientes,
               SUM(CASE WHEN estado='Aprobado'  THEN 1 ELSE 0 END) aprobadas,
               SUM(CASE WHEN estado='Rechazado' THEN 1 ELSE 0 END) rechazadas,
               SUM(CASE WHEN estado='Destacado' THEN 1 ELSE 0 END) destacadas
               FROM exhibiciones
               WHERE id_distribuidor=? AND DATE(timestamp_subida)=?""",
            (id_distribuidor, hoy),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/vendedores/{id_distribuidor}", summary="Lista de vendedores con pendientes")
def get_vendedores(id_distribuidor: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT i.nombre_integrante
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor=? AND e.estado='Pendiente'
               ORDER BY i.nombre_integrante ASC""",
            (id_distribuidor,),
        ).fetchall()
    return [r["nombre_integrante"] for r in rows if r["nombre_integrante"]]


@app.post("/evaluar", summary="Aprobar / Destacar / Rechazar una exhibición")
def evaluar(req: EvaluarRequest, _=Depends(verify_key)):
    try:
        affected = 0
        conn = get_conn()
        for id_ex in req.ids_exhibicion:
            cur = conn.execute(
                "UPDATE exhibiciones "
                "SET estado=?, supervisor_nombre=?, comentario_evaluacion=?, "
                "    evaluated_at=CURRENT_TIMESTAMP, synced_telegram=0 "
                "WHERE id_exhibicion=? AND estado='Pendiente'",
                (req.estado, req.supervisor, req.comentario or None, id_ex),
            )
            affected += cur.rowcount
        conn.commit()
        conn.close()
        return {"affected": affected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/revertir", summary="Revertir evaluación a Pendiente")
def revertir(req: RevertirRequest, _=Depends(verify_key)):
    try:
        affected = 0
        conn = get_conn()
        for id_ex in req.ids_exhibicion:
            cur = conn.execute(
                "UPDATE exhibiciones "
                "SET estado='Pendiente', supervisor_nombre=NULL, comentario_evaluacion=NULL, "
                "    evaluated_at=NULL, synced_telegram=0 "
                "WHERE id_exhibicion=?",
                (id_ex,),
            )
            affected += cur.rowcount
        conn.commit()
        conn.close()
        return {"affected": affected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Admin: Distribuidoras ───────────────────────────────────────────────────

@app.get("/admin/distribuidoras", summary="Lista de distribuidoras")
def admin_get_distribuidoras(solo_activas: str = "true", _=Depends(verify_key)):
    filtro = "WHERE estado='activo'" if solo_activas.lower() == "true" else ""
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT id_distribuidor AS id, nombre_empresa AS nombre,
                       token_bot, estado, id_carpeta_drive, ruta_credencial_drive
                FROM distribuidores {filtro} ORDER BY nombre_empresa"""
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/admin/distribuidoras", summary="Crear distribuidora")
def admin_crear_distribuidora(req: DistribuidoraRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                """INSERT INTO distribuidores(nombre_empresa, token_bot, id_carpeta_drive, ruta_credencial_drive)
                   VALUES(?,?,?,?)""",
                (req.nombre.strip(), req.token.strip(), req.carpeta_drive.strip(), req.ruta_cred.strip()),
            )
            c.execute("COMMIT")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/admin/distribuidoras/{dist_id}", summary="Editar distribuidora")
def admin_editar_distribuidora(dist_id: int, req: DistribuidoraRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                """UPDATE distribuidores
                   SET nombre_empresa=?, token_bot=?, id_carpeta_drive=?, ruta_credencial_drive=?
                   WHERE id_distribuidor=?""",
                (req.nombre.strip(), req.token.strip(), req.carpeta_drive.strip(), req.ruta_cred.strip(), dist_id),
            )
            c.execute("COMMIT")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.patch("/admin/distribuidoras/{dist_id}/estado", summary="Activar/desactivar distribuidora")
def admin_toggle_distribuidora(dist_id: int, estado: str, _=Depends(verify_key)):
    if estado not in ("activo", "inactivo"):
        raise HTTPException(status_code=400, detail="estado debe ser 'activo' o 'inactivo'")
    with get_conn() as c:
        c.execute("UPDATE distribuidores SET estado=? WHERE id_distribuidor=?", (estado, dist_id))
        c.execute("COMMIT")
    return {"ok": True}


# ─── Admin: Usuarios del portal ───────────────────────────────────────────────

@app.get("/admin/usuarios", summary="Lista de usuarios del portal")
def admin_get_usuarios(dist_id: int = None, _=Depends(verify_key)):
    where = "WHERE u.id_distribuidor=?" if dist_id else ""
    params = (dist_id,) if dist_id else ()
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor,
                       d.nombre_empresa
                FROM usuarios_portal u
                JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
                {where}
                ORDER BY d.nombre_empresa, u.usuario_login""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/admin/usuarios", summary="Crear usuario del portal")
def admin_crear_usuario(req: UsuarioRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                "INSERT INTO usuarios_portal(id_distribuidor, usuario_login, password, rol) VALUES(?,?,?,?)",
                (req.dist_id, req.login.strip(), req.password, req.rol),
            )
            c.execute("COMMIT")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/admin/usuarios/{user_id}", summary="Editar usuario del portal")
def admin_editar_usuario(user_id: int, req: UsuarioEditRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            if req.password:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=?, password=? WHERE id_usuario=?",
                    (req.login.strip(), req.rol, req.password, user_id),
                )
            else:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=? WHERE id_usuario=?",
                    (req.login.strip(), req.rol, user_id),
                )
            c.execute("COMMIT")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.delete("/admin/usuarios/{user_id}", summary="Eliminar usuario del portal")
def admin_eliminar_usuario(user_id: int, _=Depends(verify_key)):
    with get_conn() as c:
        c.execute("DELETE FROM usuarios_portal WHERE id_usuario=?", (user_id,))
        c.execute("COMMIT")
    return {"ok": True}


# ─── Admin: Integrantes de Telegram ──────────────────────────────────────────

@app.get("/admin/integrantes", summary="Lista de integrantes de Telegram")
def admin_get_integrantes(dist_id: int = None, _=Depends(verify_key)):
    where = "WHERE ig.id_distribuidor=?" if dist_id else ""
    params = (dist_id,) if dist_id else ()
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT ig.id_integrante, ig.nombre_integrante, ig.telegram_user_id,
                       ig.rol_telegram, ig.telegram_group_id,
                       g.nombre_grupo,
                       d.nombre_empresa
                FROM integrantes_grupo ig
                JOIN distribuidores d ON d.id_distribuidor = ig.id_distribuidor
                LEFT JOIN grupos g ON g.telegram_chat_id = ig.telegram_group_id
                {where}
                ORDER BY d.nombre_empresa, ig.nombre_integrante""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


@app.put("/admin/integrantes/{id_integrante}/rol", summary="Cambiar rol de integrante")
def admin_set_rol_integrante(id_integrante: int, req: IntegranteRolRequest, _=Depends(verify_key)):
    if req.rol not in ("vendedor", "observador"):
        raise HTTPException(status_code=400, detail="rol debe ser 'vendedor' u 'observador'")
    with get_conn() as c:
        # Si es admin (distribuidor_id != None), solo puede modificar su propia distribuidora
        if req.distribuidor_id:
            cur = c.execute(
                "UPDATE integrantes_grupo SET rol_telegram=? WHERE id_integrante=? AND id_distribuidor=?",
                (req.rol, id_integrante, req.distribuidor_id),
            )
        else:
            cur = c.execute(
                "UPDATE integrantes_grupo SET rol_telegram=? WHERE id_integrante=?",
                (req.rol, id_integrante),
            )
        c.execute("COMMIT")
        if cur.rowcount == 0:
            raise HTTPException(status_code=403, detail="Sin permisos o integrante no encontrado")
    return {"ok": True}


# ─── Admin: Monitor (sesiones, métricas, alertas) ────────────────────────────

@app.get("/admin/monitor/sesiones", summary="Sesiones activas del portal")
def admin_monitor_sesiones(_=Depends(verify_key)):
    """Devuelve sesiones activas (activa=1) con datos de usuario y distribuidora."""
    with get_conn() as c:
        rows = c.execute(
            """SELECT s.session_id, s.user_id, s.rol, s.dist_id,
                      s.login_at, s.last_seen_at, s.ip, s.ciudad, s.provincia,
                      u.usuario_login AS login,
                      d.nombre_empresa
               FROM sessions s
               JOIN usuarios_portal u ON u.id_usuario = s.user_id
               LEFT JOIN distribuidores d ON d.id_distribuidor = s.dist_id
               WHERE s.activa = 1
               ORDER BY s.last_seen_at DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/admin/monitor/metricas", summary="Métricas del día")
def admin_monitor_metricas(_=Depends(verify_key)):
    """KPIs del día: logins, usuarios únicos, exportaciones, pantalla top."""
    hoy = datetime.now().strftime("%Y-%m-%d")
    with get_conn() as c:
        logins = c.execute(
            "SELECT COUNT(*) FROM sessions WHERE DATE(login_at)=?", (hoy,)
        ).fetchone()[0]
        unicos = c.execute(
            "SELECT COUNT(DISTINCT user_id) FROM sessions WHERE DATE(login_at)=?", (hoy,)
        ).fetchone()[0]
        exports = c.execute(
            "SELECT COUNT(*) FROM events WHERE DATE(ts)=? AND event_type='export'", (hoy,)
        ).fetchone()[0]
        # Pantalla más visitada hoy
        pantalla_row = c.execute(
            """SELECT page, COUNT(*) AS n FROM events
               WHERE DATE(ts)=? AND event_type='page_view' AND page IS NOT NULL
               GROUP BY page ORDER BY n DESC LIMIT 1""",
            (hoy,),
        ).fetchone()
        pantalla = pantalla_row["page"] if pantalla_row else "—"
        # Tiempo medio de sesión (en minutos, solo sesiones cerradas hoy)
        tiempo_row = c.execute(
            """SELECT AVG((strftime('%s', last_seen_at) - strftime('%s', login_at)) / 60.0) AS avg_min
               FROM sessions WHERE DATE(login_at)=?""",
            (hoy,),
        ).fetchone()
        tiempo = round(tiempo_row["avg_min"], 1) if tiempo_row and tiempo_row["avg_min"] else 0
    return {
        "logins_hoy":       logins,
        "usuarios_unicos":  unicos,
        "exportaciones":    exports,
        "pantalla_top":     pantalla,
        "tiempo_medio_min": tiempo,
    }


@app.get("/admin/monitor/alertas", summary="Alertas activas")
def admin_monitor_alertas(_=Depends(verify_key)):
    """Genera alertas automáticas basadas en el estado de sesiones y eventos recientes."""
    alertas = []
    now = datetime.utcnow()
    with get_conn() as c:
        # Sesiones idle > 10 min pero activas
        sesiones = c.execute(
            """SELECT s.session_id, u.usuario_login, s.last_seen_at
               FROM sessions s JOIN usuarios_portal u ON u.id_usuario = s.user_id
               WHERE s.activa = 1"""
        ).fetchall()
        for s in sesiones:
            try:
                ts = datetime.fromisoformat(s["last_seen_at"])
                diff_m = (now - ts).total_seconds() / 60
                if diff_m > 30:
                    alertas.append({
                        "tipo": "idle",
                        "usuario": s["usuario_login"],
                        "mensaje": f"Sin actividad hace {int(diff_m)} min",
                        "ts": s["last_seen_at"],
                    })
            except Exception:
                pass
        # Múltiples logins simultáneos del mismo usuario
        multi = c.execute(
            """SELECT u.usuario_login, COUNT(*) AS n
               FROM sessions s JOIN usuarios_portal u ON u.id_usuario = s.user_id
               WHERE s.activa = 1 GROUP BY s.user_id HAVING n > 1"""
        ).fetchall()
        for m in multi:
            alertas.append({
                "tipo": "multi_login",
                "usuario": m["usuario_login"],
                "mensaje": f"{m['n']} sesiones simultáneas activas",
                "ts": now.isoformat(),
            })
    return alertas


# ─── Dashboard endpoints ──────────────────────────────────────────────────────

AR_OFFSET = "-3 hours"  # UTC → America/Argentina/Buenos_Aires (UTC-3, sin DST)

def _periodo_where(periodo: str) -> str:
    """Devuelve fragmento SQL WHERE para el período dado (sin el AND inicial).
    Usa offset UTC-3 para que el cambio de día ocurra a medianoche argentina,
    no a las 21:00 (que es cuando 'now' UTC pasa al día siguiente)."""
    if periodo == "hoy":
        return (
            f"AND DATE(e.timestamp_subida, '{AR_OFFSET}') = DATE('now', '{AR_OFFSET}')"
        )
    elif periodo == "mes":
        return (
            f"AND strftime('%Y-%m', e.timestamp_subida, '{AR_OFFSET}') "
            f"= strftime('%Y-%m', 'now', '{AR_OFFSET}')"
        )
    return ""  # historico: sin filtro de fecha


@app.get("/dashboard/kpis/{distribuidor_id}", summary="KPIs del dashboard por período")
def dashboard_kpis(distribuidor_id: int, periodo: str = "mes", _=Depends(verify_key)):
    pw = _periodo_where(periodo)
    with get_conn() as c:
        row = c.execute(
            f"""SELECT COUNT(*) AS total,
                SUM(CASE WHEN estado = 'Pendiente'                    THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN estado IN ('Aprobado','Destacado')       THEN 1 ELSE 0 END) AS aprobadas,
                SUM(CASE WHEN estado = 'Rechazado'                     THEN 1 ELSE 0 END) AS rechazadas,
                SUM(CASE WHEN estado = 'Destacado'                     THEN 1 ELSE 0 END) AS destacadas
                FROM exhibiciones e
                WHERE e.id_distribuidor = ? {pw}""",
            (distribuidor_id,),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(distribuidor_id: int, periodo: str = "mes", top: int = 15, _=Depends(verify_key)):
    pw = _periodo_where(periodo)
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT i.nombre_integrante AS vendedor,
                    COUNT(CASE WHEN e.estado IN ('Aprobado','Destacado') THEN 1 END) AS aprobadas,
                    COUNT(CASE WHEN e.estado = 'Destacado'               THEN 1 END) AS destacadas,
                    COUNT(CASE WHEN e.estado = 'Rechazado'               THEN 1 END) AS rechazadas,
                    (COUNT(CASE WHEN e.estado = 'Aprobado'  THEN 1 END) * 1
                     + COUNT(CASE WHEN e.estado = 'Destacado' THEN 1 END) * 2) AS puntos
                FROM exhibiciones e
                JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
                WHERE e.id_distribuidor = ? {pw}
                GROUP BY i.id_integrante, i.nombre_integrante
                HAVING puntos > 0
                ORDER BY puntos DESC, aprobadas DESC
                LIMIT ?""",
            (distribuidor_id, top),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/dashboard/ultimas-evaluadas/{distribuidor_id}", summary="Últimas fotos evaluadas con fallback de días")
def dashboard_ultimas(distribuidor_id: int, n: int = 8, _=Depends(verify_key)):
    """Busca las últimas N fotos aprobadas/destacadas.
    Si no hay fotos hoy, retrocede un día a la vez hasta encontrar (máx. 90 días)."""
    # Fecha actual en Argentina (UTC-3): evita que a las 21hs ARG el día ya sea "mañana" en UTC
    ar_today = (datetime.utcnow() - timedelta(hours=3)).date()
    with get_conn() as c:
        for days_back in range(90):
            fecha = (ar_today - timedelta(days=days_back)).isoformat()
            rows = c.execute(
                """SELECT e.id_exhibicion,
                          e.url_foto_drive                              AS drive_link,
                          e.estado,
                          COALESCE(e.tipo_pdv, '')                      AS tipo_pdv,
                          COALESCE(cl.numero_cliente_local,
                                   CAST(e.id_cliente AS TEXT), '') AS nro_cliente,
                          COALESCE(i.nombre_integrante, 'Sin nombre')   AS vendedor,
                          e.timestamp_subida
                   FROM exhibiciones e
                   LEFT JOIN integrantes_grupo i  ON i.id_integrante = e.id_integrante
                   LEFT JOIN clientes cl          ON cl.id_cliente   = e.id_cliente
                   WHERE e.id_distribuidor = ?
                     AND e.estado IN ('Aprobado', 'Destacado')
                     AND DATE(e.timestamp_subida, '-3 hours') = ?
                   ORDER BY e.timestamp_subida DESC
                   LIMIT ?""",
                (distribuidor_id, fecha, n),
            ).fetchall()
            if rows:
                return [dict(r) for r in rows]
    return []


# ─── Proxy de imagen Drive ────────────────────────────────────────────────────

@app.get("/dashboard/imagen/{file_id}", summary="Proxy de imagen privada de Google Drive")
def dashboard_imagen(file_id: str):
    """Descarga la imagen de Drive con el token OAuth del bot y la sirve directamente.
    No requiere API key: el file_id actúa como token de acceso opaco."""
    import certifi
    import requests as _req
    from fastapi.responses import Response
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request as GRequest
    except ImportError:
        raise HTTPException(status_code=503, detail="google-auth no instalado")

    # PostgreSQL puede setear REQUESTS_CA_BUNDLE a un path inválido; forzamos certifi
    _CA = certifi.where()

    token_path = Path(__file__).resolve().parent / "token_drive.json"
    if not token_path.exists():
        raise HTTPException(status_code=503, detail="token_drive.json no encontrado")

    try:
        creds = Credentials.from_authorized_user_file(str(token_path))
        if not creds.valid and creds.refresh_token:
            import google.auth.transport.requests as _gtr
            creds.refresh(_gtr.Request(session=_req.Session()))

        r = _req.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=20,
            verify=_CA,
        )
        r.raise_for_status()
        mime = r.headers.get("Content-Type", "image/jpeg").split(";")[0]
        return Response(
            content=r.content,
            media_type=mime,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─── Reportes endpoints ───────────────────────────────────────────────────────

class ReporteQuery(BaseModel):
    fecha_desde: str
    fecha_hasta: str
    vendedores: List[str] = []
    estados: List[str] = []
    tipos_pdv: List[str] = []
    nro_cliente: str = ""


@app.get("/reportes/vendedores/{distribuidor_id}", summary="Vendedores únicos para filtro de reportes")
def reportes_vendedores(distribuidor_id: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT i.nombre_integrante
               FROM exhibiciones e
               JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ? AND i.nombre_integrante IS NOT NULL
               ORDER BY i.nombre_integrante""",
            (distribuidor_id,),
        ).fetchall()
    return [r["nombre_integrante"] for r in rows]


@app.get("/reportes/tipos-pdv/{distribuidor_id}", summary="Tipos de PDV únicos para filtro de reportes")
def reportes_tipos_pdv(distribuidor_id: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT tipo_pdv FROM exhibiciones
               WHERE id_distribuidor = ? AND tipo_pdv IS NOT NULL AND tipo_pdv != ''
               ORDER BY tipo_pdv""",
            (distribuidor_id,),
        ).fetchall()
    return [r["tipo_pdv"] for r in rows]


@app.post("/reportes/exhibiciones/{distribuidor_id}", summary="Consulta de exhibiciones con filtros")
def reportes_exhibiciones(distribuidor_id: int, q: ReporteQuery, _=Depends(verify_key)):
    conditions = [
        "e.id_distribuidor = ?",
        "DATE(e.timestamp_subida, '-3 hours') >= ?",
        "DATE(e.timestamp_subida, '-3 hours') <= ?",
    ]
    params: list = [distribuidor_id, q.fecha_desde, q.fecha_hasta]

    if q.vendedores:
        placeholders = ",".join("?" * len(q.vendedores))
        conditions.append(f"i.nombre_integrante IN ({placeholders})")
        params.extend(q.vendedores)

    if q.estados:
        placeholders = ",".join("?" * len(q.estados))
        conditions.append(f"e.estado IN ({placeholders})")
        params.extend(q.estados)

    if q.tipos_pdv:
        placeholders = ",".join("?" * len(q.tipos_pdv))
        conditions.append(f"e.tipo_pdv IN ({placeholders})")
        params.extend(q.tipos_pdv)

    if q.nro_cliente.strip():
        conditions.append("cl.numero_cliente_local LIKE ?")
        params.append(f"%{q.nro_cliente.strip()}%")

    where = " AND ".join(conditions)

    with get_conn() as c:
        rows = c.execute(
            f"""SELECT
                    e.id_exhibicion,
                    COALESCE(i.nombre_integrante, 'Sin nombre') AS vendedor,
                    COALESCE(cl.numero_cliente_local, CAST(e.id_cliente AS TEXT), '') AS cliente,
                    COALESCE(e.tipo_pdv, '') AS tipo_pdv,
                    e.estado,
                    COALESCE(e.supervisor_nombre, '') AS supervisor,
                    COALESCE(e.comentario_evaluacion, '') AS comentario,
                    e.timestamp_subida AS fecha_carga,
                    e.evaluated_at    AS fecha_evaluacion,
                    COALESCE(e.url_foto_drive, '') AS link_foto
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               LEFT JOIN clientes cl          ON cl.id_cliente   = e.id_cliente
               WHERE {where}
               ORDER BY e.timestamp_subida DESC""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Bonos endpoints ─────────────────────────────────────────────────────────

class BonusConfigPayload(BaseModel):
    anio: int
    mes: int
    umbral: int = 0
    monto_bono_fijo: float = 0.0
    monto_por_punto: float = 0.0
    puestos: List[dict] = []   # [{puesto, premio_si_llego, premio_si_no_llego}]


@app.get("/bonos/config/{id_distribuidor}", summary="Obtener config de bonos del mes")
def bonos_get_config(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_key)):
    """Devuelve la configuración de bonos + puestos para un mes dado.
    Si no existe la fila, devuelve valores en cero (config vacía)."""
    with get_conn() as c:
        cfg = c.execute(
            """SELECT * FROM bonos_config
               WHERE id_distribuidor=? AND anio=? AND mes=?""",
            (id_distribuidor, anio, mes),
        ).fetchone()
        if not cfg:
            return {
                "id_config": None,
                "anio": anio, "mes": mes,
                "umbral": 0, "monto_bono_fijo": 0.0, "monto_por_punto": 0.0,
                "edicion_bloqueada": 0,
                "puestos": [],
            }
        cfg_dict = dict(cfg)
        puestos = c.execute(
            "SELECT puesto, premio_si_llego, premio_si_no_llego FROM bonos_ranking WHERE id_config=? ORDER BY puesto",
            (cfg_dict["id_config"],),
        ).fetchall()
        cfg_dict["puestos"] = [dict(p) for p in puestos]
    return cfg_dict


@app.post("/bonos/config/{id_distribuidor}/guardar", summary="Guardar config de bonos del mes")
def bonos_guardar_config(id_distribuidor: int, payload: BonusConfigPayload, _=Depends(verify_key)):
    """Upsert de bonos_config + reescribe filas de bonos_ranking.
    Rechaza si edicion_bloqueada=1."""
    with get_conn() as c:
        # Verificar bloqueo
        existing = c.execute(
            "SELECT id_config, edicion_bloqueada FROM bonos_config WHERE id_distribuidor=? AND anio=? AND mes=?",
            (id_distribuidor, payload.anio, payload.mes),
        ).fetchone()
        if existing and existing["edicion_bloqueada"]:
            raise HTTPException(status_code=403, detail="Configuración bloqueada por el superadmin")

        # Upsert config
        c.execute(
            """INSERT INTO bonos_config(id_distribuidor, anio, mes, umbral, monto_bono_fijo, monto_por_punto, modificado_en)
               VALUES(?,?,?,?,?,?, CURRENT_TIMESTAMP)
               ON CONFLICT(id_distribuidor, anio, mes) DO UPDATE SET
                   umbral=excluded.umbral,
                   monto_bono_fijo=excluded.monto_bono_fijo,
                   monto_por_punto=excluded.monto_por_punto,
                   modificado_en=CURRENT_TIMESTAMP""",
            (id_distribuidor, payload.anio, payload.mes,
             payload.umbral, payload.monto_bono_fijo, payload.monto_por_punto),
        )
        id_config = c.execute(
            "SELECT id_config FROM bonos_config WHERE id_distribuidor=? AND anio=? AND mes=?",
            (id_distribuidor, payload.anio, payload.mes),
        ).fetchone()["id_config"]

        # Reescribir puestos
        c.execute("DELETE FROM bonos_ranking WHERE id_config=?", (id_config,))
        for p in payload.puestos:
            c.execute(
                "INSERT INTO bonos_ranking(id_config, puesto, premio_si_llego, premio_si_no_llego) VALUES(?,?,?,?)",
                (id_config, p["puesto"], p.get("premio_si_llego", 0), p.get("premio_si_no_llego", 0)),
            )
        c.execute("COMMIT")
    return {"ok": True, "id_config": id_config}


@app.post("/bonos/config/{id_distribuidor}/bloquear", summary="Bloquear/desbloquear config (superadmin)")
def bonos_bloquear(id_distribuidor: int, anio: int, mes: int, bloquear: int = 1, _=Depends(verify_key)):
    """bloquear=1 bloquea, bloquear=0 desbloquea. Solo superadmin debería llamar esto."""
    with get_conn() as c:
        c.execute(
            "UPDATE bonos_config SET edicion_bloqueada=? WHERE id_distribuidor=? AND anio=? AND mes=?",
            (bloquear, id_distribuidor, anio, mes),
        )
        c.execute("COMMIT")
    return {"ok": True, "edicion_bloqueada": bloquear}


@app.get("/bonos/liquidacion/{id_distribuidor}", summary="Liquidación de bonos del mes")
def bonos_liquidacion(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_key)):
    """Calcula el bono final de cada vendedor para el mes dado.
    Lógica:
      - puntos = COUNT(Aprobado)*1 + COUNT(Destacado)*2
      - ranking por puntos DESC
      - Si puntos >= umbral → bono = monto_bono_fijo + premio_si_llego[puesto]
      - Si puntos <  umbral → bono = puntos * monto_por_punto + premio_si_no_llego[puesto]
    """
    with get_conn() as c:
        # Config del mes
        cfg = c.execute(
            "SELECT * FROM bonos_config WHERE id_distribuidor=? AND anio=? AND mes=?",
            (id_distribuidor, anio, mes),
        ).fetchone()
        umbral         = cfg["umbral"]          if cfg else 0
        bono_fijo      = cfg["monto_bono_fijo"] if cfg else 0.0
        por_punto      = cfg["monto_por_punto"] if cfg else 0.0
        id_config      = cfg["id_config"]       if cfg else None

        # Puestos / premios
        puestos_map: dict = {}
        if id_config:
            for p in c.execute(
                "SELECT puesto, premio_si_llego, premio_si_no_llego FROM bonos_ranking WHERE id_config=? ORDER BY puesto",
                (id_config,),
            ).fetchall():
                puestos_map[p["puesto"]] = dict(p)

        # Puntos del mes por vendedor
        rows = c.execute(
            """SELECT i.id_integrante, i.nombre_integrante AS vendedor,
                      COUNT(CASE WHEN e.estado = 'Aprobado'  THEN 1 END) AS aprobadas,
                      COUNT(CASE WHEN e.estado = 'Destacado' THEN 1 END) AS destacadas,
                      (COUNT(CASE WHEN e.estado = 'Aprobado'  THEN 1 END) * 1
                       + COUNT(CASE WHEN e.estado = 'Destacado' THEN 1 END) * 2) AS puntos
               FROM exhibiciones e
               JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ?
                 AND strftime('%Y', e.timestamp_subida, '-3 hours') = ?
                 AND strftime('%m', e.timestamp_subida, '-3 hours') = ?
               GROUP BY i.id_integrante, i.nombre_integrante
               HAVING puntos > 0
               ORDER BY puntos DESC, aprobadas DESC""",
            (id_distribuidor, str(anio), f"{mes:02d}"),
        ).fetchall()

    resultado = []
    for pos, r in enumerate(rows, start=1):
        d = dict(r)
        puntos = d["puntos"]
        info_puesto = puestos_map.get(pos, {})
        llego = puntos >= umbral
        if llego:
            bono = bono_fijo + info_puesto.get("premio_si_llego", 0.0)
        else:
            bono = puntos * por_punto + info_puesto.get("premio_si_no_llego", 0.0)
        resultado.append({
            "puesto":     pos,
            "vendedor":   d["vendedor"],
            "aprobadas":  d["aprobadas"],
            "destacadas": d["destacadas"],
            "puntos":     puntos,
            "llego_umbral": llego,
            "bono":       round(bono, 2),
        })
    return {
        "anio": anio, "mes": mes,
        "umbral": umbral, "monto_bono_fijo": bono_fijo, "monto_por_punto": por_punto,
        "vendedores": resultado,
    }


@app.get("/bonos/detalle/{id_distribuidor}", summary="Detalle de exhibiciones de un vendedor en el mes")
def bonos_detalle(id_distribuidor: int, id_integrante: int, anio: int, mes: int, _=Depends(verify_key)):
    """Devuelve cada exhibición evaluada de un vendedor en el mes, para auditoría."""
    with get_conn() as c:
        rows = c.execute(
            """SELECT e.id_exhibicion,
                      DATE(e.timestamp_subida, '-3 hours') AS fecha,
                      e.estado,
                      COALESCE(cl.numero_cliente_local, CAST(e.id_cliente AS TEXT), '') AS nro_cliente,
                      COALESCE(e.tipo_pdv, '') AS tipo_pdv
               FROM exhibiciones e
               LEFT JOIN clientes cl ON cl.id_cliente = e.id_cliente
               WHERE e.id_distribuidor = ?
                 AND e.id_integrante   = ?
                 AND e.estado IN ('Aprobado','Destacado','Rechazado')
                 AND strftime('%Y', e.timestamp_subida, '-3 hours') = ?
                 AND strftime('%m', e.timestamp_subida, '-3 hours') = ?
               ORDER BY e.timestamp_subida ASC""",
            (id_distribuidor, id_integrante, str(anio), f"{mes:02d}"),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Admin: Locations / Clientes / Asignación ────────────────────────────────

class AsignarVendedorRequest(BaseModel):
    id_integrante: int | None = None   # None = desasignar (poner NULL)


@app.get("/admin/locations/{dist_id}", summary="Sucursales de un distribuidor")
def admin_get_locations(dist_id: int, _=Depends(verify_key)):
    """Retorna todas las sucursales (locations) de un distribuidor."""
    with get_conn() as c:
        rows = c.execute(
            """SELECT location_id, ciudad, provincia, label
               FROM locations
               WHERE dist_id = ?
               ORDER BY label""",
            (dist_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/admin/vendedores-by-location/{location_id}", summary="Vendedores de una sucursal")
def admin_vendedores_by_location(location_id: int, dist_id: int, _=Depends(verify_key)):
    """
    Retorna los vendedores asignados a una sucursal específica.
    Agrupa por telegram_user_id para evitar duplicados multi-grupo.
    """
    with get_conn() as c:
        rows = c.execute(
            """SELECT id_integrante, nombre_integrante, telegram_user_id
               FROM integrantes_grupo
               WHERE location_id = ? AND id_distribuidor = ?
                 AND rol_telegram = 'vendedor'
               GROUP BY telegram_user_id
               ORDER BY nombre_integrante""",
            (location_id, dist_id),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/admin/clientes", summary="Clientes con filtros en cascada")
def admin_get_clientes(
    dist_id: int,
    location_id: int = None,
    id_vendedor: int = None,
    sin_asignar: bool = False,
    _=Depends(verify_key),
):
    """
    Lista clientes con nombre del vendedor asignado.
    Filtros opcionales (se combinan con AND):
      - location_id  → filtra por sucursal
      - id_vendedor  → filtra por vendedor específico (id_integrante)
      - sin_asignar  → True para solo los sin vendedor asignado (id_vendedor IS NULL)
    """
    conditions = ["c.id_distribuidor = ?"]
    params: list = [dist_id]

    if location_id is not None:
        conditions.append("c.location_id = ?")
        params.append(location_id)

    if sin_asignar:
        conditions.append("c.id_vendedor IS NULL")
    elif id_vendedor is not None:
        conditions.append("c.id_vendedor = ?")
        params.append(id_vendedor)

    where = " AND ".join(conditions)
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT
                   c.id_cliente,
                   c.numero_cliente_local,
                   COALESCE(c.nombre_fantasia, '') AS nombre_fantasia,
                   c.location_id,
                   c.id_vendedor,
                   COALESCE(ig.nombre_integrante, '') AS nombre_vendedor,
                   COALESCE(l.ciudad, '')             AS sucursal_ciudad,
                   COALESCE(l.label,  '')             AS sucursal_label
               FROM clientes c
               LEFT JOIN integrantes_grupo ig ON ig.id_integrante = c.id_vendedor
               LEFT JOIN locations l ON l.location_id = c.location_id
               WHERE {where}
               ORDER BY c.numero_cliente_local""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


@app.put("/admin/clientes/{id_cliente}/vendedor", summary="Asignar o reasignar vendedor a un cliente")
def admin_asignar_vendedor(
    id_cliente: int, req: AsignarVendedorRequest, _=Depends(verify_key)
):
    """
    Asigna (o des-asigna con id_integrante=null) el vendedor de un cliente.
    Es el punto de corrección manual desde el Panel Admin.
    """
    with get_conn() as c:
        cur = c.execute(
            "UPDATE clientes SET id_vendedor = ? WHERE id_cliente = ?",
            (req.id_integrante, id_cliente),
        )
        c.execute("COMMIT")
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True, "id_cliente": id_cliente, "id_integrante": req.id_integrante}


# ─── Dashboard: stats por sucursal ───────────────────────────────────────────

@app.get("/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
def dashboard_por_sucursal(distribuidor_id: int, periodo: str = "mes", _=Depends(verify_key)):
    """
    Retorna aprobadas y rechazadas agrupadas por sucursal (location).
    Útil para el gráfico de barras comparativo del Dashboard.
    La cadena es: exhibicion → integrante → location.
    """
    pw = _periodo_where(periodo)
    with get_conn() as c:
        rows = c.execute(
            f"""SELECT
                   COALESCE(l.label, l.ciudad, 'Sin sucursal') AS sucursal,
                   l.location_id,
                   COUNT(CASE WHEN e.estado IN ('Aprobado','Destacado') THEN 1 END) AS aprobadas,
                   COUNT(CASE WHEN e.estado = 'Rechazado'               THEN 1 END) AS rechazadas,
                   COUNT(*) AS total
               FROM exhibiciones e
               JOIN integrantes_grupo ig ON ig.id_integrante = e.id_integrante
               LEFT JOIN locations l ON l.location_id = ig.location_id
               WHERE e.id_distribuidor = ? {pw}
               GROUP BY ig.location_id
               ORDER BY aprobadas DESC""",
            (distribuidor_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Entry point (desarrollo) ─────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)