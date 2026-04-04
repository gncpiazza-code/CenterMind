# -*- coding: utf-8 -*-
"""
Endpoints ERP: ingesta manual, push automático (v1), padron, motores RPA,
cuentas corrientes (upload y sync), ROI y contexto cliente.
"""
import base64
import io
import json
import logging
import os
import tempfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from core.helpers import _enrich_and_store_cc
from core.security import verify_auth, verify_key, check_dist_permission
from db import sb
from models.schemas import ERPConfigAlertas
from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
from services.erp_ingestion_service import erp_service
from services.padron_ingestion_service import padron_service
from services.ventas_ingestion_service import ingest as ventas_ingest, TENANT_DIST_MAP

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ─── Carga manual ERP ─────────────────────────────────────────────────────────

@router.post("/api/admin/erp/upload-global", tags=["ERP Admin"], summary="Carga global de archivos ERP (Ventas, Clientes)")
async def erp_upload_global(
    tipo: str = Query(...),
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    try:
        dist_id = user_payload.get("id_distribuidor")
        if not dist_id and not user_payload.get("is_superadmin"):
            raise HTTPException(status_code=403, detail="No tienes un distribuidor asignado.")
        contents = await file.read()
        buffer = io.BytesIO(contents)
        count = 0
        if tipo == "ventas":
            count = erp_service.ingest_ventas_xlsx(buffer, dist_id)
        elif tipo == "clientes":
            count = erp_service.ingest_clientes_xlsx(buffer, dist_id)
        else:
            raise HTTPException(status_code=400, detail="Tipo de archivo no soportado")
        return {"ok": True, "message": f"Archivo de {tipo} procesado.", "count": count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en upload-global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Push automático v1 ───────────────────────────────────────────────────────

@router.post("/api/v1/sync/erp-clientes", tags=["ERP Push"], summary="Ingesta automática de clientes via Push")
async def erp_sync_clientes(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
):
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        content = await file.read()
        background_tasks.add_task(erp_service.ingest_clientes_xlsx, io.BytesIO(content), id_distribuidor)
        return {"status": "accepted", "message": f"Archivo de clientes recibido para dist {id_distribuidor}. Procesando en segundo plano.", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Error en endpoint sync clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/v1/sync/erp-sucursales", tags=["ERP Push"], summary="Ingesta automática de sucursales via Push")
async def erp_sync_sucursales(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
):
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        content = await file.read()
        background_tasks.add_task(erp_service.ingest_sucursales_xlsx, io.BytesIO(content), id_distribuidor)
        return {"status": "accepted", "message": "Procesando sucursales..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync sucursales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/v1/sync/erp-vendedores", tags=["ERP Push"], summary="Ingesta automática de vendedores via Push")
async def erp_sync_vendedores(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
):
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        content = await file.read()
        background_tasks.add_task(erp_service.ingest_vendedores_xlsx, io.BytesIO(content), id_distribuidor)
        return {"status": "accepted", "message": "Procesando vendedores..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/v1/sync/erp-ventas", tags=["ERP Push"], summary="Ingesta automática de ventas via Push")
async def erp_sync_ventas(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
):
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        content = await file.read()
        background_tasks.add_task(erp_service.ingest_ventas_xlsx, io.BytesIO(content), id_distribuidor)
        return {"status": "accepted", "message": "Procesando ventas..."}
    except Exception as e:
        logger.error(f"Error en endpoint sync ventas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── ERP: contexto cliente y ROI ──────────────────────────────────────────────

@router.get("/api/erp/contexto-cliente/{id_distribuidor}/{nro_cliente}", summary="Datos ERP del cliente al evaluar")
def get_erp_contexto(id_distribuidor: int, nro_cliente: str, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res_rpc = sb.rpc("fn_erp_contexto_cliente", {"p_distribuidor_id": id_distribuidor, "p_nro_cliente": nro_cliente}).execute()
        ctx = res_rpc.data[0] if res_rpc.data else {"encontrado": False}

        res_pdv = sb.table("clientes_pdv_v2").select(
            "nombre_fantasia, nombre_razon_social, domicilio, localidad, canal, fecha_alta, rutas_v2(id_ruta_erp, dia_semana)"
        ).eq("id_distribuidor", id_distribuidor).eq("id_cliente_erp", nro_cliente).limit(1).execute()

        if res_pdv.data:
            pdv = res_pdv.data[0]
            ctx["encontrado"] = True
            ctx["nombre_fantasia"] = pdv.get("nombre_fantasia")
            ctx["razon_social"]    = pdv.get("nombre_razon_social")
            ctx["domicilio"]       = pdv.get("domicilio")
            ctx["localidad"]       = pdv.get("localidad")
            ctx["canal"]           = pdv.get("canal")
            ctx["fecha_alta"]      = pdv.get("fecha_alta")
            rutas_raw = pdv.get("rutas_v2")
            if rutas_raw:
                ruta_obj = rutas_raw[0] if isinstance(rutas_raw, list) else rutas_raw
                ctx["nro_ruta"]   = ruta_obj.get("id_ruta_erp")
                ctx["dia_visita"] = ruta_obj.get("dia_semana")
        return ctx
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/erp/roi/{id_distribuidor}", summary="ROI: facturacion con vs sin exhibiciones destacadas")
def get_roi_analitico(id_distribuidor: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_roi_analitico", {"p_distribuidor_id": id_distribuidor}).execute()
        return res.data if res.data else {"con_exhibicion": {}, "sin_exhibicion": {}, "uplift_pct": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── ERP: sync status, config, vendedores ─────────────────────────────────────

@router.get("/api/admin/erp/sync-status/{id_distribuidor}", tags=["ERP Admin"])
def get_erp_sync_status(id_distribuidor: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_admin_erp_sync_status", {"p_dist_id": id_distribuidor}).execute()
        return res.data if res.data else {}
    except Exception as e:
        logger.error(f"Error en status sync ERP: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/erp/config/{dist_id}", summary="Obtener configuración de alertas ERP")
def get_erp_config(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("erp_config_alertas").select("*").eq("id_distribuidor", dist_id).execute()
    if not res.data:
        return {
            "id_distribuidor": dist_id, "limite_dinero": 500000, "limite_cbte": 5,
            "limite_dias": 30, "activo": True, "limite_dinero_activo": True,
            "limite_cbte_activo": True, "limite_dias_activo": True, "excepciones": [],
        }
    return res.data[0]


@router.post("/api/admin/erp/config/{dist_id}", summary="Guardar configuración de alertas ERP")
def save_erp_config(dist_id: int, req: ERPConfigAlertas, _=Depends(verify_auth)):
    data = req.dict()
    data["id_distribuidor"] = dist_id
    res = sb.table("erp_config_alertas").upsert(data, on_conflict="id_distribuidor").execute()
    return {"ok": True, "data": res.data[0] if res.data else None}


@router.get("/api/admin/erp/vendedores/{dist_id}", summary="Vendedores activos en ERP")
def get_erp_vendedores(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("vendedores").select("nombre_erp").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
    return [r["nombre_erp"] for r in (res.data or [])]


# ─── Padrón de Clientes ───────────────────────────────────────────────────────

@router.post("/api/admin/padron/upload/{dist_id}", tags=["Padrón"], summary="Carga manual del Padrón de Clientes")
async def padron_upload(
    dist_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
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
    return {"ok": True, "message": f"Padrón recibido ({len(file_bytes):,} bytes). Procesando en segundo plano.", "dist_id": dist_id}


@router.get("/api/admin/padron/status/{dist_id}", tags=["Padrón"], summary="Estado de la última ingesta del Padrón")
def padron_status(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = (
            sb.table("motor_runs")
            .select("id, estado, iniciado_en, finalizado_en, registros, error_msg")
            .eq("motor", "padron")
            .eq("dist_id", dist_id)
            .order("iniciado_en", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"estado": "sin_ejecuciones"}
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Motores RPA ──────────────────────────────────────────────────────────────

@router.post("/api/motor/ventas", tags=["Motores RPA"])
async def motor_ventas(
    tenant_id: str = Form(...),
    tipo: str      = Form(...),
    file: UploadFile = File(...),
):
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


@router.post("/api/motor/cuentas", tags=["Motores RPA"])
async def motor_cuentas(
    tenant_id: str   = Form(...),
    file: UploadFile = File(...),
):
    dist_id = TENANT_DIST_MAP.get(tenant_id)
    if not dist_id:
        raise HTTPException(status_code=400, detail=f"tenant_id desconocido: {tenant_id}")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    try:
        import datetime as _dt
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            _, json_data = procesar_cuentas_corrientes_service(tmp_path, "/tmp", {"reglas_generales": {}})
        finally:
            os.unlink(tmp_path)
        rows_cc = json_data.get("detalle_cuentas", []) if json_data else []
        saved = 0
        if rows_cc:
            fecha_str = _dt.datetime.now().strftime("%Y-%m-%d")
            saved = _enrich_and_store_cc(dist_id, fecha_str, rows_cc)
        return {"ok": True, "registros": saved, "id_distribuidor": dist_id, "tenant_id": tenant_id}
    except Exception as e:
        logger.error(f"Error en motor_cuentas ({tenant_id}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Cuentas Corrientes ───────────────────────────────────────────────────────

@router.options("/api/procesar-cuentas-corrientes")
def options_procesar_cuentas_corrientes():
    return JSONResponse(
        content="OK",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.post("/api/procesar-cuentas-corrientes", summary="Procesar Excel de Cuentas Corrientes y Alertas de Crédito")
async def procesar_cuentas_corrientes(
    file: UploadFile = File(...),
    config: str = Form(...),
):
    try:
        if not file.filename.endswith((".xlsx", ".xls")):
            raise HTTPException(status_code=400, detail="El archivo proporcionado no es un Excel válido (.xlsx o .xls)")

        config_data = json.loads(config)
        temp_dir = os.path.join(os.path.dirname(__file__), "..", "temp_cuentas")
        os.makedirs(temp_dir, exist_ok=True)
        timestamp = int(datetime.now().timestamp())
        temp_file_path = os.path.join(temp_dir, f"upload_{timestamp}_{file.filename}")

        with open(temp_file_path, "wb") as f:
            f.write(await file.read())

        mapa_sucursales = {}
        try:
            result = sb.table("sucursales_v2").select("id_sucursal_erp, nombre_erp").execute()
            for row in result.data or []:
                mapa_sucursales[str(row["id_sucursal_erp"])] = row["nombre_erp"]
        except Exception as db_e:
            print(f"Advertencia: No se pudo cargar el mapa de sucursales desde BDD. {db_e}")

        out_path, json_data = procesar_cuentas_corrientes_service(
            input_path=temp_file_path,
            out_dir=temp_dir,
            config=config_data,
            sucursales_map=mapa_sucursales,
        )
        with open(out_path, "rb") as f:
            b64_file = base64.b64encode(f.read()).decode("utf-8")

        tenant_id = config_data.get("tenant_id")
        id_dist   = config_data.get("id_distribuidor")
        if tenant_id:
            try:
                import datetime as dt
                fecha_str = dt.datetime.now().strftime("%Y-%m-%d")
                sb.table("cuentas_corrientes_data").upsert({
                    "tenant_id": tenant_id, "id_distribuidor": id_dist,
                    "fecha": fecha_str, "data": json_data, "file_b64": b64_file,
                }, on_conflict="tenant_id, fecha").execute()
            except Exception as e:
                print(f"Advertencia: No se pudo guardar en Supabase: {e}")

        if id_dist:
            try:
                import datetime as dt
                fecha_str = dt.datetime.now().strftime("%Y-%m-%d")
                rows_cc = []
                for vend_name, vend_data in json_data.get("vendedores", {}).items():
                    for r in vend_data.get("tabla", []):
                        rows_cc.append({
                            "vendedor":       r.get("Vendedor", vend_name),
                            "cliente":        r.get("Cliente", ""),
                            "saldo_total":    r.get("Saldo Total", 0),
                            "antiguedad":     r.get("Antigüedad (días)", 0),
                            "cant_cbte":      r.get("Cant. Comprobantes", 0),
                            "alerta_credito": r.get("Alerta de Crédito", ""),
                        })
                if rows_cc:
                    _enrich_and_store_cc(id_dist, fecha_str, rows_cc)
            except Exception as e:
                logger.error(f"Error guardando en cc_detalle (upload manual dist={id_dist}): {e}")

        os.remove(temp_file_path)
        os.remove(out_path)
        return {"ok": True, "filename": os.path.basename(out_path), "file_b64": b64_file, "data": json_data}

    except Exception as e:
        if "temp_file_path" in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        print(f"Error procesando Cuentas Corrientes: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")


@router.post("/api/v1/sync/cuentas-corrientes", summary="Sync Cuentas Corrientes JSON (RPA)")
async def sync_cuentas_corrientes(
    request: Request,
    id_distribuidor: int = Query(...),
    user_key: str = Depends(verify_key),
):
    try:
        payload = await request.json()
        tenant_id = payload.get("tenant_id")
        datos     = payload.get("datos")
        if not tenant_id or not datos:
            raise HTTPException(status_code=400, detail="Falta tenant_id o datos")

        import datetime as dt
        fecha_str = dt.datetime.now().strftime("%Y-%m-%d")

        sb.table("cuentas_corrientes_data").upsert({
            "tenant_id": tenant_id, "id_distribuidor": id_distribuidor,
            "fecha": fecha_str, "data": datos, "file_b64": None,
        }, on_conflict="tenant_id, fecha").execute()

        rows_cc = datos.get("detalle_cuentas", [])
        saved = 0
        if rows_cc:
            saved = _enrich_and_store_cc(id_distribuidor, fecha_str, rows_cc)
        return {"ok": True, "message": "Datos sincronizados", "registros_cc_detalle": saved}
    except Exception as e:
        logger.error(f"Error sync cuentas corrientes dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cuentas-corrientes/{id_distribuidor}", summary="Obtener Cuentas Corrientes")
async def get_cuentas_corrientes(id_distribuidor: int, user_payload: dict = Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = (
            sb.table("cuentas_corrientes_data")
            .select("*")
            .eq("id_distribuidor", id_distribuidor)
            .order("fecha", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"data": None, "file_b64": None, "fecha": None}
        return res.data[0]
    except Exception as e:
        print(f"Error get cuentas corrientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── SuperAdmin: empresas desconocidas ────────────────────────────────────────

@router.get("/api/superadmin/empresas-desconocidas", tags=["SuperAdmin"])
def get_unknown_companies(user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        res = sb.table("erp_empresas_desconocidas").select("*").order("fecha", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/superadmin/mapear-empresa", tags=["SuperAdmin"])
def map_unknown_company(data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    nombre_erp = data.get("nombre_erp")
    id_dist    = data.get("id_distribuidor")
    try:
        sb.table("erp_empresa_mapping").upsert({"nombre_erp": nombre_erp, "id_distribuidor": id_dist}).execute()
        sb.table("erp_empresas_desconocidas").delete().eq("nombre_erp", nombre_erp).execute()
        erp_service.reload_mappings()
        return {"status": "success", "message": f"Empresa {nombre_erp} mapeada correctamente al distribuidor {id_dist}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
