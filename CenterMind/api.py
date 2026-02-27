# -*- coding: utf-8 -*-
"""
ShelfMind — Backend API (FastAPI)
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
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Configuración ────────────────────────────────────────────────────────────
# Configura esta clave antes de usar. Puedes pasarla como variable de entorno:
#   set SHELFMIND_API_KEY=tu-clave-secreta   (Windows)
#   export SHELFMIND_API_KEY=tu-clave-secreta (Linux/Mac)
API_KEY = os.environ.get("SHELFMIND_API_KEY", "shelfmind-clave-2025")

DB_PATH = Path(__file__).resolve().parent / "base_datos" / "centermind.db"

app = FastAPI(title="ShelfMind API", version="1.0.0")

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


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    usuario: str
    password: str


class EvaluarRequest(BaseModel):
    ids_exhibicion: List[int]
    estado: str
    supervisor: str
    comentario: str = ""


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


# ─── Entry point (desarrollo) ─────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
