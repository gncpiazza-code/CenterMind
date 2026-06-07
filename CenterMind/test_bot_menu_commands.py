# -*- coding: utf-8 -*-
"""Tests menú Telegram setMyCommands."""
import sys
from unittest.mock import MagicMock, patch

if "db" not in sys.modules:
    sys.modules["db"] = MagicMock()
if "supabase" not in sys.modules:
    sys.modules["supabase"] = MagicMock()

from core.bot_menu_commands import (
    DEFAULT_MENU_COMMANDS,
    TELEGRAM_MENU_SCOPES_API,
    _sanitize_description,
    build_menu_commands_api_payload,
    resolve_menu_command_pairs,
)


def test_sanitize_description_min_length():
    assert len(_sanitize_description("x")) >= 3
    assert len(_sanitize_description("ab")) >= 3


def test_resolve_menu_fallback_when_empty():
    mock_sb = MagicMock()
    with patch("core.bot_menu_commands.get_settings_cache") as cache_fn:
        cache = MagicMock()
        cache.get_visible_menu_commands.return_value = []
        cache_fn.return_value = cache
        pairs = resolve_menu_command_pairs(mock_sb)
    assert pairs == list(DEFAULT_MENU_COMMANDS)


def test_resolve_menu_from_db():
    mock_sb = MagicMock()
    rows = [
        {"command": "stats", "menu_description": "Mis stats", "kind": "system", "visible_in_menu": True, "enabled": True},
        {"command": "ventas", "menu_description": "PDF ventas", "kind": "system_pdf", "visible_in_menu": True, "enabled": True},
        {"command": "oculto", "menu_description": "No", "kind": "admin_only", "visible_in_menu": True, "enabled": True},
    ]
    with patch("core.bot_menu_commands.get_settings_cache") as cache_fn:
        cache = MagicMock()
        cache.get_visible_menu_commands.return_value = rows
        cache_fn.return_value = cache
        pairs = resolve_menu_command_pairs(mock_sb)
    cmds = [c for c, _ in pairs]
    assert "stats" in cmds
    assert "ventas" in cmds
    assert "oculto" not in cmds


def test_api_payload_matches_pairs():
    mock_sb = MagicMock()
    with patch("core.bot_menu_commands.get_settings_cache") as cache_fn:
        cache = MagicMock()
        cache.get_visible_menu_commands.return_value = []
        cache_fn.return_value = cache
        payload = build_menu_commands_api_payload(mock_sb)
    assert len(payload) == len(DEFAULT_MENU_COMMANDS)
    assert payload[0]["command"] == "start"


def test_telegram_scopes_include_groups():
    types = {s["type"] for s in TELEGRAM_MENU_SCOPES_API}
    assert "default" in types
    assert "all_group_chats" in types
