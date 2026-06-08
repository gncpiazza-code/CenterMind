# -*- coding: utf-8 -*-
"""
Orden de corrida, lock exclusivo Consolido y auditoría de motor_runs por tenant.
"""
from __future__ import annotations

import fcntl
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from lib.logger import get_logger

logger = get_logger("PADRON_SCHED")

RPA_BASE_DIR = Path(os.environ.get("RPA_BASE_DIR", str(Path(__file__).resolve().parents[1])))
PADRON_LOCK_PATH = RPA_BASE_DIR / "locks" / "padron_consolido.lock"

# Tenants con Excel grande: al final para no bloquear al resto si el proceso se corta.
_HEAVY_TENANT_IDS = frozenset({"tabaco", "aloma"})

# Arranque / auditoría general (¿hubo padrón hoy?)
DEFAULT_MAX_AGE_HOURS = float(os.environ.get("PADRON_MAX_AGE_HOURS", "11"))
# Cierre de cada ola (08:30, 11:30, …): solo reintenta quien no corrió en esta ventana
WAVE_CATCHUP_MAX_AGE_HOURS = float(os.environ.get("PADRON_WAVE_CATCHUP_HOURS", "2.5"))


def ordenar_tenants_para_corrida(tenants: list[dict]) -> list[dict]:
    """Chicos primero, tabaco/aloma al final (misma lista de entrada, nuevo orden)."""

    def sort_key(t: dict) -> tuple:
        tid = str(t.get("id") or "")
        heavy = 1 if tid in _HEAVY_TENANT_IDS else 0
        dist = int(t.get("id_dist") or 999)
        return (heavy, dist, tid)

    return sorted(tenants, key=sort_key)


def _padron_lock_timeout_sec() -> float:
    return max(30.0, float(os.environ.get("PADRON_LOCK_WAIT_SEC", "900")))


@contextmanager
def padron_consolido_lock(*, timeout_sec: float | None = None) -> Iterator[None]:
    """
    Un solo login/descarga Consolido a la vez (jobs escalonados esperan acá).
    timeout_sec: si no se adquiere a tiempo, RuntimeError (catch-up evita bloquear 30+ min).
    """
    import time

    wait_cap = _padron_lock_timeout_sec() if timeout_sec is None else timeout_sec
    PADRON_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    lock_file = open(PADRON_LOCK_PATH, "w", encoding="utf-8")
    try:
        logger.info("Esperando lock padrón Consolido (máx %.0fs)…", wait_cap)
        deadline = time.monotonic() + wait_cap
        while True:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                logger.info("Lock padrón Consolido adquirido")
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError(
                        f"Timeout esperando lock padrón Consolido ({wait_cap:.0f}s). "
                        "Otro motor (padrón o informe ventas) sigue en Consolido."
                    )
                time.sleep(2)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            logger.info("Lock padrón Consolido liberado")
    finally:
        lock_file.close()


def _supabase_client():
    from supabase import create_client

    url = (os.environ.get("SUPABASE_URL") or os.environ.get("supabase_url") or "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("supabase_key")
        or ""
    ).strip()
    if not url or not key:
        return None
    return create_client(url, key)


class PadronRunLookup:
    """Resultado de consulta motor_runs — distingue «sin corrida» de fallo de Supabase."""

    __slots__ = ("last", "query_ok")

    def __init__(self, last: datetime | None, *, query_ok: bool) -> None:
        self.last = last
        self.query_ok = query_ok


def last_padron_run_utc(dist_id: int) -> datetime | None:
    """Última corrida motor='padron' (compat). None si no hay run o falló la consulta."""
    return lookup_last_padron_run(dist_id).last


def lookup_last_padron_run(dist_id: int) -> PadronRunLookup:
    """Última corrida padron con flag query_ok (evita catch-up masivo si Supabase falla)."""
    sb = _supabase_client()
    if sb is None:
        logger.warning("lookup_last_padron_run dist=%s: Supabase no configurado", dist_id)
        return PadronRunLookup(None, query_ok=False)
    try:
        res = (
            sb.table("motor_runs")
            .select("iniciado_en,registros")
            .eq("motor", "padron")
            .eq("dist_id", dist_id)
            .order("iniciado_en", desc=True)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        if not row or not row.get("iniciado_en"):
            return PadronRunLookup(None, query_ok=True)
        s = str(row["iniciado_en"]).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return PadronRunLookup(dt, query_ok=True)
    except Exception as e:
        logger.warning("lookup_last_padron_run dist=%s: %s", dist_id, e)
        return PadronRunLookup(None, query_ok=False)


def list_stale_tenant_ids(
    tenants: list[dict],
    max_age_hours: float = DEFAULT_MAX_AGE_HOURS,
) -> list[str]:
    """Tenants activos sin motor_run padron reciente."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    stale: list[str] = []
    for t in tenants:
        dist_id = t.get("id_dist")
        tid = str(t.get("id") or "")
        if dist_id is None or not tid:
            continue
        lookup = lookup_last_padron_run(int(dist_id))
        if not lookup.query_ok:
            logger.warning(
                "Padrón stale omitido tenant=%s dist=%s (consulta motor_runs falló)",
                tid,
                dist_id,
            )
            continue
        last = lookup.last
        if last is None or last < cutoff:
            stale.append(tid)
            logger.warning(
                "Padrón desactualizado tenant=%s dist=%s última=%s",
                tid,
                dist_id,
                last.isoformat() if last else "nunca",
            )
    return stale


def stagger_minutes() -> int:
    return max(3, int(os.environ.get("PADRON_STAGGER_MINUTES", "8")))


def catchup_delay_minutes(tenant_count: int) -> int:
    """Minutos después del slot base para job de catch-up de la ola."""
    extra = int(os.environ.get("PADRON_CATCHUP_EXTRA_MINUTES", "12"))
    return stagger_minutes() * max(tenant_count, 1) + extra
