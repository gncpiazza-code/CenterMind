# -*- coding: utf-8 -*-
"""
Shelfy -- Backend API (FastAPI + Supabase)
==========================================
Arrancar:  uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import os
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
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Header
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import base64

from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
from services.erp_ingestion_service import erp_service
from services.erp_summary_service import erp_summary_service
import io
from apscheduler.schedulers.background import BackgroundScheduler

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

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Header, Request
from telegram import Update
from bot_worker import BotWorker

from db import sb  # Supabase client singleton

import logging

# Configuración de logging para producción (Railway)
logging.basicConfig(
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    level=logging.INFO
)
logger = logging.getLogger("ShelfyAPI")

bots = {}
WEBHOOK_URL = os.environ.get("WEBHOOK_URL") # E.g. https://midominio.com
scheduler = BackgroundScheduler()

def erp_automatic_sync():
    """Tarea programada para buscar y procesar archivos en Downloads automáticamente."""
    logger.info("⏰ Ejecutando sincronización automática ERP...")
    # Rutas por defecto basadas en los ejemplos del usuario
    downloads_path = str(Path.home() / "Downloads")
    clientes_file = os.path.join(downloads_path, "resultados_Reporte.PadronDeClientes (3).xlsx")
    ventas_file   = os.path.join(downloads_path, "resultados_Reporte.InformeDeVentas (3).xlsx")
    
    try:
        if os.path.exists(clientes_file):
            logger.info(f"Procesando clientes desde {clientes_file}")
            erp_service.ingest_clientes(clientes_file)
        if os.path.exists(ventas_file):
            logger.info(f"Procesando ventas desde {ventas_file}")
            erp_service.ingest_ventas(ventas_file)
            
        # --- Cruce de datos (Fase C) ---
        # Consolidamos deudas para T&H (ID 3 de ejemplo) y otros mapeados
        for dist_id in erp_service.mapping.values():
            erp_summary_service.consolidate_debt(dist_id)
            
    except Exception as e:
        logger.error(f"❌ Error en sincronización automática: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─── Startup ──────────────────────────────────────────────────────────────
    logger.info("🚀 Iniciando gestor de bots Webhook...")
    try:
        res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa").eq("estado", "activo").execute()
        distribuidores = res.data if res.data else []
    except Exception as e:
        logger.error(f"❌ Error consultando distribuidores: {e}")
        distribuidores = []
    
    for dist in distribuidores:
        d_id = dist["id_distribuidor"]
        try:
            worker = BotWorker(distribuidor_id=d_id)
            ptb_app = worker.build_app()
            await ptb_app.initialize()
            
            if WEBHOOK_URL:
                webhook_path = f"{WEBHOOK_URL.rstrip('/')}/api/telegram/webhook/{d_id}"
                await ptb_app.bot.set_webhook(url=webhook_path)
                logger.info(f"✅ Bot {d_id} ({dist['nombre_empresa']}) - Webhook OK: {webhook_path}")
            else:
                logger.warning(f"⚠️ Bot {d_id} ({dist['nombre_empresa']}) - WEBHOOK_URL no definida")
                
            await ptb_app.start()
            bots[d_id] = ptb_app
        except Exception as e:
            logger.error(f"❌ Error iniciando bot {d_id}: {e}")
            
    # --- Scheduler Startup ---
    # Programado para las 04:00 AM todos los días
    scheduler.add_job(erp_automatic_sync, 'cron', hour=4, minute=0)
    scheduler.start()
    logger.info("📅 Scheduler iniciado (ERP Sync programado 04:00 AM)")

    yield
    
    # ─── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("🛑 Deteniendo bots...")
    for d_id, ptb_app in bots.items():
        try:
            await ptb_app.stop()
            await ptb_app.shutdown()
        except Exception as e:
            logger.error(f"Error deteniendo bot {d_id}: {e}")
    bots.clear()
    
    # --- Scheduler Shutdown ---
    scheduler.shutdown()
    logger.info("📅 Scheduler detenido")


app = FastAPI(title="Shelfy API", version="2.0.0", lifespan=lifespan)

# ─── Health Check (para Railway) ──────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "bots_active": list(bots.keys()),
        "webhook_url": WEBHOOK_URL
    }

# CORS: permite peticiones desde cualquier origen para evitar bloqueos en la migración
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Webhook Endpoint ────────────────────────────────────────────────────────
@app.post("/api/telegram/webhook/{id_distribuidor}", tags=["Telegram Webhook"])
async def telegram_webhook(id_distribuidor: int, request: Request):
    if id_distribuidor not in bots:
        logger.warning(f"⚠️ Webhook recibido para bot inactivo: {id_distribuidor}")
        raise HTTPException(status_code=404, detail="Bot inactivo o no encontrado")
    
    ptb_app = bots[id_distribuidor]
    try:
        data = await request.json()
        update = Update.de_json(data, ptb_app.bot)
        await ptb_app.process_update(update)
        return {"ok": True}
    except Exception as e:
        logger.error(f"❌ Error procesando webhook para bot {id_distribuidor}: {e}")
        return {"ok": False, "error": str(e)}


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


# ─── Seguridad combinada: acepta API Key (bot/Streamlit) O JWT (React) ────────

def verify_auth(
    x_api_key: str = Header(None),
    authorization: str = Header(None),
):
    """Acepta cualquiera de los dos métodos de autenticación:
    - X-Api-Key: <clave>  → bot de Telegram (compatibilidad)
    - Authorization: Bearer <jwt> → frontend React
    """
    if x_api_key:
        if x_api_key != API_KEY:
            raise HTTPException(status_code=401, detail="API Key inválida")
        return {"method": "api_key"}

    if authorization:
        if not JWT_AVAILABLE:
            raise HTTPException(status_code=503, detail="JWT no disponible")
        try:
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token:
                raise HTTPException(status_code=401, detail="Formato inválido")
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Token JWT inválido o expirado")

    raise HTTPException(status_code=401, detail="Se requiere autenticación (X-Api-Key o Bearer token)")


# ─── Modelos Pydantic ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    usuario: str
    password: str


class EvaluarRequest(BaseModel):
    ids_exhibicion: List[int]
    estado: str
    supervisor: str
    comentario: str = ""

class IntegranteUpdateRequest(BaseModel):
    nombre_integrante: str
    rol_telegram: str | None = None

class LocationRequest(BaseModel):
    ciudad: str
    provincia: str
    label: str
    lat: float | None = 0.0
    lon: float | None = 0.0


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


# ─── Módulo ERP: Carga Manual (Fase A) ───────────────────────────────────────

@app.post("/api/admin/erp/upload-global", tags=["ERP Admin"], summary="Carga manual de archivos globales del ERP")
async def erp_upload_global(
    tipo: str = Query(..., description="Tipo de archivo: 'ventas' o 'clientes'"),
    file: UploadFile = File(...),
    _=Depends(verify_auth)
):
    """Permite subir los archivos globales InformeDeVentas o PadronDeClientes."""
    if tipo not in ["ventas", "clientes"]:
        raise HTTPException(status_code=400, detail="Tipo inválido. Usa 'ventas' o 'clientes'.")
    
    try:
        content = await file.read()
        file_io = io.BytesIO(content)
        
        if tipo == "clientes":
            processed = erp_service.ingest_clientes(file_io)
            msg = f"Iniciado procesamiento de Padrón de Clientes. {processed} registros identificados."
        else:
            processed = erp_service.ingest_ventas(file_io)
            msg = f"Iniciado procesamiento de Informe de Ventas. {processed} registros identificados."
            
        return {"status": "success", "message": msg, "count": processed}
    except Exception as e:
        logger.error(f"Error en carga manual ERP ({tipo}): {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando archivo: {str(e)}")



@app.get("/api/public/landing-stats", summary="Estadisticas publicas para la Landing Page")
def public_landing_stats():
    try:
        result = sb.rpc("fn_landing_stats", {}).execute()
        if result.data:
            return result.data[0]
        return {"auditorias_pdv": 0, "miembros_activos": 0, "sucursales_vinculadas": 0}
    except Exception:
        return {"auditorias_pdv": 2500, "miembros_activos": 150, "sucursales_vinculadas": 50}

def check_distributor_status(dist_id: int, user_payload: dict):
    """Verifica si la distribuidora está bloqueada. Los SuperAdmins hacen bypass."""
    if user_payload.get("is_superadmin"):
        return
    
    res = sb.table("distribuidores").select("estado_operativo, motivo_bloqueo").eq("id_distribuidor", dist_id).execute()
    if res.data:
        status = res.data[0].get("estado_operativo", "Activo")
        if status != "Activo":
            motivo = res.data[0].get("motivo_bloqueo") or "Bloqueo por administración"
            raise HTTPException(status_code=403, detail=f"Distribuidora bloqueada: {motivo}")

@app.post("/login", summary="Autenticacion de usuario")
def login(req: LoginRequest, _=Depends(verify_auth)):
    result = sb.rpc("fn_login", {"p_usuario": req.usuario.strip(), "p_password": req.password.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    return result.data[0]


@app.post("/auth/login", summary="Login para frontend React - devuelve JWT", response_model=TokenResponse)
def auth_login(req: LoginRequest):
    if not JWT_AVAILABLE:
        raise HTTPException(status_code=503, detail="JWT no disponible")
    result = sb.rpc("fn_login", {"p_usuario": req.usuario.strip(), "p_password": req.password.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    user = result.data[0]
    payload = {
        "sub":               user["usuario_login"],
        "id_usuario":        user["id_usuario"],
        "rol":               user["rol"],
        "id_distribuidor":   user["id_distribuidor"],
        "nombre_empresa":    user["nombre_empresa"],
        "is_superadmin":     user.get("is_superadmin") or user["rol"] == "superadmin",
        "exp":               datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return TokenResponse(
        access_token=token, token_type="bearer",
        usuario=user["usuario_login"], rol=user["rol"],
        id_usuario=user["id_usuario"], id_distribuidor=user["id_distribuidor"],
        nombre_empresa=user["nombre_empresa"],
        is_superadmin=payload["is_superadmin"]
    )


@app.get("/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_pendientes", {"p_dist_id": id_distribuidor}).execute()
    rows = result.data or []
    grupos: dict = {}
    for d in rows:
        key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{d['id_exhibicion']}"
        if key not in grupos:
            grupos[key] = {
                "vendedor": d.get("vendedor"), "nro_cliente": d.get("nro_cliente"),
                "tipo_pdv": d.get("tipo_pdv"), "fecha_hora": d.get("fecha_hora"), "fotos": [],
            }
        grupos[key]["fotos"].append({"id_exhibicion": d["id_exhibicion"], "drive_link": d["drive_link"]})
    return list(grupos.values())


@app.get("/stats/{id_distribuidor}", summary="Estadisticas del dia actual")
def get_stats(id_distribuidor: int, _=Depends(verify_auth)):
    hoy = datetime.now().strftime("%Y-%m-%d")
    result = sb.rpc("fn_stats_hoy", {"p_dist_id": id_distribuidor, "p_fecha": hoy}).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/vendedores/{id_distribuidor}", summary="Lista de vendedores con pendientes")
def get_vendedores(id_distribuidor: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_vendedores_pendientes", {"p_dist_id": id_distribuidor}).execute()
    return [r["nombre_integrante"] for r in (result.data or [])]


@app.post("/evaluar", summary="Aprobar / Destacar / Rechazar una exhibicion")
def evaluar(req: EvaluarRequest, _=Depends(verify_auth)):
    try:
        affected = 0
        for id_ex in req.ids_exhibicion:
            # Primero validamos que la exhibición pertenezca a la dist_id del usuario (si no es superadmin)
            ex_res = sb.table("exhibiciones").select("id_distribuidor").eq("id_exhibicion", id_ex).execute()
            if not ex_res.data: continue
            dist_id = ex_res.data[0]["id_distribuidor"]
            
            # Check de bloqueo
            check_distributor_status(dist_id, user_payload)

            r = sb.table("exhibiciones").update({
                "estado": req.estado,
                "supervisor_nombre": req.supervisor,
                "comentario_evaluacion": req.comentario or None,
                "evaluated_at": datetime.utcnow().isoformat(),
                "evaluado_por_id": user_payload.get("id_usuario"),
                "synced_telegram": 0,
            }).eq("id_exhibicion", id_ex).eq("estado", "Pendiente").execute()
            affected += len(r.data) if r.data else 0
        return {"affected": affected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/revertir", summary="Revertir evaluacion a Pendiente")
def revertir(req: RevertirRequest, _=Depends(verify_auth)):
    try:
        affected = 0
        for id_ex in req.ids_exhibicion:
            r = sb.table("exhibiciones").update({
                "estado": "Pendiente",
                "supervisor_nombre": None,
                "comentario_evaluacion": None,
                "evaluated_at": None,
                "synced_telegram": 0,
            }).eq("id_exhibicion", id_ex).execute()
            affected += len(r.data) if r.data else 0
        return {"affected": affected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Admin: Distribuidoras ───────────────────────────────────────────────────

@app.get("/admin/distribuidoras", summary="Lista de distribuidoras")
def admin_get_distribuidoras(solo_activas: str = "true", _=Depends(verify_auth)):
    q = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, estado, id_carpeta_drive, ruta_credencial_drive")
    if solo_activas.lower() == "true":
        q = q.eq("estado", "activo")
    result = q.order("nombre_empresa").execute()
    # Rename id_distribuidor -> id for frontend compatibility
    return [{"id": r["id_distribuidor"], "nombre": r["nombre_empresa"], **{k: r[k] for k in r if k not in ("id_distribuidor", "nombre_empresa")}} for r in (result.data or [])]


@app.post("/admin/distribuidoras", summary="Crear distribuidora")
async def admin_crear_distribuidora(req: DistribuidoraRequest, _=Depends(verify_auth)):
    try:
        res = sb.table("distribuidores").insert({
            "nombre_empresa": req.nombre.strip(), "token_bot": req.token.strip(),
            "id_carpeta_drive": req.carpeta_drive.strip(), "ruta_credencial_drive": req.ruta_cred.strip(),
            "estado": "activo"
        }).execute()
        
        # Start bot
        if res.data:
            d_id = res.data[0]["id_distribuidor"]
            try:
                worker = BotWorker(distribuidor_id=d_id)
                ptb_app = worker.build_app()
                await ptb_app.initialize()
                if WEBHOOK_URL:
                    webhook_path = f"{WEBHOOK_URL}/api/telegram/webhook/{d_id}"
                    await ptb_app.bot.set_webhook(url=webhook_path)
                await ptb_app.start()
                bots[d_id] = ptb_app
            except Exception as e:
                print(f"Error iniciando bot nuevo {d_id}: {e}")
                
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/admin/distribuidoras/{dist_id}", summary="Editar distribuidora")
async def admin_editar_distribuidora(dist_id: int, req: DistribuidoraRequest, _=Depends(verify_auth)):
    try:
        res = sb.table("distribuidores").update({
            "nombre_empresa": req.nombre.strip(), "token_bot": req.token.strip(),
            "id_carpeta_drive": req.carpeta_drive.strip(), "ruta_credencial_drive": req.ruta_cred.strip(),
        }).eq("id_distribuidor", dist_id).execute()
        
        # Determine if it's active before trying to restart
        is_active = res.data[0]["estado"] == "activo" if res.data else False
        
        # Restart bot to apply changes
        if is_active:
            if dist_id in bots:
                old_app = bots[dist_id]
                await old_app.stop()
                await old_app.shutdown()
                del bots[dist_id]
                
            try:
                worker = BotWorker(distribuidor_id=dist_id)
                ptb_app = worker.build_app()
                await ptb_app.initialize()
                if WEBHOOK_URL:
                    webhook_path = f"{WEBHOOK_URL}/api/telegram/webhook/{dist_id}"
                    await ptb_app.bot.set_webhook(url=webhook_path)
                await ptb_app.start()
                bots[dist_id] = ptb_app
            except Exception as e:
                print(f"Error reiniciando bot editado {dist_id}: {e}")
                
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.patch("/admin/distribuidoras/{dist_id}/estado", summary="Activar/desactivar distribuidora")
async def admin_toggle_distribuidora(dist_id: int, estado: str, _=Depends(verify_auth)):
    if estado not in ("activo", "inactivo"):
        raise HTTPException(status_code=400, detail="estado debe ser 'activo' o 'inactivo'")
    sb.table("distribuidores").update({"estado": estado}).eq("id_distribuidor", dist_id).execute()
    
    if estado == "inactivo" and dist_id in bots:
        # Stop bot
        old_app = bots[dist_id]
        await old_app.stop()
        await old_app.shutdown()
        del bots[dist_id]
    elif estado == "activo" and dist_id not in bots:
        # Start bot
        try:
            worker = BotWorker(distribuidor_id=dist_id)
            ptb_app = worker.build_app()
            await ptb_app.initialize()
            if WEBHOOK_URL:
                webhook_path = f"{WEBHOOK_URL}/api/telegram/webhook/{dist_id}"
                await ptb_app.bot.set_webhook(url=webhook_path)
            await ptb_app.start()
            bots[dist_id] = ptb_app
        except Exception as e:
            print(f"Error iniciando bot activado {dist_id}: {e}")
            
    return {"ok": True}


# ─── Admin: Usuarios del portal ───────────────────────────────────────────────

@app.get("/admin/usuarios", summary="Lista de usuarios del portal")
def admin_get_usuarios(dist_id: int | None = None, _=Depends(verify_auth)):
    result = sb.rpc("fn_usuarios_portal", {"p_dist_id": dist_id or 0}).execute()
    return result.data or []


@app.post("/admin/usuarios", summary="Crear usuario del portal")
def admin_crear_usuario(req: UsuarioRequest, _=Depends(verify_auth)):
    try:
        sb.table("usuarios_portal").insert({
            "id_distribuidor": req.dist_id, "usuario_login": req.login.strip(),
            "password": req.password, "rol": req.rol,
        }).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/admin/usuarios/{user_id}", summary="Editar usuario del portal")
def admin_editar_usuario(user_id: int, req: UsuarioEditRequest, _=Depends(verify_auth)):
    try:
        update_data = {"usuario_login": req.login.strip(), "rol": req.rol}
        if req.password:
            update_data["password"] = req.password
        sb.table("usuarios_portal").update(update_data).eq("id_usuario", user_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.delete("/admin/usuarios/{user_id}", summary="Eliminar usuario del portal")
def admin_eliminar_usuario(user_id: int, _=Depends(verify_auth)):
    sb.table("usuarios_portal").delete().eq("id_usuario", user_id).execute()
    return {"ok": True}


# ─── Admin: Integrantes de Telegram ──────────────────────────────────────────

@app.get("/admin/integrantes", summary="Lista de integrantes")
def admin_get_integrantes(distribuidor_id: int | None = None, _=Depends(verify_auth)):
    result = sb.rpc("fn_integrantes", {"p_dist_id": distribuidor_id or 0}).execute()
    return result.data or []


@app.put("/admin/integrantes/{id_integrante}/rol", summary="Cambiar rol de integrante")
def admin_set_rol_integrante(id_integrante: int, req: IntegranteRolRequest, _=Depends(verify_auth)):
    if req.rol not in ("vendedor", "observador"):
        raise HTTPException(status_code=400, detail="rol debe ser 'vendedor' u 'observador'")
    q = sb.table("integrantes_grupo").update({"rol_telegram": req.rol}).eq("id_integrante", id_integrante)
    if req.distribuidor_id:
        q = q.eq("id_distribuidor", req.distribuidor_id)
    r = q.execute()
    if not r.data:
        raise HTTPException(status_code=403, detail="Sin permisos o integrante no encontrado")
    return {"ok": True}


# --- Admin: Monitor (sesiones, metricas, alertas) ---

@app.get("/admin/monitor/sesiones", summary="Sesiones activas del portal")
def admin_monitor_sesiones(_=Depends(verify_auth)):
    # Simple query on sessions table - no complex JOINs needed for now
    result = sb.table("sessions").select("*").eq("activa", True).order("last_seen_at", desc=True).execute()
    return result.data or []


@app.get("/admin/monitor/metricas", summary="Metricas del dia")
def admin_monitor_metricas(_=Depends(verify_auth)):
    hoy = datetime.now().strftime("%Y-%m-%d")
    # Sessions and events tables are empty in the migration - return defaults
    return {
        "logins_hoy": 0, "usuarios_unicos": 0, "exportaciones": 0,
        "pantalla_top": "-", "tiempo_medio_min": 0,
    }


@app.get("/admin/monitor/alertas", summary="Alertas activas")
def admin_monitor_alertas(_=Depends(verify_auth)):
    # Sessions table is empty - return empty alerts
    return []


# ─── Dashboard endpoints ──────────────────────────────────────────────────────

AR_OFFSET = "-3 hours"  # UTC → America/Argentina/Buenos_Aires (UTC-3, sin DST)

def _periodo_where(periodo: str) -> str:
    """Devuelve fragmento SQL WHERE para el período dado (sin el AND inicial).
    Usa offset UTC-3 para que el cambio de día ocurra a medianoche argentina,
    no a las 21:00 (que es cuando 'now' UTC pasa al día siguiente).

    Formatos aceptados:
      - "hoy"        → solo hoy (fecha argentina)
      - "mes"        → mes en curso (año+mes argentino actual)
      - "YYYY-MM"    → mes específico (ej: "2025-11" para noviembre 2025)
      - "historico"  → sin filtro de fecha
    """
    if periodo == "hoy":
        return (
            f"AND DATE(e.timestamp_subida, '{AR_OFFSET}') = DATE('now', '{AR_OFFSET}')"
        )
    elif periodo == "mes":
        return (
            f"AND strftime('%Y-%m', e.timestamp_subida, '{AR_OFFSET}') "
            f"= strftime('%Y-%m', 'now', '{AR_OFFSET}')"
        )
    elif len(periodo) == 7 and periodo[4] == "-":
        # Formato "YYYY-MM" — mes específico pasado o futuro
        import re as _re
        if _re.match(r"^\d{4}-\d{2}$", periodo):
            return (
                f"AND strftime('%Y-%m', e.timestamp_subida, '{AR_OFFSET}') = '{periodo}'"
            )
    return ""  # historico o cualquier valor desconocido: sin filtro


@app.get("/dashboard/kpis/{distribuidor_id}", summary="KPIs del dashboard por período")
def dashboard_kpis(distribuidor_id: int, periodo: str = "mes", _=Depends(verify_auth)):
    result = sb.rpc("fn_dashboard_kpis", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(distribuidor_id: int, periodo: str = "mes", top: int = 15, _=Depends(verify_auth)):
    result = sb.rpc("fn_dashboard_ranking", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_top": top}).execute()
    return result.data or []


@app.get("/dashboard/ultimas-evaluadas/{distribuidor_id}", summary="Últimas fotos evaluadas con fallback de días")
def dashboard_ultimas(distribuidor_id: int, n: int = 8, _=Depends(verify_auth)):
    """Busca las últimas N fotos aprobadas/destacadas.
    Si no hay fotos hoy, retrocede un día a la vez hasta encontrar (máx. 90 días)."""
    # Fecha actual en Argentina (UTC-3): evita que a las 21hs ARG el día ya sea "mañana" en UTC
    ar_today = (datetime.utcnow() - timedelta(hours=3)).date()
    for days_back in range(90):
        fecha = (ar_today - timedelta(days=days_back)).isoformat()
        result = sb.rpc("fn_ultimas_evaluadas", {
            "p_dist_id": distribuidor_id, "p_fecha": fecha, "p_limit": n
        }).execute()
        if result.data:
            return result.data
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

    # Intentar cargar credenciales desde variable de entorno o archivo
    token_json = os.environ.get("DRIVE_TOKEN_JSON")
    token_path = Path(__file__).resolve().parent / "token_drive.json"
    
    try:
        if token_json:
            try:
                creds_info = json.loads(token_json)
                creds = Credentials.from_authorized_user_info(creds_info)
                logger.info(f"📸 Proxy: Usando DRIVE_TOKEN_JSON para {file_id}")
            except Exception as json_e:
                logger.error(f"❌ Error parseando DRIVE_TOKEN_JSON: {json_e}")
                raise HTTPException(status_code=500, detail="DRIVE_TOKEN_JSON tiene formato invalido")
        elif token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path))
            logger.info(f"📸 Proxy: Usando token_drive.json para {file_id}")
        else:
            logger.warning(f"⚠️ Sin credenciales Drive para {file_id}, verificando si es Supabase...")
            raise HTTPException(status_code=503, detail="No se encontraron credenciales de Google Drive")

        if not creds.valid and creds.refresh_token:
            import google.auth.transport.requests as _gtr
            creds.refresh(_gtr.Request(session=_req.Session()))

        r = _req.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=20,
            verify=_CA,
        )
        if r.status_code != 200:
            logger.error(f"❌ Google Drive error {r.status_code} para {file_id}: {r.text[:100]}")
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
        import traceback
        err_trace = traceback.format_exc()
        logger.error(f"❌ ERROR CRITICO PROXY IMAGEN ({file_id}):\n{err_trace}")
        
        # Log de debug para la variable (primeros 20 chars para no filtrar secretos)
        token_preview = (token_json[:20] + "...") if token_json else "None"
        logger.info(f"🔍 Debug Variable: DRIVE_TOKEN_JSON={token_preview}")
        
        raise HTTPException(status_code=502, detail=f"Proxy Error: {str(e)}")


# ─── Módulo Cuentas Corrientes ───────────────────────────────────────────────

from fastapi.responses import JSONResponse

@app.options("/api/procesar-cuentas-corrientes")
def options_procesar_cuentas_corrientes():
    return JSONResponse(
        content="OK",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

@app.post("/api/procesar-cuentas-corrientes", summary="Procesar Excel de Cuentas Corrientes y Alertas de Crédito")
async def procesar_cuentas_corrientes(
    file: UploadFile = File(...),
    config: str = Form(...),
):
    """
    Endpoint para recibir un Excel con Cuentas Corrientes,
    las reglas de Alertas de Crédito (en JSON),
    y retornar el Excel enriquecido (Base64) + JSON para previsualización.
    """
    try:
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="El archivo proporcionado no es un Excel válido (.xlsx o .xls)")

        config_data = json.loads(config)

        # Crear carpeta temporal
        temp_dir = os.path.join(os.path.dirname(__file__), "temp_cuentas")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Guardar archivo subido temporalmente
        timestamp = int(datetime.now().timestamp())
        temp_file_path = os.path.join(temp_dir, f"upload_{timestamp}_{file.filename}")
        
        with open(temp_file_path, "wb") as f:
            f.write(await file.read())

        # Construir mapa de sucursales desde la Base de Datos
        mapa_sucursales = {}
        try:
            result = sb.table("locations").select("location_id, label").not_.is_("label", "null").execute()
            for row in (result.data or []):
                mapa_sucursales[str(row["location_id"])] = row["label"]
        except Exception as db_e:
            print(f"Advertencia: No se pudo cargar el mapa de sucursales desde BDD. {db_e}")

        # Ejecutar el servicio y pasarle el mapa
        out_path, json_data = procesar_cuentas_corrientes_service(
            input_path=temp_file_path,
            out_dir=temp_dir,
            config=config_data,
            sucursales_map=mapa_sucursales
        )
        # Leer el excel generado a base64
        with open(out_path, "rb") as f:
            b64_file = base64.b64encode(f.read()).decode("utf-8")
            
        # Limpieza de archivos físicos inmediatos
        os.remove(temp_file_path)
        os.remove(out_path)
        
        return {
            "ok": True,
            "filename": os.path.basename(out_path),
            "file_b64": b64_file,
            "data": json_data
        }

    except Exception as e:
        # Intentar limpiar en caso de error
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path): 
            os.remove(temp_file_path)
        print(f"Error procesando Cuentas Corrientes: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")


# ─── Reportes endpoints ───────────────────────────────────────────────────────

class ReporteQuery(BaseModel):
    fecha_desde: str
    fecha_hasta: str
    vendedores: List[str] = []
    estados: List[str] = []
    tipos_pdv: List[str] = []
    sucursales: List[str] = []
    nro_cliente: str = ""


@app.get("/reportes/vendedores/{distribuidor_id}", summary="Vendedores unicos para filtro de reportes")
def reportes_vendedores(distribuidor_id: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_vendedores_pendientes", {"p_dist_id": distribuidor_id}).execute()
    # Also get vendedores with any exhibicion, not just pendientes
    q = sb.table("exhibiciones").select("id_integrante").eq("id_distribuidor", distribuidor_id) if distribuidor_id > 0 else sb.table("exhibiciones").select("id_integrante")
    ex_result = q.execute()
    integrante_ids = list(set(r["id_integrante"] for r in (ex_result.data or []) if r.get("id_integrante")))
    if not integrante_ids:
        return []
    ig_result = sb.table("integrantes_grupo").select("nombre_integrante").in_("id_integrante", integrante_ids).not_.is_("nombre_integrante", "null").order("nombre_integrante").execute()
    return list(set(r["nombre_integrante"] for r in (ig_result.data or [])))


@app.get("/reportes/tipos-pdv/{distribuidor_id}", summary="Tipos de PDV unicos")
def reportes_tipos_pdv(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("exhibiciones").select("tipo_pdv")
    if distribuidor_id > 0:
        q = q.eq("id_distribuidor", distribuidor_id)
    result = q.not_.is_("tipo_pdv", "null").execute()
    return sorted(set(r["tipo_pdv"] for r in (result.data or []) if r.get("tipo_pdv")))


@app.get("/reportes/sucursales/{distribuidor_id}", summary="Sucursales unicas")
def reportes_sucursales(distribuidor_id: int, _=Depends(verify_auth)):
    # Get all locations for the distribuidor
    result = sb.table("locations").select("label").not_.is_("label", "null").execute()
    return sorted(set(r["label"] for r in (result.data or []) if r.get("label")))



@app.post("/reportes/exhibiciones/{distribuidor_id}", summary="Consulta de exhibiciones con filtros")
def reportes_exhibiciones(distribuidor_id: int, q_body: ReporteQuery, _=Depends(verify_auth)):
    # Build query using Supabase client
    query = sb.table("exhibiciones").select(
        "id_exhibicion, estado, tipo_pdv, supervisor_nombre, comentario_evaluacion, "
        "timestamp_subida, evaluated_at, url_foto_drive, id_integrante, id_cliente"
    )
    # Date filters (using timestamp_subida with Argentina TZ)
    query = query.gte("timestamp_subida", f"{q_body.fecha_desde}T03:00:00Z")
    query = query.lte("timestamp_subida", f"{q_body.fecha_hasta}T26:59:59Z")
    if distribuidor_id > 0:
        query = query.eq("id_distribuidor", distribuidor_id)
    if q_body.estados:
        query = query.in_("estado", q_body.estados)
    if q_body.tipos_pdv:
        query = query.in_("tipo_pdv", q_body.tipos_pdv)
    result = query.order("timestamp_subida", desc=True).execute()
    rows = result.data or []
    # Enrich with vendedor/cliente/sucursal names
    integrante_ids = list(set(r["id_integrante"] for r in rows if r.get("id_integrante")))
    cliente_ids = list(set(r["id_cliente"] for r in rows if r.get("id_cliente")))
    vendedores_map = {}
    clientes_map = {}
    if integrante_ids:
        ig = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante").in_("id_integrante", integrante_ids).execute()
        vendedores_map = {r["id_integrante"]: r["nombre_integrante"] for r in (ig.data or [])}
    if cliente_ids:
        cl = sb.table("clientes").select("id_cliente, numero_cliente_local").in_("id_cliente", cliente_ids).execute()
        clientes_map = {r["id_cliente"]: r["numero_cliente_local"] for r in (cl.data or [])}
    output = []
    for r in rows:
        # Filter by vendedores if specified
        if q_body.vendedores:
            vendedor_name = vendedores_map.get(r.get("id_integrante"), "")
            if vendedor_name not in q_body.vendedores:
                continue
        output.append({
            "id_exhibicion": r["id_exhibicion"],
            "vendedor": vendedores_map.get(r.get("id_integrante"), "Sin nombre"),
            "sucursal": "",
            "cliente": clientes_map.get(r.get("id_cliente"), str(r.get("id_cliente", ""))),
            "tipo_pdv": r.get("tipo_pdv", ""),
            "estado": r["estado"],
            "supervisor": r.get("supervisor_nombre", ""),
            "comentario": r.get("comentario_evaluacion", ""),
            "fecha_carga": r.get("timestamp_subida"),
            "fecha_evaluacion": r.get("evaluated_at"),
            "link_foto": r.get("url_foto_drive", ""),
        })
    return output


# ─── Bonos endpoints ─────────────────────────────────────────────────────────

class BonusConfigPayload(BaseModel):
    anio: int
    mes: int
    umbral: int = 0
    monto_bono_fijo: float = 0.0
    monto_por_punto: float = 0.0
    puestos: List[dict] = []   # [{puesto, premio_si_llego, premio_si_no_llego}]


@app.get("/bonos/config/{id_distribuidor}", summary="Obtener config de bonos del mes")
def bonos_get_config(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    if not result.data:
        return {
            "id_config": None, "anio": anio, "mes": mes,
            "umbral": 0, "monto_bono_fijo": 0.0, "monto_por_punto": 0.0,
            "edicion_bloqueada": 0, "puestos": [],
        }
    cfg = result.data[0]
    puestos_result = sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", cfg["id_config"]).order("puesto").execute()
    cfg["puestos"] = puestos_result.data or []
    return cfg


@app.post("/bonos/config/{id_distribuidor}/guardar", summary="Guardar config de bonos del mes")
def bonos_guardar_config(id_distribuidor: int, payload: BonusConfigPayload, _=Depends(verify_auth)):
    # Check existing config
    existing = sb.table("bonos_config").select("id_config, edicion_bloqueada").eq("id_distribuidor", id_distribuidor).eq("anio", payload.anio).eq("mes", payload.mes).execute()
    if existing.data and existing.data[0].get("edicion_bloqueada"):
        raise HTTPException(status_code=403, detail="Configuracion bloqueada por el superadmin")
    # Upsert config
    config_data = {
        "id_distribuidor": id_distribuidor, "anio": payload.anio, "mes": payload.mes,
        "umbral": payload.umbral, "monto_bono_fijo": payload.monto_bono_fijo,
        "monto_por_punto": payload.monto_por_punto,
    }
    result = sb.table("bonos_config").upsert(config_data, on_conflict="id_distribuidor,anio,mes").execute()
    id_config = result.data[0]["id_config"]
    # Rewrite puestos
    sb.table("bonos_ranking").delete().eq("id_config", id_config).execute()
    for p in payload.puestos:
        sb.table("bonos_ranking").insert({
            "id_config": id_config, "puesto": p["puesto"],
            "premio_si_llego": p.get("premio_si_llego", 0),
            "premio_si_no_llego": p.get("premio_si_no_llego", 0),
        }).execute()
    return {"ok": True, "id_config": id_config}


@app.post("/bonos/config/{id_distribuidor}/bloquear", summary="Bloquear/desbloquear config (superadmin)")
def bonos_bloquear(id_distribuidor: int, anio: int, mes: int, bloquear: int = 1, _=Depends(verify_auth)):
    sb.table("bonos_config").update({"edicion_bloqueada": bloquear}).eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    return {"ok": True, "edicion_bloqueada": bloquear}


@app.get("/bonos/liquidacion/{id_distribuidor}", summary="Liquidacion de bonos del mes")
def bonos_liquidacion(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    # Config del mes
    cfg_result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    cfg = cfg_result.data[0] if cfg_result.data else None
    umbral = cfg["umbral"] if cfg else 0
    bono_fijo = cfg["monto_bono_fijo"] if cfg else 0.0
    por_punto = cfg["monto_por_punto"] if cfg else 0.0
    id_config = cfg["id_config"] if cfg else None
    # Puestos / premios
    puestos_map: dict = {}
    if id_config:
        puestos_result = sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", id_config).order("puesto").execute()
        for p in (puestos_result.data or []):
            puestos_map[p["puesto"]] = p
    # Puntos del mes via RPC
    rows_result = sb.rpc("fn_bonos_liquidacion", {"p_dist_id": id_distribuidor, "p_anio": anio, "p_mes": mes}).execute()
    rows = rows_result.data or []
    resultado = []
    for pos, d in enumerate(rows, start=1):
        puntos = d["puntos"]
        info_puesto = puestos_map.get(pos, {})
        llego = puntos >= umbral
        if llego:
            bono = bono_fijo + info_puesto.get("premio_si_llego", 0.0)
        else:
            bono = puntos * por_punto + info_puesto.get("premio_si_no_llego", 0.0)
        resultado.append({
            "puesto": pos, "vendedor": d["vendedor"],
            "aprobadas": d["aprobadas"], "destacadas": d["destacadas"],
            "puntos": puntos, "llego_umbral": llego, "bono": round(bono, 2),
        })
    return {
        "anio": anio, "mes": mes,
        "umbral": umbral, "monto_bono_fijo": bono_fijo, "monto_por_punto": por_punto,
        "vendedores": resultado,
    }


@app.get("/bonos/detalle/{id_distribuidor}", summary="Detalle de exhibiciones de un vendedor en el mes")
def bonos_detalle(id_distribuidor: int, id_integrante: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_bonos_detalle", {
        "p_dist_id": id_distribuidor, "p_integrante": id_integrante,
        "p_anio": anio, "p_mes": mes,
    }).execute()
    return result.data or []


# ─── Admin: Locations / Clientes / Asignación ────────────────────────────────

class AsignarVendedorRequest(BaseModel):
    id_integrante: int | None = None   # None = desasignar (poner NULL)

class IntegranteCreateRequest(BaseModel):
    nombre_integrante: str
    rol_telegram: str = "vendedor"
    location_id: int | None = None
    telegram_user_id: int | None = None
    telegram_group_id: int | None = None


@app.get("/admin/locations/{dist_id}", summary="Sucursales de un distribuidor")
def admin_get_locations(dist_id: int, _=Depends(verify_auth)):
    q = sb.table("locations").select("location_id, ciudad, provincia, label, lat, lon")
    if dist_id > 0:
        q = q.eq("dist_id", dist_id)
    result = q.order("label").execute()
    return result.data or []

@app.post("/admin/locations/{dist_id}", summary="Crear sucursal")
def admin_create_location(dist_id: int, req: LocationRequest, _=Depends(verify_auth)):
    result = sb.table("locations").insert({
        "dist_id": dist_id, "ciudad": req.ciudad, "provincia": req.provincia,
        "label": req.label, "lat": req.lat, "lon": req.lon,
    }).execute()
    new_id = result.data[0]["location_id"] if result.data else None
    return {"ok": True, "location_id": new_id}

@app.put("/admin/locations/{location_id}", summary="Editar sucursal")
def admin_update_location(location_id: int, req: LocationRequest, _=Depends(verify_auth)):
    sb.table("locations").update({
        "ciudad": req.ciudad, "provincia": req.provincia,
        "label": req.label, "lat": req.lat, "lon": req.lon,
    }).eq("location_id", location_id).execute()
    return {"ok": True}

@app.get("/admin/usuarios/{dist_id}", summary="Listar todos los integrantes (Telegram)")
def admin_get_usuarios_telegram(dist_id: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_usuarios_telegram", {"p_dist_id": dist_id}).execute()
    return result.data or []

@app.post("/admin/integrantes/{dist_id}", summary="Crear un nuevo integrante manualmente")
def admin_create_integrante(dist_id: int, req: IntegranteCreateRequest, _=Depends(verify_auth)):
    """Permite crear manualmente un usuario (ej. vendedor) sin que haya interactuado con el bot primero."""
    result = sb.table("integrantes_grupo").insert({
        "id_distribuidor": dist_id, "telegram_user_id": req.telegram_user_id or 0,
        "nombre_integrante": req.nombre_integrante, "rol_telegram": req.rol_telegram,
        "location_id": req.location_id, "telegram_group_id": req.telegram_group_id or 0,
    }).execute()
    new_id = result.data[0]["id_integrante"] if result.data else None
    return {"ok": True, "id_integrante": new_id}

@app.put("/admin/integrantes/{id_integrante}", summary="Editar nombre/rol de integrante")
def admin_update_integrante(id_integrante: int, req: IntegranteUpdateRequest, _=Depends(verify_auth)):
    """Permite al SuperAdmin cambiar el nombre y rol del integrante independientemente de Telegram."""
    update_data = {"nombre_integrante": req.nombre_integrante}
    if req.rol_telegram:
        update_data["rol_telegram"] = req.rol_telegram
    sb.table("integrantes_grupo").update(update_data).eq("id_integrante", id_integrante).execute()
    return {"ok": True}


@app.get("/admin/vendedores-by-location/{location_id}", summary="Vendedores de una sucursal")
def admin_vendedores_by_location(location_id: int, dist_id: int, _=Depends(verify_auth)):
    """
    Retorna los vendedores asignados a una sucursal específica.
    Agrupa por telegram_user_id para evitar duplicados multi-grupo.
    """
    result = sb.table("integrantes_grupo").select(
        "id_integrante, nombre_integrante, telegram_user_id"
    ).eq("location_id", location_id).eq("id_distribuidor", dist_id).eq(
        "rol_telegram", "vendedor"
    ).order("nombre_integrante").execute()
    return result.data or []


@app.get("/admin/clientes", summary="Clientes con filtros en cascada")
def admin_get_clientes(
    dist_id: int,
    location_id: int | None = None,
    id_vendedor: int | None = None,
    sin_asignar: bool = False,
    _=Depends(verify_auth),
):
    """
    Lista clientes con nombre del vendedor asignado.
    Filtros opcionales (se combinan con AND):
      - location_id  → filtra por sucursal
      - id_vendedor  → filtra por vendedor específico (id_integrante)
      - sin_asignar  → True para solo los sin vendedor asignado (id_vendedor IS NULL)
    """
    result = sb.rpc("fn_clientes_admin", {
        "p_dist_id": dist_id,
        "p_location_id": location_id or 0,
        "p_vendedor_id": id_vendedor or 0,
        "p_sin_asignar": sin_asignar,
    }).execute()
    return result.data or []


@app.put("/admin/clientes/{id_cliente}/vendedor", summary="Asignar o reasignar vendedor a un cliente")
def admin_asignar_vendedor(
    id_cliente: int, req: AsignarVendedorRequest, _=Depends(verify_auth)
):
    """
    Asigna (o des-asigna con id_integrante=null) el vendedor de un cliente.
    Es el punto de corrección manual desde el Panel Admin.
    """
    r = sb.table("clientes").update({"id_vendedor": req.id_integrante}).eq("id_cliente", id_cliente).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True, "id_cliente": id_cliente, "id_integrante": req.id_integrante}


# ─── Dashboard: stats por sucursal ───────────────────────────────────────────

@app.get("/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
def dashboard_por_sucursal(distribuidor_id: int, periodo: str = "mes", _=Depends(verify_auth)):
    """
    Retorna aprobadas y rechazadas agrupadas por sucursal (location).
    Útil para el gráfico de barras comparativo del Dashboard.
    La cadena es: exhibicion → integrante → location.
    """
    result = sb.rpc("fn_dashboard_por_sucursal", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    return result.data or []


@app.get("/api/admin/erp/vendedores/{dist_id}", summary="Obtener lista de vendedores activos en ERP")
def get_erp_vendedores(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("erp_ventas_raw").select("vendedor_erp").eq("id_distribuidor", dist_id).execute()
    vendedores = sorted(list(set(row["vendedor_erp"] for row in res.data if row["vendedor_erp"])))
    return vendedores

@app.get("/api/admin/erp/mappings", summary="Obtener todos los mapeos ERP")
def get_erp_mappings(_=Depends(verify_auth)):
    res = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor, distribuidores(nombre_empresa)").execute()
    return res.data or []

@app.post("/api/admin/erp/mappings", summary="Crear o actualizar mapeo ERP")
def save_erp_mapping(data: dict, _=Depends(verify_auth)):
    # data: {nombre_erp: str, id_distribuidor: int}
    res = sb.table("erp_empresa_mapping").upsert(data).execute()
    erp_service.reload_mappings()
    return {"message": "Mapeo guardado"}

@app.delete("/api/admin/erp/mappings/{nombre_erp}", summary="Eliminar mapeo ERP")
def delete_erp_mapping(nombre_erp: str, _=Depends(verify_auth)):
    res = sb.table("erp_empresa_mapping").delete().eq("nombre_erp", nombre_erp).execute()
    erp_service.reload_mappings()
    return {"message": "Mapeo eliminado"}

# ─── ERP: Configuración y Reportes ───────────────────────────────────────────

class ERPConfigAlertas(BaseModel):
    limite_dinero: float
    limite_cbte: int
    limite_dias: int
    activo: bool = True

@app.get("/api/admin/erp/config/{dist_id}", summary="Obtener configuración de alertas ERP")
def get_erp_config(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("erp_config_alertas").select("*").eq("id_distribuidor", dist_id).execute()
    if not res.data:
        # Valores por defecto si no existe
        return {
            "id_distribuidor": dist_id,
            "limite_dinero": 500000,
            "limite_cbte": 5,
            "limite_dias": 30,
            "activo": True
        }
    return res.data[0]

@app.post("/api/admin/erp/config/{dist_id}", summary="Guardar configuración de alertas ERP")
def save_erp_config(dist_id: int, req: ERPConfigAlertas, _=Depends(verify_auth)):
    data = req.dict()
    data["id_distribuidor"] = dist_id
    res = sb.table("erp_config_alertas").upsert(data, on_conflict="id_distribuidor").execute()
    return {"ok": True, "data": res.data[0] if res.data else None}

@app.get("/api/reportes/recaudacion/{dist_id}", summary="Resumen de recaudación y KPIs")
def get_recaudacion_summary(
    dist_id: int, 
    desde: str = Query(None), 
    hasta: str = Query(None), 
    vendedor: str = Query(None),
    _=Depends(verify_auth)
):
    # Usamos RPC para cálculos complejos
    res = sb.rpc("fn_reporte_recaudacion_kpis", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor
    }).execute()
    return res.data or {}

@app.get("/api/reportes/recaudacion-detallada/{dist_id}", summary="Tabla detallada de ventas")
def get_recaudacion_detallada(
    dist_id: int, 
    desde: str = Query(None), 
    hasta: str = Query(None), 
    vendedor: str = Query(None),
    _=Depends(verify_auth)
):
    res = sb.rpc("fn_reporte_recaudacion_detallada", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor
    }).execute()
    return res.data or []

@app.get("/api/reportes/clientes-muertos/{dist_id}", summary="Listado de clientes sin ventas")
def get_clientes_muertos(dist_id: int, dias: int = 30, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_muertos", {
        "p_dist_id": dist_id,
        "p_dias": dias
    }).execute()
    return res.data or []

# ─── Entry point (desarrollo) ─────────────────────────────────────────────────

@app.get("/api/reportes/clientes/stats/{dist_id}", summary="KPIs de Padrón de Clientes")
def get_clientes_stats(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_stats", {"p_dist_id": dist_id}).execute()
    return res.data or {}

@app.get("/api/reportes/clientes/temporal/{dist_id}", summary="Altas de clientes por mes")
def get_clientes_temporal(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_temporal", {"p_dist_id": dist_id}).execute()
    return res.data or []

@app.get("/api/reportes/clientes/desglose/{dist_id}", summary="Análisis de clientes por Vendedor, Localidad o Provincia")
def get_clientes_desglose(dist_id: int, tipo: str = Query("vendedor"), _=Depends(verify_auth)):
    # tipo: 'vendedor', 'localidad', 'provincia'
    res = sb.rpc("fn_reporte_clientes_desglose", {"p_dist_id": dist_id, "p_tipo": tipo}).execute()
    return res.data or []


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)