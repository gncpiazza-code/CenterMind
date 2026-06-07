"""
Menú de comandos Telegram (setMyCommands) — catálogo DB + fallback + scopes.
"""
from __future__ import annotations

from typing import Any, Sequence

from supabase import Client
from telegram import Bot, BotCommand, BotCommandScopeAllGroupChats, BotCommandScopeDefault

from core.bot_settings import get_settings_cache

# Fallback si bot_commands está vacío o falla la lectura
DEFAULT_MENU_COMMANDS: tuple[tuple[str, str], ...] = (
    ("start", "Iniciar el bot"),
    ("help", "Cómo usar el bot"),
    ("stats", "Mis estadísticas"),
    ("ranking", "Ranking del mes"),
    ("objetivos", "Mis objetivos y progreso"),
    ("cartera", "Mi cartera de clientes"),
    ("ventas", "Mis ventas del mes"),
    ("cuentas", "Cuentas corrientes"),
)

# Grupos (uso principal del bot) + privados
TELEGRAM_MENU_SCOPES_API: tuple[dict[str, str], ...] = (
    {"type": "default"},
    {"type": "all_group_chats"},
)


def _sanitize_description(desc: str) -> str:
    """Telegram exige 3–256 caracteres en la descripción."""
    text = (desc or "").strip()
    if len(text) < 3:
        text = (text + " — Shelfy").strip()[:256]
    if len(text) < 3:
        text = "Comando Shelfy"
    return text[:256]


def resolve_menu_command_pairs(sb: Client) -> list[tuple[str, str]]:
    """Lista (command, description) visible en menú, ordenada por sort_order."""
    try:
        rows = get_settings_cache().get_visible_menu_commands(sb)
        out: list[tuple[str, str]] = []
        for c in rows:
            if c.get("kind") == "admin_only":
                continue
            cmd = (c.get("command") or "").strip().lower()
            desc = (c.get("menu_description") or "").strip()
            if not cmd or not desc:
                continue
            out.append((cmd, _sanitize_description(desc)))
        if out:
            return out
    except Exception:
        pass
    return list(DEFAULT_MENU_COMMANDS)


def build_bot_commands(sb: Client) -> list[BotCommand]:
    return [BotCommand(command=c, description=d) for c, d in resolve_menu_command_pairs(sb)]


def build_menu_commands_api_payload(sb: Client) -> list[dict[str, str]]:
    return [
        {"command": c, "description": d}
        for c, d in resolve_menu_command_pairs(sb)
    ]


async def apply_telegram_menu_commands(bot: Bot, sb: Client) -> int:
    """
    setMyCommands en default + all_group_chats.
    Retorna cantidad de scopes aplicados con éxito.
    """
    tg_cmds = build_bot_commands(sb)
    if not tg_cmds:
        tg_cmds = [BotCommand(command=c, description=d) for c, d in DEFAULT_MENU_COMMANDS]

    scopes: Sequence[Any] = (BotCommandScopeDefault(), BotCommandScopeAllGroupChats())
    applied = 0
    for scope in scopes:
        await bot.set_my_commands(tg_cmds, scope=scope)
        applied += 1
    return applied
