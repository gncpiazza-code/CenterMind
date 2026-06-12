# -*- coding: utf-8 -*-
"""Detección de errores transitorios de Supabase/PostgREST (compartido por shield y bots)."""
from __future__ import annotations

_TRANSIENT_MARKERS = (
    "connectionterminated",
    "remoteprotocolerror",
    "connection closed",
    "timed out",
    "timeout",
    "schema cache",
    "pgrst002",
    "retrying",
    "could not query the database",
    "server disconnected",
    "connection reset",
    "bad gateway",
    "502",
    "read operation timed out",
    "connection terminated",
)


def is_transient_supabase_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    if isinstance(exc, dict):
        msg = str(exc.get("message") or exc).lower()
        code = str(exc.get("code") or "").lower()
        if code in ("pgrst002", "502"):
            return True
    return any(m in msg for m in _TRANSIENT_MARKERS)
