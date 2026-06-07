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
    y llama setMyCommands en cada uno (default + grupos).
    Retorna {"updated": N, "errors": [...]}
    """
    from core.bot_menu_commands import TELEGRAM_MENU_SCOPES_API, build_menu_commands_api_payload

    cache = get_settings_cache()
    tg_commands = build_menu_commands_api_payload(sb)

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
                ok_scopes = 0
                for scope in TELEGRAM_MENU_SCOPES_API:
                    resp = await client.post(
                        url,
                        json={"commands": tg_commands, "scope": scope},
                    )
                    if resp.status_code == 200 and resp.json().get("ok"):
                        ok_scopes += 1
                    else:
                        err = f"{nombre}: scope={scope['type']} HTTP {resp.status_code} — {resp.text[:200]}"
                        errors.append(err)
                        logger.warning(f"[refresh_menu] {err}")
                if ok_scopes == len(TELEGRAM_MENU_SCOPES_API):
                    updated += 1
                    logger.info(
                        f"[refresh_menu] {nombre}: menú actualizado "
                        f"({len(tg_commands)} cmds, {ok_scopes} scopes)"
                    )
                elif ok_scopes > 0:
                    updated += 1
                    logger.warning(
                        f"[refresh_menu] {nombre}: menú parcial "
                        f"({ok_scopes}/{len(TELEGRAM_MENU_SCOPES_API)} scopes)"
                    )
            except Exception as e:
                err = f"{nombre}: {e}"
                errors.append(err)
                logger.warning(f"[refresh_menu] {err}")

    # Invalidar cache para que la próxima lectura sea fresca
    cache.invalidate()

    return {"updated": updated, "errors": errors}
