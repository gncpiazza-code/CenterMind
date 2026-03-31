# -*- coding: utf-8 -*-
"""
Shelfy -- Backend API (FastAPI + Supabase)
==========================================
Arrancar:  uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import os
import math
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

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Header, BackgroundTasks
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import base64
import re
import unicodedata

from services.erp_ingestion_service import erp_service
from services.system_monitoring_service import monitor_service
from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
from services.padron_ingestion_service import padron_service
from services.ventas_ingestion_service import ingest as ventas_ingest
import io
import psutil
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
        "version": "2.1.2-dashboard-fix",
        "bots_active": list(bots.keys()),
        "webhook_url": WEBHOOK_URL
    }

# CORS: permite peticiones desde orígenes autorizados
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://shelfycenter.vercel.app",
        "https://shelfy.vercel.app"
    ],
    allow_credentials=True,
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
        # Para compatibilidad, el bot actúa como superadmin total
        return {"method": "api_key", "is_superadmin": True, "rol": "admin"}

    if authorization:
        if not JWT_AVAILABLE:
            raise HTTPException(status_code=503, detail="JWT no disponible")
        try:
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token:
                raise HTTPException(status_code=401, detail="Formato inválido. Usa: Bearer <token>")
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            
            # Aseguramos que los campos booleanos existan
            payload["is_superadmin"] = payload.get("is_superadmin", False) or payload.get("rol") == "superadmin"
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Token JWT inválido o expirado")

    raise HTTPException(status_code=401, detail="Se requiere autenticación (X-Api-Key o Bearer token)")


def check_dist_permission(payload: dict, required_dist_id: int):
    """
    Helper para validar que un usuario no acceda a datos de otra distribuidora.
    Los SuperAdmins pueden ver CUALQUIER distribuidora.
    """
    if payload.get("is_superadmin"):
        return True
    
    user_dist_id = payload.get("id_distribuidor")
    if user_dist_id != required_dist_id:
        logger.warning(f"🚫 Intento de acceso no autorizado: Usuario dist {user_dist_id} -> Recurso dist {required_dist_id}")
        raise HTTPException(
            status_code=403, 
            detail=f"No tienes permisos para acceder a esta distribuidora ({required_dist_id})"
        )
    
    # --- La Ley del Sistema: Bloqueo de Compliance ---
    check_distributor_status(required_dist_id, payload)
    
    return True


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
    id_vendedor_erp: str | None = None

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
    id_distribuidor: Optional[int] = None
    nombre_empresa: Optional[str] = None
    is_superadmin: bool = False
    usa_quarentena: bool = False
    usa_contexto_erp: bool = False
    usa_mapeo_vendedores: bool = False
    show_tutorial: bool = False


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check")
def health():
    return {"status": "ok"}


# ─── Módulo ERP: Carga Manual (Fase A) ───────────────────────────────────────

@app.post("/api/admin/erp/upload-global", tags=["ERP Admin"], summary="Carga manual de archivos globales del ERP")
async def erp_upload_global(
    background_tasks: BackgroundTasks,
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
            background_tasks.add_task(erp_service.ingest_clientes, file_io)
            msg = "Se inició el procesamiento del Padrón de Clientes en segundo plano."
        else:
            background_tasks.add_task(erp_service.ingest_ventas, file_io)
            msg = "Se inició el procesamiento del Informe de Ventas en segundo plano."
            
        return {"status": "success", "message": msg, "count": "N/A"}
    except Exception as e:
        logger.error(f"Error en carga manual ERP ({tipo}): {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando archivo: {str(e)}")


# ─── ERP: Sincronización Automática "Push" (v1) ──────────────────────────────

@app.post("/api/v1/sync/erp-clientes", tags=["ERP Push"], summary="Ingesta automática de clientes via Push")
async def erp_sync_clientes(
    id_distribuidor: int = Query(..., description="ID de la distribuidora"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key) # Solo requiere API Key global
):
    """
    Recibe un archivo Excel con el padrón de clientes.
    Retorna 202 Accepted y procesa en segundo plano.
    """
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    
    try:
        content = await file.read()
        file_io = io.BytesIO(content)
        
        # Procesamos en background para evitar timeout
        background_tasks.add_task(erp_service.ingest_clientes_xlsx, file_io, id_distribuidor)
        
        return {
            "status": "accepted",
            "message": f"Archivo de clientes recibido para dist {id_distribuidor}. Procesando en segundo plano.",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error en endpoint sync clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/sync/erp-sucursales", tags=["ERP Push"], summary="Ingesta automática de sucursales via Push")
async def erp_sync_sucursales(
    id_distribuidor: int = Query(..., description="ID de la distribuidora"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key)
):
    """Recibe Excel con metadatos de sucursales."""
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    
    try:
        content = await file.read()
        file_io = io.BytesIO(content)
        background_tasks.add_task(erp_service.ingest_sucursales_xlsx, file_io, id_distribuidor)
        
        return {"status": "accepted", "message": "Procesando sucursales..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync sucursales: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/sync/erp-vendedores", tags=["ERP Push"], summary="Ingesta automática de vendedores via Push")
async def erp_sync_vendedores(
    id_distribuidor: int = Query(..., description="ID de la distribuidora"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key)
):
    """Recibe Excel con la jerarquía de vendedores."""
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    
    try:
        content = await file.read()
        file_io = io.BytesIO(content)
        background_tasks.add_task(erp_service.ingest_vendedores_xlsx, file_io, id_distribuidor)
        
        return {"status": "accepted", "message": "Procesando vendedores..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/sync/erp-ventas", tags=["ERP Push"], summary="Ingesta automática de ventas via Push")
async def erp_sync_ventas(
    id_distribuidor: int = Query(..., description="ID de la distribuidora"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key)
):
    """Recibe Excel con informe de ventas."""
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    
    try:
        content = await file.read()
        file_io = io.BytesIO(content)
        background_tasks.add_task(erp_service.ingest_ventas_xlsx, file_io, id_distribuidor)
        
        return {"status": "accepted", "message": "Procesando ventas..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync ventas: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/reports/performance/{id_distribuidor}", tags=["Reports"], summary="Reporte general de objetivos: Venta vs Exhibicion")
def get_reporte_performance(id_distribuidor: int, mes: int = Query(...), anio: int = Query(...), user_payload=Depends(verify_auth)):
    """Cruza datos de ventas ERP con exhibiciones de Shelfy."""
    check_dist_permission(user_payload, id_distribuidor)

    try:
        res = sb.rpc("fn_reporte_vendedor_objetivos", {
            "p_dist_id": id_distribuidor,
            "p_mes": mes,
            "p_anio": anio
        }).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reports/ventas-resumen/{id_distribuidor}", tags=["Reports"], summary="Resumen de Ventas y Recaudación")
def get_ventas_resumen(
    id_distribuidor: int, 
    desde: str = Query(...), 
    hasta: str = Query(...), 
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_resumen", {
            "p_dist_id": id_distribuidor,
            "p_desde": desde,
            "p_hasta": hasta
        }).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas resumen: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reports/ventas-bultos/{id_distribuidor}", tags=["Reports"], summary="Análisis Detallado por Bultos")
def get_ventas_bultos(
    id_distribuidor: int, 
    desde: str = Query(...), 
    hasta: str = Query(...), 
    proveedor: str | None = Query(None),
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_detallado", {
            "p_dist_id": id_distribuidor,
            "p_desde": desde,
            "p_hasta": hasta,
            "p_proveedor_busqueda": proveedor
        }).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas bultos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reports/auditoria-sigo/{id_distribuidor}", tags=["Reports"], summary="Auditoría SIGO (Geospatial)")
def get_auditoria_sigo(
    id_distribuidor: int, 
    desde: str = Query(...), 
    hasta: str = Query(...), 
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_sigo_audit", {
            "p_dist_id": id_distribuidor,
            "p_desde": desde,
            "p_hasta": hasta
        }).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte sigo audit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/erp/sync-status/{id_distribuidor}", tags=["ERP Admin"], summary="Estado de sincronización y matching de datos")
def get_erp_sync_status(id_distribuidor: int, user_payload=Depends(verify_auth)):
    """Informa cuántos datos hay cargados y el % de emparejamiento con Telegram."""
    check_dist_permission(user_payload, id_distribuidor)

    try:
        res = sb.rpc("fn_admin_erp_sync_status", {"p_dist_id": id_distribuidor}).execute()
        return res.data if res.data else {}
    except Exception as e:
        logger.error(f"Error en status sync ERP: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/global-monitoring", tags=["SuperAdmin"], summary="Monitoreo de estrés y volumen de todas las distribuidoras")
def get_global_monitoring(user_payload=Depends(verify_auth)):
    """Vista global para SuperAdmin: volumen de datos y salud del sistema."""
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo accesible para SuperAdmin")
    
    try:
        res = sb.rpc("fn_admin_global_monitoring", {}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en monitoreo global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/live-map-events", tags=["Admin"], summary="Eventos en vivo con coordenadas para el mapa")
def get_live_map_events(minutos: int | None = None, fecha: str | None = None, user_payload=Depends(verify_auth)):
    """Retorna exhibiciones con Lat/Lon para el mapa. Solo accesible para SuperAdmin.
    Usa lógica de fallback robusta en Python para asegurar visualización de puntos.
    """
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado. El mapa en vivo es exclusivo para SuperAdmins.")

    try:
        # 1. Fetch exhibiciones (solo columnas locales para evitar errores de join)
        query = sb.table("exhibiciones").select(
            "id_exhibicion, id_distribuidor, timestamp_subida, url_foto_drive, tipo_pdv, estado, "
            "latitud_gps, longitud_gps, id_integrante, id_cliente, cliente_sombra_codigo, id_cliente_pdv"
        )

        if fecha:
            query = query.gte("timestamp_subida", f"{fecha}T00:00:00-03:00")
            query = query.lte("timestamp_subida", f"{fecha}T23:59:59-03:00")
        else:
            m = minutos if minutos is not None else 60
            since = (datetime.now() - timedelta(minutes=m)).isoformat()
            query = query.gte("timestamp_subida", since)

        res = query.order("timestamp_subida", desc=True).execute()
        raw_events = res.data or []

        if not raw_events:
            return []

        # 2. Cargar maestros (Distribuidores, Clientes PDV, Jerarquía)
        dist_ids = list(set(e["id_distribuidor"] for e in raw_events))
        # Recopilamos IDs de clientes_pdv anclados
        pdv_ids = list(set(e["id_cliente_pdv"] for e in raw_events if e.get("id_cliente_pdv")))

        # Mapas de maestros
        dists = {d["id_distribuidor"]: d["nombre_display"] or d["nombre_empresa"] 
                 for d in sb.table("distribuidores").select("id_distribuidor, nombre_empresa, nombre_display").in_("id_distribuidor", dist_ids).execute().data or []}
        
        # Mapeo de Clientes PDV con toda su jerarquía
        # Usamos un join (vía embedding en Supabase select) para traer sucursal y vendedor
        pdv_map = {}
        if pdv_ids:
            pdv_res = sb.table("clientes_pdv_v2").select(
                "id_cliente, id_cliente_erp, nombre_fantasia, latitud, longitud, "
                "rutas_v2(id_ruta, id_ruta_erp, vendedores_v2(id_vendedor, nombre_erp, sucursales_v2(id_sucursal, nombre_erp)))"
            ).in_("id_cliente", pdv_ids).execute()

            for row in (pdv_res.data or []):
                pdv_map[row["id_cliente"]] = row

        # 3. Transformar y Coalescer
        final_data = []
        for e in raw_events:
            pdv = pdv_map.get(e["id_cliente_pdv"])
            
            # Si no hay coordenadas, no se muestra en el mapa
            lat = pdv.get("latitud") if pdv else e.get("latitud_gps")
            lon = pdv.get("longitud") if pdv else e.get("longitud_gps")

            if not lat or lat == 0:
                continue

            # Enriquecimiento vía Jerarquía Real
            nombre_sucursal = "Sin Sucursal"
            nombre_vendedor = "Sin Vendedor"
            dist_name = dists.get(e["id_distribuidor"], f"Dist {e['id_distribuidor']}")

            if pdv and pdv.get("rutas_v2"):
                ruta = pdv["rutas_v2"]
                if ruta.get("vendedores_v2"):
                    vendedor = ruta["vendedores_v2"]
                    nombre_vendedor = vendedor.get("nombre_erp", "Vendedor S/N")
                    if vendedor.get("sucursales_v2"):
                        nombre_sucursal = vendedor["sucursales_v2"].get("nombre_erp", "Sucursal S/N")

            final_data.append({
                "id_ex": e["id_exhibicion"],
                "id_dist": e["id_distribuidor"],
                "nombre_dist": dist_name,
                "sucursal_nombre": nombre_sucursal,
                "vendedor_nombre": nombre_vendedor,
                "lat": float(lat),
                "lon": float(lon),
                "timestamp_evento": e["timestamp_subida"],
                "nro_cliente": pdv["id_cliente_erp"] if pdv else (e.get("cliente_sombra_codigo") or "0"),
                "cliente_nombre": pdv["nombre_fantasia"] if pdv else "Desconocido",
                "drive_link": e["url_foto_drive"],
                "id_vendedor": pdv["rutas_v2"]["vendedores_v2"]["id_vendedor"] if (pdv and pdv.get("rutas_v2") and pdv["rutas_v2"].get("vendedores_v2")) else None
            })

        return final_data

    except Exception as e:
        logger.error(f"Error procesando eventos de mapa: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        logger.error(f"Error procesando eventos de mapa: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/system-health", tags=["SuperAdmin"], summary="Métricas de hardware y base de datos (Nivel 0)")
def get_system_health(user_payload=Depends(verify_auth)):
    """Retorna RAM, CPU, Storage y saturación global."""
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo accesible para SuperAdmin")
    
    try:
        metrics = monitor_service.get_system_metrics()
        db_stats = monitor_service.get_db_stats()
        sessions = monitor_service.get_active_sessions(bots)
        
        return {
            "hardware": metrics,
            "database": db_stats,
            "sessions": sessions,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error en health monitor: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        result = sb.rpc("fn_login", {"p_usuario": req.usuario.strip(), "p_password": req.password.strip()}).execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="Credenciales invalidas")
        user = result.data[0]
        
        # --- Fase 1 Improvements: Bloqueo de usuarios ---
        if not user.get("activo", True):
            raise HTTPException(status_code=403, detail="Tu usuario ha sido desactivado. Contacta al administrador.")

        # --- Tutorial views logic ---
        tutorial_views = user.get("tutorial_views", 0)
        show_tutorial = tutorial_views < 3
        if show_tutorial:
            sb.table("usuarios_portal").update({"tutorial_views": tutorial_views + 1}).eq("id_usuario", user["id_usuario"]).execute()

        # --- Fase Architecture V3: Feature Flags desde DB ---
        dist_id = user.get("id_distribuidor")
        flags = {"usa_quarentena": False, "usa_contexto_erp": False, "usa_mapeo_vendedores": False}
        if dist_id:
            dist_res = sb.table("distribuidores").select("feature_flags, estado_operativo").eq("id_distribuidor", dist_id).execute()
            if dist_res.data:
                d_data = dist_res.data[0]
                flags = d_data.get("feature_flags") or flags
                # Si el tenant está bloqueado, forzamos flags a false o informamos
                if d_data.get("estado_operativo") != "Activo":
                    logger.warning(f"⚠️ Tenant {dist_id} logueando en modo lectura (Bloqueado)")

        payload = {
            "sub":               user["usuario_login"],
            "id_usuario":        user["id_usuario"],
            "rol":               user["rol"],
            "id_distribuidor":   dist_id, # IMPORTANTE: para RLS en Supabase
            "nombre_empresa":    user.get("nombre_empresa"),
            "is_superadmin":     bool(user.get("is_superadmin") or user["rol"] == "superadmin"),
            "usa_quarentena":    flags.get("usa_quarentena", False),
            "usa_contexto_erp":   flags.get("usa_contexto_erp", False),
            "usa_mapeo_vendedores": flags.get("usa_mapeo_vendedores", False),
            "show_tutorial":     show_tutorial,
            "exp":               datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        }
        token = _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return TokenResponse(
            access_token=token, token_type="bearer",
            usuario=user["usuario_login"], rol=user["rol"],
            id_usuario=user["id_usuario"], id_distribuidor=dist_id,
            nombre_empresa=user.get("nombre_empresa"),
            is_superadmin=payload["is_superadmin"],
            usa_quarentena=payload["usa_quarentena"],
            usa_contexto_erp=payload["usa_contexto_erp"],
            usa_mapeo_vendedores=payload["usa_mapeo_vendedores"],
            show_tutorial=show_tutorial
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en auth_login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en el servidor: {str(e)}")


@app.post("/auth/switch-context/{dist_id}", summary="Superadmin cambia de distribuidora activa", response_model=TokenResponse)
def switch_context(dist_id: int, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo el superadmin puede cambiar de contexto")
    
    # 1. Buscar la nueva distribuidora e incluir sus flags
    res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, feature_flags").eq("id_distribuidor", dist_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Distribuidora no encontrada")
    dist = res.data[0]
    flags = dist.get("feature_flags") or {}
    
    # 2. Generar nuevo token con el id_distribuidor actualizado y sus flags
    new_payload = dict(payload)
    new_payload["id_distribuidor"] = int(dist["id_distribuidor"])
    new_payload["nombre_empresa"]  = dist["nombre_empresa"]
    new_payload["usa_quarentena"]      = bool(flags.get("usa_quarentena", False))
    new_payload["usa_contexto_erp"]    = bool(flags.get("usa_contexto_erp", False))
    new_payload["usa_mapeo_vendedores"] = bool(flags.get("usa_mapeo_vendedores", False))
    new_payload["is_superadmin"] = True # Siempre true si llegamos aquí
    
    token = _jwt.encode(new_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return TokenResponse(
        access_token=token, token_type="bearer",
        usuario=new_payload.get("sub", ""), rol=new_payload.get("rol", ""),
        id_usuario=new_payload.get("id_usuario", 0), id_distribuidor=dist["id_distribuidor"],
        nombre_empresa=dist["nombre_empresa"],
        is_superadmin=True,
        usa_quarentena=new_payload["usa_quarentena"],
        usa_contexto_erp=new_payload["usa_contexto_erp"],
        usa_mapeo_vendedores=new_payload["usa_mapeo_vendedores"]
    )


# ── Helper: resolución de nombre Telegram → nombre ERP ──────────────────────
def _get_erp_name_map(dist_id: int) -> dict:
    """
    Devuelve dict { nombre_integrante_lower → nombre_erp } para un distribuidor.
    Resuelve la cadena: integrantes_grupo.id_vendedor_v2 → vendedores_v2.nombre_erp
    Fallback: si un integrante no tiene id_vendedor_v2 asignado, su nombre Telegram
    se mantiene como clave y valor (sin transformación).
    """
    try:
        ig_res = sb.table("integrantes_grupo")\
            .select("nombre_integrante, id_vendedor_v2, vendedores_v2(nombre_erp)")\
            .eq("id_distribuidor", dist_id)\
            .execute()
        name_map: dict = {}
        for ig in (ig_res.data or []):
            tg_name = (ig.get("nombre_integrante") or "").strip()
            if not tg_name:
                continue
            vend = ig.get("vendedores_v2")
            nombre_erp = None
            if isinstance(vend, dict):
                nombre_erp = vend.get("nombre_erp")
            elif isinstance(vend, list) and vend:
                nombre_erp = vend[0].get("nombre_erp")
            if nombre_erp:
                name_map[tg_name.lower()] = nombre_erp
        return name_map
    except Exception as e:
        logger.warning(f"_get_erp_name_map dist={dist_id} falló: {e}")
        return {}


@app.get("/api/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        result = sb.rpc("fn_pendientes", {"p_dist_id": id_distribuidor}).execute()
        rows = result.data or []

        # Enriquecimiento: fallback nro_cliente desde clientes_pdv_v2 si RPC no lo trajo
        pendientes_sin_nro = [r.get("id_exhibicion") for r in rows if r.get("id_exhibicion") and (not r.get("nro_cliente") or r.get("nro_cliente") == "0")]
        if pendientes_sin_nro:
            try:
                # Paso 1: obtener id_cliente_pdv de cada exhibicion
                extra_res = sb.table("exhibiciones")\
                    .select("id_exhibicion, id_cliente_pdv")\
                    .in_("id_exhibicion", pendientes_sin_nro)\
                    .execute()
                exh_cliente = {r["id_exhibicion"]: r.get("id_cliente_pdv") for r in (extra_res.data or []) if r.get("id_cliente_pdv")}
                nro_map = {}
                if exh_cliente:
                    # Paso 2: resolver id_cliente_erp desde clientes_pdv_v2
                    pdv_res = sb.table("clientes_pdv_v2")\
                        .select("id_cliente, id_cliente_erp")\
                        .in_("id_cliente", list(set(exh_cliente.values())))\
                        .execute()
                    pdv_erp = {r["id_cliente"]: r["id_cliente_erp"] for r in (pdv_res.data or [])}
                    nro_map = {ex_id: pdv_erp[cid] for ex_id, cid in exh_cliente.items() if cid in pdv_erp}
                for r in rows:
                    if not r.get("nro_cliente") or r.get("nro_cliente") == "0":
                        ex_id = r.get("id_exhibicion")
                        if ex_id in nro_map:
                            r["nro_cliente"] = nro_map[ex_id]
            except Exception as enrich_err:
                logger.error(f"Error en enriquecimiento nro_cliente: {enrich_err}")

        # Resolver nombres Telegram → nombre ERP del padrón
        erp_name_map = _get_erp_name_map(id_distribuidor)

        grupos: dict = {}
        for d in rows:
            ex_id = d.get("id_exhibicion")
            if not ex_id:
                continue
            key = str(d.get("telegram_msg_id")) if d.get("telegram_msg_id") else f"solo_{ex_id}"
            tg_vendedor = (d.get("vendedor") or "S/V").strip()
            vendedor_display = erp_name_map.get(tg_vendedor.lower(), tg_vendedor)
            if key not in grupos:
                grupos[key] = {
                    "vendedor": vendedor_display,
                    "nro_cliente": d.get("nro_cliente") or "S/C",
                    "tipo_pdv": d.get("tipo_pdv") or "S/D",
                    "fecha_hora": d.get("fecha_hora") or "",
                    "fotos": [],
                }
            grupos[key]["fotos"].append({
                "id_exhibicion": ex_id,
                "drive_link": d.get("drive_link") or "",
                "estado": d.get("estado"),
            })
        return list(grupos.values())
    except Exception as e:
        logger.error(f"Error en get_pendientes dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/{id_distribuidor}", summary="Estadisticas del dia actual")
def get_stats(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        hoy = datetime.now().strftime("%Y-%m-%d")
        result = sb.rpc("fn_stats_hoy", {"p_dist_id": id_distribuidor, "p_fecha": hoy}).execute()
        r = result.data[0] if result.data else {}
        return {k: (v or 0) for k, v in r.items()}
    except Exception as e:
        logger.error(f"Error en get_stats dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/vendedores/{id_distribuidor}", summary="Lista de vendedores con pendientes")
def get_vendedores(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    try:
        result = sb.rpc("fn_vendedores_pendientes", {"p_dist_id": id_distribuidor}).execute()
        erp_name_map = _get_erp_name_map(id_distribuidor)
        nombres = []
        seen = set()
        for r in (result.data or []):
            tg_name = (r.get("nombre_integrante") or "").strip()
            display = erp_name_map.get(tg_name.lower(), tg_name)
            if display and display not in seen:
                nombres.append(display)
                seen.add(display)
        return nombres
    except Exception as e:
        logger.error(f"Error en get_vendedores dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluar", summary="Aprobar / Destacar / Rechazar una exhibicion")
def evaluar(req: EvaluarRequest, user_payload=Depends(verify_auth)):
    try:
        if not req.ids_exhibicion:
            return {"affected": 0}
            
        # Validamos el primer elemento para obtener el dist_id
        # (Asumimos que todos los IDs en el request pertenecen a la misma distribución,
        # lo cual es cierto para el visor ya que agrupa por mensaje de Telegram)
        first_id = req.ids_exhibicion[0]
        ex_res = sb.table("exhibiciones").select("id_distribuidor").eq("id_exhibicion", first_id).execute()
        if not ex_res.data:
            raise HTTPException(status_code=404, detail="Exhibición no encontrada")
            
        dist_id = ex_res.data[0]["id_distribuidor"]
        check_dist_permission(user_payload, dist_id)
        check_distributor_status(dist_id, user_payload)

        # Update batch
        r = sb.table("exhibiciones").update({
            "estado": req.estado,
            "supervisor_nombre": req.supervisor,
            "comentario_evaluacion": req.comentario or None,
            "evaluated_at": datetime.utcnow().isoformat(),
            "evaluado_por_id": user_payload.get("id_usuario"),
            "synced_telegram": 0,
        }).in_("id_exhibicion", req.ids_exhibicion).eq("estado", "Pendiente").execute()
        
        affected = len(r.data) if r.data else 0
        return {"affected": affected}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en evaluar batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── PASO 9: Contexto ERP durante evaluación ─────────────────────────────────

@app.get("/api/erp/contexto-cliente/{id_distribuidor}/{nro_cliente}", summary="Datos ERP del cliente al evaluar")
def get_erp_contexto(id_distribuidor: int, nro_cliente: str, user_payload=Depends(verify_auth)):
    """PASO 9: Contexto ERP del cliente para la tarjeta de evaluación."""
    check_dist_permission(user_payload, id_distribuidor)
    try:
        # Contexto financiero (Facturación/Deuda) desde RPC
        res_rpc = sb.rpc("fn_erp_contexto_cliente", {
            "p_distribuidor_id": id_distribuidor,
            "p_nro_cliente": nro_cliente
        }).execute()
        
        # RPC devuelve lista; tomamos el primer elemento
        ctx = res_rpc.data[0] if res_rpc.data else {"encontrado": False}

        # Enriquecimiento con datos maestros (Ruta, Domicilio, Canal, Fecha Alta, Día Visita)
        res_pdv = sb.table("clientes_pdv_v2").select(
            "nombre_fantasia, nombre_razon_social, domicilio, localidad, canal, fecha_alta, "
            "rutas_v2(id_ruta_erp, dia_semana)"
        ).eq("id_distribuidor", id_distribuidor).eq("id_cliente_erp", nro_cliente).limit(1).execute()

        if res_pdv.data:
            pdv = res_pdv.data[0]
            ctx["encontrado"] = True
            ctx["nombre_fantasia"] = pdv.get("nombre_fantasia")
            ctx["razon_social"] = pdv.get("nombre_razon_social")
            ctx["domicilio"] = pdv.get("domicilio")
            ctx["localidad"] = pdv.get("localidad")
            ctx["canal"] = pdv.get("canal")
            ctx["fecha_alta"] = pdv.get("fecha_alta")
            # Extraer número de ruta y día de visita del objeto anidado
            # (puede ser lista si hay múltiples rutas, o dict si hay una sola)
            rutas_raw = pdv.get("rutas_v2")
            if rutas_raw:
                ruta_obj = rutas_raw[0] if isinstance(rutas_raw, list) else rutas_raw
                ctx["nro_ruta"] = ruta_obj.get("id_ruta_erp")
                ctx["dia_visita"] = ruta_obj.get("dia_semana")
        
        return ctx
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── PASO 10: ROI Analítico ───────────────────────────────────────────────────

@app.get("/api/erp/roi/{id_distribuidor}", summary="ROI: facturacion con vs sin exhibiciones destacadas")
def get_roi_analitico(id_distribuidor: int, user_payload=Depends(verify_auth)):
    """PASO 10: Compara clientes con/sin exhibiciones Destacadas en los últimos 30 días."""
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_roi_analitico", {"p_distribuidor_id": id_distribuidor}).execute()
        return res.data if res.data else {"con_exhibicion": {}, "sin_exhibicion": {}, "uplift_pct": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/revertir", summary="Revertir evaluacion a Pendiente")
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
def admin_get_distribuidoras(solo_activas: str = "true", payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    q = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, estado, id_carpeta_drive, ruta_credencial_drive")
    if solo_activas.lower() == "true":
        q = q.eq("estado", "activo")
    result = q.order("nombre_empresa").execute()
    # Rename id_distribuidor -> id for frontend compatibility
    return [{"id": r["id_distribuidor"], "nombre": r["nombre_empresa"], **{k: r[k] for k in r if k not in ("id_distribuidor", "nombre_empresa")}} for r in (result.data or [])]


@app.post("/admin/distribuidoras", summary="Crear distribuidora")
async def admin_crear_distribuidora(req: DistribuidoraRequest, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
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
async def admin_editar_distribuidora(dist_id: int, req: DistribuidoraRequest, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
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
async def admin_toggle_distribuidora(dist_id: int, estado: str, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
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

@app.get("/api/admin/usuarios", summary="Lista de usuarios del portal")
def admin_get_usuarios(dist_id: int | None = None, payload=Depends(verify_auth)):
    actual_dist_id = dist_id if payload.get("is_superadmin") else payload.get("id_distribuidor")
    if actual_dist_id is None:
        actual_dist_id = 0 # 0 para superadmin viendo todos
    
    result = sb.rpc("fn_usuarios_portal", {"p_dist_id": actual_dist_id}).execute()
    return result.data or []


@app.post("/api/admin/usuarios", summary="Crear usuario del portal")
def admin_crear_usuario(req: UsuarioRequest, payload=Depends(verify_auth)):
    check_dist_permission(payload, req.dist_id)
    try:
        sb.table("usuarios_portal").insert({
            "id_distribuidor": req.dist_id, "usuario_login": req.login.strip(),
            "password": req.password, "rol": req.rol,
        }).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.put("/api/admin/usuarios/{user_id}", summary="Editar usuario del portal")
def admin_editar_usuario(user_id: int, req: UsuarioEditRequest, payload=Depends(verify_auth)):
    try:
        # Validar pertenencia del usuario a editar
        check_q = sb.table("usuarios_portal").select("id_distribuidor").eq("id_usuario", user_id).execute()
        if check_q.data:
            check_dist_permission(payload, check_q.data[0]["id_distribuidor"])
            
        update_data = {"usuario_login": req.login.strip(), "rol": req.rol}
        if req.password:
            update_data["password"] = req.password
        sb.table("usuarios_portal").update(update_data).eq("id_usuario", user_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.delete("/api/admin/usuarios/{user_id}", summary="Eliminar usuario del portal")
def admin_eliminar_usuario(user_id: int, payload=Depends(verify_auth)):
    # Validar pertenencia
    check_q = sb.table("usuarios_portal").select("id_distribuidor").eq("id_usuario", user_id).execute()
    if check_q.data:
        check_dist_permission(payload, check_q.data[0]["id_distribuidor"])
        
    sb.table("usuarios_portal").delete().eq("id_usuario", user_id).execute()
    return {"ok": True}


# ─── Admin: Integrantes de Telegram ──────────────────────────────────────────

@app.get("/api/admin/integrantes", summary="Lista de integrantes")
def admin_get_integrantes(distribuidor_id: int | None = None, payload=Depends(verify_auth)):
    actual_dist_id = distribuidor_id if payload.get("is_superadmin") else payload.get("id_distribuidor")
    if actual_dist_id is None:
        actual_dist_id = 0
        
    result = sb.rpc("fn_integrantes", {"p_dist_id": actual_dist_id or 0}).execute()
    return result.data or []


@app.put("/api/admin/integrantes/{id_integrante}/rol", summary="Cambiar rol de integrante")
def admin_set_rol_integrante(id_integrante: int, req: IntegranteRolRequest, payload=Depends(verify_auth)):
    if req.distribuidor_id:
        check_dist_permission(payload, req.distribuidor_id)
    
    if req.rol not in ("vendedor", "observador"):
        raise HTTPException(status_code=400, detail="rol debe ser 'vendedor' u 'observador'")
    
    q = sb.table("integrantes_grupo").update({"rol_telegram": req.rol}).eq("id_integrante", id_integrante)
    if not payload.get("is_superadmin"):
        q = q.eq("id_distribuidor", payload.get("id_distribuidor"))
    
    r = q.execute()
    if not r.data:
        raise HTTPException(status_code=403, detail="Sin permisos o integrante no encontrado")
    return {"ok": True}


# ─── FASE 2 — Mapeo Vendedor ERP ↔ Integrante Telegram ──────────────────────

class MapeoVendedorRequest(BaseModel):
    id_vendedor: Optional[int] = None  # None = desasignar

@app.get(
    "/api/admin/mapeo/integrantes/{dist_id}",
    tags=["Mapeo"],
    summary="Integrantes con su vendedor ERP asignado (para pantalla de mapeo)",
)
def get_mapeo_integrantes(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        # Integrantes del distribuidor (excluye rol supervisor)
        ig_res = sb.table("integrantes_grupo") \
            .select("id_integrante, nombre_integrante, rol_telegram, telegram_user_id, id_vendedor_v2") \
            .eq("id_distribuidor", dist_id) \
            .neq("rol_telegram", "supervisor") \
            .order("nombre_integrante") \
            .execute()

        # Vendedores desde la tabla canónica (padrón)
        vend_res = sb.table("vendedores_v2") \
            .select("id_vendedor, nombre_erp, id_sucursal") \
            .eq("id_distribuidor", dist_id) \
            .order("nombre_erp") \
            .execute()

        # Sucursales para el dropdown agrupado
        suc_res = sb.table("sucursales_v2") \
            .select("id_sucursal, nombre_erp") \
            .eq("id_distribuidor", dist_id) \
            .execute()
        suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_res.data or [])}

        # Enriquecer vendedores con nombre de sucursal (mismo shape que antes)
        vendedores = [
            {**v, "sucursales": {"nombre_erp": suc_map.get(v["id_sucursal"], f"Sucursal {v['id_sucursal']}")}}
            for v in (vend_res.data or [])
        ]

        # Alias id_vendedor_v2 → id_vendedor para compat con el frontend
        integrantes = [
            {**ig, "id_vendedor": ig.get("id_vendedor_v2")}
            for ig in (ig_res.data or [])
        ]

        mapeados = sum(1 for ig in integrantes if ig.get("id_vendedor"))
        total    = len(integrantes)

        return {
            "integrantes": integrantes,
            "vendedores":  vendedores,
            "stats": {"total": total, "mapeados": mapeados, "sin_mapear": total - mapeados},
        }
    except Exception as e:
        logger.error(f"Error en get_mapeo_integrantes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put(
    "/api/admin/mapeo/integrante/{id_integrante}/vendedor",
    tags=["Mapeo"],
    summary="Asigna (o desasigna) un vendedor ERP a un integrante",
)
def set_mapeo_vendedor(id_integrante: int, req: MapeoVendedorRequest, user_payload=Depends(verify_auth)):
    try:
        # Verificar que el integrante pertenece al distribuidor del usuario
        ig = sb.table("integrantes_grupo") \
            .select("id_integrante, id_distribuidor") \
            .eq("id_integrante", id_integrante) \
            .maybe_single() \
            .execute()
        if not ig.data:
            raise HTTPException(status_code=404, detail="Integrante no encontrado")
        check_dist_permission(user_payload, ig.data["id_distribuidor"])

        sb.table("integrantes_grupo") \
            .update({"id_vendedor_v2": req.id_vendedor}) \
            .eq("id_integrante", id_integrante) \
            .execute()

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en set_mapeo_vendedor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Admin: Monitor (sesiones, metricas, alertas) ---

@app.get("/api/admin/monitor/sesiones", summary="Sesiones activas del portal")
def admin_monitor_sesiones(_=Depends(verify_auth)):
    # Simple query on sessions table - no complex JOINs needed for now
    result = sb.table("sessions").select("*").eq("activa", True).order("last_seen_at", desc=True).execute()
    return result.data or []


@app.get("/api/admin/monitor/metricas", summary="Metricas del dia")
def admin_monitor_metricas(_=Depends(verify_auth)):
    hoy = datetime.now().strftime("%Y-%m-%d")
    # Sessions and events tables are empty in the migration - return defaults
    return {
        "logins_hoy": 0, "usuarios_unicos": 0, "exportaciones": 0,
        "pantalla_top": "-", "tiempo_medio_min": 0,
    }


@app.get("/api/admin/monitor/alertas", summary="Alertas activas")
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


@app.get("/api/dashboard/kpis/{distribuidor_id}", summary="KPIs del dashboard por período")
def dashboard_kpis(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_kpis", {
        "p_dist_id": distribuidor_id, 
        "p_periodo": periodo,
        "p_sucursal_id": sucursal_id
    }).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/api/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(distribuidor_id: int, periodo: str = "mes", top: int = 15, sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_ranking", {
        "p_dist_id": distribuidor_id,
        "p_periodo": periodo,
        "p_top": top,
        "p_sucursal_id": sucursal_id
    }).execute()
    rows = result.data or []

    # Resolver nombres Telegram → ERP y re-agregar (un mismo ERP puede tener N integrantes Telegram)
    erp_name_map = _get_erp_name_map(distribuidor_id)
    aggregated: dict = {}
    NUMERIC_FIELDS = ("total", "aprobadas", "rechazadas", "destacadas", "pendientes",
                      "total_enviadas", "total_aprobadas", "total_rechazadas", "total_destacadas")
    for row in rows:
        tg_name = (row.get("vendedor") or "").strip()
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if erp_name not in aggregated:
            aggregated[erp_name] = {**row, "vendedor": erp_name}
        else:
            for field in NUMERIC_FIELDS:
                if field in row:
                    aggregated[erp_name][field] = (aggregated[erp_name].get(field) or 0) + (row.get(field) or 0)

    # Re-ordenar por total descendente y aplicar top
    sort_key = "total" if "total" in (rows[0] if rows else {}) else "total_enviadas"
    sorted_rows = sorted(aggregated.values(), key=lambda x: x.get(sort_key) or 0, reverse=True)
    return sorted_rows[:top]

@app.get("/api/dashboard/evolucion-tiempo/{distribuidor_id}", summary="Evolución temporal de exhibiciones")
def dashboard_evolucion(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_evolucion_tiempo", {
        "p_dist_id": distribuidor_id, 
        "p_periodo": periodo,
        "p_sucursal_id": sucursal_id
    }).execute()
    return res.data or []

@app.get("/api/dashboard/por-ciudad/{distribuidor_id}", summary="Rendimiento agrupado por ciudad")
def dashboard_por_ciudad(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_por_ciudad", {
        "p_dist_id": distribuidor_id, 
        "p_periodo": periodo,
        "p_sucursal_id": sucursal_id
    }).execute()
    return res.data or []

@app.get("/api/dashboard/por-empresa", summary="Rendimiento agrupado por empresa (Superadmin)")
def dashboard_por_empresa(periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    # Solo superadmins o con permiso global
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para Superadmins")
    res = sb.rpc("fn_dashboard_por_empresa", {
        "p_periodo": periodo,
        "p_sucursal_id": sucursal_id
    }).execute()
    return res.data or []


@app.get("/api/dashboard/ultimas-evaluadas/{distribuidor_id}", summary="Últimas fotos evaluadas con fallback de días")
def dashboard_ultimas(distribuidor_id: int, n: int = 8, payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
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


# ─── Proxy de imagen Drive (removido) ────────────────────────────────────────
# Las fotos se almacenan en Supabase Storage. El endpoint de Drive ya no es necesario.

@app.get("/api/dashboard/imagen/{file_id}", summary="Proxy de imagen — Removido")
def dashboard_imagen(file_id: str):
    """Endpoint legado de proxy Drive. Las fotos ahora están en Supabase Storage."""
    raise HTTPException(status_code=410, detail="Endpoint removido. Las fotos se sirven directamente desde Supabase Storage.")


# ─── Módulo Cuentas Corrientes ───────────────────────────────────────────────

from fastapi.responses import JSONResponse

def _enrich_and_store_cc(dist_id: int, fecha_snapshot: str, rows: list) -> int:
    """
    Enriquece filas de cuentas corrientes con id_vendedor/id_sucursal desde
    vendedores_v2 y hace insert en cc_detalle (previa eliminación del snapshot
    del mismo día para garantizar idempotencia).
    Devuelve cantidad de registros guardados.
    Lanza excepción en caso de error para que el caller pueda propagarla.
    """
    vend_res = sb.table("vendedores_v2") \
        .select("id_vendedor, nombre_erp, id_sucursal") \
        .eq("id_distribuidor", int(dist_id)) \
        .execute()
    suc_res = sb.table("sucursales_v2") \
        .select("id_sucursal, id_sucursal_erp, nombre_erp") \
        .eq("id_distribuidor", int(dist_id)) \
        .execute()

    suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_res.data or [])}
    # Mapeo por id_sucursal_erp (código numérico del ERP) → nombre_erp
    # Usado como fallback cuando el name matching de vendedor falla
    suc_erp_map = {
        str(s["id_sucursal_erp"]): s["nombre_erp"]
        for s in (suc_res.data or [])
        if s.get("id_sucursal_erp") is not None
    }
    vend_map: dict = {}
    for v in (vend_res.data or []):
        nombre = (v.get("nombre_erp") or "").strip().lower()
        if not nombre:
            continue
        info = {
            "id_vendedor": v["id_vendedor"],
            "id_sucursal": v["id_sucursal"],
            "sucursal_nombre": suc_map.get(v["id_sucursal"], ""),
        }
        vend_map[nombre] = info
        # Indexar también por nombre-sólo, sin el prefijo "CODE-" del padrón
        # (ej. "1-ramiro cornejo" → también clave "ramiro cornejo")
        # para hacer match con el formato CC Excel "1 0001 - RAMIRO CORNEJO"
        name_only = re.sub(r"^\d+\s*-\s*", "", nombre).strip()
        if name_only and name_only != nombre:
            vend_map.setdefault(name_only, info)

    records = []
    for row in rows:
        v_nombre_raw = (row.get("vendedor") or "Sin Vendedor").strip()
        v_lower = v_nombre_raw.lower()
        enrichment = vend_map.get(v_lower)
        if not enrichment:
            # intenta sin prefijo de código ERP tipo "1 0001 - " o "01 - "
            stripped = re.sub(r"^\d+[\s\d]*-\s*", "", v_nombre_raw, flags=re.IGNORECASE).strip().lower()
            if stripped and stripped != v_lower:
                enrichment = vend_map.get(stripped)

        # Chequeo explícito de None para no descartar valores 0.0 con operador "or"
        deuda_raw = row.get("deuda_total")
        if deuda_raw is None:
            deuda_raw = row.get("saldo_total")
        deuda_total = float(deuda_raw) if deuda_raw is not None else 0.0

        records.append({
            "id_distribuidor": int(dist_id),
            "id_vendedor": enrichment["id_vendedor"] if enrichment else None,
            "id_sucursal": enrichment["id_sucursal"] if enrichment else None,
            "vendedor_nombre": v_nombre_raw,
            "sucursal_nombre": enrichment["sucursal_nombre"] if enrichment else (
                suc_erp_map.get(str(row.get("sucursal") or "")) or row.get("sucursal") or ""
            ),
            "cliente_nombre": (row.get("cliente") or "Sin Cliente").strip(),
            "deuda_total": deuda_total,
            "rango_antiguedad": row.get("rango_antiguedad"),
            "antiguedad_dias": int(row.get("antiguedad") or 0),
            "cantidad_comprobantes": int(row.get("cantidad_comprobantes") or row.get("cant_cbte") or 0),
            "alerta_credito": row.get("alerta_credito") or row.get("Alerta de Crédito") or "",
            "fecha_snapshot": fecha_snapshot,
            "id_cliente_erp": str(row["cod_cliente"]) if row.get("cod_cliente") else None,
        })

    # Deduplicar por (vendedor_nombre, cliente_nombre): el Excel puede tener
    # múltiples filas por el mismo par (una por comprobante). Sumamos deuda y
    # comprobantes, y nos quedamos con la antigüedad máxima (la más vieja).
    dedup: dict = {}
    for r in records:
        key = (r["vendedor_nombre"], r["cliente_nombre"])
        if key not in dedup:
            dedup[key] = r.copy()
        else:
            existing = dedup[key]
            existing["deuda_total"] += r["deuda_total"]
            existing["cantidad_comprobantes"] += r["cantidad_comprobantes"]
            if r["antiguedad_dias"] > existing["antiguedad_dias"]:
                existing["antiguedad_dias"] = r["antiguedad_dias"]
                existing["rango_antiguedad"] = r["rango_antiguedad"]
    records = list(dedup.values())

    if records:
        # Eliminar registros previos del mismo snapshot antes de insertar,
        # garantizando que una re-sincronización del día reemplaza los datos
        # sin depender de un UNIQUE constraint en la tabla.
        sb.table("cc_detalle") \
            .delete() \
            .eq("id_distribuidor", int(dist_id)) \
            .eq("fecha_snapshot", fecha_snapshot) \
            .execute()
        sb.table("cc_detalle").insert(records).execute()
    logger.info(
        f"_enrich_and_store_cc dist={dist_id}: {len(records)} registros guardados "
        f"en cc_detalle (snapshot {fecha_snapshot})"
    )
    return len(records)

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

        # Construir mapa de sucursales desde sucursales_v2
        mapa_sucursales = {}
        try:
            result = sb.table("sucursales_v2").select("id_sucursal_erp, nombre_erp").execute()
            for row in (result.data or []):
                mapa_sucursales[str(row["id_sucursal_erp"])] = row["nombre_erp"]
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
            
        tenant_id = config_data.get("tenant_id")
        id_dist = config_data.get("id_distribuidor")
        if tenant_id:
            try:
                import datetime as dt
                fecha_str = dt.datetime.now().strftime("%Y-%m-%d")
                sb.table("cuentas_corrientes_data").upsert({
                    "tenant_id": tenant_id,
                    "id_distribuidor": id_dist,
                    "fecha": fecha_str,
                    "data": json_data,
                    "file_b64": b64_file
                }, on_conflict="tenant_id, fecha").execute()
            except Exception as e:
                print(f"Advertencia: No se pudo guardar en Supabase: {e}")

        # Enriquecer y guardar en cc_detalle (tabla normalizada)
        if id_dist:
            try:
                import datetime as dt
                fecha_str = dt.datetime.now().strftime("%Y-%m-%d")
                rows_cc = []
                for vend_name, vend_data in json_data.get("vendedores", {}).items():
                    for r in vend_data.get("tabla", []):
                        rows_cc.append({
                            "vendedor": r.get("Vendedor", vend_name),
                            "cliente": r.get("Cliente", ""),
                            "saldo_total": r.get("Saldo Total", 0),
                            "antiguedad": r.get("Antigüedad (días)", 0),
                            "cant_cbte": r.get("Cant. Comprobantes", 0),
                            "alerta_credito": r.get("Alerta de Crédito", ""),
                        })
                if rows_cc:
                    _enrich_and_store_cc(id_dist, fecha_str, rows_cc)
            except Exception as e:
                logger.error(f"Error guardando en cc_detalle (upload manual dist={id_dist}): {e}")

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


@app.post("/api/v1/sync/cuentas-corrientes", summary="Sync Cuentas Corrientes JSON (RPA)")
async def sync_cuentas_corrientes(
    request: Request,
    id_distribuidor: int = Query(...),
    user_key: str = Depends(verify_key)
):
    try:
        payload = await request.json()
        tenant_id = payload.get("tenant_id")
        datos = payload.get("datos")
        if not tenant_id or not datos:
            raise HTTPException(status_code=400, detail="Falta tenant_id o datos")

        import datetime as dt
        fecha_str = dt.datetime.now().strftime("%Y-%m-%d")

        sb.table("cuentas_corrientes_data").upsert({
            "tenant_id": tenant_id,
            "id_distribuidor": id_distribuidor,
            "fecha": fecha_str,
            "data": datos,
            "file_b64": None
        }, on_conflict="tenant_id, fecha").execute()

        # Enriquecer y guardar en cc_detalle (tabla normalizada)
        rows_cc = datos.get("detalle_cuentas", [])
        saved = 0
        if rows_cc:
            saved = _enrich_and_store_cc(id_distribuidor, fecha_str, rows_cc)

        return {"ok": True, "message": "Datos sincronizados", "registros_cc_detalle": saved}
    except Exception as e:
        logger.error(f"Error sync cuentas corrientes dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cuentas-corrientes/{id_distribuidor}", summary="Obtener Cuentas Corrientes")
async def get_cuentas_corrientes(
    id_distribuidor: int,
    user_payload: dict = Depends(verify_auth)
):
    try:
        res = sb.table("cuentas_corrientes_data").select("*").eq("id_distribuidor", id_distribuidor).order("fecha", desc=True).limit(1).execute()
        if not res.data:
            return {"data": None, "file_b64": None, "fecha": None}
        return res.data[0]
    except Exception as e:
        print(f"Error get cuentas corrientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# ─── ERP: Carga Global y Reportes Avanzados ───────────────────────────────────

@app.post("/api/admin/erp/upload-global", summary="Carga global de archivos ERP (Ventas, Clientes)")
async def erp_upload_global(
    tipo: str = Query(...), # 'ventas' o 'clientes'
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth)
):
    """
    Endpoint centralizado para subir archivos Excel del ERP.
    """
    try:
        # Extraer dist_id del token (o usar el del payload si es admin de una sola)
        dist_id = user_payload.get("id_distribuidor")
        if not dist_id and not user_payload.get("is_superadmin"):
            raise HTTPException(status_code=403, detail="No tienes un distribuidor asignado.")

        # Si es superadmin y no envió dist_id, podriamos inferirlo o pedirlo. 
        # Pero por ahora usamos el del usuario logueado.
        
        contents = await file.read()
        buffer = io.BytesIO(contents)
        
        count = 0
        if tipo == "ventas":
            count = erp_service.ingest_ventas_xlsx(buffer, dist_id)
        elif tipo == "clientes":
            count = erp_service.ingest_clientes_xlsx(buffer, dist_id)
        else:
            raise HTTPException(status_code=400, detail="Tipo de archivo no soportados")
            
        return {"ok": True, "message": f"Archivo de {tipo} procesado.", "count": count}
    except Exception as e:
        logger.error(f"Error en upload-global: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reports/ventas-resumen/{dist_id}")
def report_ventas_resumen(
    dist_id: int, 
    desde: str = Query(...), 
    hasta: str = Query(...),
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_resumen", {
        "p_dist_id": dist_id,
        "p_desde": desde,
        "p_hasta": hasta
    }).execute()
    return res.data or []

@app.get("/api/reports/ventas-bultos/{dist_id}")
def report_ventas_bultos(
    dist_id: int, 
    desde: str = Query(...), 
    hasta: str = Query(...),
    proveedor: str = Query(None),
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_detallado", {
        "p_dist_id": dist_id,
        "p_desde": desde,
        "p_hasta": hasta,
        "p_proveedor_busqueda": proveedor
    }).execute()
    return res.data or []

@app.get("/api/reports/auditoria-sigo/{dist_id}")
def report_auditoria_sigo(
    dist_id: int, 
    desde: str = Query(...), 
    hasta: str = Query(...),
    user_payload=Depends(verify_auth)
):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_sigo_audit", {
        "p_dist_id": dist_id,
        "p_desde": desde,
        "p_hasta": hasta
    }).execute()
    return res.data or []


# ─── Reportes endpoints ───────────────────────────────────────────────────────

class ReporteQuery(BaseModel):
    fecha_desde: str
    fecha_hasta: str
    vendedores: List[str] = []
    estados: List[str] = []
    tipos_pdv: List[str] = []
    sucursales: List[str] = []
    nro_cliente: str = ""


@app.get("/api/reportes/vendedores/{distribuidor_id}", summary="Vendedores unicos para filtro de reportes")
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


@app.get("/api/reportes/tipos-pdv/{distribuidor_id}", summary="Tipos de PDV unicos")
def reportes_tipos_pdv(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("exhibiciones").select("tipo_pdv")
    if distribuidor_id > 0:
        q = q.eq("id_distribuidor", distribuidor_id)
    result = q.not_.is_("tipo_pdv", "null").execute()
    return sorted(set(r["tipo_pdv"] for r in (result.data or []) if r.get("tipo_pdv")))


@app.get("/api/reportes/sucursales/{distribuidor_id}", summary="Sucursales unicas")
def reportes_sucursales(distribuidor_id: int, _=Depends(verify_auth)):
    # Get all sucursales for the distribuidor
    q = sb.table("sucursales").select("nombre_erp")
    if distribuidor_id > 0:
        q = q.eq("id_distribuidor", distribuidor_id)
    result = q.execute()
    return sorted(list(set(r["nombre_erp"] for r in (result.data or []) if r.get("nombre_erp"))))



@app.post("/api/reportes/exhibiciones/{distribuidor_id}", summary="Consulta de exhibiciones con filtros")
def reportes_exhibiciones(distribuidor_id: int, q_body: ReporteQuery, _=Depends(verify_auth)):
    # Build query using Supabase client
    query = sb.table("exhibiciones").select(
        "id_exhibicion, estado, tipo_pdv, supervisor_nombre, comentario_evaluacion, "
        "timestamp_subida, evaluated_at, url_foto_drive, id_integrante, id_cliente"
    )
    # Date filters (using timestamp_subida with Argentina TZ)
    query = query.gte("timestamp_subida", f"{q_body.fecha_desde}T03:00:00Z")
    query = query.lte("timestamp_subida", f"{q_body.fecha_hasta}T23:59:59Z")
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
        ig = sb.table("integrantes_grupo")\
            .select("id_integrante, nombre_integrante, vendedores_v2(nombre_erp)")\
            .in_("id_integrante", integrante_ids).execute()
        for r in (ig.data or []):
            vend = r.get("vendedores_v2")
            nombre_erp = None
            if isinstance(vend, dict):
                nombre_erp = vend.get("nombre_erp")
            elif isinstance(vend, list) and vend:
                nombre_erp = vend[0].get("nombre_erp")
            vendedores_map[r["id_integrante"]] = nombre_erp or r["nombre_integrante"]
    if cliente_ids:
        cl = sb.table("clientes_pdv_v2").select("id_cliente, id_cliente_erp").in_("id_cliente", cliente_ids).execute()
        clientes_map = {r["id_cliente"]: r["id_cliente_erp"] for r in (cl.data or [])}
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


@app.get("/api/bonos/config/{id_distribuidor}", summary="Obtener config de bonos del mes")
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


@app.post("/api/bonos/config/{id_distribuidor}/guardar", summary="Guardar config de bonos del mes")
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


@app.post("/api/bonos/config/{id_distribuidor}/bloquear", summary="Bloquear/desbloquear config (superadmin)")
def bonos_bloquear(id_distribuidor: int, anio: int, mes: int, bloquear: int = 1, _=Depends(verify_auth)):
    sb.table("bonos_config").update({"edicion_bloqueada": bloquear}).eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    return {"ok": True, "edicion_bloqueada": bloquear}


@app.get("/api/bonos/liquidacion/{id_distribuidor}", summary="Liquidacion de bonos del mes")
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


@app.get("/api/bonos/detalle/{id_distribuidor}", summary="Detalle de exhibiciones de un vendedor en el mes")
def bonos_detalle(id_distribuidor: int, id_integrante: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_bonos_detalle", {
        "p_dist_id": id_distribuidor, "p_integrante": id_integrante,
        "p_anio": anio, "p_mes": mes,
    }).execute()
    return result.data or []


# ─── Admin: Locations / Clientes / Asignación ────────────────────────────────

class AsignarVendedorRequest(BaseModel):
    id_integrante: int | None = None   # None = desasignar (poner NULL)

class MappingItem(BaseModel):
    id_integrante: int
    location_id: str | None = None
    id_vendedor_erp: str | None = None

class BulkMappingRequest(BaseModel):
    mappings: List[MappingItem]

class IntegranteRequest(BaseModel):
    nombre_integrante: str
    rol_telegram: str | None = None
    location_id: str | None = None
    telegram_user_id: int | None = None
    telegram_group_id: int | None = None


@app.get("/api/admin/locations/{dist_id}", summary="Sucursales de un distribuidor")
def admin_get_locations(dist_id: int, _=Depends(verify_auth)):
    # Fetch unique sucursales from new relational model
    q = sb.table("sucursales").select("nombre_erp, id_sucursal_erp").eq("id_distribuidor", dist_id)
    if dist_id > 0:
        q = q.eq("ID_DIST", dist_id)
    
    res = q.execute()
    # Deduplicate and format to match previous structure
    seen = set()
    formatted = []
    for row in (res.data or []):
        sid = row.get("id suc")
        if sid and sid not in seen:
            seen.add(sid)
            formatted.append({
                "location_id": sid, # Using ERP ID as location_id
                "label": row.get("SUCURSAL"),
                "ciudad": "-",
                "provincia": "-"
            })
    return sorted(formatted, key=lambda x: x["label"])

@app.put("/api/admin/locations/{location_id}", summary="Editar sucursal")
def admin_update_location(location_id: str, req: LocationRequest, _=Depends(verify_auth)):
    # This is deprecated but we'll keep the signature for now if needed by frontend
    # Since locations table is being deleted, this will eventually error or we handle it gracefully
    return {"ok": True}

@app.get("/api/admin/usuarios/{dist_id}", summary="Listar todos los integrantes (Telegram)")
def admin_get_usuarios_telegram(dist_id: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_usuarios_telegram", {"p_dist_id": dist_id}).execute()
    return result.data or []

@app.post("/api/admin/integrantes/{dist_id}", summary="Crear un nuevo integrante manualmente")
def admin_create_integrante(dist_id: int, req: IntegranteRequest, _=Depends(verify_auth)):
    """Permite crear manualmente un usuario (ej. vendedor) sin que haya interactuado con el bot primero."""
    result = sb.table("integrantes_grupo").insert({
        "id_distribuidor": dist_id, "telegram_user_id": req.telegram_user_id or 0,
        "nombre_integrante": req.nombre_integrante, "rol_telegram": req.rol_telegram,
        "id_sucursal_erp": str(req.location_id) if req.location_id else None, 
        "telegram_group_id": req.telegram_group_id or 0,
    }).execute()
    new_id = result.data[0]["id_integrante"] if result.data else None
    return {"ok": True, "id_integrante": new_id}

@app.put("/api/admin/integrantes/{id_integrante}", summary="Editar nombre/rol de integrante")
def admin_update_integrante(id_integrante: int, req: IntegranteUpdateRequest, _=Depends(verify_auth)):
    """Permite al SuperAdmin cambiar el nombre y rol del integrante independientemente de Telegram."""
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return {"ok": True}
        
    sb.table("integrantes_grupo").update(update_data).eq("id_integrante", id_integrante).execute()
    return {"ok": True}


@app.get("/api/admin/vendedores-by-location/{location_id}", summary="Vendedores de una sucursal")
def admin_vendedores_by_location(location_id: str, dist_id: int, _=Depends(verify_auth)):
    """
    Retorna los vendedores asignados a una sucursal específica (ERP ID).
    """
    result = sb.table("integrantes_grupo").select(
        "id_integrante, nombre_integrante, telegram_user_id"
    ).eq("id_sucursal_erp", location_id).eq("id_distribuidor", dist_id).eq(
        "rol_telegram", "vendedor"
    ).order("nombre_integrante").execute()
    return result.data or []


@app.get("/api/admin/hierarchy-config/{dist_id}", summary="Configuración de jerarquía consolidada")
def get_hierarchy_config(dist_id: int, _=Depends(verify_auth)):
    """
    Jerarquía consolidada basada en el nuevo modelo: Sucursales -> Vendedores.
    """
    try:
        # 1. Authoritative Names from new tables
        suc_res = sb.table("sucursales").select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).execute()
        suc_names = {s['id_sucursal']: s['nombre_erp'] for s in (suc_res.data or [])}

        vend_res = sb.table("vendedores").select("id_vendedor, nombre_erp, id_sucursal").eq("id_distribuidor", dist_id).execute()
        
        # 2. Build Hierarchy Tree
        hierarchy_map = {}
        for v in (vend_res.data or []):
            sid = v.get("id_sucursal")
            vid = v.get("id_vendedor")
            if not sid or not vid: continue
            
            vname = v.get("nombre_erp") or f"Vendedor {vid}"
            
            if sid not in hierarchy_map:
                hierarchy_map[sid] = {
                    "sucursal_id": sid,
                    "sucursal_nombre": suc_names.get(sid) or f"Sucursal {sid}",
                    "vendedores": []
                }
            hierarchy_map[sid]["vendedores"].append({
                "vendedor_id": vid,
                "vendedor_nombre": vname
            })

        formatted_erp = sorted(list(hierarchy_map.values()), key=lambda x: x["sucursal_nombre"])

        # 3. Locations (backwards compat)
        formatted_locs = [{"location_id": sid, "label": sname} for sid, sname in suc_names.items()]

        # 4. Telegram Groups
        groups = sb.table("integrantes_grupo").select("telegram_group_id, nombre_grupo").eq("id_distribuidor", dist_id).execute()
        formatted_groups = [{"id": g.get("telegram_group_id"), "nombre": g.get("nombre_grupo") or f"Grupo {g.get('telegram_group_id')}"} 
                            for g in (groups.data or []) if g.get("telegram_group_id")]

        # 5. Integrantes
        integrantes = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, id_vendedor_erp, id_sucursal_erp, telegram_group_id").eq("id_distribuidor", dist_id).execute()

        return {
            "locations": formatted_locs,
            "erp_hierarchy": formatted_erp,
            "telegram_groups": formatted_groups,
            "integrantes": integrantes.data or []
        }
    except Exception as e:
        logger.error(f"Error fetching hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/hierarchy-config/save/{dist_id}", summary="Guardado masivo de jerarquía")
def save_hierarchy_config(dist_id: int, req: BulkMappingRequest, _=Depends(verify_auth)):
    """
    Guarda múltiples mapeos de una sola vez.
    """
    try:
        for item in req.mappings:
            sb.table("integrantes_grupo").update({
                "id_sucursal_erp": str(item.location_id) if item.location_id else None,
                "id_vendedor_erp": item.id_vendedor_erp
            }).eq("id_integrante", item.id_integrante).eq("id_distribuidor", dist_id).execute()
        
        return {"ok": True, "message": f"Se procesaron {len(req.mappings)} mapeos."}
    except Exception as e:
        logger.error(f"Error saving hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/hierarchy/sucursales/{dist_id}", tags=["Hierarchy"], summary="Listar sucursales de una distribuidora")
def get_hierarchy_sucursales(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("sucursales").select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
    return res.data or []

@app.get("/api/admin/hierarchy/vendedores/{sucursal_id}", tags=["Hierarchy"], summary="Listar vendedores de una sucursal")
def get_hierarchy_vendedores(sucursal_id: int, _=Depends(verify_auth)):
    res = sb.table("vendedores").select("id_vendedor, nombre_erp").eq("id_sucursal", sucursal_id).order("nombre_erp").execute()
    return res.data or []

@app.get("/api/admin/hierarchy/rutas/{vendedor_id}", tags=["Hierarchy"], summary="Listar rutas de un vendedor")
def get_hierarchy_rutas(vendedor_id: int, _=Depends(verify_auth)):
    res = sb.table("rutas").select("id_ruta, id_ruta_erp, dia_semana, periodicidad").eq("id_vendedor", vendedor_id).order("id_ruta_erp").execute()
    return res.data or []

@app.get("/api/admin/hierarchy/clientes-pdv/{ruta_id}", tags=["Hierarchy"], summary="Listar clientes de una ruta")
def get_hierarchy_clientes_pdv(ruta_id: int, _=Depends(verify_auth)):
    res = sb.table("clientes_pdv_v2").select("id_cliente, id_cliente_erp, nombre_fantasia, domicilio").eq("id_ruta", ruta_id).order("nombre_fantasia").execute()
    return res.data or []


@app.get("/api/admin/unified-dashboard", summary="Dashboard unificado ERP 3.0")
def get_unified_dashboard(_=Depends(verify_auth)):
    """
    Retorna la estructura jerárquica completa para el nuevo frontend unificado.
    Basado en el nuevo modelo: Distribuidor -> Sucursales -> Vendedores -> Integrantes
    """
    try:
        # 1. Fetch Distribuidores
        dist_res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, id_erp").execute()
        distribuidores = dist_res.data or []
        
        # 2. Fetch Hierarchy
        suc_res = sb.table("sucursales").select("id_sucursal, id_distribuidor, nombre_erp").execute()
        sucursales_db = suc_res.data or []
        
        ven_res = sb.table("vendedores").select("id_vendedor, id_sucursal, id_distribuidor, nombre_erp").execute()
        vendedores_db = ven_res.data or []
        
        # 3. Fetch Integrantes
        int_res = sb.table("integrantes_grupo").select("id_integrante, id_distribuidor, nombre_integrante, id_vendedor_erp, id_sucursal_erp, rol_telegram, telegram_group_id").execute()
        integrantes_db = int_res.data or []

        result = []
        for dist in distribuidores:
            did = dist["id_distribuidor"]
            dist_id_erp = dist.get("id_erp")
            dist_data = {
                "id_distribuidor": did,
                "nombre_empresa": dist["nombre_empresa"],
                "id_erp_global": dist_id_erp,
                "token": dist.get("token_bot", ""),
                "sucursales": [],
                "unmapped_integrantes": []
            }
            
            # Build Sucursales
            suc_list = [s for s in sucursales_db if s["id_distribuidor"] == did]
            suc_ids_dist = {s["id_sucursal"] for s in suc_list}
            ven_list = [v for v in vendedores_db if v.get("id_distribuidor") == did or v.get("id_sucursal") in suc_ids_dist]
            int_list = [i for i in integrantes_db if i["id_distribuidor"] == did]
            
            for suc in suc_list:
                s_id = suc["id_sucursal"]
                suc_data = {
                    "id": s_id,
                    "nombre_sucursal": suc["nombre_erp"],
                    "vendedores": []
                }
                
                # Build Vendedores
                s_vendedores = [v for v in ven_list if v["id_sucursal"] == s_id]
                for ven in s_vendedores:
                    v_id = ven["id_vendedor"]
                    v_name = ven["nombre_erp"]
                    ven_data = {
                        "id": v_id,
                        "vendedor_nombre": v_name,
                        "integrantes": []
                    }
                    
                    # Assigned Integrantes (Buscamos por ID de vendedor real en el campo id_vendedor_erp histórico si aplica, 
                    # o por mapeo futuro. Por ahora mantenemos compatibilidad con el nombre si id_vendedor_erp es texto)
                    assigned = [i for i in int_list if i.get("id_vendedor_erp") == v_name]
                    for a in assigned:
                        ven_data["integrantes"].append({
                            "id_integrante": a["id_integrante"],
                            "nombre": a["nombre_integrante"],
                            "rol_telegram": a["rol_telegram"],
                            "telegram_group_id": a["telegram_group_id"]
                        })
                    
                    suc_data["vendedores"].append(ven_data)
                
                dist_data["sucursales"].append(suc_data)
                
            # Unmapped Integrantes
            unmapped = [i for i in int_list if not i.get("id_vendedor_erp")]
            for u in unmapped:
                dist_data["unmapped_integrantes"].append({
                    "id_integrante": u["id_integrante"],
                    "nombre": u["nombre_integrante"],
                    "rol_telegram": u["rol_telegram"],
                    "telegram_group_id": u["telegram_group_id"]
                })
                
            result.append(dist_data)
            
        return result
    except Exception as e:
        logger.error(f"Error fetching unified dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/clientes", summary="Clientes con filtros en cascada")
def admin_get_clientes(
    dist_id: int,
    location_id: str | None = None,
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


@app.put("/api/admin/clientes/{id_cliente}/vendedor", summary="Asignar o reasignar vendedor a un cliente")
def admin_asignar_vendedor(
    id_cliente: int, req: AsignarVendedorRequest, _=Depends(verify_auth)
):
    """
    Asigna (o des-asigna con id_integrante=null) el vendedor de un cliente.
    Es el punto de corrección manual desde el Panel Admin.
    """
    r = sb.table("clientes_pdv_v2").update({"id_vendedor": req.id_integrante}).eq("id_cliente", id_cliente).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True, "id_cliente": id_cliente, "id_integrante": req.id_integrante}


# ─── Dashboard: stats por sucursal ───────────────────────────────────────────

@app.get("/api/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
def dashboard_por_sucursal(distribuidor_id: int, periodo: str = "mes", sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_por_sucursal", {
        "p_dist_id": distribuidor_id, 
        "p_periodo": periodo
    }).execute()
    return res.data or []


@app.get("/api/admin/erp/vendedores/{dist_id}", summary="Obtener lista de vendedores activos en ERP")
def get_erp_vendedores(dist_id: int, _=Depends(verify_auth)):
    """Retorna la lista de vendedores desde la nueva tabla maestra de vendedores."""
    res = sb.table("vendedores").select("nombre_erp").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
    return [r["nombre_erp"] for r in (res.data or [])]

# Endpoints de mapeo manual eliminados (Fase 5 - Hoja de Ruta)

# ─── ERP: Configuración y Reportes ───────────────────────────────────────────

class ERPConfigAlertas(BaseModel):
    limite_dinero: float
    limite_cbte: int
    limite_dias: int
    activo: bool = True
    limite_dinero_activo: bool = True
    limite_cbte_activo: bool = True
    limite_dias_activo: bool = True
    excepciones: List[dict] = []

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
            "activo": True,
            "limite_dinero_activo": True,
            "limite_cbte_activo": True,
            "limite_dias_activo": True,
            "excepciones": []
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

@app.get("/api/admin/hierarchy/{dist_id}", tags=["Admin"])
def get_hierarchy(dist_id: int, user_payload=Depends(verify_auth)):
    """Consolidado de jerarquía: Sucursal -> Vendedores/Telegram."""
    check_dist_permission(user_payload, dist_id)
    
    try:
        # 1. Sucursales
        res_loc = sb.table("sucursales").select("nombre_erp, id_sucursal_erp").eq("id_distribuidor", dist_id).execute()
        seen_locs = set()
        locs = []
        for row in (res_loc.data or []):
            sid = row.get("id_sucursal_erp")
            if sid and sid not in seen_locs:
                seen_locs.add(sid)
                locs.append({"location_id": sid, "label": row.get("nombre_erp") or "Sucursal " + str(sid)})
        
        # 2. Vendedores (Integrantes)
        vendedores = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute().data or []
        
        # 3. Armar estructura
        hierarchy = []
        for loc in locs:
            sucursal_node = {
                **loc,
                "vendedores": [v for v in vendedores if v.get("id_sucursal_erp") == loc["location_id"]]
            }
            hierarchy.append(sucursal_node)
            
        # Añadir vendedores sin sucursal
        sin_sucursal = [v for v in vendedores if not v.get("id_sucursal_erp")]
        if sin_sucursal:
            hierarchy.append({
                "location_id": None,
                "label": "Sin Sucursal",
                "ciudad": "-",
                "provincia": "-",
                "vendedores": sin_sucursal
            })
            
        return hierarchy
    except Exception as e:
        logger.error(f"Error en jerarquía: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/hierarchy/map-seller", tags=["Admin"])
def map_seller_erp(data: dict, user_payload=Depends(verify_auth)):
    """Mapeo atómico de vendedor Telegram a ID ERP."""
    dist_id = data.get("dist_id")
    check_dist_permission(user_payload, dist_id)
    
    id_integrante = data.get("id_integrante")
    id_vendedor_erp = data.get("id_vendedor_erp")
    
    try:
        res = sb.table("integrantes_grupo").update({"id_vendedor_erp": id_vendedor_erp}).eq("id_integrante", id_integrante).execute()
        return res.data[0] if res.data else {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/hierarchy/map-sucursal", tags=["Admin"])
def map_integrante_sucursal(data: dict, user_payload=Depends(verify_auth)):
    dist_id = data.get("dist_id")
    check_dist_permission(user_payload, dist_id)
    id_integrante = data.get("id_integrante")
    location_id = data.get("location_id") # This is now the ERP Branch ID
    try:
        res = sb.table("integrantes_grupo").update({"id_sucursal_erp": str(location_id) if location_id else None}).eq("id_integrante", id_integrante).execute()
        return res.data[0] if res.data else {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/hierarchy/sync-from-erp/{dist_id}", tags=["Admin"])
def sync_hierarchy_from_erp(dist_id: int, user_payload=Depends(verify_auth)):
    """
    Sincronización masiva de jerarquía usando vendedores_v2.
    Vincula automáticamente a los integrantes de Telegram con su vendedor y sucursal ERP.
    """
    check_dist_permission(user_payload, dist_id)

    try:
        # 1. Obtener vendedores desde vendedores_v2
        res_vend = sb.table("vendedores_v2").select("nombre_erp, id_vendedor_erp, id_sucursal").eq("id_distribuidor", dist_id).execute()
        if not res_vend.data:
            return {"message": "No hay vendedores en vendedores_v2 para sincronizar.", "count": 0}

        # Resolver id_sucursal_erp para cada vendedor
        suc_ids = list(set(r["id_sucursal"] for r in res_vend.data if r.get("id_sucursal")))
        suc_erp_map: dict = {}
        if suc_ids:
            suc_res = sb.table("sucursales_v2").select("id_sucursal, id_sucursal_erp").in_("id_sucursal", suc_ids).execute()
            suc_erp_map = {r["id_sucursal"]: r["id_sucursal_erp"] for r in (suc_res.data or [])}

        # Mapeo de Vendedor (nombre normalizado) -> {id_vend, id_suc}
        import unicodedata
        def normalize_str(text: str) -> str:
            if not text or str(text).strip().upper() in ("NAN", "NONE", "NULL", "NA"):
                return ""
            text = str(text).strip().upper()
            return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

        vendedor_mapping = {}
        for row in res_vend.data:
            v_name = normalize_str(row.get("nombre_erp"))
            v_id = row.get("id_vendedor_erp")
            s_id = suc_erp_map.get(row.get("id_sucursal"))
            if v_name:
                vendedor_mapping[v_name] = {"v_id": v_id, "s_id": s_id}
                # También mapear sin prefijo 02- si existe
                if '-' in v_name:
                    v_clean = v_name.split('-', 1)[1].strip()
                    if v_clean: vendedor_mapping[v_clean] = {"v_id": v_id, "s_id": s_id}

        # 2. Mapear integrantes de Telegram
        integrantes = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute().data or []
        
        updated_count = 0
        for ig in integrantes:
            ig_nombre = normalize_str(ig.get("nombre_integrante"))
            if not ig_nombre: continue
            
            # Buscamos coincidencia en el mapping
            match = None
            if ig_nombre in vendedor_mapping:
                match = vendedor_mapping[ig_nombre]
            else:
                # Substring match parcial
                for v_key, v_val in vendedor_mapping.items():
                    if ig_nombre in v_key or v_key in ig_nombre:
                        match = v_val
                        break
            
            if match:
                v_erp_id = match["v_id"]
                s_erp_id = match["s_id"]
                
                # Actualizar si cambió algo
                if ig.get("id_vendedor_erp") != v_erp_id or ig.get("id_sucursal_erp") != s_erp_id:
                    sb.table("integrantes_grupo").update({
                        "id_vendedor_erp": str(v_erp_id) if v_erp_id else None,
                        "id_sucursal_erp": str(s_erp_id) if s_erp_id else None
                    }).eq("id_integrante", ig["id_integrante"]).execute()
                    updated_count += 1
        
        return {"ok": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Error en sync hierarchy: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reportes/clientes/listado/{dist_id}", tags=["Reportes"])
def get_clientes_listado(
    dist_id: int, 
    search: str = "", 
    sucursal_id: str = "",
    vendedor_id: str = "",
    limit: int = 200, 
    user_payload=Depends(verify_auth)
):
    """Retorna listado maestro de clientes con jerarquía (Sucursal/Vendedor)."""
    check_dist_permission(user_payload, dist_id)
    
    try:
        res = sb.rpc("fn_reporte_clientes_maestro", {
            "p_dist_id": dist_id,
            "p_search": search,
            "p_sucursal_id": sucursal_id,
            "p_vendedor_id": vendedor_id,
            "p_limit": limit
        }).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en listado de clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reportes/clientes/stats/{dist_id}", summary="KPIs de Padrón de Clientes", tags=["Reportes"])
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

@app.get("/api/reportes/sucursales/cruce/{dist_id}", summary="Cruce de datos ERP vs Shelfy por sucursal", tags=["Reportes"])
def get_sucursales_cruce(dist_id: int, periodo: str = Query("mes"), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_reporte_sucursales_cruce", {"p_dist_id": dist_id, "p_periodo": periodo}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en cruce de sucursales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/distribuidoras", tags=["Admin"])
@app.get("/api/admin/distribuidores", tags=["Admin"])
def list_distribuidores(solo_activas: bool = False, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        query = sb.table("distribuidores").select("*")
        if solo_activas:
            query = query.eq("estado", "activo")
        res = query.execute()
        
        # Mapeamos para el frontend
        data = []
        for d in (res.data or []):
            data.append({
                "id": d["id_distribuidor"],
                "id_distribuidor": d["id_distribuidor"], # Para compatibilidad Sidebar
                "nombre": d["nombre_empresa"],
                "nombre_dist": d["nombre_empresa"], # Para compatibilidad Sidebar
                "estado": d["estado"],
                "token": d.get("token_bot"),
                "carpeta_drive": d.get("id_carpeta_drive"),
                "ruta_cred": d.get("ruta_credencial_drive")
            })
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/distribuidoras", tags=["Admin"])
@app.post("/api/admin/distribuidores", tags=["Admin"])
def create_distribuidor(data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        payload = {
            "nombre_empresa": data["nombre"],
            "token_bot": data["token"],
            "id_carpeta_drive": data.get("carpeta_drive"),
            "ruta_credencial_drive": data.get("ruta_cred"),
            "estado": "activo"
        }
        res = sb.table("distribuidores").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/admin/distribuidoras/{dist_id}/estado", tags=["Admin"])
@app.patch("/api/admin/distribuidores/{dist_id}/estado", tags=["Admin"])
def toggle_distribuidor(dist_id: int, data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        res = sb.table("distribuidores").update({"estado": data["estado"]}).eq("id_distribuidor", dist_id).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/admin/distribuidoras/{dist_id}", tags=["Admin"])
@app.put("/api/admin/distribuidores/{dist_id}", tags=["Admin"])
def update_distribuidor(dist_id: int, data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        payload = {
            "nombre_empresa": data["nombre"],
            "token_bot": data["token"],
            "id_carpeta_drive": data.get("carpeta_drive"),
            "ruta_credencial_drive": data.get("ruta_cred")
        }
        res = sb.table("distribuidores").update(payload).eq("id_distribuidor", dist_id).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SuperAdmin: God Mode & Mapping Resolution (Step 3) ───────────────────────

@app.get("/api/superadmin/empresas-desconocidas", tags=["SuperAdmin"])
def get_unknown_companies(user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        res = sb.table("erp_empresas_desconocidas").select("*").order("fecha", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/superadmin/mapear-empresa", tags=["SuperAdmin"])
def map_unknown_company(data: dict, user_payload=Depends(verify_auth)):
    """
    Mapea una empresa que rebotó en el ETL a un id_distribuidor oficial.
    data: { nombre_erp: str, id_distribuidor: int }
    """
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    
    nombre_erp = data.get("nombre_erp")
    id_dist = data.get("id_distribuidor")
    
    try:
        # 1. Guardar en el mapeo oficial
        sb.table("erp_empresa_mapping").upsert({
            "nombre_erp": nombre_erp,
            "id_distribuidor": id_dist
        }).execute()
        
        # 2. Limpiar de la tabla de desconocidas
        sb.table("erp_empresas_desconocidas").delete().eq("nombre_erp", nombre_erp).execute()
        
        # 3. Recargar el servicio
        erp_service.reload_mappings()
        
        return {"status": "success", "message": f"Empresa {nombre_erp} mapeada correctamente al distribuidor {id_dist}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Admin: Identity Wall (Step 4) ───────────────────────────────────────────

@app.get("/api/admin/hierarchy/vendedores-huerfanos/{dist_id}", tags=["Admin"])
def get_orphan_vendedores(dist_id: int, user_payload=Depends(verify_auth)):
    """
    Lista vendedores que aparecen en erp_clientes_raw pero que no están 
    vinculados correctamente en integrantes_grupo (donde codigo_vendedor_erp es null).
    """
    check_dist_permission(user_payload, dist_id)
    try:
        # Esta lógica se delegará a un RPC para mayor eficiencia
        res = sb.rpc("fn_vendedores_huerfanos", {"p_dist_id": dist_id}).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── FASE 1 — Padrón de Clientes ─────────────────────────────────────────────

@app.post(
    "/api/admin/padron/upload/{dist_id}",
    tags=["Padrón"],
    summary="Carga manual del Padrón de Clientes — reconstruye jerarquía completa",
)
async def padron_upload(
    dist_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    """
    Recibe el Excel del Padrón y dispara la ingesta en background.
    La ingesta actualiza en cascada: sucursales → vendedores → rutas → clientes_pdv.
    El resultado queda registrado en motor_runs.
    """
    check_dist_permission(user_payload, dist_id)

    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx, .xls o .csv")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    def _run_ingestion(fb: bytes) -> None:
        try:
            padron_service.ingest(fb)
        except Exception as e:
            logger.error(f"[Padrón background] error global: {e}")

    background_tasks.add_task(_run_ingestion, file_bytes)

    return {
        "ok": True,
        "message": f"Padrón recibido ({len(file_bytes):,} bytes). Procesando en segundo plano.",
        "dist_id": dist_id,
    }


@app.get(
    "/api/admin/padron/status/{dist_id}",
    tags=["Padrón"],
    summary="Estado de la última ingesta del Padrón para una distribuidora",
)
def padron_status(dist_id: int, user_payload=Depends(verify_auth)):
    """
    Devuelve la última entrada de motor_runs con motor='padron' para esta distribuidora.
    """
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.table("motor_runs") \
            .select("id, estado, iniciado_en, finalizado_en, registros, error_msg") \
            .eq("motor", "padron") \
            .eq("dist_id", dist_id) \
            .order("iniciado_en", desc=True) \
            .limit(1) \
            .execute()
        if not res.data:
            return {"estado": "sin_ejecuciones"}
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── FASE 3 — Panel de Supervisión ───────────────────────────────────────────

@app.get("/api/supervision/vendedores/{dist_id}", tags=["Supervisión"])
def supervision_vendedores(dist_id: int, user_payload=Depends(verify_auth)):
    """Vendedores con sucursal, total de rutas y total de PDV para el panel."""
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_supervision_vendedores", {"p_dist_id": dist_id}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en supervision_vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/rutas/{id_vendedor}", tags=["Supervisión"])
def supervision_rutas(id_vendedor: int, user_payload=Depends(verify_auth)):
    """Rutas de un vendedor con día de visita y cantidad de PDV."""
    try:
        res = sb.rpc("fn_supervision_rutas", {"p_id_vendedor": id_vendedor}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en supervision_rutas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/clientes/{id_ruta}", tags=["Supervisión"])
def supervision_clientes(id_ruta: int, user_payload=Depends(verify_auth)):
    """Clientes PDV de una ruta con flag de exhibición reciente calculado server-side."""
    try:
        from datetime import datetime, timedelta
        
        res = sb.table("clientes_pdv_v2") \
            .select("id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                    "domicilio, localidad, provincia, canal, latitud, longitud, "
                    "fecha_ultima_compra, fecha_alta, id_distribuidor, id_ruta") \
            .eq("id_ruta", id_ruta) \
            .order("nombre_fantasia") \
            .execute()
        rows = res.data or []

        # Cross-reference exhibiciones por id_cliente (legacy) o id_cliente_erp (sombra)
        if rows:
            ids_pdv = [r["id_cliente"] for r in rows]
            erp_map = {r["id_cliente_erp"]: r["id_cliente"] for r in rows if r.get("id_cliente_erp")}
            dist_id = rows[0].get("id_distribuidor")
            
            exh_map: dict = {}       # id_cliente_v2 → timestamp_subida
            exh_foto_map: dict = {}  # id_cliente_v2 → url_foto_drive
            exh_count_map: dict = {} # id_cliente_v2 → total exhibiciones

            # Calculate 30-day threshold for "recent" exhibition
            threshold_date = (datetime.now() - timedelta(days=30)).isoformat()

            try:
                # 1. Buscar por id_cliente_pdv (legacy mapping)
                exh_res = sb.table("exhibiciones") \
                    .select("id_cliente_pdv, cliente_sombra_codigo, timestamp_subida, url_foto_drive") \
                    .eq("id_distribuidor", dist_id) \
                    .in_("id_cliente_pdv", ids_pdv) \
                    .order("timestamp_subida", desc=True) \
                    .execute()
                for e in (exh_res.data or []):
                    cid = e.get("id_cliente_pdv")
                    if cid:
                        exh_count_map[cid] = exh_count_map.get(cid, 0) + 1
                        if cid not in exh_map:
                            exh_map[cid] = e.get("timestamp_subida")
                            exh_foto_map[cid] = e.get("url_foto_drive")

                # 2. Buscar por ERP code (cliente_sombra_codigo) para los que aún no tienen match
                # Esto es más lento pero asegura encontrar exhibiciones no vinculadas por ID
                erps_pending = [erp for erp, vid in erp_map.items() if vid not in exh_map]
                if erps_pending:
                    exh_erp_res = sb.table("exhibiciones") \
                        .select("cliente_sombra_codigo, timestamp_subida, url_foto_drive") \
                        .eq("id_distribuidor", dist_id) \
                        .in_("cliente_sombra_codigo", erps_pending) \
                        .order("timestamp_subida", desc=True) \
                        .execute()
                    for e in (exh_erp_res.data or []):
                        erp = e.get("cliente_sombra_codigo")
                        vid = erp_map.get(erp)
                        if vid:
                            exh_count_map[vid] = exh_count_map.get(vid, 0) + 1
                            if vid not in exh_map:
                                exh_map[vid]      = e.get("timestamp_subida")
                                exh_foto_map[vid] = e.get("url_foto_drive")
            except Exception as e:
                logger.error(f"Error en join exhibiciones: {e}")

            for r in rows:
                fecha_exh = exh_map.get(r["id_cliente"])
                r["fecha_ultima_exhibicion"]  = fecha_exh
                r["url_ultima_exhibicion"]    = exh_foto_map.get(r["id_cliente"])
                r["total_exhibiciones"]       = exh_count_map.get(r["id_cliente"], 0)
                # Server-side calculation: is exhibition recent (within 30 days)?
                r["tiene_exhibicion_reciente"] = bool(fecha_exh and fecha_exh >= threshold_date)

        return rows
    except Exception as e:
        logger.error(f"Error en supervision_clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/cliente-info/{dist_id}", tags=["Supervisión"])
def supervision_cliente_info(dist_id: int, nombre: str, id_cliente_erp: Optional[str] = Query(None), user_payload=Depends(verify_auth)):
    """Busca datos de contacto y localización de un cliente PDV por nombre (para popup CC)."""
    def _strip_accents(s: str) -> str:
        return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

    try:
        check_dist_permission(user_payload, dist_id)
        fields = ("id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                  "domicilio, localidad, provincia, canal, latitud, longitud")
        nombre_s      = nombre.strip()
        nombre_plain  = _strip_accents(nombre_s)   # sin acentos

        # Estrategia 0: buscar por id_cliente_erp (match exacto, más confiable)
        if id_cliente_erp:
            erp_id_s = id_cliente_erp.strip()
            r = sb.table("clientes_pdv_v2").select(fields) \
                .eq("id_distribuidor", dist_id) \
                .eq("id_cliente_erp", erp_id_s).limit(3).execute()
            if r.data: return r.data

        def _search(col: str, val: str, substring: bool = False) -> list:
            pattern = f"%{val}%" if substring else val
            r = sb.table("clientes_pdv_v2").select(fields) \
                .eq("id_distribuidor", dist_id) \
                .ilike(col, pattern).limit(3).execute()
            return r.data or []

        # 1. Exacto con acento
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_s)
            if data: return data

        # 2. Exacto sin acento
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_plain)
            if data: return data

        # 3. Substring con acento
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_s, substring=True)
            if data: return data

        # 4. Substring sin acento
        for col in ("nombre_razon_social", "nombre_fantasia"):
            data = _search(col, nombre_plain, substring=True)
            if data: return data

        # 5. Palabras individuales (orden independiente) — maneja "FABIANA GUTIÉRREZ" vs "GUTIERREZ FABIANA"
        words = [w for w in _strip_accents(nombre_s).split() if len(w) > 2]
        if words:
            for col in ("nombre_razon_social", "nombre_fantasia"):
                try:
                    q = sb.table("clientes_pdv_v2").select(fields).eq("id_distribuidor", dist_id)
                    for w in words:
                        q = q.ilike(col, f"%{w}%")
                    r = q.limit(3).execute()
                    if r.data: return r.data
                except Exception:
                    pass

        return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en supervision_cliente_info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── FASE 4 — Motores RPA ────────────────────────────────────────────────────

@app.post("/api/motor/ventas", tags=["Motores RPA"])
async def motor_ventas(
    tenant_id: str = Form(...),
    tipo: str      = Form(...),
    file: UploadFile = File(...),
):
    """
    Recibe el Excel de Comprobantes de Ventas descargado por el motor RPA de CHESS.
    Parsea, upserta en ventas_v2 y actualiza fecha_ultima_compra en clientes_pdv_v2.

    Args (form-data):
        tenant_id : "tabaco" | "aloma" | "liver" | "real"
        tipo      : "resumido" | "detallado"
        file      : archivo Excel (.xlsx)
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if tipo not in ("resumido", "detallado"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'resumido' o 'detallado'")
    try:
        result = ventas_ingest(tenant_id, tipo, file_bytes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error en motor_ventas ({tenant_id}/{tipo}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/motor/cuentas", tags=["Motores RPA"])
async def motor_cuentas(
    tenant_id: str   = Form(...),
    file: UploadFile = File(...),
):
    """
    Recibe el Excel de Saldos Totales (Cuentas Corrientes) descargado por el motor RPA.
    Delega en procesar_cuentas_corrientes_service.

    Args (form-data):
        tenant_id : "tabaco" | "aloma" | "liver" | "real"
        file      : archivo Excel (.xlsx)
    """
    from services.ventas_ingestion_service import TENANT_DIST_MAP
    dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise HTTPException(status_code=400, detail=f"tenant_id desconocido: {tenant_id}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    try:
        import io, tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            # Fix signature mismatch: pass out_dir and a dummy config
            _, json_data = procesar_cuentas_corrientes_service(tmp_path, "/tmp", {"reglas_generales": {}})
        finally:
            os.unlink(tmp_path)
        registros = len(json_data.get("detalle_cuentas", [])) if json_data else 0
        return {"registros": registros, "id_distribuidor": dist_id, "tenant_id": tenant_id}
    except Exception as e:
        logger.error(f"Error en motor_cuentas ({tenant_id}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/ventas/{dist_id}", tags=["Supervisión"])
def supervision_ventas(dist_id: int, dias: int = 30, user_payload=Depends(verify_auth)):
    """Resumen de ventas por vendedor para el panel de supervisión."""
    check_dist_permission(user_payload, dist_id)
    try:
        from datetime import datetime, timedelta
        fecha_desde = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")

        res = sb.table("ventas_v2") \
            .select("vendedor, sucursal, tipo_operacion, es_devolucion, monto_total, monto_recaudado, fecha, cliente, comprobante, numero") \
            .eq("id_distribuidor", int(dist_id)) \
            .eq("es_anulado", False) \
            .gte("fecha", fecha_desde) \
            .order("fecha", desc=True) \
            .execute()

        rows = res.data or []
        vendors: dict = {}
        for row in rows:
            v = row.get("vendedor") or "Sin Vendedor"
            if v not in vendors:
                vendors[v] = {
                    "vendedor": v,
                    "total_facturas": 0,
                    "monto_total": 0.0,
                    "monto_recaudado": 0.0,
                    "transacciones": [],
                }
            vd = vendors[v]
            vd["total_facturas"] += 1
            vd["monto_total"] += float(row.get("monto_total") or 0)
            vd["monto_recaudado"] += float(row.get("monto_recaudado") or 0)
            if len(vd["transacciones"]) < 100:
                vd["transacciones"].append({
                    "fecha": row["fecha"],
                    "cliente": row.get("cliente"),
                    "comprobante": row.get("comprobante"),
                    "numero": row.get("numero"),
                    "tipo_operacion": row.get("tipo_operacion"),
                    "es_devolucion": row.get("es_devolucion", False),
                    "monto_total": float(row.get("monto_total") or 0),
                    "monto_recaudado": float(row.get("monto_recaudado") or 0),
                })

        result = sorted(vendors.values(), key=lambda x: x["monto_total"], reverse=True)
        return {
            "dias": dias,
            "fecha_desde": fecha_desde,
            "total_facturado": round(sum(v["monto_total"] for v in result), 2),
            "total_recaudado": round(sum(v["monto_recaudado"] for v in result), 2),
            "total_facturas": sum(v["total_facturas"] for v in result),
            "vendedores": result,
        }
    except Exception as e:
        logger.error(f"Error en supervision_ventas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/cuentas/{dist_id}", tags=["Supervisión"])
def supervision_cuentas(dist_id: int, sucursal: Optional[str] = Query(None), user_payload=Depends(verify_auth)):
    """Cuentas corrientes por vendedor para el panel de supervisión (lee cc_detalle)."""
    check_dist_permission(user_payload, dist_id)
    try:
        # Obtener snapshot más reciente
        snap_res = sb.table("cc_detalle") \
            .select("fecha_snapshot") \
            .eq("id_distribuidor", int(dist_id)) \
            .order("fecha_snapshot", desc=True) \
            .limit(1) \
            .execute()

        if not snap_res.data:
            return {"fecha": None, "metadatos": {}, "vendedores": []}

        fecha_snapshot = snap_res.data[0]["fecha_snapshot"]

        # Construir query base con filtros (incluyendo sucursal si se especifica)
        def build_query():
            q = sb.table("cc_detalle") \
                .select("id_vendedor, vendedor_nombre, sucursal_nombre, cliente_nombre, deuda_total, antiguedad_dias, rango_antiguedad, cantidad_comprobantes, alerta_credito") \
                .eq("id_distribuidor", int(dist_id)) \
                .eq("fecha_snapshot", fecha_snapshot)
            if sucursal:
                q = q.ilike("sucursal_nombre", sucursal.strip())
            return q

        # Paginar para evitar el límite de 1000 filas por defecto de Supabase
        rows = []
        page_size = 1000
        page_offset = 0
        while True:
            res = build_query() \
                .range(page_offset, page_offset + page_size - 1) \
                .execute()
            batch = res.data or []
            rows.extend(batch)
            if len(batch) < page_size:
                break
            page_offset += page_size

        # Cruzar fecha_ultima_compra e id_cliente_erp desde clientes_pdv_v2 por nombre
        fecha_uc_map: dict  = {}   # norm_nombre → fecha_ultima_compra
        erp_id_map:   dict  = {}   # norm_nombre → id_cliente_erp
        try:
            pdv_offset = 0
            while True:
                pdv_res = sb.table("clientes_pdv_v2") \
                    .select("nombre_fantasia, nombre_razon_social, id_cliente_erp, fecha_ultima_compra") \
                    .eq("id_distribuidor", int(dist_id)) \
                    .range(pdv_offset, pdv_offset + 999) \
                    .execute()
                pdv_batch = pdv_res.data or []
                for p in pdv_batch:
                    erp_id = p.get("id_cliente_erp")
                    fuc    = p.get("fecha_ultima_compra")
                    for key in [p.get("nombre_fantasia"), p.get("nombre_razon_social")]:
                        if key:
                            norm_key = key.strip().upper()
                            if fuc and norm_key not in fecha_uc_map:
                                fecha_uc_map[norm_key] = fuc
                            if erp_id and norm_key not in erp_id_map:
                                erp_id_map[norm_key] = str(erp_id).strip()
                if len(pdv_batch) < 1000:
                    break
                pdv_offset += 1000
        except Exception:
            pass

        vendors: dict = {}
        for item in rows:
            v_key = item.get("id_vendedor") or item.get("vendedor_nombre", "Sin Vendedor")
            if v_key not in vendors:
                vendors[v_key] = {
                    "id_vendedor": item.get("id_vendedor"),
                    "vendedor": item.get("vendedor_nombre") or "Sin Vendedor",
                    "sucursal": item.get("sucursal_nombre") or "",
                    "deuda_total": 0.0,
                    "cantidad_clientes": 0,
                    "clientes": [],
                }
            vd = vendors[v_key]
            deuda = float(item.get("deuda_total") or 0)
            vd["deuda_total"] += deuda
            vd["cantidad_clientes"] += 1
            nombre_norm = (item.get("cliente_nombre") or "").strip().upper()
            # id_cliente_erp: primero del Excel CC, luego cruzado por nombre desde clientes_pdv_v2
            erp_id = (item.get("id_cliente_erp")
                      or erp_id_map.get(nombre_norm))
            vd["clientes"].append({
                "cliente": item.get("cliente_nombre"),
                "id_cliente_erp": erp_id,
                "sucursal": item.get("sucursal_nombre"),
                "deuda_total": deuda,
                "antiguedad": item.get("antiguedad_dias"),
                "rango_antiguedad": item.get("rango_antiguedad"),
                "cantidad_comprobantes": item.get("cantidad_comprobantes"),
                "fecha_ultima_compra": fecha_uc_map.get(nombre_norm),
            })

        for vd in vendors.values():
            vd["clientes"].sort(key=lambda x: x["deuda_total"], reverse=True)
        result = sorted(vendors.values(), key=lambda x: x["deuda_total"], reverse=True)

        all_clientes = [c for v in result for c in v["clientes"]]
        total_deuda = sum(v["deuda_total"] for v in result)
        total_cli = sum(v["cantidad_clientes"] for v in result)
        avg_dias = (
            sum(c["antiguedad"] or 0 for c in all_clientes) / len(all_clientes)
            if all_clientes else 0
        )

        return {
            "fecha": fecha_snapshot,
            "metadatos": {
                "total_deuda": round(total_deuda, 2),
                "clientes_deudores": total_cli,
                "promedio_dias_retraso": round(avg_dias, 1),
            },
            "vendedores": result,
        }
    except Exception as e:
        logger.error(f"Error en supervision_cuentas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Scanner GPS — PDVs Cercanos ───────────────────────────────────────────────

def haversine_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@app.get("/api/supervision/pdvs-cercanos", tags=["Supervisión"])
def pdvs_cercanos(
    lat: float,
    lng: float,
    radio: int = 500,
    dist_id: int = 0,
    user_payload=Depends(verify_auth),
):
    """Retorna PDVs del distribuidor dentro del radio (metros) alrededor de la coordenada."""
    check_dist_permission(user_payload, int(dist_id))
    radio = min(radio, 5000)

    def parse_coord(v):
        if v is None:
            return None
        try:
            return float(str(v).replace(",", "."))
        except (ValueError, TypeError):
            return None

    try:
        # Paginar para superar el límite de 1000 filas de Supabase PostgREST
        todos = []
        PAGE = 1000
        offset = 0
        while True:
            page_res = sb.table("clientes_pdv_v2") \
                .select(
                    "id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social, "
                    "domicilio, localidad, provincia, canal, latitud, longitud, "
                    "fecha_alta, fecha_ultima_compra, id_ruta"
                ) \
                .eq("id_distribuidor", int(dist_id)) \
                .neq("es_limbo", True) \
                .limit(PAGE) \
                .offset(offset) \
                .execute()
            batch = page_res.data or []
            todos.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
            if offset >= 20000:  # cap de seguridad: 20k PDVs max
                break
        logger.info(f"[SCANNER] dist_id={dist_id} lat={lat} lng={lng} radio={radio} — total_pdvs={len(todos)}")

        todos_con_dist = []
        for row in todos:
            plat = parse_coord(row.get("latitud"))
            plng = parse_coord(row.get("longitud"))
            if plat is None or plng is None:
                continue
            # Descartar coordenadas nulas de facto (0,0)
            if plat == 0.0 and plng == 0.0:
                continue
            try:
                dist = haversine_metros(lat, lng, plat, plng)
            except (TypeError, ValueError):
                continue
            todos_con_dist.append((row, dist))

        todos_con_dist.sort(key=lambda x: x[1])

        # Filtrar por radio; si no hay ninguno, devolver los 5 más cercanos (sin cap de distancia)
        # El frontend muestra "fuera de radio" cuando fallback=True + la distancia en cada PDV
        fallback = False
        cercanos = [(r, d) for r, d in todos_con_dist if d <= radio]
        if not cercanos:
            cercanos = todos_con_dist[:5]
            fallback = True
        if not cercanos:
            return {"fallback": False, "pdvs": []}

        # Obtener rutas y vendedores en batch
        ids_ruta = list({r[0]["id_ruta"] for r in cercanos if r[0].get("id_ruta")})
        ruta_map: dict = {}
        vendedor_map: dict = {}
        if ids_ruta:
            rutas_res = sb.table("rutas_v2") \
                .select("id_ruta, id_ruta_erp, id_vendedor") \
                .in_("id_ruta", ids_ruta) \
                .execute()
            for r in (rutas_res.data or []):
                ruta_map[r["id_ruta"]] = r
            ids_vend = list({r["id_vendedor"] for r in (rutas_res.data or []) if r.get("id_vendedor")})
            if ids_vend:
                vend_res = sb.table("vendedores_v2") \
                    .select("id_vendedor, nombre_erp") \
                    .in_("id_vendedor", ids_vend) \
                    .execute()
                for v in (vend_res.data or []):
                    vendedor_map[v["id_vendedor"]] = v["nombre_erp"]

        # Obtener última exhibición en batch
        ids_cercanos = [r[0]["id_cliente"] for r in cercanos]
        ultima_exhibicion_map: dict = {}
        try:
            exh_res = sb.table("exhibiciones") \
                .select("id_cliente_pdv, created_at") \
                .eq("id_distribuidor", dist_id) \
                .in_("id_cliente_pdv", ids_cercanos) \
                .order("created_at", desc=True) \
                .execute()
            for e in (exh_res.data or []):
                cid = e.get("id_cliente_pdv")
                if cid and cid not in ultima_exhibicion_map:
                    ultima_exhibicion_map[cid] = e.get("created_at")
        except Exception:
            pass

        result = []
        for row, dist in cercanos:
            ruta_info = ruta_map.get(row.get("id_ruta") or 0, {})
            result.append({
                "id_cliente": row["id_cliente"],
                "id_cliente_erp": row.get("id_cliente_erp"),
                "nombre_fantasia": row.get("nombre_fantasia"),
                "nombre_razon_social": row.get("nombre_razon_social"),
                "domicilio": row.get("domicilio"),
                "localidad": row.get("localidad"),
                "provincia": row.get("provincia"),
                "canal": row.get("canal"),
                "latitud": row.get("latitud"),
                "longitud": row.get("longitud"),
                "fecha_alta": row.get("fecha_alta"),
                "fecha_ultima_compra": row.get("fecha_ultima_compra"),
                "fecha_ultima_exhibicion": ultima_exhibicion_map.get(row["id_cliente"]),
                "vendedor_nombre": vendedor_map.get(ruta_info.get("id_vendedor")),
                "ruta_nombre": ruta_info.get("id_ruta_erp"),
                "distancia_metros": round(dist, 1),
            })
        return {"fallback": fallback, "pdvs": result}
    except Exception as e:
        logger.error(f"Error en pdvs_cercanos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
