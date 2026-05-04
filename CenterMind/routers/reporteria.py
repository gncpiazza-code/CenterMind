# -*- coding: utf-8 -*-
"""
Reportería — upload de XLSX + panel interactivo.
Fase 1: solo ingesta manual por upload.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query

from core.security import verify_auth, check_dist_permission
from services.reporting.ingest_service import ingest_file, get_job, get_snapshot

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()

_ALLOWED_SOURCES = {"sigo", "comprobantes", "bultos"}
_MAX_MB = 50


@router.post("/api/reporteria/manual-upload/{id_distribuidor}", tags=["Reportería"])
async def manual_upload(
    id_distribuidor: int,
    file: UploadFile = File(...),
    source: str = Form(...),
    date_from: str = Form(...),
    date_to: str = Form(...),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, id_distribuidor)

    if source not in _ALLOWED_SOURCES:
        raise HTTPException(400, f"source debe ser: {sorted(_ALLOWED_SOURCES)}")

    content = await file.read()
    if len(content) > _MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"Archivo demasiado grande (máx {_MAX_MB} MB)")

    filename = file.filename or "upload.xlsx"
    lower = filename.lower()
    if not (lower.endswith(".xlsx") or lower.endswith(".xls") or lower.endswith(".csv")):
        raise HTTPException(400, "Formato no aceptado. Usá .xlsx, .xls o .csv")

    logger.info(f"Reportería upload | dist={id_distribuidor} source={source} file={filename} size={len(content)//1024}KB")

    try:
        job = ingest_file(
            dist_id=id_distribuidor,
            source=source,
            file_bytes=content,
            filename=filename,
            date_from=date_from,
            date_to=date_to,
            user_id=user_payload.get("id_usuario", 0),
        )
    except Exception as exc:
        logger.error(f"Reportería ingest error: {exc}")
        raise HTTPException(500, f"Error procesando el archivo: {exc}")

    return job


@router.get("/api/reporteria/jobs/{job_id}", tags=["Reportería"])
def job_status(job_id: str, user_payload=Depends(verify_auth)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")
    return job


@router.get("/api/reporteria/explore/{id_distribuidor}", tags=["Reportería"])
def explore(
    id_distribuidor: int,
    source: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    user_payload=Depends(verify_auth),
):
    check_dist_permission(user_payload, id_distribuidor)
    snap = get_snapshot(id_distribuidor, source, date_from, date_to)
    if not snap:
        raise HTTPException(
            404,
            "No hay snapshot disponible para esos parámetros. Subí el archivo primero."
        )
    return snap
