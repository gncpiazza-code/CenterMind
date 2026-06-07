"""
Llama setMyCommands en todos los bots activos con los comandos visibles actuales.
"""
from __future__ import annotations
import logging
import httpx
from supabase import Client
from core.bot_settings import get_settings_cache

logger = logging.getLogger("ShelfyAPI")


async def refresh_all_bots_menu(sb: Client) -> dict:
    """
    Lee distribuidores activos para obtener tokens Telegram,
    y llama setMyCommands en cada uno.
    Retorna {"updated": N, "errors": [...]}
    """
    cache = get_settings_cache()
    commands = cache.get_visible_menu_commands(sb)
    tg_commands = [
        {"command": c["command"], "description": c["menu_description"]}
        for c in commands
        if c.get("kind") not in ("admin_only",)
        and c.get("menu_description")
    ]

    # Obtener tokens activos desde tabla distribuidores
    try:
        rows = (
            sb.table("distribuidores")
            .select("id_distribuidor,nombre_empresa,token_bot")
            .eq("estado", "activo")
            .not_.is_("token_bot", "null")
            .execute().data or []
        )
    except Exception as e:
        logger.error(f"[refresh_menu] Error leyendo distribuidores: {e}")
        return {"updated": 0, "errors": [str(e)]}

    updated = 0
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in rows:
            token = (row.get("token_bot") or "").strip()
            nombre = row.get("nombre_empresa", f"dist_{row.get('id_distribuidor')}")
            if not token:
                continue
            url = f"https://api.telegram.org/bot{token}/setMyCommands"
            try:
                resp = await client.post(url, json={"commands": tg_commands})
                if resp.status_code == 200 and resp.json().get("ok"):
                    updated += 1
                    logger.info(f"[refresh_menu] {nombre}: menú actualizado ({len(tg_commands)} cmds)")
                else:
                    err = f"{nombre}: HTTP {resp.status_code} — {resp.text[:200]}"
                    errors.append(err)
                    logger.warning(f"[refresh_menu] {err}")
            except Exception as e:
                err = f"{nombre}: {e}"
                errors.append(err)
                logger.warning(f"[refresh_menu] {err}")

    # Invalidar cache para que la próxima lectura sea fresca
    cache.invalidate()

    return {"updated": updated, "errors": errors}
