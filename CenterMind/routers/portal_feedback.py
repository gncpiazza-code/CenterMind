# -*- coding: utf-8 -*-
"""Portal: telemetría guía CC/Difusión y mensajes al desarrollador (superadmin responde)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from core.security import verify_auth
from core.lifespan import broadcast_sync, SUPERADMIN_WS_DIST_ID
from db import sb
from models.schemas import (
    PortalFeedbackMessageCreate,
    PortalFeedbackReplyIn,
    PortalGuiaTrackingIn,
)

logger = logging.getLogger("ShelfyAPI")
router = APIRouter(prefix="/api/portal-feedback", tags=["Portal feedback"])


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
    return {"ok": True, "id": cid}


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
    return {"items": rows}


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
