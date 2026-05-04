# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
import uuid
import datetime as dt
from typing import Any, Optional

from .parsers._normalization import read_excel_robust
from .parsers.sigo_parser import parse_sigo
from .parsers.comprobantes_parser import parse_comprobantes
from .parsers.bultos_parser import parse_bultos

_PARSERS = {
    "sigo":         parse_sigo,
    "comprobantes": parse_comprobantes,
    "bultos":       parse_bultos,
}

# In-memory stores — reset on process restart (acceptable for Fase 1)
_jobs:      dict[str, dict] = {}
_snapshots: dict[str, dict] = {}
_lock = threading.Lock()


def _snap_key(dist_id: int, source: str, date_from: str, date_to: str) -> str:
    return f"{dist_id}:{source}:{date_from}:{date_to}"


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
    }
    with _lock:
        _jobs[job_id] = job

    try:
        df = read_excel_robust(file_bytes, filename)
        parser = _PARSERS[source]
        result = parser(df, date_from, date_to)
        result["snapshot_version"]    = job_id
        result["snapshot_created_at"] = dt.datetime.now().isoformat()

        key = _snap_key(dist_id, source, date_from, date_to)
        with _lock:
            _snapshots[key] = result
            job["status"]         = "completed"
            job["finished_at"]    = dt.datetime.now().isoformat()
            job["result_version"] = key

    except Exception as exc:
        with _lock:
            job["status"]      = "failed"
            job["finished_at"] = dt.datetime.now().isoformat()
            job["error_msg"]   = str(exc)[:800]

    return job


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


def get_snapshot(dist_id: int, source: str, date_from: str, date_to: str) -> Optional[dict]:
    return _snapshots.get(_snap_key(dist_id, source, date_from, date_to))
