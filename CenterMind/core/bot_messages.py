# -*- coding: utf-8 -*-
"""Resolución de plantillas de mensajes del bot (DB + catálogo + placeholders)."""
from __future__ import annotations

import html
import re
from typing import Any

from supabase import Client

from core.bot_message_catalog import get_default_message, normalize_message_key
from core.bot_settings import get_settings_cache
from core.telegram_html import repair_telegram_message_html

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


def _safe_format(template: str, variables: dict[str, Any]) -> str:
    """Reemplaza {placeholders} sin romper HTML Telegram."""

    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            return match.group(0)
        val = variables[key]
        if val is None:
            return ""
        # Valores que ya vienen con HTML seguro (ej. estado_bloque) no re-escapar
        if variables.get(f"__raw_{key}"):
            return str(val)
        return html.escape(str(val), quote=False)

    return _PLACEHOLDER_RE.sub(repl, template)


def resolve_bot_message(
    sb: Client,
    key: str,
    *,
    fallback: str | None = None,
    **variables: Any,
) -> str:
    """
    Obtiene mensaje: DB → catálogo → fallback explícito → ''.
    variables: reemplazo seguro de {placeholders}.
    Pasá __raw_nombre=True junto con nombre=... para HTML pre-formateado.
    """
    canon = normalize_message_key(key)
    body = get_settings_cache().get_message(sb, canon)
    if not body.strip():
        body = get_default_message(canon)
    if not body.strip() and fallback is not None:
        body = fallback
    if not body.strip():
        return ""
    body = repair_telegram_message_html(body)
    if variables:
        return _safe_format(body, variables)
    return body
