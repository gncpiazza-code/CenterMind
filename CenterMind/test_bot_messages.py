# -*- coding: utf-8 -*-
"""Tests de resolución de plantillas (saltos de línea preservados)."""
from unittest.mock import MagicMock

from core.bot_message_catalog import get_default_message
from core.bot_messages import resolve_bot_message
from core.bot_settings import get_settings_cache


def test_resolve_preserves_leading_newlines_in_defaults():
    """strip() en resolve_bot_message pegaba items de /objetivos y líneas de ranking."""
    get_settings_cache().invalidate()
    sb = MagicMock()
    sb.table.return_value.select.return_value.execute.return_value.data = []

    for key in ("objetivos_item", "eval_nota", "stats_ranking_line", "upload_rich_stats_block"):
        default = get_default_message(key)
        resolved = resolve_bot_message(sb, key)
        assert resolved == default, f"{key}: se perdieron saltos al resolver"


def test_resolve_preserves_trailing_newlines_in_ranking_row():
    get_settings_cache().invalidate()
    sb = MagicMock()
    sb.table.return_value.select.return_value.execute.return_value.data = []

    default = get_default_message("ranking_result_row")
    resolved = resolve_bot_message(sb, "ranking_result_row")
    assert resolved.endswith("\n\n"), "ranking_result_row debe terminar con doble salto"
    assert resolved == default
