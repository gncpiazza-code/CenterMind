# -*- coding: utf-8 -*-
"""Portal: telemetría guía CC/Difusión y mensajes al desarrollador (superadmin responde)."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from core.security import verify_auth
from core.lifespan import broadcast_sync, SUPERADMIN_WS_DIST_ID
from db import sb
from services.portal_ticket_classifier import clasificar_portal_ticket
from models.schemas import (
    PortalFeedbackMessageCreate,
    PortalFeedbackReplyIn,
    PortalGuiaTrackingIn,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter(prefix="/api/portal-feedback", tags=["Portal feedback"])

_TICKET_BUCKET = "Exhibiciones-PDV"
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

_ALLOWED_CT_PREFIXES = (
    "image/",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
)
_ALLOWED_CT_FULL = frozenset(
    {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    }
)


def _safe_orig_name(raw: str) -> str:
    base = (raw or "").replace("\\", "/").split("/")[-1] or "archivo"
    cleaned = re.sub(r"[^a-zA-Z0-9._\- ]+", "", base).strip()
    return (cleaned[:160] if cleaned else "archivo")


def _ext_from_name(name: str) -> str:
    if "." not in name:
        return ""
    tail = name.rsplit(".", 1)[-1].lower()
    if re.fullmatch(r"[a-z0-9]{1,12}", tail or ""):
        return f".{tail}"
    return ""



def _require_jwt_user(payload: dict) -> dict:
    if payload.get("method") == "api_key":
        raise HTTPException(status_code=403, detail="Este recurso solo acepta sesión JWT de portal.")
    uid = payload.get("id_usuario")
    if uid is None:
        raise HTTPException(status_code=400, detail="Token sin id_usuario")
    return payload


def _require_superadmin(payload: dict) -> dict:
    p = _require_jwt_user(payload)
    if not p.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin.")
    return p


def _fila_feedback_con_agente(row: dict) -> dict:
    r = dict(row)
    try:
        r["clasificacion_agent"] = clasificar_portal_ticket(str(r.get("contenido") or ""))
    except Exception as e:
        logger.warning("[portal-feedback] clasificacion omitida: %s", e)
        r["clasificacion_agent"] = None
    return r


@router.post("/guia-tracking")
async def post_guia_tracking(body: PortalGuiaTrackingIn, user_payload: dict = Depends(verify_auth)):
    pl = _require_jwt_user(user_payload)
    row = {
        "id_usuario": int(pl["id_usuario"]),
        "id_distribuidor": pl.get("id_distribuidor"),
        "usuario_snapshot": pl.get("sub") or "",
        "scroll_max_pct": int(body.scroll_max_pct),
        "active_seconds": int(body.active_seconds),
        "guia_version": body.guia_version,
        "cerrado_modal": body.cerrado_modal,
    }
    try:
        sb.table("portal_guia_cc_events").insert(row).execute()
    except Exception as e:
        logger.error(f"[portal-feedback] insert guia_tracking: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.post("/attachments")
async def post_portal_feedback_attachment(
    file: UploadFile = File(...),
    user_payload: dict = Depends(verify_auth),
):
    """Sube un adjunto para tickets del portal (JWT). Bucket público, path por distribuidor."""
    pl = _require_jwt_user(user_payload)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo inválido")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(data) > _MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera los 10 MB")

    ctype = (file.content_type or "").strip().lower() or "application/octet-stream"
    if ctype != "application/octet-stream":
        prefix_ok = any(ctype.startswith(p) for p in _ALLOWED_CT_PREFIXES)
        full_ok = ctype in _ALLOWED_CT_FULL
        if not (prefix_ok or full_ok):
            raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {ctype}")
    elif _ext_from_name(file.filename) not in {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".pdf",
        ".txt",
        ".csv",
        ".zip",
        ".xlsx",
        ".xls",
    }:
        raise HTTPException(
            status_code=400,
            detail="Tipo de archivo no permitido — usá imagen, PDF, TXT/CSV o Excel",
        )

    dist_id = pl.get("id_distribuidor")
    try:
        dist_part = int(dist_id) if dist_id is not None else 0
    except (TypeError, ValueError):
        dist_part = 0
    uid = int(pl.get("id_usuario") or 0)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    orig = _safe_orig_name(file.filename)
    short = uuid4().hex[:10]
    ext = _ext_from_name(orig) or ""
    fname_core = orig[: -len(ext)] if ext and orig.endswith(ext) else orig
    if not fname_core:
        fname_core = "archivo"
    storage_name = f"u{uid}_{stamp}_{short}_{fname_core}{ext}"
    storage_path = f"portal-tickets/{dist_part}/{storage_name}"

    upload_opts = {"content-type": ctype, "upsert": "true"}

    try:
        sb.storage.from_(_TICKET_BUCKET).upload(
            storage_path,
            data,
            file_options=upload_opts,
        )
        url = sb.storage.from_(_TICKET_BUCKET).get_public_url(storage_path)
    except Exception as e:
        logger.error(f"[portal-feedback] upload attachment path={storage_path}: {e}")
        raise HTTPException(status_code=500, detail="No se pudo guardar el adjunto") from e

    return {"ok": True, "url": url, "filename": orig}


@router.post("/messages")
async def post_feedback_message(
    body: PortalFeedbackMessageCreate, user_payload: dict = Depends(verify_auth)
):
    pl = _require_jwt_user(user_payload)
    row = {
        "id_usuario": int(pl["id_usuario"]),
        "id_distribuidor": pl.get("id_distribuidor"),
        "usuario_snapshot": pl.get("sub") or "",
        "rol_snapshot": str(pl.get("rol") or ""),
        "contenido": body.contenido.strip(),
    }
    pending_safe = 0
    try:
        res = sb.table("portal_feedback_messages").insert(row).execute()
        cid = ((res.data or [{}])[0] or {}).get("id") if getattr(res, "data", None) else None
        try:
            cr = (
                sb.table("portal_feedback_messages")
                .select("id", count="exact")
                .is_("respuesta", "null")
                .execute()
            )
            pending_safe = int(cr.count or 0)
        except Exception as cnt_e:
            logger.debug(f"[portal-feedback] pending count after insert: {cnt_e}")
            pending_safe = 0
    except Exception as e:
        logger.error(f"[portal-feedback] insert message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    broadcast_sync(
        SUPERADMIN_WS_DIST_ID,
        {
            "type": "portal_feedback_new",
            "id": str(cid) if cid else None,
            "usuario": pl.get("sub"),
            "pending": pending_safe,
        },
    )
    cl = clasificar_portal_ticket(body.contenido.strip())
    return {"ok": True, "id": cid, "clasificacion_agent": cl}


@router.get("/messages")
async def list_feedback_messages(
    pendientes_primero: bool = True,
    limit: int = 200,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    lim = max(1, min(limit, 500))
    try:
        res = (
            sb.table("portal_feedback_messages")
            .select(
                "id,created_at,updated_at,id_usuario,id_distribuidor,usuario_snapshot,rol_snapshot,"
                "contenido,respuesta,responded_at,id_usuario_respuesta"
            )
            .order("created_at", desc=True)
            .limit(lim)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.error(f"[portal-feedback] list messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if pendientes_primero:
        rows = sorted(
            rows,
            key=lambda r: (
                bool((r.get("respuesta") or "").strip()),
                r.get("created_at") or "",
            ),
        )
    enriched = [_fila_feedback_con_agente(r) for r in rows]
    return {"items": enriched}


@router.get("/pending-count")
async def pending_feedback_count(user_payload: dict = Depends(verify_auth)):
    """Solo superadmin — tickets sin respuesta."""
    _require_superadmin(user_payload)
    try:
        cr = (
            sb.table("portal_feedback_messages")
            .select("id", count="exact")
            .is_("respuesta", "null")
            .execute()
        )
        pending = int(cr.count or 0)
    except Exception as e:
        logger.error(f"[portal-feedback] pending-count: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"pending": pending}


@router.patch("/messages/{message_id}")
async def reply_feedback_message(
    message_id: str,
    body: PortalFeedbackReplyIn,
    user_payload: dict = Depends(verify_auth),
):
    pl = _require_superadmin(user_payload)
    responder = int(pl["id_usuario"])
    patch = {
        "respuesta": body.respuesta.strip(),
        "responded_at": datetime.now(timezone.utc).isoformat(),
        "id_usuario_respuesta": responder,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    pending_safe = 0
    try:
        sb.table("portal_feedback_messages").update(patch).eq("id", message_id).execute()
        try:
            cr = (
                sb.table("portal_feedback_messages")
                .select("id", count="exact")
                .is_("respuesta", "null")
                .execute()
            )
            pending_safe = int(cr.count or 0)
        except Exception as cnt_e:
            logger.debug(f"[portal-feedback] pending count after reply: {cnt_e}")
            pending_safe = 0
    except Exception as e:
        logger.error(f"[portal-feedback] reply {message_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    broadcast_sync(
        SUPERADMIN_WS_DIST_ID,
        {
            "type": "portal_feedback_updated",
            "pending": pending_safe,
        },
    )
    return {"ok": True}
