# -*- coding: utf-8 -*-
"""
Endpoints de administración: distribuidoras, usuarios del portal, integrantes,
mapeo vendedor↔integrante, jerarquía, monitoring, RPA admin.
"""
import logging
import os
import subprocess
import sys
import unicodedata
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from core.config import WEBHOOK_URL
from core.lifespan import bots, manager
from core.security import verify_auth, check_dist_permission
from db import sb
from models.schemas import (
    AsignarVendedorRequest,
    BulkMappingRequest,
    DistribuidoraRequest,
    IntegranteRequest,
    IntegranteRolRequest,
    IntegranteUpdateRequest,
    LocationRequest,
    MapeoVendedorRequest,
    RolePermissionUpdate,
    UsuarioEditRequest,
    UsuarioRequest,
)
from bot_worker import BotWorker
from services.system_monitoring_service import monitor_service

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

CC_LOG_PATH = os.path.join(os.path.dirname(__file__), "../../ShelfMind-RPA/logs/cuentas_corrientes_admin.log")


# ─── Distribuidoras (rutas legacy /admin/distribuidoras) ──────────────────────

@router.get("/admin/distribuidoras", summary="Lista de distribuidoras")
def admin_get_distribuidoras(solo_activas: str = "true", payload=Depends(verify_auth)):
    # Superadmin o usuarios con permiso explícito de cambio de entorno
    if not payload.get("is_superadmin"):
        permisos = payload.get("permisos", {})
        if not permisos.get("action_switch_tenant"):
            raise HTTPException(status_code=403, detail="Acceso denegado")
    q = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, estado, id_carpeta_drive, ruta_credencial_drive")
    if solo_activas.lower() == "true":
        q = q.eq("estado", "activo")
    result = q.order("nombre_empresa").execute()
    return [{"id": r["id_distribuidor"], "nombre": r["nombre_empresa"], **{k: r[k] for k in r if k not in ("id_distribuidor", "nombre_empresa")}} for r in (result.data or [])]


@router.post("/admin/distribuidoras", summary="Crear distribuidora")
async def admin_crear_distribuidora(req: DistribuidoraRequest, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    try:
        res = sb.table("distribuidores").insert({
            "nombre_empresa": req.nombre.strip(), "token_bot": req.token.strip(),
            "id_carpeta_drive": req.carpeta_drive.strip(), "ruta_credencial_drive": req.ruta_cred.strip(),
            "estado": "activo",
        }).execute()
        if res.data:
            d_id = res.data[0]["id_distribuidor"]
            try:
                worker  = BotWorker(distribuidor_id=d_id)
                ptb_app = worker.build_app()
                await ptb_app.initialize()
                if WEBHOOK_URL:
                    await ptb_app.bot.set_webhook(url=f"{WEBHOOK_URL}/api/telegram/webhook/{d_id}")
                await ptb_app.start()
                bots[d_id] = ptb_app
            except Exception as e:
                print(f"Error iniciando bot nuevo {d_id}: {e}")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/admin/distribuidoras/{dist_id}", summary="Editar distribuidora")
async def admin_editar_distribuidora(dist_id: int, req: DistribuidoraRequest, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    try:
        res = sb.table("distribuidores").update({
            "nombre_empresa": req.nombre.strip(), "token_bot": req.token.strip(),
            "id_carpeta_drive": req.carpeta_drive.strip(), "ruta_credencial_drive": req.ruta_cred.strip(),
        }).eq("id_distribuidor", dist_id).execute()
        is_active = res.data[0]["estado"] == "activo" if res.data else False
        if is_active:
            if dist_id in bots:
                old_app = bots[dist_id]
                await old_app.stop()
                await old_app.shutdown()
                del bots[dist_id]
            try:
                worker  = BotWorker(distribuidor_id=dist_id)
                ptb_app = worker.build_app()
                await ptb_app.initialize()
                if WEBHOOK_URL:
                    await ptb_app.bot.set_webhook(url=f"{WEBHOOK_URL}/api/telegram/webhook/{dist_id}")
                await ptb_app.start()
                bots[dist_id] = ptb_app
            except Exception as e:
                print(f"Error reiniciando bot editado {dist_id}: {e}")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/admin/distribuidoras/{dist_id}/estado", summary="Activar/desactivar distribuidora")
async def admin_toggle_distribuidora(dist_id: int, estado: str, payload=Depends(verify_auth)):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if estado not in ("activo", "inactivo"):
        raise HTTPException(status_code=400, detail="estado debe ser 'activo' o 'inactivo'")
    sb.table("distribuidores").update({"estado": estado}).eq("id_distribuidor", dist_id).execute()
    if estado == "inactivo" and dist_id in bots:
        old_app = bots[dist_id]
        await old_app.stop()
        await old_app.shutdown()
        del bots[dist_id]
    elif estado == "activo" and dist_id not in bots:
        try:
            worker  = BotWorker(distribuidor_id=dist_id)
            ptb_app = worker.build_app()
            await ptb_app.initialize()
            if WEBHOOK_URL:
                await ptb_app.bot.set_webhook(url=f"{WEBHOOK_URL}/api/telegram/webhook/{dist_id}")
            await ptb_app.start()
            bots[dist_id] = ptb_app
        except Exception as e:
            print(f"Error iniciando bot activado {dist_id}: {e}")
    return {"ok": True}


# ─── Distribuidoras (rutas nuevas /api/admin/distribuidoras) ──────────────────

@router.get("/api/admin/distribuidoras", tags=["Admin"])
@router.get("/api/admin/distribuidores", tags=["Admin"])
def list_distribuidores(solo_activas: bool = False, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        query = sb.table("distribuidores").select("*")
        if solo_activas:
            query = query.eq("estado", "activo")
        res = query.execute()
        data = []
        for d in res.data or []:
            data.append({
                "id": d["id_distribuidor"], "id_distribuidor": d["id_distribuidor"],
                "nombre": d["nombre_empresa"], "nombre_dist": d["nombre_empresa"],
                "estado": d["estado"], "token": d.get("token_bot"),
                "carpeta_drive": d.get("id_carpeta_drive"), "ruta_cred": d.get("ruta_credencial_drive"),
            })
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/admin/distribuidoras", tags=["Admin"])
@router.post("/api/admin/distribuidores", tags=["Admin"])
def create_distribuidor(data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        payload = {
            "nombre_empresa": data["nombre"], "token_bot": data["token"],
            "id_carpeta_drive": data.get("carpeta_drive"), "ruta_credencial_drive": data.get("ruta_cred"),
            "estado": "activo",
        }
        res = sb.table("distribuidores").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/api/admin/distribuidoras/{dist_id}/estado", tags=["Admin"])
@router.patch("/api/admin/distribuidores/{dist_id}/estado", tags=["Admin"])
def toggle_distribuidor(dist_id: int, data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        res = sb.table("distribuidores").update({"estado": data["estado"]}).eq("id_distribuidor", dist_id).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/admin/distribuidoras/{dist_id}", tags=["Admin"])
@router.put("/api/admin/distribuidores/{dist_id}", tags=["Admin"])
def update_distribuidor(dist_id: int, data: dict, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    try:
        payload = {
            "nombre_empresa": data["nombre"], "token_bot": data["token"],
            "id_carpeta_drive": data.get("carpeta_drive"), "ruta_credencial_drive": data.get("ruta_cred"),
        }
        res = sb.table("distribuidores").update(payload).eq("id_distribuidor", dist_id).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Usuarios del portal ──────────────────────────────────────────────────────

@router.get("/api/admin/usuarios", summary="Lista de usuarios del portal")
def admin_get_usuarios(dist_id: int | None = None, payload=Depends(verify_auth)):
    actual_dist_id = dist_id if payload.get("is_superadmin") else payload.get("id_distribuidor")
    if actual_dist_id is None:
        actual_dist_id = 0
    result = sb.rpc("fn_usuarios_portal", {"p_dist_id": actual_dist_id}).execute()
    return result.data or []


@router.post("/api/admin/usuarios", summary="Crear usuario del portal")
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


@router.put("/api/admin/usuarios/{user_id}", summary="Editar usuario del portal")
def admin_editar_usuario(user_id: int, req: UsuarioEditRequest, payload=Depends(verify_auth)):
    try:
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


@router.delete("/api/admin/usuarios/{user_id}", summary="Eliminar usuario del portal")
def admin_eliminar_usuario(user_id: int, payload=Depends(verify_auth)):
    check_q = sb.table("usuarios_portal").select("id_distribuidor").eq("id_usuario", user_id).execute()
    if check_q.data:
        check_dist_permission(payload, check_q.data[0]["id_distribuidor"])
    sb.table("usuarios_portal").delete().eq("id_usuario", user_id).execute()
    return {"ok": True}


# ─── Integrantes Telegram ─────────────────────────────────────────────────────

@router.get("/api/admin/integrantes", summary="Lista de integrantes")
def admin_get_integrantes(distribuidor_id: int | None = None, payload=Depends(verify_auth)):
    actual_dist_id = distribuidor_id if payload.get("is_superadmin") else payload.get("id_distribuidor")
    if actual_dist_id is None:
        actual_dist_id = 0
    result = sb.rpc("fn_integrantes", {"p_dist_id": actual_dist_id or 0}).execute()
    return result.data or []


@router.put("/api/admin/integrantes/{id_integrante}/rol", summary="Cambiar rol de integrante")
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


@router.put("/api/admin/integrantes/{integrante_id}/activo", tags=["Admin"])
def toggle_integrante_activo(integrante_id: int, body: dict, payload=Depends(verify_auth)):
    activo = body.get("activo")
    if not isinstance(activo, bool):
        raise HTTPException(status_code=400, detail="'activo' debe ser boolean")
    try:
        q = sb.table("integrantes_grupo").update({"activo": activo}).eq("id_integrante", integrante_id)
        if not payload.get("is_superadmin"):
            q = q.eq("id_distribuidor", payload.get("id_distribuidor"))
        r = q.execute()
        if not r.data:
            raise HTTPException(status_code=403, detail="Sin permisos o integrante no encontrado")
        return {"ok": True, "data": r.data[0]}
    except Exception as e:
        # Compatibilidad con esquemas donde `integrantes_grupo` no expone columna `activo`.
        if "column integrantes_grupo.activo does not exist" in str(e).lower() or "42703" in str(e):
            raise HTTPException(
                status_code=501,
                detail="Este entorno no soporta toggle de 'activo' en integrantes_grupo (columna ausente).",
            )
        raise


@router.put("/api/admin/integrantes/{id_integrante}", summary="Editar nombre/rol de integrante")
def admin_update_integrante(id_integrante: int, req: IntegranteUpdateRequest, _=Depends(verify_auth)):
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return {"ok": True}
    sb.table("integrantes_grupo").update(update_data).eq("id_integrante", id_integrante).execute()
    return {"ok": True}


@router.post("/api/admin/integrantes/{dist_id}", summary="Crear integrante manualmente")
def admin_create_integrante(dist_id: int, req: IntegranteRequest, _=Depends(verify_auth)):
    result = sb.table("integrantes_grupo").insert({
        "id_distribuidor": dist_id, "telegram_user_id": req.telegram_user_id or 0,
        "nombre_integrante": req.nombre_integrante, "rol_telegram": req.rol_telegram,
        "id_sucursal_erp": str(req.location_id) if req.location_id else None,
        "telegram_group_id": req.telegram_group_id or 0,
    }).execute()
    new_id = result.data[0]["id_integrante"] if result.data else None
    return {"ok": True, "id_integrante": new_id}


@router.get("/api/admin/usuarios/{dist_id}", summary="Listar todos los integrantes Telegram")
def admin_get_usuarios_telegram(dist_id: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_usuarios_telegram", {"p_dist_id": dist_id}).execute()
    return result.data or []


# ─── Mapeo Vendedor ERP ↔ Integrante ─────────────────────────────────────────

@router.get("/api/admin/mapeo/integrantes/{dist_id}", tags=["Mapeo"], summary="Integrantes con vendedor ERP asignado")
def get_mapeo_integrantes(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        ig_res = (
            sb.table("integrantes_grupo")
            .select("id_integrante, nombre_integrante, rol_telegram, telegram_user_id, id_vendedor_v2")
            .eq("id_distribuidor", dist_id).neq("rol_telegram", "supervisor").order("nombre_integrante")
            .execute()
        )
        vend_res = sb.table("vendedores_v2").select("id_vendedor, nombre_erp, id_sucursal").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
        suc_res  = sb.table("sucursales_v2").select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).execute()
        suc_map  = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_res.data or [])}
        vendedores  = [{**v, "sucursales": {"nombre_erp": suc_map.get(v["id_sucursal"], f"Sucursal {v['id_sucursal']}")}} for v in (vend_res.data or [])]
        integrantes = [{**ig, "id_vendedor": ig.get("id_vendedor_v2")} for ig in (ig_res.data or [])]
        mapeados = sum(1 for ig in integrantes if ig.get("id_vendedor"))
        total    = len(integrantes)
        return {"integrantes": integrantes, "vendedores": vendedores, "stats": {"total": total, "mapeados": mapeados, "sin_mapear": total - mapeados}}
    except Exception as e:
        logger.error(f"Error en get_mapeo_integrantes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/admin/mapeo/integrante/{id_integrante}/vendedor", tags=["Mapeo"], summary="Asigna vendedor ERP a integrante")
def set_mapeo_vendedor(id_integrante: int, req: MapeoVendedorRequest, user_payload=Depends(verify_auth)):
    try:
        ig = sb.table("integrantes_grupo").select("id_integrante, id_distribuidor").eq("id_integrante", id_integrante).maybe_single().execute()
        if not ig.data:
            raise HTTPException(status_code=404, detail="Integrante no encontrado")
        check_dist_permission(user_payload, ig.data["id_distribuidor"])
        sb.table("integrantes_grupo").update({"id_vendedor_v2": req.id_vendedor}).eq("id_integrante", id_integrante).execute()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en set_mapeo_vendedor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Monitor (sesiones, métricas, alertas) ────────────────────────────────────

@router.get("/api/admin/monitor/sesiones", summary="Sesiones activas del portal")
def admin_monitor_sesiones(_=Depends(verify_auth)):
    result = sb.table("sessions").select("*").eq("activa", True).order("last_seen_at", desc=True).execute()
    return result.data or []


@router.get("/api/admin/monitor/metricas", summary="Métricas del día")
def admin_monitor_metricas(_=Depends(verify_auth)):
    return {"logins_hoy": 0, "usuarios_unicos": 0, "exportaciones": 0, "pantalla_top": "-", "tiempo_medio_min": 0}


@router.get("/api/admin/monitor/alertas", summary="Alertas activas")
def admin_monitor_alertas(_=Depends(verify_auth)):
    return []


# ─── SuperAdmin / Global monitoring ──────────────────────────────────────────

@router.get("/api/admin/global-monitoring", tags=["SuperAdmin"])
def get_global_monitoring(user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo accesible para SuperAdmin")
    try:
        res = sb.rpc("fn_admin_global_monitoring", {}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"❌ Error en monitoreo global: {e}")
        return []


@router.get("/api/admin/system-health", tags=["SuperAdmin"])
def get_system_health(user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo accesible para SuperAdmin")
    try:
        metrics  = monitor_service.get_system_metrics()
        db_stats = monitor_service.get_db_stats()
        sessions = monitor_service.get_active_sessions(bots)
        return {"hardware": metrics, "database": db_stats, "sessions": sessions, "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Error en health monitor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/live-map-events", tags=["Admin"])
def get_live_map_events(minutos: int | None = None, fecha: str | None = None, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado. El mapa en vivo es exclusivo para SuperAdmins.")
    try:
        from datetime import timedelta
        query = sb.table("exhibiciones").select(
            "id_exhibicion, id_distribuidor, timestamp_subida, url_foto_drive, tipo_pdv, estado, "
            "latitud_gps, longitud_gps, id_integrante, id_cliente, cliente_sombra_codigo, id_cliente_pdv"
        )
        if fecha:
            query = query.gte("timestamp_subida", f"{fecha}T00:00:00-03:00").lte("timestamp_subida", f"{fecha}T23:59:59-03:00")
        else:
            m     = minutos if minutos is not None else 60
            since = (datetime.now() - timedelta(minutes=m)).isoformat()
            query = query.gte("timestamp_subida", since)
        res        = query.order("timestamp_subida", desc=True).execute()
        raw_events = res.data or []
        if not raw_events:
            return []

        dist_ids = list(set(e["id_distribuidor"] for e in raw_events))
        pdv_ids  = list(set(e["id_cliente_pdv"] for e in raw_events if e.get("id_cliente_pdv")))
        dists    = {d["id_distribuidor"]: d["nombre_display"] or d["nombre_empresa"]
                    for d in sb.table("distribuidores").select("id_distribuidor, nombre_empresa, nombre_display").in_("id_distribuidor", dist_ids).execute().data or []}
        pdv_map: dict = {}
        if pdv_ids:
            pdv_res = sb.table("clientes_pdv_v2").select(
                "id_cliente, id_cliente_erp, nombre_fantasia, latitud, longitud, "
                "rutas_v2(id_ruta, id_ruta_erp, vendedores_v2(id_vendedor, nombre_erp, sucursales_v2(id_sucursal, nombre_erp)))"
            ).in_("id_cliente", pdv_ids).execute()
            for row in pdv_res.data or []:
                pdv_map[row["id_cliente"]] = row

        final_data = []
        for e in raw_events:
            pdv = pdv_map.get(e["id_cliente_pdv"])
            lat = pdv.get("latitud") if pdv else e.get("latitud_gps")
            lon = pdv.get("longitud") if pdv else e.get("longitud_gps")
            if not lat or lat == 0:
                continue
            nombre_sucursal = "Sin Sucursal"
            nombre_vendedor = "Sin Vendedor"
            dist_name       = dists.get(e["id_distribuidor"], f"Dist {e['id_distribuidor']}")
            id_vendedor_found = None
            if pdv and pdv.get("rutas_v2"):
                rutas_raw = pdv["rutas_v2"]
                if not isinstance(rutas_raw, list): rutas_raw = [rutas_raw]
                for ruta in rutas_raw:
                    if not ruta: continue
                    vendedor = ruta.get("vendedores_v2")
                    if vendedor:
                        nombre_vendedor   = vendedor.get("nombre_erp", "Vendedor S/N")
                        id_vendedor_found = vendedor.get("id_vendedor")
                        suc = vendedor.get("sucursales_v2")
                        if suc: nombre_sucursal = suc.get("nombre_erp", "Sucursal S/N")
                        break
            final_data.append({
                "id_ex": e["id_exhibicion"], "id_dist": e["id_distribuidor"],
                "nombre_dist": dist_name, "sucursal_nombre": nombre_sucursal,
                "vendedor_nombre": nombre_vendedor, "lat": float(lat), "lon": float(lon),
                "timestamp_evento": e["timestamp_subida"],
                "nro_cliente": pdv["id_cliente_erp"] if pdv else (e.get("cliente_sombra_codigo") or "0"),
                "cliente_nombre": pdv["nombre_fantasia"] if pdv else "Desconocido",
                "drive_link": e["url_foto_drive"], "id_vendedor": id_vendedor_found,
            })
        return final_data
    except Exception as e:
        logger.error(f"Error procesando eventos de mapa: {e}")
        import traceback; logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ─── Motor RPA control ────────────────────────────────────────────────────────

@router.post("/api/admin/run-cc-motor", tags=["Admin"])
async def admin_run_cc_motor(background_tasks: BackgroundTasks, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Exclusivo para SuperAdmins")
    script_path = os.path.join(os.path.dirname(__file__), "../../ShelfMind-RPA/motores/cuentas_corrientes.py")
    os.makedirs(os.path.dirname(CC_LOG_PATH), exist_ok=True)

    def run_motor():
        with open(CC_LOG_PATH, "w") as log_file:
            log_file.write(f"--- Iniciando ejecución manual: {datetime.now().isoformat()} ---\n")
            log_file.flush()
            try:
                env = os.environ.copy()
                env["RPA_HEADLESS"] = "true"
                process = subprocess.Popen([sys.executable, script_path], stdout=log_file, stderr=subprocess.STDOUT, env=env, cwd=os.path.dirname(script_path))
                process.wait()
                log_file.write(f"\n--- Ejecución finalizada: {datetime.now().isoformat()} (Exit: {process.returncode}) ---\n")
            except Exception as e:
                log_file.write(f"\n❌ ERROR CRITICO: {str(e)}\n")

    background_tasks.add_task(run_motor)
    return {"ok": True, "message": "Motor iniciado en segundo plano. Monitorea los logs."}


@router.get("/api/admin/cc-logs", tags=["Admin"])
async def admin_cc_logs(lines: int = 100, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Exclusivo para SuperAdmins")
    if not os.path.exists(CC_LOG_PATH):
        return {"logs": "No hay logs disponibles."}
    try:
        with open(CC_LOG_PATH, "r") as f:
            content = f.readlines()
        return {"logs": "".join(content[-lines:])}
    except Exception as e:
        return {"logs": f"Error leyendo logs: {str(e)}"}


@router.get("/api/admin/motor-runs", tags=["Admin"])
def admin_motor_runs(motor: Optional[str] = None, limit: int = 20, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Exclusivo para SuperAdmins")
    q = sb.table("motor_runs").select("*").order("iniciado_en", desc=True).limit(limit)
    if motor: q = q.eq("motor", motor)
    return q.execute().data or []


@router.get("/api/admin/motor-runs/{dist_id}", tags=["Admin"])
def motor_runs_by_dist(dist_id: int, motor: Optional[str] = None, limit: int = 20, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        q = sb.table("motor_runs").select("*").eq("dist_id", dist_id).order("iniciado_en", desc=True).limit(limit)
        if motor: q = q.eq("motor", motor)
        return q.execute().data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/permissions", tags=["Admin"])
def get_all_permissions(user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado. Exclusivo para SuperAdmins.")
    res = sb.table("roles_permisos").select("*").execute()
    return res.data or []


@router.post("/api/admin/permissions", tags=["Admin"])
def update_permissions_batch(req: RolePermissionUpdate, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado. Exclusivo para SuperAdmins.")
    try:
        # Upsert cada permiso. En Supabase/Postgres, upsert requiere que el conflicto esté definido.
        for p in req.permissions:
            sb.table("roles_permisos").upsert({
                "rol": p.rol,
                "permiso_key": p.permiso_key,
                "valor": p.valor
            }, on_conflict="rol, permiso_key").execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error actualizando permisos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Locations / jerarquía ────────────────────────────────────────────────────

@router.get("/api/admin/locations/{dist_id}", summary="Sucursales de un distribuidor")
def admin_get_locations(dist_id: int, _=Depends(verify_auth)):
    q = sb.table("sucursales").select("nombre_erp, id_sucursal_erp").eq("id_distribuidor", dist_id)
    if dist_id > 0: q = q.eq("ID_DIST", dist_id)
    res = q.execute()
    seen, formatted = set(), []
    for row in res.data or []:
        sid = row.get("id suc")
        if sid and sid not in seen:
            seen.add(sid)
            formatted.append({"location_id": sid, "label": row.get("SUCURSAL"), "ciudad": "-", "provincia": "-"})
    return sorted(formatted, key=lambda x: x["label"])


@router.put("/api/admin/locations/{location_id}", summary="Editar sucursal")
def admin_update_location(location_id: str, req: LocationRequest, _=Depends(verify_auth)):
    return {"ok": True}


@router.get("/api/admin/vendedores-by-location/{location_id}", summary="Vendedores de una sucursal")
def admin_vendedores_by_location(location_id: str, dist_id: int, _=Depends(verify_auth)):
    result = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, telegram_user_id").eq("id_sucursal_erp", location_id).eq("id_distribuidor", dist_id).eq("rol_telegram", "vendedor").order("nombre_integrante").execute()
    return result.data or []


@router.get("/api/admin/hierarchy/{dist_id}", tags=["Admin"])
def get_hierarchy(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res_loc = sb.table("sucursales").select("nombre_erp, id_sucursal_erp").eq("id_distribuidor", dist_id).execute()
        seen_locs, locs = set(), []
        for row in res_loc.data or []:
            sid = row.get("id_sucursal_erp")
            if sid and sid not in seen_locs:
                seen_locs.add(sid)
                locs.append({"location_id": sid, "label": row.get("nombre_erp") or "Sucursal " + str(sid)})
        vendedores = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute().data or []
        hierarchy = []
        for loc in locs:
            hierarchy.append({**loc, "vendedores": [v for v in vendedores if v.get("id_sucursal_erp") == loc["location_id"]]})
        sin_sucursal = [v for v in vendedores if not v.get("id_sucursal_erp")]
        if sin_sucursal:
            hierarchy.append({"location_id": None, "label": "Sin Sucursal", "ciudad": "-", "provincia": "-", "vendedores": sin_sucursal})
        return hierarchy
    except Exception as e:
        logger.error(f"Error en jerarquía: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/hierarchy-config/{dist_id}", summary="Configuración de jerarquía consolidada")
def get_hierarchy_config(dist_id: int, _=Depends(verify_auth)):
    try:
        suc_res   = sb.table("sucursales").select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).execute()
        suc_names = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_res.data or [])}
        vend_res  = sb.table("vendedores").select("id_vendedor, nombre_erp, id_sucursal").eq("id_distribuidor", dist_id).execute()
        hierarchy_map: dict = {}
        for v in vend_res.data or []:
            sid, vid = v.get("id_sucursal"), v.get("id_vendedor")
            if not sid or not vid: continue
            if sid not in hierarchy_map:
                hierarchy_map[sid] = {"sucursal_id": sid, "sucursal_nombre": suc_names.get(sid) or f"Sucursal {sid}", "vendedores": []}
            hierarchy_map[sid]["vendedores"].append({"vendedor_id": vid, "vendedor_nombre": v.get("nombre_erp") or f"Vendedor {vid}"})
        formatted_erp  = sorted(list(hierarchy_map.values()), key=lambda x: x["sucursal_nombre"])
        formatted_locs = [{"location_id": sid, "label": sname} for sid, sname in suc_names.items()]
        groups = sb.table("integrantes_grupo").select("telegram_group_id").eq("id_distribuidor", dist_id).execute()
        formatted_groups = [{"id": g.get("telegram_group_id"), "nombre": f"Grupo {g.get('telegram_group_id')}"} for g in (groups.data or []) if g.get("telegram_group_id")]
        integrantes = sb.table("integrantes_grupo").select("id_integrante, nombre_integrante, id_vendedor_erp, id_sucursal_erp, telegram_group_id").eq("id_distribuidor", dist_id).execute()
        return {"locations": formatted_locs, "erp_hierarchy": formatted_erp, "telegram_groups": formatted_groups, "integrantes": integrantes.data or []}
    except Exception as e:
        logger.error(f"Error fetching hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/admin/hierarchy-config/save/{dist_id}", summary="Guardado masivo de jerarquía")
def save_hierarchy_config(dist_id: int, req: BulkMappingRequest, _=Depends(verify_auth)):
    try:
        for item in req.mappings:
            sb.table("integrantes_grupo").update({
                "id_sucursal_erp": str(item.location_id) if item.location_id else None,
                "id_vendedor_erp": item.id_vendedor_erp,
            }).eq("id_integrante", item.id_integrante).eq("id_distribuidor", dist_id).execute()
        return {"ok": True, "message": f"Se procesaron {len(req.mappings)} mapeos."}
    except Exception as e:
        logger.error(f"Error saving hierarchy config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/admin/hierarchy/sucursales/{dist_id}", tags=["Hierarchy"])
def get_hierarchy_sucursales(dist_id: int, _=Depends(verify_auth)):
    res = sb.table("sucursales").select("id_sucursal, nombre_erp").eq("id_distribuidor", dist_id).order("nombre_erp").execute()
    return res.data or []


@router.get("/api/admin/hierarchy/vendedores/{sucursal_id}", tags=["Hierarchy"])
def get_hierarchy_vendedores(sucursal_id: int, _=Depends(verify_auth)):
    res = sb.table("vendedores").select("id_vendedor, nombre_erp").eq("id_sucursal", sucursal_id).order("nombre_erp").execute()
    return res.data or []


@router.get("/api/admin/hierarchy/rutas/{vendedor_id}", tags=["Hierarchy"])
def get_hierarchy_rutas(vendedor_id: int, _=Depends(verify_auth)):
    res = sb.table("rutas").select("id_ruta, id_ruta_erp, dia_semana, periodicidad").eq("id_vendedor", vendedor_id).order("id_ruta_erp").execute()
    return res.data or []


@router.get("/api/admin/hierarchy/clientes-pdv/{ruta_id}", tags=["Hierarchy"])
def get_hierarchy_clientes_pdv(ruta_id: int, _=Depends(verify_auth)):
    res = sb.table("clientes_pdv_v2").select("id_cliente, id_cliente_erp, nombre_fantasia, domicilio").eq("id_ruta", ruta_id).order("nombre_fantasia").execute()
    return res.data or []


@router.get("/api/admin/hierarchy/vendedores-huerfanos/{dist_id}", tags=["Admin"])
def get_orphan_vendedores(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_vendedores_huerfanos", {"p_dist_id": dist_id}).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/admin/hierarchy/map-seller", tags=["Admin"])
def map_seller_erp(data: dict, user_payload=Depends(verify_auth)):
    dist_id = data.get("dist_id")
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.table("integrantes_grupo").update({"id_vendedor_erp": data.get("id_vendedor_erp")}).eq("id_integrante", data.get("id_integrante")).execute()
        return res.data[0] if res.data else {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/admin/hierarchy/map-sucursal", tags=["Admin"])
def map_integrante_sucursal(data: dict, user_payload=Depends(verify_auth)):
    dist_id    = data.get("dist_id")
    check_dist_permission(user_payload, dist_id)
    location_id = data.get("location_id")
    try:
        res = sb.table("integrantes_grupo").update({"id_sucursal_erp": str(location_id) if location_id else None}).eq("id_integrante", data.get("id_integrante")).execute()
        return res.data[0] if res.data else {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/admin/hierarchy/sync-from-erp/{dist_id}", tags=["Admin"])
def sync_hierarchy_from_erp(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res_vend = sb.table("vendedores_v2").select("nombre_erp, id_vendedor_erp, id_sucursal").eq("id_distribuidor", dist_id).execute()
        if not res_vend.data:
            return {"message": "No hay vendedores en vendedores_v2 para sincronizar.", "count": 0}
        suc_ids = list(set(r["id_sucursal"] for r in res_vend.data if r.get("id_sucursal")))
        suc_erp_map: dict = {}
        if suc_ids:
            suc_res = sb.table("sucursales_v2").select("id_sucursal, id_sucursal_erp").in_("id_sucursal", suc_ids).execute()
            suc_erp_map = {r["id_sucursal"]: r["id_sucursal_erp"] for r in (suc_res.data or [])}

        def normalize_str(text: str) -> str:
            if not text or str(text).strip().upper() in ("NAN", "NONE", "NULL", "NA"): return ""
            text = str(text).strip().upper()
            return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")

        vendedor_mapping: dict = {}
        for row in res_vend.data:
            v_name = normalize_str(row.get("nombre_erp"))
            v_id   = row.get("id_vendedor_erp")
            s_id   = suc_erp_map.get(row.get("id_sucursal"))
            if v_name:
                vendedor_mapping[v_name] = {"v_id": v_id, "s_id": s_id}
                if "-" in v_name:
                    v_clean = v_name.split("-", 1)[1].strip()
                    if v_clean: vendedor_mapping[v_clean] = {"v_id": v_id, "s_id": s_id}

        integrantes   = sb.table("integrantes_grupo").select("*").eq("id_distribuidor", dist_id).execute().data or []
        updated_count = 0
        for ig in integrantes:
            ig_nombre = normalize_str(ig.get("nombre_integrante"))
            if not ig_nombre: continue
            match = vendedor_mapping.get(ig_nombre)
            if not match:
                for v_key, v_val in vendedor_mapping.items():
                    if ig_nombre in v_key or v_key in ig_nombre:
                        match = v_val; break
            if match:
                v_erp_id, s_erp_id = match["v_id"], match["s_id"]
                if ig.get("id_vendedor_erp") != v_erp_id or ig.get("id_sucursal_erp") != s_erp_id:
                    sb.table("integrantes_grupo").update({
                        "id_vendedor_erp": str(v_erp_id) if v_erp_id else None,
                        "id_sucursal_erp": str(s_erp_id) if s_erp_id else None,
                    }).eq("id_integrante", ig["id_integrante"]).execute()
                    updated_count += 1
        return {"ok": True, "updated_count": updated_count}
    except Exception as e:
        logger.error(f"Error en sync hierarchy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Clientes ─────────────────────────────────────────────────────────────────

@router.get("/api/admin/clientes", summary="Clientes con filtros en cascada")
def admin_get_clientes(dist_id: int, location_id: str | None = None, id_vendedor: int | None = None, sin_asignar: bool = False, _=Depends(verify_auth)):
    result = sb.rpc("fn_clientes_admin", {"p_dist_id": dist_id, "p_location_id": location_id or 0, "p_vendedor_id": id_vendedor or 0, "p_sin_asignar": sin_asignar}).execute()
    return result.data or []


@router.put("/api/admin/clientes/{id_cliente}/vendedor", summary="Asignar vendedor a cliente")
def admin_asignar_vendedor(id_cliente: int, req: AsignarVendedorRequest, _=Depends(verify_auth)):
    r = sb.table("clientes_pdv_v2").update({"id_vendedor": req.id_integrante}).eq("id_cliente", id_cliente).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True, "id_cliente": id_cliente, "id_integrante": req.id_integrante}


# ─── Dashboard unificado y legacy ─────────────────────────────────────────────

@router.get("/api/admin/unified-dashboard", summary="Dashboard unificado ERP 3.0")
def get_unified_dashboard(_=Depends(verify_auth)):
    try:
        dist_res = sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, id_erp").execute()
        distribuidores = dist_res.data or []
        suc_res  = sb.table("sucursales").select("id_sucursal, id_distribuidor, nombre_erp").execute()
        sucursales_db = suc_res.data or []
        ven_res  = sb.table("vendedores").select("id_vendedor, id_sucursal, id_distribuidor, nombre_erp").execute()
        vendedores_db = ven_res.data or []
        int_res  = sb.table("integrantes_grupo").select("id_integrante, id_distribuidor, nombre_integrante, id_vendedor_erp, id_sucursal_erp, rol_telegram, telegram_group_id").execute()
        integrantes_db = int_res.data or []
        result = []
        for dist in distribuidores:
            did = dist["id_distribuidor"]
            dist_data = {"id_distribuidor": did, "nombre_empresa": dist["nombre_empresa"], "id_erp_global": dist.get("id_erp"), "token": dist.get("token_bot", ""), "sucursales": [], "unmapped_integrantes": []}
            suc_list = [s for s in sucursales_db if s["id_distribuidor"] == did]
            suc_ids_dist = {s["id_sucursal"] for s in suc_list}
            ven_list = [v for v in vendedores_db if v.get("id_distribuidor") == did or v.get("id_sucursal") in suc_ids_dist]
            int_list = [i for i in integrantes_db if i["id_distribuidor"] == did]
            for suc in suc_list:
                s_id = suc["id_sucursal"]
                suc_data = {"id": s_id, "nombre_sucursal": suc["nombre_erp"], "vendedores": []}
                for ven in [v for v in ven_list if v["id_sucursal"] == s_id]:
                    v_id   = ven["id_vendedor"]
                    v_name = ven["nombre_erp"]
                    ven_data = {"id": v_id, "vendedor_nombre": v_name, "integrantes": []}
                    for a in [i for i in int_list if i.get("id_vendedor_erp") == v_name]:
                        ven_data["integrantes"].append({"id_integrante": a["id_integrante"], "nombre": a["nombre_integrante"], "rol_telegram": a["rol_telegram"], "telegram_group_id": a["telegram_group_id"]})
                    suc_data["vendedores"].append(ven_data)
                dist_data["sucursales"].append(suc_data)
            for u in [i for i in int_list if not i.get("id_vendedor_erp")]:
                dist_data["unmapped_integrantes"].append({"id_integrante": u["id_integrante"], "nombre": u["nombre_integrante"], "rol_telegram": u["rol_telegram"], "telegram_group_id": u["telegram_group_id"]})
            result.append(dist_data)
        return result
    except Exception as e:
        logger.error(f"Error fetching unified dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
