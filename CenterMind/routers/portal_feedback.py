# -*- coding: utf-8 -*-
"""Portal: telemetría guía CC/Difusión y mensajes al desarrollador (superadmin responde)."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from core.security import verify_auth
from core.lifespan import broadcast_sync, SUPERADMIN_WS_DIST_ID
from db import sb
from services.portal_ticket_classifier import (
    clasificar_portal_ticket,
    generar_pre_resolucion_ticket,
)
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


async def _store_portal_attachment(file: UploadFile, dist_id: int | None, uid: int) -> dict:
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
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".txt", ".csv", ".zip", ".xlsx", ".xls"
    }:
        raise HTTPException(
            status_code=400,
            detail="Tipo de archivo no permitido — usá imagen, PDF, TXT/CSV o Excel",
        )

    try:
        dist_part = int(dist_id) if dist_id is not None else 0
    except (TypeError, ValueError):
        dist_part = 0
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
        sb.storage.from_(_TICKET_BUCKET).upload(storage_path, data, file_options=upload_opts)
        url = sb.storage.from_(_TICKET_BUCKET).get_public_url(storage_path)
    except Exception as e:
        logger.error(f"[portal-feedback] upload attachment path={storage_path}: {e}")
        raise HTTPException(status_code=500, detail="No se pudo guardar el adjunto") from e
    return {"ok": True, "url": url, "filename": orig}



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
    uid = int(pl.get("id_usuario") or 0)
    return await _store_portal_attachment(file, pl.get("id_distribuidor"), uid)


@router.post("/messages")
async def post_feedback_message(
    request: Request,
    user_payload: dict = Depends(verify_auth),
):
    pl = _require_jwt_user(user_payload)
    content_type = (request.headers.get("content-type") or "").lower()
    contenido: str = ""
    attachments_lines: list[str] = []
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        contenido = str(form.get("contenido") or "").strip()
        files = [
            v for v in form.values()
            if isinstance(v, UploadFile) and v.filename
        ]
        if files:
            uid = int(pl.get("id_usuario") or 0)
            for f in files:
                stored = await _store_portal_attachment(f, pl.get("id_distribuidor"), uid)
                attachments_lines.append(f"- {stored['url']} ({stored['filename']})")
    else:
        payload = await request.json()
        body = PortalFeedbackMessageCreate.model_validate(payload)
        contenido = body.contenido.strip()

    if not contenido:
        raise HTTPException(status_code=422, detail="contenido es obligatorio")
    if attachments_lines:
        contenido = f"{contenido}\n\nAdjuntos:\n" + "\n".join(attachments_lines)

    row = {
        "id_usuario": int(pl["id_usuario"]),
        "id_distribuidor": pl.get("id_distribuidor"),
        "usuario_snapshot": pl.get("sub") or "",
        "rol_snapshot": str(pl.get("rol") or ""),
        "contenido": contenido,
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
    cl = clasificar_portal_ticket(contenido)
    return {"ok": True, "id": cid, "clasificacion_agent": cl}


@router.get("/messages")
async def list_feedback_messages(
    pendientes_primero: bool = True,
    limit: int = 200,
    status: str = "all",
    category_id: str | None = None,
    dist_id: int | None = None,
    q: str | None = None,
    order: str = "desc",
    user_payload: dict = Depends(verify_auth),
):
    pl = _require_jwt_user(user_payload)
    lim = max(1, min(limit, 500))
    try:
        query = (
            sb.table("portal_feedback_messages")
            .select(
                "id,created_at,updated_at,id_usuario,id_distribuidor,usuario_snapshot,rol_snapshot,"
                "contenido,respuesta,responded_at,id_usuario_respuesta"
            )
        )
        
        # Si no es superadmin, solo puede ver sus propios tickets
        if not pl.get("is_superadmin"):
            query = query.eq("id_usuario", int(pl["id_usuario"]))
        elif dist_id is not None:
            query = query.eq("id_distribuidor", dist_id)

        res = (
            query
            .order("created_at", desc=(order.lower() == "desc"))
            .limit(lim)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.error(f"[portal-feedback] list messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if pendientes_primero:
        # Si order es desc, queremos los más nuevos primero (dentro de cada grupo)
        # Si order es asc, queremos los más viejos primero
        # Pero SIEMPRE queremos los pendientes (False) primero.
        rows = sorted(
            rows,
            key=lambda r: (
                bool((r.get("respuesta") or "").strip()),
                r.get("created_at") or "" if order.lower() == "asc" else -(datetime.fromisoformat((r.get("created_at") or "1970-01-01").replace("Z", "+00:00")).timestamp())
            ),
        )
    q_norm = (q or "").strip().lower()
    status_norm = (status or "all").strip().lower()
    cat_norm = (category_id or "").strip().lower()
    enriched: list[dict] = []
    for r in rows:
        if dist_id is not None and r.get("id_distribuidor") != dist_id:
            continue
        has_reply = bool((r.get("respuesta") or "").strip())
        if status_norm == "pending" and has_reply:
            continue
        if status_norm == "answered" and not has_reply:
            continue
        row_enriched = _fila_feedback_con_agente(r)
        if cat_norm:
            rid = str((row_enriched.get("clasificacion_agent") or {}).get("categoria_id") or "").lower()
            if rid != cat_norm:
                continue
        if q_norm:
            haystack = " ".join(
                [
                    str(row_enriched.get("contenido") or ""),
                    str(row_enriched.get("respuesta") or ""),
                    str(row_enriched.get("usuario_snapshot") or ""),
                    str((row_enriched.get("clasificacion_agent") or {}).get("hipotesis_falla") or ""),
                ]
            ).lower()
            if q_norm not in haystack:
                continue
        enriched.append(row_enriched)
    return {"items": enriched}


@router.get("/messages/export")
async def export_feedback_messages_json(
    pendientes_primero: bool = True,
    limit: int = 500,
    status: str = "all",
    category_id: str | None = None,
    dist_id: int | None = None,
    q: str | None = None,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    data = await list_feedback_messages(
        pendientes_primero=pendientes_primero,
        limit=limit,
        status=status,
        category_id=category_id,
        dist_id=dist_id,
        q=q,
        user_payload=user_payload,
    )
    return {
        "meta": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "pendientes_primero": pendientes_primero,
                "limit": limit,
                "status": status,
                "category_id": category_id,
                "dist_id": dist_id,
                "q": q,
            },
            "count": len(data.get("items") or []),
        },
        "items": data.get("items") or [],
    }


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


@router.post("/messages/{message_id}/pre-resolucion")
async def generar_pre_resolucion(
    message_id: str,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    try:
        res = (
            sb.table("portal_feedback_messages")
            .select(
                "id,created_at,updated_at,id_usuario,id_distribuidor,usuario_snapshot,rol_snapshot,"
                "contenido,respuesta,responded_at,id_usuario_respuesta"
            )
            .eq("id", message_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")
        clf = clasificar_portal_ticket(str(row.get("contenido") or ""))
        pre = generar_pre_resolucion_ticket(ticket=row, clasificacion=clf)
        return {"ok": True, "id": str(row.get("id")), "clasificacion_agent": clf, "pre_resolucion": pre}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[portal-feedback] pre-resolucion {message_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
