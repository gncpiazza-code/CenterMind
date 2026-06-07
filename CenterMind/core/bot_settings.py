"""
Lee configuración de bot desde tablas globales bot_message_templates y bot_commands.
Cache TTL simple (120s) para evitar round-trips en cada mensaje.
"""
from __future__ import annotations
import time
from typing import Any
from supabase import Client

_CACHE_TTL = 120  # segundos


class BotSettingsCache:
    """Cache sencillo con TTL para mensajes y comandos."""

    def __init__(self) -> None:
        self._messages: dict[str, str] = {}
        self._commands: list[dict] = []
        self._ts_msg: float = 0.0
        self._ts_cmd: float = 0.0

    def get_message(self, sb: Client, key: str) -> str:
        if time.time() - self._ts_msg > _CACHE_TTL:
            self._refresh_messages(sb)
        return self._messages.get(key, "")

    def list_commands(self, sb: Client) -> list[dict]:
        if time.time() - self._ts_cmd > _CACHE_TTL:
            self._refresh_commands(sb)
        return list(self._commands)

    def get_visible_menu_commands(self, sb: Client) -> list[dict]:
        return [c for c in self.list_commands(sb) if c.get("visible_in_menu") and c.get("enabled")]

    def invalidate(self) -> None:
        self._ts_msg = 0.0
        self._ts_cmd = 0.0

    def _refresh_messages(self, sb: Client) -> None:
        try:
            rows = sb.table("bot_message_templates").select("message_key,body_html").execute().data or []
            self._messages = {r["message_key"]: r["body_html"] for r in rows}
        except Exception:
            pass
        self._ts_msg = time.time()

    def _refresh_commands(self, sb: Client) -> None:
        try:
            rows = (
                sb.table("bot_commands")
                .select("*")
                .order("sort_order", desc=False)
                .execute().data or []
            )
            self._commands = rows
        except Exception:
            pass
        self._ts_cmd = time.time()


# Singleton por proceso
_settings_cache = BotSettingsCache()


def get_settings_cache() -> BotSettingsCache:
    return _settings_cache
