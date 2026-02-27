# -*- coding: utf-8 -*-
"""
ShelfMind — Backend API (FastAPI)
==================================
Arrancar:
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Exponer al mundo:
    cloudflared tunnel --url http://localhost:8000

La URL de Cloudflare va en st.secrets["API_URL"].
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Configuración ────────────────────────────────────────────────────────────
API_KEY = os.environ.get("SHELFMIND_API_KEY", "shelfmind-clave-2025")
DB_PATH = Path(__file__).resolve().parent / "base_datos" / "centermind.db"

app = FastAPI(title="ShelfMind API", version="2.0.0")

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


# ─── Seguridad ────────────────────────────────────────────────────────────────

def verify_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API Key inválida")


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

class ReporteFiltros(BaseModel):
    fecha_desde: str
    fecha_hasta: str
    vendedores: List[str] = []
    estados: List[str] = []
    tipos_pdv: List[str] = []
    nro_cliente: str = ""

class DistribuidoraRequest(BaseModel):
    nombre: str
    token: str
    carpeta_drive: str = ""
    ruta_cred: str = ""

class UsuarioCreateRequest(BaseModel):
    dist_id: int
    login: str
    password: str
    rol: str

class UsuarioEditRequest(BaseModel):
    login: str
    rol: str
    password: str = ""

class RolRequest(BaseModel):
    rol: str
    distribuidor_id: Optional[int] = None


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/login")
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


# ═══════════════════════════════════════════════════════════════════════════════
# VISOR — Pendientes y evaluación
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/pendientes/{id_distribuidor}")
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


@app.get("/stats/{id_distribuidor}")
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


@app.get("/vendedores/{id_distribuidor}")
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


@app.post("/evaluar")
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


@app.post("/revertir")
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


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/dashboard/kpis/{id_distribuidor}")
def dashboard_kpis(id_distribuidor: int, periodo: str = "mes", _=Depends(verify_key)):
    now = datetime.now()
    where_extra = ""
    if periodo == "hoy":
        hoy = now.strftime("%Y-%m-%d")
        where_extra = f" AND DATE(timestamp_subida) = '{hoy}'"
    elif periodo == "mes":
        mes_inicio = now.replace(day=1).strftime("%Y-%m-%d")
        where_extra = f" AND timestamp_subida >= '{mes_inicio}'"

    with get_conn() as c:
        row = c.execute(
            f"""SELECT COUNT(*) total,
                   SUM(CASE WHEN estado='Aprobado'  THEN 1 ELSE 0 END) aprobadas,
                   SUM(CASE WHEN estado='Destacado' THEN 1 ELSE 0 END) destacadas,
                   SUM(CASE WHEN estado='Rechazado' THEN 1 ELSE 0 END) rechazadas,
                   SUM(CASE WHEN estado='Pendiente' THEN 1 ELSE 0 END) pendientes
               FROM exhibiciones
               WHERE id_distribuidor = ?{where_extra}""",
            (id_distribuidor,),
        ).fetchone()
    r = dict(row) if row else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/dashboard/ranking/{id_distribuidor}")
def dashboard_ranking(id_distribuidor: int, periodo: str = "mes", top: int = 15, _=Depends(verify_key)):
    now = datetime.now()
    where_extra = ""
    if periodo == "hoy":
        hoy = now.strftime("%Y-%m-%d")
        where_extra = f" AND DATE(e.timestamp_subida) = '{hoy}'"
    elif periodo == "mes":
        mes_inicio = now.replace(day=1).strftime("%Y-%m-%d")
        where_extra = f" AND e.timestamp_subida >= '{mes_inicio}'"

    with get_conn() as c:
        rows = c.execute(
            f"""SELECT i.nombre_integrante AS vendedor,
                   SUM(CASE WHEN e.estado IN ('Aprobado','Destacado') THEN 1 ELSE 0 END) aprobadas,
                   SUM(CASE WHEN e.estado = 'Destacado' THEN 1 ELSE 0 END) destacadas,
                   SUM(CASE WHEN e.estado = 'Rechazado' THEN 1 ELSE 0 END) rechazadas,
                   COUNT(*) total
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               WHERE e.id_distribuidor = ?{where_extra}
               GROUP BY e.id_integrante
               ORDER BY aprobadas DESC, destacadas DESC
               LIMIT ?""",
            (id_distribuidor, top),
        ).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["puntos"] = d["aprobadas"] + d["destacadas"]
        result.append(d)
    return result


@app.get("/dashboard/ultimas-evaluadas/{id_distribuidor}")
def dashboard_ultimas_evaluadas(id_distribuidor: int, n: int = 8, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT e.url_foto_drive       AS drive_link,
                      e.estado,
                      e.evaluated_at,
                      c.numero_cliente_local AS nro_cliente,
                      e.tipo_pdv,
                      i.nombre_integrante    AS vendedor
               FROM exhibiciones e
               LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
               LEFT JOIN clientes c          ON c.id_cliente    = e.id_cliente
               WHERE e.id_distribuidor = ?
                 AND e.estado IN ('Aprobado','Destacado')
                 AND e.url_foto_drive IS NOT NULL
               ORDER BY e.evaluated_at DESC
               LIMIT ?""",
            (id_distribuidor, n),
        ).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════════════
# REPORTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/reportes/vendedores/{id_distribuidor}")
def reportes_vendedores(id_distribuidor: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT nombre_integrante FROM integrantes_grupo
               WHERE id_distribuidor = ? AND nombre_integrante IS NOT NULL
               ORDER BY nombre_integrante""",
            (id_distribuidor,),
        ).fetchall()
    return [r[0] for r in rows]


@app.get("/reportes/tipos-pdv/{id_distribuidor}")
def reportes_tipos_pdv(id_distribuidor: int, _=Depends(verify_key)):
    with get_conn() as c:
        rows = c.execute(
            """SELECT DISTINCT tipo_pdv FROM exhibiciones
               WHERE id_distribuidor = ? AND tipo_pdv IS NOT NULL
               ORDER BY tipo_pdv""",
            (id_distribuidor,),
        ).fetchall()
    return [r[0] for r in rows if r[0]]


@app.post("/reportes/exhibiciones/{id_distribuidor}")
def reportes_exhibiciones(id_distribuidor: int, filtros: ReporteFiltros, _=Depends(verify_key)):
    wheres = [
        "e.id_distribuidor = ?",
        "DATE(e.timestamp_subida) >= ?",
        "DATE(e.timestamp_subida) <= ?",
    ]
    params: list = [id_distribuidor, filtros.fecha_desde, filtros.fecha_hasta]

    if filtros.vendedores:
        ph = ",".join("?" * len(filtros.vendedores))
        wheres.append(f"i.nombre_integrante IN ({ph})")
        params.extend(filtros.vendedores)

    if filtros.estados:
        ph = ",".join("?" * len(filtros.estados))
        wheres.append(f"e.estado IN ({ph})")
        params.extend(filtros.estados)

    if filtros.tipos_pdv:
        ph = ",".join("?" * len(filtros.tipos_pdv))
        wheres.append(f"e.tipo_pdv IN ({ph})")
        params.extend(filtros.tipos_pdv)

    if filtros.nro_cliente.strip():
        wheres.append("c.numero_cliente_local LIKE ?")
        params.append(f"%{filtros.nro_cliente.strip()}%")

    sql = f"""
        SELECT e.id_exhibicion,
               i.nombre_integrante     AS vendedor,
               c.numero_cliente_local  AS cliente,
               e.tipo_pdv,
               e.estado,
               e.supervisor_nombre     AS supervisor,
               e.comentario_evaluacion AS comentario,
               e.timestamp_subida      AS fecha_carga,
               e.evaluated_at          AS fecha_evaluacion,
               e.url_foto_drive        AS link_foto
        FROM exhibiciones e
        LEFT JOIN integrantes_grupo i ON i.id_integrante = e.id_integrante
        LEFT JOIN clientes c          ON c.id_cliente    = e.id_cliente
        WHERE {" AND ".join(wheres)}
        ORDER BY e.timestamp_subida DESC
    """
    with get_conn() as c:
        rows = c.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — Distribuidoras
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/distribuidoras")
def admin_get_distribuidoras(solo_activas: bool = True, _=Depends(verify_key)):
    with get_conn() as c:
        if solo_activas:
            rows = c.execute(
                """SELECT id_distribuidor AS id, nombre_empresa AS nombre, estado
                   FROM distribuidores WHERE estado = 'activo' ORDER BY nombre_empresa"""
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT id_distribuidor AS id, nombre_empresa AS nombre,
                          token_bot, ruta_credencial_drive, id_carpeta_drive, estado
                   FROM distribuidores ORDER BY nombre_empresa"""
            ).fetchall()
    return [dict(r) for r in rows]


@app.post("/admin/distribuidoras")
def admin_crear_distribuidora(req: DistribuidoraRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                """INSERT INTO distribuidores
                   (nombre_empresa, token_bot, id_carpeta_drive, ruta_credencial_drive, estado)
                   VALUES (?,?,?,?,'activo')""",
                (req.nombre.strip(), req.token.strip(), req.carpeta_drive.strip(), req.ruta_cred.strip()),
            )
            c.commit()
        return {"ok": True}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/admin/distribuidoras/{dist_id}")
def admin_editar_distribuidora(dist_id: int, req: DistribuidoraRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                """UPDATE distribuidores
                   SET nombre_empresa=?, token_bot=?, id_carpeta_drive=?, ruta_credencial_drive=?
                   WHERE id_distribuidor=?""",
                (req.nombre.strip(), req.token.strip(), req.carpeta_drive.strip(), req.ruta_cred.strip(), dist_id),
            )
            c.commit()
        return {"ok": True}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.patch("/admin/distribuidoras/{dist_id}/estado")
def admin_toggle_distribuidora(dist_id: int, estado: str = Query(...), _=Depends(verify_key)):
    with get_conn() as c:
        c.execute("UPDATE distribuidores SET estado=? WHERE id_distribuidor=?", (estado, dist_id))
        c.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — Usuarios del portal
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/usuarios")
def admin_get_usuarios(dist_id: Optional[int] = None, _=Depends(verify_key)):
    with get_conn() as c:
        if dist_id:
            rows = c.execute(
                """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor, d.nombre_empresa
                   FROM usuarios_portal u
                   JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
                   WHERE u.id_distribuidor = ? ORDER BY u.rol, u.usuario_login""",
                (dist_id,),
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT u.id_usuario, u.usuario_login, u.rol, u.id_distribuidor, d.nombre_empresa
                   FROM usuarios_portal u
                   JOIN distribuidores d ON d.id_distribuidor = u.id_distribuidor
                   ORDER BY d.nombre_empresa, u.rol, u.usuario_login"""
            ).fetchall()
    return [dict(r) for r in rows]


@app.post("/admin/usuarios")
def admin_crear_usuario(req: UsuarioCreateRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            c.execute(
                "INSERT INTO usuarios_portal (id_distribuidor, usuario_login, password, rol) VALUES (?,?,?,?)",
                (req.dist_id, req.login.strip(), req.password.strip(), req.rol),
            )
            c.commit()
        return {"ok": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Usuario ya existe")


@app.put("/admin/usuarios/{user_id}")
def admin_editar_usuario(user_id: int, req: UsuarioEditRequest, _=Depends(verify_key)):
    try:
        with get_conn() as c:
            if req.password:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=?, password=? WHERE id_usuario=?",
                    (req.login.strip(), req.rol, req.password.strip(), user_id),
                )
            else:
                c.execute(
                    "UPDATE usuarios_portal SET usuario_login=?, rol=? WHERE id_usuario=?",
                    (req.login.strip(), req.rol, user_id),
                )
            c.commit()
        return {"ok": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Login ya existe")


@app.delete("/admin/usuarios/{user_id}")
def admin_eliminar_usuario(user_id: int, _=Depends(verify_key)):
    with get_conn() as c:
        c.execute("DELETE FROM usuarios_portal WHERE id_usuario=?", (user_id,))
        c.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — Integrantes Telegram
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/integrantes")
def admin_get_integrantes(dist_id: Optional[int] = None, _=Depends(verify_key)):
    with get_conn() as c:
        if dist_id:
            rows = c.execute(
                """SELECT i.id_integrante, i.nombre_integrante, i.telegram_user_id,
                          i.rol_telegram, i.telegram_group_id, g.nombre_grupo, d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d ON d.id_distribuidor = i.id_distribuidor
                   LEFT JOIN grupos g    ON g.telegram_chat_id = i.telegram_group_id
                   WHERE i.id_distribuidor = ? ORDER BY i.rol_telegram, i.nombre_integrante""",
                (dist_id,),
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT i.id_integrante, i.nombre_integrante, i.telegram_user_id,
                          i.rol_telegram, i.telegram_group_id, g.nombre_grupo, d.nombre_empresa
                   FROM integrantes_grupo i
                   JOIN distribuidores d ON d.id_distribuidor = i.id_distribuidor
                   LEFT JOIN grupos g    ON g.telegram_chat_id = i.telegram_group_id
                   ORDER BY d.nombre_empresa, i.rol_telegram, i.nombre_integrante"""
            ).fetchall()
    return [dict(r) for r in rows]


@app.put("/admin/integrantes/{id_integrante}/rol")
def admin_set_rol_integrante(id_integrante: int, req: RolRequest, _=Depends(verify_key)):
    with get_conn() as c:
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
        changed = c.execute("SELECT changes()").fetchone()[0]
        c.commit()
    if not changed:
        raise HTTPException(status_code=403, detail="Sin permisos o integrante no encontrado")
    return {"ok": True}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
