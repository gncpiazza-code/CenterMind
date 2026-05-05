# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
import threading
import uuid
import datetime as dt
from typing import Any, Optional

from .parsers._normalization import read_excel_robust
from .parsers.sigo_parser import parse_sigo
from .parsers.comprobantes_parser import parse_comprobantes
from .parsers.bultos_parser import parse_bultos

logger = logging.getLogger("ShelfyAPI")

_PARSERS = {
    "sigo":         parse_sigo,
    "comprobantes": parse_comprobantes,
    "bultos":       parse_bultos,
}

# In-memory cache (L1) — fast, reset on process restart
_jobs:      dict[str, dict] = {}
_snapshots: dict[str, dict] = {}
_lock = threading.Lock()


def _snap_key(dist_id: int, source: str, date_from: str, date_to: str) -> str:
    return f"{dist_id}:{source}:{date_from}:{date_to}"


def _infer_dates(result: dict, date_from: str, date_to: str):
    """Fill date_from/date_to from serie_temporal when not provided."""
    if date_from and date_to:
        return date_from, date_to
    serie = result.get("serie_temporal") or []
    fechas = [s["fecha"] for s in serie if s.get("fecha")]
    if fechas:
        return min(fechas), max(fechas)
    return date_from or "", date_to or ""


# ── Supabase persistence (L2) ──────────────────────────────────────────────────

def _try_persist_job(job: dict) -> None:
    """Upsert job row in Supabase. Swallows errors to not break ingestion."""
    try:
        from db import sb
        sb.table("reporteria_jobs").upsert({
            "id":               job["id"],
            "id_distribuidor":  job["id_distribuidor"],
            "source":           job["source"],
            "status":           job["status"],
            "requested_by":     job.get("requested_by"),
            "params_json":      job.get("params_json"),
            "requested_at":     job.get("requested_at"),
            "started_at":       job.get("started_at"),
            "finished_at":      job.get("finished_at"),
            "error_msg":        job.get("error_msg"),
            "result_version":   job.get("result_version"),
            "parsed_date_from": job.get("parsed_date_from"),
            "parsed_date_to":   job.get("parsed_date_to"),
        }, on_conflict="id").execute()
    except Exception as e:
        logger.warning(f"[Reporteria] No se pudo persistir job {job.get('id')}: {e}")


def _try_persist_snapshot(job_id: str, snap: dict) -> None:
    """Upsert snapshot payload in Supabase. Swallows errors."""
    try:
        from db import sb
        sb.table("reporteria_snapshots").upsert({
            "job_id":          job_id,
            "id_distribuidor": snap.get("id_distribuidor"),
            "source":          snap.get("source"),
            "date_from":       snap.get("date_from"),
            "date_to":         snap.get("date_to"),
            "snap_key":        snap.get("_snap_key"),
            "payload":         snap,
            "created_at":      dt.datetime.utcnow().isoformat(),
        }, on_conflict="job_id").execute()
    except Exception as e:
        logger.warning(f"[Reporteria] No se pudo persistir snapshot {job_id}: {e}")


def _try_load_job_from_db(job_id: str) -> Optional[dict]:
    """Load job from Supabase if not in memory cache."""
    try:
        from db import sb
        r = sb.table("reporteria_jobs").select("*").eq("id", job_id).limit(1).execute()
        return (r.data or [None])[0]
    except Exception:
        return None


def _try_load_snapshot_from_db(job_id: str) -> Optional[dict]:
    """Load snapshot from Supabase if not in memory cache."""
    try:
        from db import sb
        r = sb.table("reporteria_snapshots").select("payload").eq("job_id", job_id).limit(1).execute()
        row = (r.data or [None])[0]
        if row and row.get("payload"):
            payload = row["payload"]
            return payload if isinstance(payload, dict) else json.loads(payload)
    except Exception:
        return None
    return None


# ── Public API ─────────────────────────────────────────────────────────────────

def ingest_file(
    dist_id: int,
    source: str,
    file_bytes: bytes,
    filename: str,
    date_from: str,
    date_to: str,
    user_id: int,
) -> dict:
    if source not in _PARSERS:
        raise ValueError(f"source inválido: {source}")

    job_id = str(uuid.uuid4())
    job: dict[str, Any] = {
        "id":             job_id,
        "id_distribuidor": dist_id,
        "source":         source,
        "status":         "running",
        "requested_by":   user_id,
        "params_json":    {"date_from": date_from, "date_to": date_to, "filename": filename},
        "requested_at":   dt.datetime.now().isoformat(),
        "started_at":     dt.datetime.now().isoformat(),
        "finished_at":    None,
        "error_msg":      None,
        "result_version": None,
        "parsed_date_from": None,
        "parsed_date_to":   None,
    }
    with _lock:
        _jobs[job_id] = job

    try:
        df = read_excel_robust(file_bytes, filename)
        parser = _PARSERS[source]
        result = parser(df, date_from, date_to)

        inferred_from, inferred_to = _infer_dates(result, date_from, date_to)
        result["date_from"] = inferred_from
        result["date_to"]   = inferred_to
        result["id_distribuidor"]     = dist_id
        result["snapshot_version"]    = job_id
        result["snapshot_created_at"] = dt.datetime.now().isoformat()
        result["_snap_key"]           = _snap_key(dist_id, source, inferred_from, inferred_to)

        with _lock:
            _snapshots[job_id] = result
            job["status"]           = "completed"
            job["finished_at"]      = dt.datetime.now().isoformat()
            job["result_version"]   = job_id
            job["parsed_date_from"] = inferred_from
            job["parsed_date_to"]   = inferred_to

        # Persist to Supabase in background (non-blocking)
        t = threading.Thread(target=_try_persist_job, args=(dict(job),), daemon=True)
        t.start()
        t2 = threading.Thread(target=_try_persist_snapshot, args=(job_id, dict(result)), daemon=True)
        t2.start()

    except Exception as exc:
        with _lock:
            job["status"]      = "failed"
            job["finished_at"] = dt.datetime.now().isoformat()
            job["error_msg"]   = str(exc)[:800]
        threading.Thread(target=_try_persist_job, args=(dict(job),), daemon=True).start()

    return job


def get_job(job_id: str) -> Optional[dict]:
    job = _jobs.get(job_id)
    if job:
        return job
    # Fallback to DB (handles process restarts)
    db_job = _try_load_job_from_db(job_id)
    if db_job:
        with _lock:
            _jobs[job_id] = db_job
    return db_job


def get_snapshot_by_job(job_id: str) -> Optional[dict]:
    snap = _snapshots.get(job_id)
    if snap:
        return snap
    # Fallback to DB
    db_snap = _try_load_snapshot_from_db(job_id)
    if db_snap:
        with _lock:
            _snapshots[job_id] = db_snap
    return db_snap


def get_snapshot(dist_id: int, source: str, date_from: str, date_to: str) -> Optional[dict]:
    return _snapshots.get(_snap_key(dist_id, source, date_from, date_to))
