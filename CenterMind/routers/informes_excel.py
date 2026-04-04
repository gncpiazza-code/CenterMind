# -*- coding: utf-8 -*-
"""
Informes Excel: motor multi-tenant para generación de PDFs desde archivos de ventas.

Endpoints:
  POST /api/admin/reports/infer-config          → Superadmin: infiere JSON de config desde un Excel
  GET  /api/admin/reports/config/{dist_id}      → Obtiene config guardada del tenant
  POST /api/admin/reports/config/{dist_id}      → Guarda/actualiza config del tenant
  POST /api/reports/generate/{dist_id}          → Sube Excel(s) y devuelve PDF
"""
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from core.security import verify_auth, check_dist_permission
from db import sb
from services.report_service import report_service

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


# ─── Inferencia de configuración ──────────────────────────────────────────────

@router.post(
    "/api/admin/reports/infer-config",
    tags=["Informes Excel"],
    summary="Superadmin: inferir config de un Excel de muestra",
)
async def infer_report_config(
    file: UploadFile = File(...),
    user_payload=Depends(verify_auth),
):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin puede inferir configuraciones.")
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx o .xls")
    try:
        file_bytes = await file.read()
        config_draft = report_service.infer_config(file_bytes)
        return {"ok": True, "config_draft": config_draft}
    except Exception as e:
        logger.error(f"Error en infer_report_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Gestión de configuración por tenant ──────────────────────────────────────

@router.get(
    "/api/admin/reports/config/{dist_id}",
    tags=["Informes Excel"],
    summary="Obtener configuración de informe del tenant",
)
def get_report_config(dist_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = (
            sb.table("tenant_report_configs")
            .select("config_json, updated_at")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"ok": True, "config_json": None, "configured": False}
        return {"ok": True, "config_json": res.data[0]["config_json"], "configured": True, "updated_at": res.data[0]["updated_at"]}
    except Exception as e:
        logger.error(f"Error obteniendo report config dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/api/admin/reports/config/{dist_id}",
    tags=["Informes Excel"],
    summary="Guardar/actualizar configuración de informe del tenant (PUT)",
)
async def put_report_config(dist_id: int, request: Request, user_payload=Depends(verify_auth)):
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin puede guardar configuraciones.")
    check_dist_permission(user_payload, dist_id)
    try:
        body = await request.json()
        config_json = body.get("config_json", body)
        sb.table("tenant_report_configs").upsert(
            {"id_distribuidor": dist_id, "config_json": config_json},
            on_conflict="id_distribuidor",
        ).execute()
        return {"ok": True, "message": "Configuración guardada."}
    except Exception as e:
        logger.error(f"Error guardando report config dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Generación de PDF ────────────────────────────────────────────────────────

@router.post(
    "/api/reports/generate/{dist_id}",
    tags=["Informes Excel"],
    summary="Subir Excel(s) y generar PDF de informe de ventas",
    response_class=Response,
)
async def generate_report(
    dist_id: int,
    files: List[UploadFile] = File(...),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, dist_id)

    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos un archivo Excel.")

    for f in files:
        if not f.filename or not f.filename.lower().endswith((".xlsx", ".xls")):
            raise HTTPException(status_code=400, detail=f"'{f.filename}' no es un Excel válido.")

    # Cargar config del tenant
    try:
        res = (
            sb.table("tenant_report_configs")
            .select("config_json")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error cargando tenant config dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al cargar la configuración del tenant.")

    if not res.data:
        raise HTTPException(
            status_code=422,
            detail="Este distribuidor no tiene una configuración de informes. El Superadmin debe crearla primero.",
        )

    config = res.data[0]["config_json"]
    if isinstance(config, str):
        config = json.loads(config)

    # Leer archivos
    files_bytes: list[bytes] = []
    for f in files:
        content = await f.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"El archivo '{f.filename}' está vacío.")
        files_bytes.append(content)

    # Procesar y generar PDF
    try:
        pdf_bytes = report_service.process_and_generate(files_bytes, config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        # reportlab no instalado
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error generando informe dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar los archivos: {str(e)}")

    empresa = config.get("empresa", f"dist_{dist_id}").replace(" ", "_").replace("/", "-")[:30]
    mes = config.get("mes_reporte", "informe").replace(" ", "_")[:20]
    filename = f"informe_{empresa}_{mes}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
