"""
Tests para BotSettingsCache (core/bot_settings.py).
"""
import time
import pytest
from unittest.mock import MagicMock, patch


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_sb(messages=None, commands=None):
    """Crea un mock de Supabase client que devuelve datos de plantillas y comandos."""
    sb = MagicMock()

    # Encadenamiento: sb.table(...).select(...).execute().data
    def _table_side_effect(table_name):
        tbl = MagicMock()
        if table_name == "bot_message_templates":
            tbl.select.return_value.execute.return_value.data = messages or []
        elif table_name == "bot_commands":
            tbl.select.return_value.order.return_value.execute.return_value.data = commands or []
        else:
            tbl.select.return_value.execute.return_value.data = []
        return tbl

    sb.table.side_effect = _table_side_effect
    return sb


SAMPLE_MESSAGES = [
    {"message_key": "bienvenida", "body_html": "<b>Bienvenido a Shelfy</b>"},
    {"message_key": "ayuda", "body_html": "Comandos disponibles: /stats /ranking"},
]

SAMPLE_COMMANDS = [
    {"command": "stats", "menu_description": "Mis estadísticas", "visible_in_menu": True, "enabled": True, "kind": "builtin", "sort_order": 1},
    {"command": "ranking", "menu_description": "Ranking del mes", "visible_in_menu": True, "enabled": True, "kind": "builtin", "sort_order": 2},
    {"command": "oculto", "menu_description": "Comando oculto", "visible_in_menu": False, "enabled": True, "kind": "builtin", "sort_order": 3},
    {"command": "desactivado", "menu_description": "Desactivado", "visible_in_menu": True, "enabled": False, "kind": "builtin", "sort_order": 4},
]


# ─────────────────────────────────────────────────────────────────────────────
# Tests BotSettingsCache
# ─────────────────────────────────────────────────────────────────────────────

def test_get_message_returns_body():
    """get_message devuelve body_html para una key existente."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(messages=SAMPLE_MESSAGES)
    result = cache.get_message(sb, "bienvenida")
    assert result == "<b>Bienvenido a Shelfy</b>"


def test_get_message_missing_key_returns_empty():
    """get_message retorna '' si la key no existe."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(messages=SAMPLE_MESSAGES)
    result = cache.get_message(sb, "no_existe")
    assert result == ""


def test_visible_filter():
    """get_visible_menu_commands excluye visible_in_menu=False y enabled=False."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(commands=SAMPLE_COMMANDS)
    visible = cache.get_visible_menu_commands(sb)
    cmds = [c["command"] for c in visible]
    assert "stats" in cmds
    assert "ranking" in cmds
    assert "oculto" not in cmds, "visible_in_menu=False debe excluirse"
    assert "desactivado" not in cmds, "enabled=False debe excluirse"


def test_list_commands_returns_all():
    """list_commands retorna todos los comandos (sin filtro)."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(commands=SAMPLE_COMMANDS)
    cmds = cache.list_commands(sb)
    assert len(cmds) == len(SAMPLE_COMMANDS)


def test_cache_hit_no_extra_call():
    """Segunda llamada dentro del TTL no vuelve a llamar a Supabase."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(messages=SAMPLE_MESSAGES, commands=SAMPLE_COMMANDS)

    # Primera llamada → refresca
    cache.get_message(sb, "bienvenida")
    first_call_count = sb.table.call_count

    # Segunda llamada dentro del TTL → cache hit
    cache.get_message(sb, "ayuda")
    second_call_count = sb.table.call_count

    assert second_call_count == first_call_count, (
        "Segunda llamada dentro del TTL no debería llamar a sb.table"
    )


def test_cache_invalidation():
    """Después de invalidate(), la próxima llamada refresca desde Supabase."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(messages=SAMPLE_MESSAGES)

    # Primera carga
    cache.get_message(sb, "bienvenida")
    calls_after_first = sb.table.call_count

    # Sin invalidar → cache hit
    cache.get_message(sb, "ayuda")
    assert sb.table.call_count == calls_after_first, "Debe ser cache hit"

    # Invalidar
    cache.invalidate()

    # Tras invalidar → debe llamar a Supabase de nuevo
    cache.get_message(sb, "bienvenida")
    assert sb.table.call_count > calls_after_first, (
        "Después de invalidate() debe refrescar desde Supabase"
    )


def test_cache_invalidation_commands():
    """Después de invalidate(), list_commands también refresca."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = _make_sb(commands=SAMPLE_COMMANDS)

    cache.list_commands(sb)
    calls_1 = sb.table.call_count

    cache.invalidate()
    cache.list_commands(sb)
    calls_2 = sb.table.call_count

    assert calls_2 > calls_1


def test_supabase_error_does_not_crash():
    """Si Supabase lanza excepción, el cache devuelve datos vacíos sin lanzar."""
    from core.bot_settings import BotSettingsCache
    cache = BotSettingsCache()
    sb = MagicMock()
    sb.table.side_effect = Exception("Connection timeout")

    result = cache.get_message(sb, "bienvenida")
    # Con catálogo: fallback al default aunque falle Supabase
    assert "bot" in result.lower() or result == ""

    cmds = cache.list_commands(sb)
    assert cmds == [], "Debe retornar [] en caso de error de Supabase"


def test_singleton():
    """get_settings_cache retorna siempre la misma instancia."""
    from core.bot_settings import get_settings_cache, BotSettingsCache
    c1 = get_settings_cache()
    c2 = get_settings_cache()
    assert c1 is c2, "get_settings_cache debe retornar el mismo objeto"
    assert isinstance(c1, BotSettingsCache)
