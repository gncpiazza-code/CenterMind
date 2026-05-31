# -*- coding: utf-8 -*-
"""
Helpers compartidos para snapshots portal: freshness, SWR y refresh en background.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Callable

logger = logging.getLogger("snapshot_common")

_in_flight: set[str] = set()
_in_flight_lock = threading.Lock()

EPOCH_INVALID_PREFIX = "1970"


def age_seconds(generated_at_iso: str) -> float | None:
    try:
        if generated_at_iso.startswith(EPOCH_INVALID_PREFIX):
            return None
        generated_at = datetime.fromisoformat(
            generated_at_iso.replace("Z", "+00:00")
        )
        return (datetime.now(timezone.utc) - generated_at).total_seconds()
    except Exception:
        return None


def is_invalidated(generated_at_iso: str) -> bool:
    return generated_at_iso.startswith(EPOCH_INVALID_PREFIX)


def is_fresh(generated_at_iso: str, max_stale_seconds: int) -> bool:
    age = age_seconds(generated_at_iso)
    if age is None:
        return False
    return age < max_stale_seconds


def is_serveable_stale(generated_at_iso: str, max_serve_seconds: int) -> bool:
    """Snapshot existe, no fue invalidado por ingesta, y aún es aceptable servir."""
    if is_invalidated(generated_at_iso):
        return False
    age = age_seconds(generated_at_iso)
    if age is None:
        return False
    return age < max_serve_seconds


def apply_meta_flags(
    meta: dict,
    *,
    cache_hit: bool,
    stale: bool,
    revalidating: bool,
    generated_at: str | None = None,
) -> dict:
    meta["cache_hit"] = cache_hit
    meta["stale"] = stale
    meta["revalidating"] = revalidating
    if generated_at:
        meta["generated_at"] = generated_at
        age = age_seconds(generated_at)
        if age is not None:
            meta["age_seconds"] = int(age)
    return meta


def trigger_background_refresh(key: str, fn: Callable[[], None]) -> None:
    """Ejecuta fn en hilo daemon; deduplica por key."""
    with _in_flight_lock:
        if key in _in_flight:
            logger.debug("[snapshot_common] refresh skipped (in-flight) key=%s", key)
            return
        _in_flight.add(key)

    def _run() -> None:
        try:
            fn()
        except Exception as e:
            logger.warning("[snapshot_common] background refresh key=%s: %s", key, e)
        finally:
            with _in_flight_lock:
                _in_flight.discard(key)

    threading.Thread(target=_run, daemon=True).start()


def clear_in_flight_for_tests() -> None:
    with _in_flight_lock:
        _in_flight.clear()
