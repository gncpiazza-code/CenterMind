# -*- coding: utf-8 -*-
"""Persistencia de sesiones de carga del bot (sobrevive redeploy API)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from db import sb

logger = logging.getLogger("bot_upload_sessions")

TABLE = "bot_upload_sessions"
DEFAULT_TTL_SECS = 600


def _expires_at(ttl_secs: int = DEFAULT_TTL_SECS) -> str:
    exp = datetime.now(timezone.utc) + timedelta(seconds=ttl_secs)
    return exp.isoformat()


def _is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return True
    try:
        raw = expires_at.replace("Z", "+00:00")
        exp = datetime.fromisoformat(raw)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= exp
    except (TypeError, ValueError):
        return True


def load_upload_session(dist_id: int, telegram_user_id: int) -> dict[str, Any] | None:
    try:
        res = (
            sb.table(TABLE)
            .select("payload,expires_at")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_user_id", telegram_user_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row:
            return None
        if _is_expired(row.get("expires_at")):
            delete_upload_session(dist_id, telegram_user_id)
            return None
        payload = row.get("payload")
        return payload if isinstance(payload, dict) else None
    except Exception as e:
        logger.warning(
            "[bot_upload_sessions] load dist=%s uid=%s: %s",
            dist_id,
            telegram_user_id,
            e,
        )
        return None


def save_upload_session(
    dist_id: int,
    telegram_user_id: int,
    payload: dict[str, Any],
    *,
    ttl_secs: int = DEFAULT_TTL_SECS,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id_distribuidor": dist_id,
        "telegram_user_id": telegram_user_id,
        "payload": payload,
        "updated_at": now,
        "expires_at": _expires_at(ttl_secs),
    }
    try:
        sb.table(TABLE).upsert(
            row,
            on_conflict="id_distribuidor,telegram_user_id",
        ).execute()
    except Exception as e:
        logger.warning(
            "[bot_upload_sessions] save dist=%s uid=%s: %s",
            dist_id,
            telegram_user_id,
            e,
        )


def delete_upload_session(dist_id: int, telegram_user_id: int) -> None:
    try:
        (
            sb.table(TABLE)
            .delete()
            .eq("id_distribuidor", dist_id)
            .eq("telegram_user_id", telegram_user_id)
            .execute()
        )
    except Exception as e:
        logger.warning(
            "[bot_upload_sessions] delete dist=%s uid=%s: %s",
            dist_id,
            telegram_user_id,
            e,
        )


def clear_upload_sessions_for_dist(dist_id: int) -> None:
    try:
        sb.table(TABLE).delete().eq("id_distribuidor", dist_id).execute()
    except Exception as e:
        logger.warning("[bot_upload_sessions] clear dist=%s: %s", dist_id, e)


def purge_expired_upload_sessions() -> int:
    """Elimina filas vencidas (job periódico). Retorna cantidad aproximada."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        res = sb.table(TABLE).delete().lt("expires_at", now).execute()
        return len(res.data or [])
    except Exception as e:
        logger.warning("[bot_upload_sessions] purge: %s", e)
        return 0
