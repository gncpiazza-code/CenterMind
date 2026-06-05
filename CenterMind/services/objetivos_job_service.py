# -*- coding: utf-8 -*-
"""
services/objetivos_job_service.py
===================================
Orquestación async para creación de objetivos.
El POST /crear_objetivo retorna rápido; el job corre en background.

Estados UI:
  1 - Guardando objetivo...
  2 - Calculando avances del mes...
  3 - Sumando compradores desde Consolido... (solo tipo compradores)
  4 - Armando desglose diario...
  5 - Enviando mensaje Telegram...
  6 - Listo
"""
from __future__ import annotations

import logging
import traceback
import unicodedata
from datetime import date
from typing import Any

from db import sb

logger = logging.getLogger("ObjetivosJob")

# Pasos y mensajes
PASO_GUARDANDO = 1
PASO_CALCULANDO = 2
PASO_COMPRADORES = 3
PASO_DESGLOSE = 4
PASO_TELEGRAM = 5
PASO_LISTO = 6

_MENSAJES = {
    PASO_GUARDANDO: "Guardando objetivo…",
    PASO_CALCULANDO: "Calculando avances del mes…",
    PASO_COMPRADORES: "Sumando compradores desde Consolido…",
    PASO_DESGLOSE: "Armando desglose diario…",
    PASO_TELEGRAM: "Enviando mensaje Telegram…",
    PASO_LISTO: "Listo",
}

_PCT = {
    PASO_GUARDANDO: 10,
    PASO_CALCULANDO: 30,
    PASO_COMPRADORES: 50,
    PASO_DESGLOSE: 70,
    PASO_TELEGRAM: 90,
    PASO_LISTO: 100,
}


def _norm_origen(val: Any) -> str:
    raw = str(val or "").strip().lower()
    txt = "".join(c for c in unicodedata.normalize("NFD", raw) if unicodedata.category(c) != "Mn")
    txt = " ".join(txt.split())
    if txt in {"compania", "company"}:
        return "compania"
    return txt


def _norm_tipo(val: Any) -> str:
    return str(val or "").strip().lower()


def _update_job(job_id: str, paso: int, mensaje: str | None = None, error: str | None = None, estado: str = "running") -> None:
    pct = _PCT.get(paso, 0)
    upd: dict[str, Any] = {"estado": estado, "paso": paso, "pct": pct}
    if mensaje is not None:
        upd["mensaje"] = mensaje
    if error is not None:
        upd["error"] = error
    try:
        sb.table("objetivo_jobs").update(upd).eq("id", job_id).execute()
    except Exception as e:
        logger.warning("[Job] update_job id=%s paso=%s: %s", job_id, paso, e)


def enqueue_create_objetivo(objetivo_id: str, dist_id: int) -> str:
    """
    Inserta un job en objetivo_jobs y retorna su id.
    Llamar DESPUÉS de insertar el objetivo en DB.
    """
    res = sb.table("objetivo_jobs").insert({
        "id_objetivo": objetivo_id,
        "id_distribuidor": dist_id,
        "estado": "pending",
        "paso": PASO_GUARDANDO,
        "pct": _PCT[PASO_GUARDANDO],
        "mensaje": _MENSAJES[PASO_GUARDANDO],
    }).execute()
    rows = res.data or []
    if not rows:
        raise RuntimeError(f"No se pudo crear job para objetivo {objetivo_id}")
    return str(rows[0]["id"])


def get_job_status(job_id: str, dist_id: int) -> dict[str, Any] | None:
    """Retorna el estado actual del job o None si no existe."""
    res = sb.table("objetivo_jobs").select("*").eq("id", job_id).eq("id_distribuidor", dist_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    return {
        "id": row["id"],
        "id_objetivo": row["id_objetivo"],
        "estado": row["estado"],
        "paso": row["paso"],
        "pct": row["pct"],
        "mensaje": row.get("mensaje"),
        "error": row.get("error"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def run_job(job_id: str, objetivo_id: str, dist_id: int) -> None:
    """
    Ejecuta el job de creación completo (llamar desde BackgroundTasks).
    Etapas: watcher retro → desglose → telegram.
    """
    try:
        _update_job(job_id, PASO_CALCULANDO, _MENSAJES[PASO_CALCULANDO])

        # Obtener objetivo para saber tipo y origen
        res = sb.table("objetivos").select("*").eq("id", objetivo_id).limit(1).execute()
        obj_rows = res.data or []
        if not obj_rows:
            _update_job(job_id, PASO_LISTO, "Objetivo no encontrado", error="objetivo_not_found", estado="error")
            return
        obj = obj_rows[0]
        tipo = _norm_tipo(obj.get("tipo"))
        origen = _norm_origen(obj.get("origen"))

        # Paso compradores específico
        if tipo == "compradores":
            _update_job(job_id, PASO_COMPRADORES, _MENSAJES[PASO_COMPRADORES])

        # Paso desglose
        _update_job(job_id, PASO_DESGLOSE, _MENSAJES[PASO_DESGLOSE])

        # Ejecutar watcher retro para este objetivo
        try:
            from services.objetivos_watcher_service import objetivos_watcher
            objetivos_watcher.run_watcher(dist_id, obj_id=objetivo_id)
        except Exception as e_watch:
            logger.error("[Job] watcher error job=%s obj=%s: %s", job_id, objetivo_id, e_watch)
            _update_job(job_id, PASO_DESGLOSE, error=str(e_watch)[:500], estado="error")
            return

        # Paso telegram
        _update_job(job_id, PASO_TELEGRAM, _MENSAJES[PASO_TELEGRAM])
        if origen != "compania" or obj.get("lanzado_at"):
            try:
                from services.objetivos_notification_service import notify_objetivo_creado  # noqa: F401
                notify_objetivo_creado(obj, dist_id)
            except ImportError:
                # notify_objetivo_creado no existe como función standalone; la
                # notificación Telegram ya fue enviada inline en crear_objetivo.
                logger.debug("[Job] notify_objetivo_creado no disponible (stub OK)")
            except Exception as e_tg:
                logger.warning("[Job] telegram error job=%s: %s", job_id, e_tg)

        _update_job(job_id, PASO_LISTO, _MENSAJES[PASO_LISTO], estado="done")
        logger.info("[Job] done job=%s obj=%s dist=%s", job_id, objetivo_id, dist_id)

    except Exception as exc:
        logger.error("[Job] fatal job=%s: %s\n%s", job_id, exc, traceback.format_exc())
        try:
            _update_job(job_id, PASO_LISTO, error=str(exc)[:500], estado="error")
        except Exception:
            pass
