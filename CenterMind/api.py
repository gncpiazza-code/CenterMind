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

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Header, BackgroundTasks
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import base64

from services.erp_summary_service import erp_summary_service
from services.erp_ingestion_service import erp_service
from services.system_monitoring_service import monitor_service
from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
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
                raise HTTPException(status_code=401, detail="Formato inválido")
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
            "latitud_gps, longitud_gps, id_integrante, id_cliente, cliente_sombra_codigo"
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

        # 2. Cargar maestros (Distribuidores, Clientes ERP, Jerarquía Maestra)
        dist_ids = list(set(e["id_distribuidor"] for e in raw_events))
        client_internal_ids = list(set(e["id_cliente"] for e in raw_events if e.get("id_cliente")))

        # Mapas de maestros
        dists = {d["id_distribuidor"]: d["nombre_empresa"] for d in sb.table("distribuidores").select("id_distribuidor, nombre_empresa").in_("id_distribuidor", dist_ids).execute().data or []}
        
        # Jerarquía Maestra (Limpiada por el usuario)
        maestro_rows = sb.table("maestro_jerarquia").select("*").execute().data or []
        maestro_map = {}
        for m in maestro_rows:
            # Llave: (ID_DIST, id_suc_erp, id_vendedor_erp)
            m_key = (m["ID_DIST"], str(m["id suc"]), str(m["ID_VENDEDOR"]))
            maestro_map[m_key] = m

        # Mapa de Numero Local (desde la tabla clientes interna)
        internal_clients = {c["id_cliente"]: c["numero_cliente_local"] for c in sb.table("clientes").select("id_cliente, numero_cliente_local").in_("id_cliente", client_internal_ids).execute().data or []}

        # Identificar qué necesitamos de erp_clientes_raw
        erp_ids_to_fetch = [] # (dist_id, local_id)
        for e in raw_events:
            local_id = internal_clients.get(e["id_cliente"]) or e.get("cliente_sombra_codigo")
            if local_id:
                erp_ids_to_fetch.append((e["id_distribuidor"], str(local_id)))

        erp_map = {}
        if erp_ids_to_fetch:
            for d_id in dist_ids:
                local_ids = list(set(k[1] for k in erp_ids_to_fetch if k[0] == d_id))
                res_erp = sb.table("erp_clientes_raw").select("id_cliente_erp_local, nombre_cliente, lat, lon, id_sucursal_erp, sucursal_erp, vendedor_erp")\
                            .eq("id_distribuidor", d_id).in_("id_cliente_erp_local", local_ids).execute()
                for row in (res_erp.data or []):
                    erp_map[(d_id, str(row["id_cliente_erp_local"]))] = row

        # 3. Transformar y Coalescer
        final_data = []
        for e in raw_events:
            local_id = internal_clients.get(e["id_cliente"]) or e.get("cliente_sombra_codigo")
            erp_data = erp_map.get((e["id_distribuidor"], str(local_id))) if local_id else None

            # Coalesce Lat/Lon: EXCLUSIVAMENTE ERP
            if not erp_data:
                continue
                
            lat = erp_data.get("lat")
            lon = erp_data.get("lon")

            if lat is None or lat == 0:
                continue

            # Enriquecimiento vía Maestro Jerarquía
            d_id = e["id_distribuidor"]
            suc_id = str(erp_data.get("id_sucursal_erp"))
            seller_id = str(erp_data.get("vendedor_erp"))
            
            m_key = (d_id, suc_id, seller_id)
            maestro = maestro_map.get(m_key)

            if maestro:
                nombre_empresa = maestro.get("EMPRESA")
                nombre_sucursal = maestro.get("SUCURSAL")
                nombre_vendedor = maestro.get("Vendedor")
            else:
                nombre_empresa = dists.get(d_id, f"Dist {d_id}")
                nombre_sucursal = erp_data.get("sucursal_erp", f"Suc {suc_id}")
                nombre_vendedor = erp_data.get("nombre_vendedor_erp") or f"Vendedor {seller_id}"

            final_data.append({
                "id_ex": e["id_exhibicion"],
                "id_dist": d_id,
                "nombre_dist": nombre_empresa,
                "sucursal_nombre": nombre_sucursal,
                "vendedor_nombre": nombre_vendedor,
                "lat": float(lat),
                "lon": float(lon),
                "timestamp_evento": e["timestamp_subida"],
                "nro_cliente": str(local_id) if local_id else "0",
                "cliente_nombre": erp_data.get("nombre_cliente") or (f"Cliente {local_id}" if local_id else "S/N"),
                "drive_link": e["url_foto_drive"],
                "id_vendedor": seller_id
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
            usa_mapeo_vendedores=payload["usa_mapeo_vendedores"]
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


@app.get("/api/pendientes/{id_distribuidor}", summary="Exhibiciones pendientes agrupadas por mensaje")
def get_pendientes(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
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


@app.get("/api/stats/{id_distribuidor}", summary="Estadisticas del dia actual")
def get_stats(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    hoy = datetime.now().strftime("%Y-%m-%d")
    result = sb.rpc("fn_stats_hoy", {"p_dist_id": id_distribuidor, "p_fecha": hoy}).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/api/vendedores/{id_distribuidor}", summary="Lista de vendedores con pendientes")
def get_vendedores(id_distribuidor: int, payload=Depends(verify_auth)):
    check_dist_permission(payload, id_distribuidor)
    result = sb.rpc("fn_vendedores_pendientes", {"p_dist_id": id_distribuidor}).execute()
    return [r["nombre_integrante"] for r in (result.data or [])]


@app.post("/api/evaluar", summary="Aprobar / Destacar / Rechazar una exhibicion")
def evaluar(req: EvaluarRequest, user_payload=Depends(verify_auth)):
    try:
        affected = 0
        for id_ex in req.ids_exhibicion:
            # Primero validamos que la exhibición pertenezca a la dist_id del usuario (si no es superadmin)
            ex_res = sb.table("exhibiciones").select("id_distribuidor").eq("id_exhibicion", id_ex).execute()
            if not ex_res.data: continue
            dist_id = ex_res.data[0]["id_distribuidor"]
            
            check_dist_permission(user_payload, dist_id)
            # Check de bloqueo operativo
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


# ─── PASO 9: Contexto ERP durante evaluación ─────────────────────────────────

@app.get("/api/erp/contexto-cliente/{id_distribuidor}/{nro_cliente}", summary="Datos ERP del cliente al evaluar")
def get_erp_contexto(id_distribuidor: int, nro_cliente: str, user_payload=Depends(verify_auth)):
    """PASO 9: Contexto ERP del cliente para la tarjeta de evaluación."""
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_erp_contexto_cliente", {
            "p_distribuidor_id": id_distribuidor,
            "p_nro_cliente": nro_cliente
        }).execute()
        return res.data if res.data else {"encontrado": False}
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
def dashboard_kpis(distribuidor_id: int, periodo: str = "mes", payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_kpis", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    r = result.data[0] if result.data else {}
    return {k: (v or 0) for k, v in r.items()}


@app.get("/api/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(distribuidor_id: int, periodo: str = "mes", top: int = 15, payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_ranking", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_top": top}).execute()
    return result.data or []

@app.get("/api/dashboard/evolucion-tiempo/{distribuidor_id}", summary="Evolución en el tiempo del dashboard")
def dashboard_evolucion(distribuidor_id: int, periodo: str = "mes", payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_evolucion_tiempo", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    return result.data or []

@app.get("/api/dashboard/por-ciudad/{distribuidor_id}", summary="Rendimiento agrupado por ciudad")
def dashboard_por_ciudad(distribuidor_id: int, periodo: str = "mes", payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    result = sb.rpc("fn_dashboard_por_ciudad", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    return result.data or []


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


# ─── Proxy de imagen Drive ────────────────────────────────────────────────────

@app.get("/api/dashboard/imagen/{file_id}", summary="Proxy de imagen privada de Google Drive")
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
            result = sb.table("maestro_jerarquia").select("\"id suc\", \"SUCURSAL\"").execute()
            for row in (result.data or []):
                mapa_sucursales[str(row["id suc"])] = row["SUCURSAL"]
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
    # Get all sucursales from Maestro for the distribuidor
    q = sb.table("maestro_jerarquia").select("SUCURSAL")
    if distribuidor_id > 0:
        q = q.eq("ID_DIST", distribuidor_id)
    result = q.execute()
    return sorted(list(set(r["SUCURSAL"] for r in (result.data or []) if r.get("SUCURSAL"))))



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
    # Fetch unique sucursales from maestro_jerarquia
    q = sb.table("maestro_jerarquia").select("SUCURSAL, \"id suc\"")
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
    """
    try:
        # We will keep get_hierarchy_config for backwards compatibility momentarily,
        # but the new unified dashboard endpoint handles the whole tree.
        # 1. Locations from Maestro

        loc_res = sb.table("maestro_jerarquia").select("SUCURSAL, \"id suc\", \"Vendedor\"").eq("ID_DIST", dist_id).execute()
        seen_locs = set()
        formatted_locs = []
        for row in (loc_res.data or []):
            sid = row.get("id suc")
            if sid and sid not in seen_locs:
                seen_locs.add(sid)
                formatted_locs.append({"location_id": sid, "label": row.get("SUCURSAL")})
        
        # 2. ERP Hierarchy (Unique sucursal_erp and vendedor_erp)
        # We can now use maestro_jerarquia for this too
        formatted_erp = []
        suc_map = {}
        for row in (loc_res.data or []):
            s = row.get("SUCURSAL")
            v = row.get("Vendedor")
            if s and v:
                if s not in suc_map: suc_map[s] = set()
                suc_map[s].add(v)
        
        for k, v in suc_map.items():
            formatted_erp.append({"sucursal_erp": k, "vendedores": sorted(list(v))})

        # Fallback to erp_clientes_raw if maestro is empty (unlikely but safe)
        if not formatted_erp:
            erp_data = sb.table("erp_clientes_raw").select("sucursal_erp, vendedor_erp").eq("id_distribuidor", dist_id).execute()
            temp_map = {}
            for row in (erp_data.data or []):
                s_erp = str(row.get("sucursal_erp", "")).strip().upper()
                v_erp = str(row.get("vendedor_erp", "")).strip().upper()
                if not s_erp or s_erp == "NAN" or not v_erp or v_erp == "NAN": continue
                if s_erp not in temp_map: temp_map[s_erp] = set()
                temp_map[s_erp].add(v_erp)
            formatted_erp = [{"sucursal_erp": k, "vendedores": sorted(list(v))} for k, v in temp_map.items()]

        # 3. Telegram Groups
        groups = sb.table("integrantes_grupo").select("telegram_group_id, nombre_grupo").eq("id_distribuidor", dist_id).execute()
        seen_groups = {}
        for g in (groups.data or []):
            gid = g.get("telegram_group_id")
            if gid and gid not in seen_groups:
                seen_groups[gid] = g.get("nombre_grupo") or f"Grupo {gid}"
        formatted_groups = [{"id": k, "nombre": v} for k, v in seen_groups.items()]

        # 4. Integrantes (all for mapping)
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


@app.get("/api/admin/unified-dashboard", summary="Dashboard unificado ERP 3.0")
def get_unified_dashboard(_=Depends(verify_auth)):
    """
    Retorna la estructura jerárquica completa para el nuevo frontend unificado.
    Distribuidor -> Sucursal -> Vendedor -> Usuarios Telegram
    """
    try:
        # 1. Fetch Distribuidores
        dist_res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot").execute()
        distribuidores = dist_res.data or []
        
        # 2. Fetch ERP Mappings
        map_res = sb.table("erp_empresa_mapping").select("nombre_erp, id_distribuidor").execute()
        mappings = {row["id_distribuidor"]: row["nombre_erp"] for row in (map_res.data or [])}
        
        # 3. Fetch Sucursales ERP
        suc_res = sb.table("erp_sucursales").select("id_distribuidor, nombre_sucursal").execute()
        sucursales_db = suc_res.data or []
        
        # 4. Fetch Fuerza de Ventas ERP
        ven_res = sb.table("erp_fuerza_ventas").select("id_distribuidor, nombre_sucursal, nombre_vendedor").execute()
        vendedores_db = ven_res.data or []
        
        # 5. Fetch Integrantes Grupo
        int_res = sb.table("integrantes_grupo").select("id_integrante, id_distribuidor, nombre_integrante, id_vendedor_erp, rol_telegram, telegram_group_id").execute()
        integrantes_db = int_res.data or []

        result = []
        for dist in distribuidores:
            did = dist["id_distribuidor"]
            dist_data = {
                "id_distribuidor": did,
                "nombre_empresa": dist["nombre_empresa"],
                "token": dist.get("token_bot", ""),
                "erp_mapping_name": mappings.get(did, ""),
                "sucursales": [],
                "unmapped_integrantes": []
            }
            
            # Build Sucursales
            suc_list = [s for s in sucursales_db if s["id_distribuidor"] == did]
            ven_list = [v for v in vendedores_db if v["id_distribuidor"] == did]
            int_list = [i for i in integrantes_db if i["id_distribuidor"] == did]
            
            for suc in suc_list:
                s_name = suc["nombre_sucursal"]
                suc_data = {
                    "nombre_sucursal": s_name,
                    "vendedores": []
                }
                
                # Build Vendedores
                s_vendedores = [v for v in ven_list if v["nombre_sucursal"] == s_name]
                for ven in s_vendedores:
                    v_name = ven["nombre_vendedor"]
                    ven_data = {
                        "id_vendedor_erp": v_name,
                        "integrantes": []
                    }
                    
                    # Assigned Integrantes
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
    r = sb.table("clientes").update({"id_vendedor": req.id_integrante}).eq("id_cliente", id_cliente).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True, "id_cliente": id_cliente, "id_integrante": req.id_integrante}


# ─── Dashboard: stats por sucursal ───────────────────────────────────────────

@app.get("/api/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
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
    # Buscamos en ventas (histórico real) y en clientes (padrón actual)
    res_v = sb.table("erp_ventas_raw").select("vendedor_erp").eq("id_distribuidor", dist_id).execute()
    res_c = sb.table("erp_clientes_raw").select("vendedor_erp").eq("id_distribuidor", dist_id).execute()
    
    vend_v = [row["vendedor_erp"] for row in (res_v.data or []) if row.get("vendedor_erp")]
    vend_c = [row["vendedor_erp"] for row in (res_c.data or []) if row.get("vendedor_erp")]
    
    vendedores = sorted(list(set(vend_v + vend_c)))
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
        # 1. Sucursales from Maestro
        res_loc = sb.table("maestro_jerarquia").select("SUCURSAL, \"id suc\"").eq("ID_DIST", dist_id).execute()
        seen_locs = set()
        locs = []
        for row in (res_loc.data or []):
            sid = row.get("id suc")
            if sid and sid not in seen_locs:
                seen_locs.add(sid)
                locs.append({"location_id": sid, "label": row.get("SUCURSAL")})
        
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
    Sincronización masiva de jerarquía usando datos del MAESTRO (maestro_jerarquia).
    Esto vincula automáticamente a los integrantes de Telegram con su vendedor y sucursal ERP.
    """
    check_dist_permission(user_payload, dist_id)
    
    try:
        # 1. Obtener la jerarquía del maestro
        res_maestro = sb.table("maestro_jerarquia").select("*").eq("ID_DIST", dist_id).execute()
        if not res_maestro.data:
            return {"message": "No hay datos en el Maestro para sincronizar.", "count": 0}
        
        # Mapeo de Vendedor (nombre normalizado) -> {id_vend, id_suc}
        import unicodedata
        def normalize_str(text: str) -> str:
            if not text or str(text).strip().upper() in ("NAN", "NONE", "NULL", "NA"): 
                return ""
            text = str(text).strip().upper()
            return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

        vendedor_mapping = {}
        for row in res_maestro.data:
            v_name = normalize_str(row.get("Vendedor"))
            v_id = row.get("ID_VENDEDOR")
            s_id = row.get("id suc")
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

        return {
            "status": "success",
            "sucursales_creadas": created_count,
            "vendedores_mapeados": updated_count
        }
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)