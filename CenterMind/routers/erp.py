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
import re
import tempfile
import threading
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from core.helpers import _enrich_and_store_cc
from core.security import verify_auth, verify_key, check_dist_permission
from core.tenant_tables import tenant_table_name
from db import sb
from models.schemas import ERPConfigAlertas, RendimientoCalleAnalyticsIn, VentasComprobantesAnalyticsIn
from services.cuentas_corrientes_service import procesar_cuentas_corrientes_service
from services.erp_ingestion_service import erp_service
from services.padron_ingestion_service import padron_service
from services.ventas_detalle_ingestion_service import ingest_detallado as ventas_detalle_ingest
from services.ventas_ingestion_service import ingest as ventas_ingest, TENANT_DIST_MAP
from services.ventas_detalle_ingestion_service import ingest_detallado as ventas_detalle_ingest
from services.ventas_enriched_ingestion_service import accept_enriched_upload
from services.rendimiento_calle_analytics_service import (
    obtener_analytics_rendimiento_calle,
    persistir_analisis_rendimiento_calle,
)
from services.ventas_analytics_service import persistir_analisis_comprobantes
from services.motor_ops_notification_service import send_motor_digest
from services.cc_motor_tracking import (
    start_cc_motor_run,
    finish_cc_motor_run,
    build_cc_registros_from_rows,
    record_cc_sin_cambios,
)

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


@router.post("/api/v1/sync/erp-padrón", tags=["ERP Push"], summary="Ingesta automática de Padrón via Push (RPA)")
async def erp_sync_padron(
    id_distribuidor: int = Query(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _=Depends(verify_key),
):
    """
    Ingesta automática del Padrón de Clientes descargado desde Consolido/Nextbyn.

    Llamado por ShelfMind-RPA motores/padron.py después de descargar el Excel.
    Procesa la jerarquía: sucursales_v2 → vendedores_v2 → rutas_v2 → clientes_pdv_v2.
    """
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Archivo vacío")

        def _padron_sync_rpa_background(dist_id: int, file_bytes: bytes) -> None:
            try:
                padron_service.ingest_for_dist(file_bytes, dist_id)
            except Exception as exc:
                logger.exception(
                    "[Padrón RPA] ingest_for_dist falló tras POST sync (dist=%s): %s",
                    dist_id,
                    exc,
                )

        # threading: no depender del pool de BackgroundTasks bajo carga concurrente RPA
        import threading

        threading.Thread(
            target=_padron_sync_rpa_background,
            args=(id_distribuidor, content),
            daemon=True,
        ).start()
        return {
            "status": "accepted",
            "message": f"Padrón recibido para dist {id_distribuidor} ({len(content):,} bytes). Procesando en segundo plano.",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error en endpoint sync padrón: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/api/v1/sync/erp-ventas/sin-cambios",
    tags=["ERP Push"],
    summary="Registrar verificación RPA sin cambios en el Informe de Ventas",
)
async def erp_sync_ventas_sin_cambios(
    id_distribuidor: int = Query(...),
    source: str = Query("rpa_hash_guard"),
    _=Depends(verify_key),
):
    """
    ShelfMind-RPA llama esto cuando Hash Guard detecta el mismo Excel o sin movimientos.
    No re-ingesta, pero actualiza motor_runs para el badge de sync-status.
    """
    try:
        from services.ventas_enriched_ingestion_service import record_sin_cambios_run

        run_id = record_sin_cambios_run(id_distribuidor, source=source)
        return {
            "status": "ok",
            "run_id": run_id,
            "message": f"Informe ventas sin cambios registrado para dist {id_distribuidor}.",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error registrando ventas sin cambios dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/api/v1/sync/erp-padrón/sin-cambios",
    tags=["ERP Push"],
    summary="Registrar verificación RPA sin cambios en el Excel de padrón",
)
async def erp_sync_padron_sin_cambios(
    id_distribuidor: int = Query(...),
    _=Depends(verify_key),
):
    """
    ShelfMind-RPA llama esto cuando Hash Guard detecta el mismo archivo que ayer.
    No re-ingesta, pero deja constancia en motor_runs para el badge de sync-status.
    """
    try:
        run_id = padron_service.record_sin_cambios_run(id_distribuidor)
        return {
            "status": "ok",
            "run_id": run_id,
            "message": f"Padrón sin cambios registrado para dist {id_distribuidor}.",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error registrando padrón sin cambios dist={id_distribuidor}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── ERP: contexto cliente y ROI ──────────────────────────────────────────────

@router.get("/api/erp/contexto-cliente/{id_distribuidor}/{nro_cliente}", summary="Datos ERP del cliente al evaluar")
def get_erp_contexto(id_distribuidor: int, nro_cliente: str, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        raw_nro = str(nro_cliente or "").strip()
        candidates: list[str] = []
        if raw_nro:
            candidates.append(raw_nro)
            # Normaliza variantes frecuentes: "0010517", "10517.0", "10.517"
            normalized = raw_nro.replace(".", "").replace(",", "")
            if normalized.endswith("0") and "." in raw_nro:
                normalized = normalized.rstrip("0")
            normalized = normalized.strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
            digits_only = "".join(ch for ch in raw_nro if ch.isdigit())
            if digits_only and digits_only not in candidates:
                candidates.append(digits_only)
            nozeros = raw_nro.lstrip("0")
            if nozeros and nozeros not in candidates:
                candidates.append(nozeros)
            nozeros_digits = digits_only.lstrip("0") if digits_only else ""
            if nozeros_digits and nozeros_digits not in candidates:
                candidates.append(nozeros_digits)
        if not candidates:
            candidates = [raw_nro]

        ctx = {"encontrado": False}
        for cand in candidates:
            res_rpc = sb.rpc(
                "fn_erp_contexto_cliente",
                {"p_distribuidor_id": id_distribuidor, "p_nro_cliente": cand},
            ).execute()
            rpc_ctx = res_rpc.data[0] if res_rpc.data else None
            if not rpc_ctx:
                continue
            ctx = rpc_ctx
            if rpc_ctx.get("encontrado"):
                break

        t_clientes = tenant_table_name("clientes_pdv_v2", id_distribuidor)
        pdv = None
        pdv_erp_canonical: str | None = None
        for cand in candidates:
            res_pdv = (
                sb.table(t_clientes)
                .select(
                    "id_cliente_erp, nombre_fantasia, nombre_razon_social, domicilio, localidad, canal, "
                    "telefono, celular, fecha_alta, id_ruta, estado, motivo_inactivo, fecha_ultima_compra"
                )
                .eq("id_distribuidor", id_distribuidor)
                .eq("id_cliente_erp", cand)
                .limit(1)
                .execute()
            )
            if res_pdv.data:
                pdv = res_pdv.data[0]
                pdv_erp_canonical = str(pdv.get("id_cliente_erp") or cand).strip() or None
                break

        if pdv:
            ctx["encontrado"] = True
            ctx["nombre_fantasia"] = pdv.get("nombre_fantasia")
            ctx["razon_social"]    = pdv.get("nombre_razon_social")
            ctx["domicilio"]       = pdv.get("domicilio")
            ctx["localidad"]       = pdv.get("localidad")
            ctx["canal"]           = pdv.get("canal")
            ctx["telefono"]        = pdv.get("telefono")
            ctx["celular"]         = pdv.get("celular")
            ctx["fecha_alta"]      = pdv.get("fecha_alta")
            id_ruta = pdv.get("id_ruta")
            if id_ruta:
                t_rutas = tenant_table_name("rutas_v2", id_distribuidor)
                t_vendedores = tenant_table_name("vendedores_v2", id_distribuidor)
                t_sucursales = tenant_table_name("sucursales_v2", id_distribuidor)
                ruta_res = (
                    sb.table(t_rutas)
                    .select("id_ruta_erp,dia_semana,id_vendedor")
                    .eq("id_ruta", id_ruta)
                    .limit(1)
                    .execute()
                )
                if ruta_res.data:
                    ruta_obj = ruta_res.data[0]
                    ctx["nro_ruta"] = ruta_obj.get("id_ruta_erp")
                    ctx["dia_visita"] = ruta_obj.get("dia_semana")
                    id_vendedor = ruta_obj.get("id_vendedor")
                    if id_vendedor and not ctx.get("vendedor_erp"):
                        vend_res = (
                            sb.table(t_vendedores)
                            .select("nombre_erp,id_sucursal")
                            .eq("id_vendedor", id_vendedor)
                            .limit(1)
                            .execute()
                        )
                        if vend_res.data:
                            vend_row = vend_res.data[0]
                            nombre_v = (vend_row.get("nombre_erp") or "").strip()
                            if nombre_v:
                                ctx["vendedor_erp"] = nombre_v
                            if not ctx.get("sucursal_erp") and vend_row.get("id_sucursal") is not None:
                                suc_res = (
                                    sb.table(t_sucursales)
                                    .select("nombre_erp")
                                    .eq("id_sucursal", vend_row["id_sucursal"])
                                    .limit(1)
                                    .execute()
                                )
                                if suc_res.data:
                                    ctx["sucursal_erp"] = suc_res.data[0].get("nombre_erp")

        # Última compra operativa (Informe Ventas); deuda CC sigue en RPC si aplica.
        erp_ventas = pdv_erp_canonical
        if not erp_ventas:
            for cand in candidates:
                if cand:
                    erp_ventas = cand
                    break
        compra_ventas = False
        if erp_ventas:
            try:
                from core.ultima_compra import fetch_ultima_compra_detalle_por_erp, apply_ultima_compra_enriched

                detalle = fetch_ultima_compra_detalle_por_erp(
                    id_distribuidor,
                    erp_ventas,
                    nombre_fantasia=pdv.get("nombre_fantasia") if pdv else ctx.get("nombre_fantasia"),
                    nombre_razon_social=pdv.get("nombre_razon_social") if pdv else ctx.get("razon_social"),
                )
                if detalle:
                    compra_ventas = True
                    ent = {"fecha": detalle["fecha"], "comprobante": detalle.get("comprobante")}
                    ctx["ultima_compra"] = detalle["fecha"]
                    apply_ultima_compra_enriched(ctx, ent, detalle=detalle)
            except Exception as e_uc:
                logger.warning(
                    "[erp contexto] ultima compra enriched dist=%s erp=%s: %s",
                    id_distribuidor,
                    erp_ventas,
                    e_uc,
                )

        if pdv:
            try:
                from core.padron_cliente_vitalidad import apply_vitalidad_padron_row

                vital = {
                    "motivo_inactivo": pdv.get("motivo_inactivo"),
                    "fecha_ultima_compra": ctx.get("ultima_compra") or pdv.get("fecha_ultima_compra"),
                }
                apply_vitalidad_padron_row(vital, compra_desde_ventas=compra_ventas)
                ctx["padron_anulado"] = vital["padron_anulado"]
                ctx["activo_comercial"] = vital["activo_comercial"]
            except Exception as e_v:
                logger.warning(
                    "[erp contexto] vitalidad padron dist=%s: %s",
                    id_distribuidor,
                    e_v,
                )

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
    res = sb.table(tenant_table_name("vendedores_v2", dist_id)).select("nombre_erp").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
    return [r["nombre_erp"] for r in (res.data or [])]


# ─── Padrón de Clientes ───────────────────────────────────────────────────────

@router.post("/api/admin/padron/upload/{dist_id}", tags=["Padrón"], summary="Carga manual del Padrón de Clientes")
async def padron_upload(
    dist_id: int,
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(
            status_code=403,
            detail="La carga del padrón por API está restringida a superadmin. "
            "Usá POST /api/admin/padron/upload-global desde el panel.",
        )
    check_dist_permission(user_payload, dist_id)
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx, .xls o .csv")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    def _run_ingestion(fb: bytes) -> None:
        try:
            padron_service.ingest_for_dist(fb, dist_id)
        except Exception as e:
            logger.error(f"[Padrón background] error global: {e}", exc_info=True)

    # Evita timeouts 524 del proxy: responder inmediato y procesar fuera del ciclo HTTP.
    threading.Thread(target=_run_ingestion, args=(file_bytes,), daemon=True).start()
    return {"ok": True, "message": f"Padrón recibido ({len(file_bytes):,} bytes). Procesando en segundo plano.", "dist_id": dist_id}


@router.post("/api/admin/padron/upload-global", tags=["Padrón"], summary="Carga global del Padrón (todas las distribuidoras del Excel)")
async def padron_upload_global(
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    """
    Igual que la ingesta RPA consolidada: agrupa el Excel por idempresa y actualiza
    cada id_distribuidor según erp_empresa_mapping / distribuidores.id_empresa_erp.
    Solo superadmin (evita que un admin de un tenant dispare escritura masiva).
    """
    if not user_payload.get("is_superadmin"):
        raise HTTPException(
            status_code=403,
            detail="La ingesta global del padrón está restringida a superadmin.",
        )
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx, .xls o .csv")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    def _run_global(fb: bytes) -> None:
        try:
            padron_service.ingest(fb)
        except Exception as e:
            logger.error(f"[Padrón global background] error: {e}", exc_info=True)

    threading.Thread(target=_run_global, args=(file_bytes,), daemon=True).start()
    return {
        "ok": True,
        "message": (
            f"Padrón global recibido ({len(file_bytes):,} bytes). "
            "Procesando en segundo plano todas las distribuidoras mapeadas desde el archivo."
        ),
    }


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


@router.get("/api/admin/padron/last-global", tags=["Padrón"], summary="Última ingesta global de padrón (superadmin)")
def padron_last_global(user_payload=Depends(verify_auth)):
    """Una sola corrida multi-tenant: motor padron_global (dist_id=0)."""
    if not user_payload.get("is_superadmin"):
        raise HTTPException(
            status_code=403,
            detail="Solo superadmin puede consultar el estado de ingesta global del padrón.",
        )
    try:
        res = (
            sb.table("motor_runs")
            .select("id, estado, iniciado_en, finalizado_en, registros, error_msg")
            .eq("motor", "padron_global")
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
        # Resumido: persiste cabecera en ventas_v2 (incluye actualización de fecha_ultima_compra).
        if tipo == "resumido":
            return ventas_ingest(tenant_id, tipo, file_bytes)

        # Detallado: persiste líneas por artículo en ventas_detalle_v2.
        # Evita mezclar detallado en ventas_v2 (cabecera), donde la clave de conflicto
        # es por comprobante y puede colapsar/rechazar múltiples líneas.
        return ventas_detalle_ingest(tenant_id, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error en motor_ventas ({tenant_id}/{tipo}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/motor/ventas-enriched", tags=["Motores RPA"])
async def motor_ventas_enriched(
    tenant_id: str = Form(...),
    file: UploadFile = File(...),
    _=Depends(verify_key),
):
    """
    Ingesta de Informe de Ventas (Reporteador Genérico) con métricas enriquecidas.

    Patrón async como erp-padrón: acepta el Excel, responde al RPA de inmediato (202)
    y procesa upsert pesado en thread (evita 524/502 de Cloudflare en corridas largas).
    """
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        file_bytes = await file.read()
        payload = accept_enriched_upload(tenant_id, file_bytes)
        return JSONResponse(status_code=202, content=payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error en motor_ventas_enriched ({tenant_id}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/motor/rendimiento-calle-analytics", tags=["Motores RPA"])
async def motor_rendimiento_calle_analytics(body: RendimientoCalleAnalyticsIn):
    """
    Persiste KPI JSON de Rendimiento en calle (SIGO) en `rendimiento_calle_analytics_runs`.
    Para tenants con split por sucursal (`real`/franquiciados), el payload debe traer en
    `meta.id_distribuidor` el distrito destino.
    """
    try:
        return persistir_analisis_rendimiento_calle(body.tenant_id, body.payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"motor_rendimiento_calle_analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/motor/rendimiento-calle-analytics", tags=["Motores RPA"])
async def motor_rendimiento_calle_analytics_list(
    tenant_id: str = Query(..., description="Tenant RPA (tabaco/aloma/liver/real/extra/gyg)"),
    fecha_operativa: Optional[str] = Query(None, description="Filtro YYYY-MM-DD"),
    sucursal_nombre: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=500),
):
    """
    Lista runs persistidos de rendimiento calle con KPIs principales y payload.
    """
    try:
        return obtener_analytics_rendimiento_calle(
            tenant_id,
            fecha_operativa=fecha_operativa,
            sucursal_nombre=sucursal_nombre,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"motor_rendimiento_calle_analytics_list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/motor/ventas-analytics", tags=["Motores RPA"])
async def motor_ventas_analytics(body: VentasComprobantesAnalyticsIn):
    """
    Persiste KPIs + agregados del análisis resumen/detallado CHESS en tablas
    ventas_comprobantes_analytics_runs / ventas_comprobantes_agg_*.
    El campo `payload` debe coincidir con el JSON emitido por
    ShelfMind-RPA/scripts/analizar_ventas_comprobantes.py (clave `payload` envuelve
    financiero_resumen, lineas_detallado, validacion_fcvtas y opcionalmente archivos).
    """
    try:
        return persistir_analisis_comprobantes(
            body.tenant_id,
            body.payload,
            fecha_desde=body.fecha_desde,
            fecha_hasta=body.fecha_hasta,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"motor_ventas_analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Mapa empresa RPA SIGO (Nextbyn) → id_distribuidor Shelfy (gyg = GyG / dist 6)
_SIGO_EMPRESA_DIST = {
    "tabaco": 3,
    "aloma": 4,
    "liver": 5,
    "real": 2,
    "gyg": 6,
}


@router.post("/api/motor/sigo", tags=["Motores RPA"])
async def motor_sigo(
    empresa_id: str = Form(...),
    sucursal: str = Form(...),
    tipo: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Recibe exports del portal SIGO (Puntos de venta .xls o Ventas fuera de ruta .xlsx).
    Persiste en Supabase Storage bajo `sigo-rpa/{dist}/...` para auditoría y futura ingesta.
    """
    eid = (empresa_id or "").strip().lower()
    dist_id = _SIGO_EMPRESA_DIST.get(eid)
    if not dist_id:
        raise HTTPException(status_code=400, detail=f"empresa_id SIGO desconocido: {empresa_id}")
    if tipo not in ("pdv", "vfr"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'pdv' o 'vfr'")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    fname = (file.filename or "export").strip()
    suc_slug = re.sub(r"[^\w\-]+", "_", (sucursal or "sucursal").strip())[:80]
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = f"sigo-rpa/{dist_id}/{eid}/{suc_slug}/{tipo}/{stamp}_{fname}"
    bucket = "Exhibiciones-PDV"
    ctype = (
        "application/vnd.ms-excel"
        if fname.lower().endswith(".xls")
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    try:
        sb.storage.from_(bucket).upload(
            path,
            file_bytes,
            file_options={"content-type": ctype, "upsert": "true"},
        )
        logger.info(f"[motor_sigo] guardado dist={dist_id} empresa={eid} tipo={tipo} path={path} bytes={len(file_bytes)}")
        return {
            "ok": True,
            "id_distribuidor": dist_id,
            "empresa_id": eid,
            "tipo": tipo,
            "bytes": len(file_bytes),
            "storage_bucket": bucket,
            "storage_path": path,
        }
    except Exception as e:
        logger.error(f"motor_sigo: {e}")
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
    run_id = start_cc_motor_run(dist_id)
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
        fecha_str = _dt.datetime.now().strftime("%Y-%m-%d")
        regs = build_cc_registros_from_rows(rows_cc, fecha_str)
        if rows_cc:
            saved = _enrich_and_store_cc(dist_id, fecha_str, rows_cc)
            regs = build_cc_registros_from_rows(rows_cc, fecha_str)
            regs["registros_cc"] = saved
        finish_cc_motor_run(run_id, dist_id, "ok", regs, source="motor_cuentas")
        return {"ok": True, "registros": saved, "id_distribuidor": dist_id, "tenant_id": tenant_id, "run_id": run_id}
    except Exception as e:
        logger.error(f"Error en motor_cuentas ({tenant_id}): {e}")
        finish_cc_motor_run(run_id, dist_id, "error", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail=str(e))


# ─── Cuentas Corrientes ───────────────────────────────────────────────────────

@router.options("/api/procesar-cuentas-corrientes")
def options_procesar_cuentas_corrientes():
    return JSONResponse(content="OK")


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
        _dist_id_for_suc = config_data.get("id_distribuidor")
        try:
            t_suc = tenant_table_name("sucursales_v2", _dist_id_for_suc)
            result = sb.table(t_suc).select("id_sucursal_erp, nombre_erp").execute()
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
    run_id = start_cc_motor_run(id_distribuidor)
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
        regs = build_cc_registros_from_rows(rows_cc, fecha_str)
        if rows_cc:
            saved = _enrich_and_store_cc(id_distribuidor, fecha_str, rows_cc)
            regs = build_cc_registros_from_rows(rows_cc, fecha_str)
            regs["registros_cc"] = saved
            regs["tenant_id"] = tenant_id
        finish_cc_motor_run(
            run_id, id_distribuidor, "ok", regs, source="sync_cuentas_corrientes",
        )
        return {
            "ok": True,
            "message": "Datos sincronizados",
            "registros_cc_detalle": saved,
            "run_id": run_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sync cuentas corrientes dist={id_distribuidor}: {e}")
        finish_cc_motor_run(run_id, id_distribuidor, "error", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/api/v1/ops/motor-digest",
    tags=["Ops"],
    summary="Enviar resumen Telegram al admin (RPA post-corrida)",
)
async def ops_motor_digest(request: Request, _=Depends(verify_key)):
    """
    ShelfMind-RPA llama al terminar job_padron / job_cuentas.
    Combina resumen RPA (Railway logs) con motor_runs y delta en Supabase.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    motor = str(body.get("motor") or "motores").strip()
    since_hours = float(body.get("since_hours") or 8)
    rpa_resumen = body.get("resumen") if isinstance(body.get("resumen"), dict) else None
    detalle = body.get("detalle") if isinstance(body.get("detalle"), list) else None
    m = motor.lower()
    if m.startswith("pad"):
        label = "PADRÓN"
    elif "venta" in m:
        label = "INFORME VENTAS"
    else:
        label = "CUENTAS CORRIENTES"
    sent = send_motor_digest(
        label,
        since_hours=since_hours,
        rpa_resumen=rpa_resumen,
        rpa_detalle=detalle,
    )
    return {"ok": True, "telegram_sent": sent, "motor": motor}


@router.post(
    "/api/v1/ops/motor-error",
    tags=["Ops"],
    summary="Alerta Telegram inmediata por fallo de motor RPA",
)
async def ops_motor_error(request: Request, _=Depends(verify_key)):
    """ShelfMind-RPA llama cuando un tenant falla antes/durante la corrida (sin motor_run)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    motor = str(body.get("motor") or "motor").strip()
    try:
        dist_id = int(body.get("dist_id") or 0)
    except (TypeError, ValueError):
        dist_id = 0
    error_msg = str(body.get("error_msg") or "error desconocido")
    run_id = body.get("run_id")
    try:
        run_id = int(run_id) if run_id is not None else None
    except (TypeError, ValueError):
        run_id = None
    from services.motor_ops_notification_service import notify_run_error

    notify_run_error(motor, dist_id, error_msg, run_id)
    return {"ok": True, "motor": motor, "dist_id": dist_id}


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
