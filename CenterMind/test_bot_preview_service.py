# -*- coding: utf-8 -*-
"""Tests del simulador de preview del bot."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from services.bot_preview_service import preview_bot_interaction


def test_preview_help_without_vendor():
    sb = MagicMock()
    with patch("services.bot_preview_service.get_settings_cache") as cache:
        cache.return_value.get_message.return_value = ""
        msgs = preview_bot_interaction(sb, dist_id=1, id_vendedor=None, input_text="/help")
    assert len(msgs) == 1
    assert msgs[0]["type"] == "text"
    assert "Ayuda" in msgs[0]["html"]


def test_preview_stats_requires_vendor():
    sb = MagicMock()
    msgs = preview_bot_interaction(sb, dist_id=1, id_vendedor=None, input_text="/stats")
    assert "vendedor" in msgs[0]["html"].lower()


def test_preview_ranking_picker():
    sb = MagicMock()
    msgs = preview_bot_interaction(sb, dist_id=1, id_vendedor=None, input_text="/ranking")
    assert msgs[0]["type"] == "text"
    assert "buttons" in msgs[0]
    assert len(msgs[0]["buttons"]) == 3


def test_preview_unknown_command():
    sb = MagicMock()
    with patch("services.bot_preview_service.get_settings_cache") as cache:
        cache.return_value.list_commands.return_value = []
        msgs = preview_bot_interaction(sb, dist_id=1, id_vendedor=None, input_text="/xyzabc")
    assert "no reconocido" in msgs[0]["html"].lower()
