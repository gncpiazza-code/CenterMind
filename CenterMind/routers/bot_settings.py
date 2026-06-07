# -*- coding: utf-8 -*-
"""
API REST para Bot Settings. Solo superadmin.
Gestión de plantillas de mensajes y comandos del bot Telegram.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from core.security import verify_auth
from core.bot_settings import get_settings_cache
from db import sb

logger = logging.getLogger("ShelfyAPI")
router = APIRouter(prefix="/api/bot-settings", tags=["bot-settings"])


# ─── Guards ───────────────────────────────────────────────────────────────────

def _require_superadmin(user_payload: dict) -> dict:
    if not user_payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadmin puede acceder a Bot Settings.")
    return user_payload


async def _sync_telegram_menu() -> dict:
    """Push setMyCommands a todos los bots activos tras cambiar bot_commands."""
    from services.bot_commands_refresh_service import refresh_all_bots_menu

    try:
        return await refresh_all_bots_menu(sb)
    except Exception as e:
        logger.error(f"[bot-settings] sync menu: {e}", exc_info=True)
        return {"updated": 0, "errors": [str(e)]}


# ─── Modelos Pydantic ──────────────────────────────────────────────────────────

class MessageTemplateUpdate(BaseModel):
    body_html: str


class CommandPatch(BaseModel):
    menu_description: str | None = None
    visible_in_menu: bool | None = None
    enabled: bool | None = None
    sort_order: int | None = None


class CustomCommandCreate(BaseModel):
    command: str
    menu_description: str
    visible_in_menu: bool = True
    enabled: bool = True
    caption_html: str = ""
    kind: str = "static_media"


class BotPreviewRequest(BaseModel):
    dist_id: int
    id_vendedor: int | None = None
    input: str | None = None
    callback_action: str | None = None


# ─── Slug validation ──────────────────────────────────────────────────────────

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")
_BUILTIN_COMMANDS = frozenset({
    "start", "help", "stats", "ranking", "objetivos",
    "vincular", "status", "id", "cadenaone", "reset", "hardreset",
    "cartera", "carterahoy", "ventas", "cuentas",
})


def _validate_command_slug(command: str) -> str:
    cmd = command.lower().strip().lstrip("/")
    if not _SLUG_RE.match(cmd):
        raise HTTPException(
            status_code=400,
            detail="El comando debe tener 2-32 caracteres: solo letras minúsculas, dígitos y _",
        )
    if cmd in _BUILTIN_COMMANDS:
        raise HTTPException(status_code=400, detail=f"/{cmd} es un comando reservado del sistema")
    return cmd


# ─── Endpoints: plantillas de mensajes ────────────────────────────────────────

@router.get("/messages")
async def get_messages(user_payload: dict = Depends(verify_auth)):
    _require_superadmin(user_payload)
    try:
        rows = sb.table("bot_message_templates").select("*").order("message_key").execute().data or []
    except Exception as e:
        logger.error(f"[bot-settings] get_messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    from core.bot_message_catalog import merge_messages_for_api
    return {"messages": merge_messages_for_api(rows)}


@router.get("/flows")
async def get_message_flows(user_payload: dict = Depends(verify_auth)):
    _require_superadmin(user_payload)
    try:
        rows = sb.table("bot_message_templates").select("message_key,body_html").execute().data or []
    except Exception as e:
        logger.error(f"[bot-settings] get_flows: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    from core.bot_message_catalog import build_flows_payload, normalize_message_key
    db_map = {normalize_message_key(r["message_key"]): r.get("body_html") or "" for r in rows}
    return {"flows": build_flows_payload(db_map)}


@router.put("/messages/{key}")
async def update_message(
    key: str,
    body: MessageTemplateUpdate,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    if not key.strip():
        raise HTTPException(status_code=400, detail="message_key inválido")
    from core.bot_message_catalog import normalize_message_key
    canon = normalize_message_key(key)
    try:
        result = (
            sb.table("bot_message_templates")
            .upsert({"message_key": canon, "body_html": body.body_html})
            .execute()
        )
    except Exception as e:
        logger.error(f"[bot-settings] update_message key={key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Invalidar cache para que el próximo uso lea el valor actualizado
    get_settings_cache().invalidate()
    return {"ok": True, "message_key": key}


@router.delete("/messages/{key}")
async def reset_message(
    key: str,
    user_payload: dict = Depends(verify_auth),
):
    """Elimina override en DB → vuelve al default del catálogo."""
    _require_superadmin(user_payload)
    from core.bot_message_catalog import normalize_message_key, get_message_def
    canon = normalize_message_key(key)
    if not get_message_def(canon):
        raise HTTPException(status_code=404, detail="message_key desconocido")
    try:
        sb.table("bot_message_templates").delete().eq("message_key", canon).execute()
    except Exception as e:
        logger.error(f"[bot-settings] reset_message key={canon}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    get_settings_cache().invalidate()
    return {"ok": True, "message_key": canon}


# ─── Endpoints: comandos ──────────────────────────────────────────────────────

@router.get("/commands")
async def get_commands(user_payload: dict = Depends(verify_auth)):
    _require_superadmin(user_payload)
    try:
        rows = (
            sb.table("bot_commands")
            .select("*")
            .order("sort_order", desc=False)
            .execute().data or []
        )
    except Exception as e:
        logger.error(f"[bot-settings] get_commands: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"commands": rows}


@router.put("/commands/{command}")
async def update_command(
    command: str,
    body: CommandPatch,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    updates: dict = {}
    if body.menu_description is not None:
        updates["menu_description"] = body.menu_description
    if body.visible_in_menu is not None:
        updates["visible_in_menu"] = body.visible_in_menu
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    if body.sort_order is not None:
        updates["sort_order"] = body.sort_order

    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    try:
        res = (
            sb.table("bot_commands")
            .update(updates)
            .eq("command", command.lower().strip().lstrip("/"))
            .execute()
        )
    except Exception as e:
        logger.error(f"[bot-settings] update_command command={command}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    get_settings_cache().invalidate()
    menu_sync = await _sync_telegram_menu()
    return {"ok": True, "command": command, "updated": updates, "menu_sync": menu_sync}


@router.post("/commands/custom")
async def create_custom_command(
    command: str = Form(...),
    menu_description: str = Form(...),
    visible_in_menu: bool = Form(True),
    enabled: bool = Form(True),
    caption_html: str = Form(""),
    image: UploadFile | None = File(None),
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    cmd = _validate_command_slug(command)

    try:
        existing = (
            sb.table("bot_commands")
            .select("command")
            .eq("command", cmd)
            .limit(1)
            .execute().data or []
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if existing:
        raise HTTPException(status_code=409, detail=f"El comando /{cmd} ya existe")

    image_path: str | None = None
    if image and image.filename:
        from services.objetivos_notification_service import sanitize_telegram_html

        content = await image.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx. 5 MB)")
        ext = (image.filename.rsplit(".", 1)[-1].lower() if "." in image.filename else "jpg")
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            raise HTTPException(status_code=400, detail="Formato de imagen no soportado")
        storage_path = f"custom/{cmd}.{ext}"
        sb.storage.from_("bot-command-assets").upload(
            storage_path,
            content,
            file_options={"content-type": image.content_type or f"image/{ext}", "upsert": "true"},
        )
        image_path = storage_path
        caption_html = sanitize_telegram_html(caption_html)

    try:
        sb.table("bot_commands").insert({
            "command": cmd,
            "menu_description": menu_description.strip(),
            "visible_in_menu": visible_in_menu,
            "enabled": enabled,
            "kind": "static_media",
            "caption_html": caption_html,
            "image_path": image_path,
        }).execute()
    except Exception as e:
        logger.error(f"[bot-settings] create_custom_command cmd={cmd}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    get_settings_cache().invalidate()
    menu_sync = await _sync_telegram_menu()
    return {"ok": True, "command": cmd, "menu_sync": menu_sync}


@router.delete("/commands/custom/{command}")
async def delete_custom_command(
    command: str,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    cmd = command.lower().strip().lstrip("/")
    if cmd in _BUILTIN_COMMANDS:
        raise HTTPException(status_code=400, detail="No se puede eliminar un comando de sistema")

    try:
        # Solo eliminar comandos de tipo custom/static_media — no los built-in
        sb.table("bot_commands").delete().eq("command", cmd).eq("kind", "static_media").execute()
    except Exception as e:
        logger.error(f"[bot-settings] delete_custom_command cmd={cmd}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    get_settings_cache().invalidate()
    menu_sync = await _sync_telegram_menu()
    return {"ok": True, "command": cmd, "menu_sync": menu_sync}


# ─── Preview / simulador de chat ─────────────────────────────────────────────

@router.post("/preview")
async def preview_bot(
    body: BotPreviewRequest,
    user_payload: dict = Depends(verify_auth),
):
    _require_superadmin(user_payload)
    if not body.input and not body.callback_action:
        raise HTTPException(status_code=400, detail="Enviá input o callback_action")
    if body.dist_id <= 0:
        raise HTTPException(status_code=400, detail="dist_id inválido")

    from services.bot_preview_service import preview_bot_interaction

    try:
        messages = preview_bot_interaction(
            sb,
            dist_id=body.dist_id,
            id_vendedor=body.id_vendedor,
            input_text=body.input,
            callback_action=body.callback_action,
        )
    except Exception as e:
        logger.error(f"[bot-settings] preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return {"messages": messages}


# ─── Endpoint: refresh menú en todos los bots ─────────────────────────────────

@router.post("/refresh-menu")
async def refresh_menu(user_payload: dict = Depends(verify_auth)):
    _require_superadmin(user_payload)
    from services.bot_commands_refresh_service import refresh_all_bots_menu
    try:
        result = await refresh_all_bots_menu(sb)
    except Exception as e:
        logger.error(f"[bot-settings] refresh_menu: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return result
