# -*- coding: utf-8 -*-
"""
Escudo Supabase — circuit breaker + load shedding para evitar colapso del portal.

Cuando Postgres/PostgREST se degrada, el backend deja de aceptar trabajo de fondo
(cron, ingesta pesada) y responde rápido en rutas críticas del portal en lugar de
colgar workers con timeouts de 45–60s.
"""
from __future__ import annotations

import enum
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Deque, TypeVar

from core.supabase_errors import is_transient_supabase_error

logger = logging.getLogger("supabase_shield")

T = TypeVar("T")

# Ventana deslizante de resultados de probe / llamadas instrumentadas
_WINDOW_SECONDS = 90
_FAILURES_TO_DEGRADE = 3
_FAILURES_TO_OPEN = 6
_OPEN_COOLDOWN_SECONDS = 120
_LATENCY_DEGRADED_MS = 4_000
_PROBE_TIMEOUT_SECONDS = 5.0

# Rutas HTTP de baja prioridad — se rechazan rápido bajo estrés
BACKGROUND_PATH_PREFIXES = (
    "/api/v1/sync/",
    "/api/erp/",
    "/api/admin/erp/",
    "/api/reporteria/manual-upload/",
    "/api/procesar-cuentas-corrientes",
)

CRITICAL_PATH_PREFIXES = (
    "/health",
    "/auth/",
    "/api/bundle/",
    "/api/dashboard/",
    "/login",
)


class ShieldPriority(enum.IntEnum):
    CRITICAL = 0
    NORMAL = 1
    BACKGROUND = 2


class ShieldState(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    OPEN = "open"


@dataclass
class _Outcome:
    ts: float
    ok: bool
    latency_ms: float


@dataclass
class SupabaseShield:
    """Circuit breaker thread-safe para Supabase."""

    _lock: threading.Lock = field(default_factory=threading.Lock)
    _outcomes: Deque[_Outcome] = field(default_factory=lambda: deque(maxlen=80))
    _state: ShieldState = ShieldState.HEALTHY
    _open_until: float = 0.0
    _last_probe_at: float = 0.0
    _last_probe_ms: float | None = None
    _last_error: str | None = None
    _shed_count: int = 0

    def _prune(self, now: float) -> None:
        cutoff = now - _WINDOW_SECONDS
        while self._outcomes and self._outcomes[0].ts < cutoff:
            self._outcomes.popleft()

    def _recompute_state(self, now: float) -> None:
        if now < self._open_until:
            self._state = ShieldState.OPEN
            return

        self._prune(now)
        if not self._outcomes:
            if self._state == ShieldState.OPEN:
                self._state = ShieldState.HEALTHY
            return

        failures = sum(1 for o in self._outcomes if not o.ok)
        recent_latencies = [o.latency_ms for o in self._outcomes if o.ok][-10:]
        avg_lat = sum(recent_latencies) / len(recent_latencies) if recent_latencies else 0.0

        if failures >= _FAILURES_TO_OPEN:
            self._state = ShieldState.OPEN
            self._open_until = now + _OPEN_COOLDOWN_SECONDS
            logger.warning(
                "[shield] CIRCUIT OPEN — %s fallos en %ss; pausa carga de fondo %ss",
                failures,
                _WINDOW_SECONDS,
                _OPEN_COOLDOWN_SECONDS,
            )
        elif failures >= _FAILURES_TO_DEGRADE or avg_lat >= _LATENCY_DEGRADED_MS:
            self._state = ShieldState.DEGRADED
        else:
            self._state = ShieldState.HEALTHY

    def record_outcome(self, *, ok: bool, latency_ms: float, error: str | None = None) -> None:
        now = time.monotonic()
        with self._lock:
            self._outcomes.append(_Outcome(ts=now, ok=ok, latency_ms=latency_ms))
            if error:
                self._last_error = error[:500]
            self._recompute_state(now)

    def record_failure(self, exc: BaseException) -> None:
        if not is_transient_supabase_error(exc):
            return
        self.record_outcome(ok=False, latency_ms=_PROBE_TIMEOUT_SECONDS * 1000, error=str(exc))

    def should_shed(self, priority: ShieldPriority) -> bool:
        with self._lock:
            state = self._state
        if state == ShieldState.HEALTHY:
            return False
        if priority == ShieldPriority.CRITICAL:
            return False
        if state == ShieldState.DEGRADED:
            return priority == ShieldPriority.BACKGROUND
        return priority != ShieldPriority.CRITICAL

    def shed_http_path(self, path: str, method: str) -> bool:
        if method.upper() not in ("GET", "HEAD", "OPTIONS"):
            if any(path.startswith(p) for p in BACKGROUND_PATH_PREFIXES):
                return self.should_shed(ShieldPriority.BACKGROUND)
        if any(path.startswith(p) for p in BACKGROUND_PATH_PREFIXES):
            return self.should_shed(ShieldPriority.BACKGROUND)
        return False

    def is_critical_path(self, path: str) -> bool:
        return any(path.startswith(p) for p in CRITICAL_PATH_PREFIXES)

    def allow_background_job(self, job_id: str) -> bool:
        if self.should_shed(ShieldPriority.BACKGROUND):
            with self._lock:
                self._shed_count += 1
            logger.info("[shield] job omitido (DB bajo estrés): %s", job_id)
            return False
        return True

    def postgrest_timeout_seconds(self) -> int:
        with self._lock:
            state = self._state
        if state == ShieldState.OPEN:
            return 8
        if state == ShieldState.DEGRADED:
            return 15
        return 45

    def httpx_timeout_seconds(self) -> float:
        with self._lock:
            state = self._state
        if state == ShieldState.OPEN:
            return 12.0
        if state == ShieldState.DEGRADED:
            return 25.0
        return 60.0

    def probe(self) -> dict[str, Any]:
        """Ping liviano a Supabase; actualiza estado del escudo."""
        from db import sb

        started = time.monotonic()
        ok = False
        err: str | None = None
        try:
            sb.table("distribuidores").select("id_distribuidor").limit(1).execute()
            ok = True
        except Exception as e:
            err = str(e)
            ok = not is_transient_supabase_error(e)
            if not ok:
                self.record_failure(e)

        latency_ms = (time.monotonic() - started) * 1000
        if ok:
            self.record_outcome(ok=True, latency_ms=latency_ms)

        now = time.monotonic()
        with self._lock:
            self._last_probe_at = now
            self._last_probe_ms = latency_ms
            if err and not ok:
                self._last_error = err[:500]

        return {"ok": ok, "latency_ms": round(latency_ms, 1), "error": err}

    def status(self) -> dict[str, Any]:
        with self._lock:
            failures = sum(1 for o in self._outcomes if not o.ok)
            samples = len(self._outcomes)
            open_remaining = max(0.0, self._open_until - time.monotonic())
            return {
                "state": self._state.value,
                "samples_in_window": samples,
                "failures_in_window": failures,
                "window_seconds": _WINDOW_SECONDS,
                "open_remaining_seconds": round(open_remaining, 1) if open_remaining else 0,
                "last_probe_ms": self._last_probe_ms,
                "last_error": self._last_error,
                "shed_count": self._shed_count,
                "postgrest_timeout_s": self.postgrest_timeout_seconds(),
            }


shield = SupabaseShield()


def run_guarded(
    fn: Callable[[], T],
    *,
    priority: ShieldPriority = ShieldPriority.NORMAL,
    label: str = "supabase",
) -> T:
    """Ejecuta callable DB; rechaza rápido si el escudo está abierto."""
    if shield.should_shed(priority):
        raise SupabaseShieldShedError(f"[shield] carga omitida: {label}")
    started = time.monotonic()
    try:
        result = fn()
        shield.record_outcome(ok=True, latency_ms=(time.monotonic() - started) * 1000)
        return result
    except Exception as e:
        shield.record_failure(e)
        raise


def background_job_guard(job_id: str) -> Callable[[Callable[[], T]], T]:
    """Decorador para jobs APScheduler — no corre si DB degradada."""

    def decorator(fn: Callable[[], T]) -> Callable[[], T | None]:
        def wrapped() -> T | None:
            if not shield.allow_background_job(job_id):
                return None
            return fn()

        wrapped.__name__ = getattr(fn, "__name__", job_id)
        return wrapped

    return decorator


class SupabaseShieldShedError(RuntimeError):
    """Carga rechazada deliberadamente para proteger rutas críticas del portal."""
