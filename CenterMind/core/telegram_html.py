# -*- coding: utf-8 -*-
"""
Normalización HTML Telegram (parse_mode=HTML).
Telegram usa \\n para saltos de línea — no <br>.
"""
from __future__ import annotations

import re

_ALLOWED_TAGS = frozenset({"b", "i", "u", "s", "code", "pre"})
_TAG_ATTR_RE = re.compile(r"<(b|i|u|s|code|pre)\b[^>]*>", re.I)
_TAG_CLOSE_RE = re.compile(r"</(b|i|u|s|code|pre)\b[^>]*>", re.I)
_DISALLOWED_TAG_RE = re.compile(r"</?(?:span|font|div|p)\b[^>]*>", re.I)
_BR_RE = re.compile(r"<br\s*/?>", re.I)


def repair_telegram_message_html(text: str) -> str:
    """
    Convierte HTML de editor WYSIWYG → HTML válido para Telegram.
    - <br>, </div>, </p> → \\n
    - Elimina ZWSP y tags no permitidos (conserva contenido).
    - Normaliza tags permitidos sin atributos.
    """
    if not text:
        return ""

    s = text.replace("\r\n", "\n").replace("\r", "\n")
    s = _BR_RE.sub("\n", s)
    s = re.sub(r"</div>", "\n", s, flags=re.I)
    s = re.sub(r"<div[^>]*>", "", s, flags=re.I)
    s = re.sub(r"</p>", "\n", s, flags=re.I)
    s = re.sub(r"<p[^>]*>", "", s, flags=re.I)
    s = _DISALLOWED_TAG_RE.sub("", s)
    s = s.replace("\u200b", "").replace("&nbsp;", " ")
    s = _TAG_ATTR_RE.sub(lambda m: f"<{m.group(1).lower()}>", s)
    s = _TAG_CLOSE_RE.sub(lambda m: f"</{m.group(1).lower()}>", s)

    # Quitar cualquier otro tag HTML (conservar texto)
    s = re.sub(r"<(?!/?(?:b|i|u|s|code|pre)\b)[^>]+>", "", s, flags=re.I)

    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def message_needs_linebreak_repair(text: str) -> bool:
    """True si el texto guardado tiene artefactos típicos del bug de saltos."""
    if not text:
        return False
    lower = text.lower()
    return (
        "<br" in lower
        or "\u200b" in text
        or "</div>" in lower
        or "<div" in lower
        or "</p>" in lower
        or "<p" in lower
    )
