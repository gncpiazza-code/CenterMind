# -*- coding: utf-8 -*-
"""
CenterMind / hardening / logger.py
===================================
Sistema de logs centralizado con rotación diaria.

Crea un archivo por día en:
    CenterMind/logs/centermind_YYYY-MM-DD.log

Uso (reemplaza el get_logger() de bot_worker.py y centermind_core.py):

    from hardening import setup_logging, get_logger

    # Una sola vez al arrancar el proceso:
    setup_logging()

    # En cualquier módulo:
    logger = get_logger("Bot-1")
    logger.info("Mensaje")
"""

import logging
import sys
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from zoneinfo import ZoneInfo

AR_TZ    = ZoneInfo("America/Argentina/Buenos_Aires")
BASE_DIR = Path(__file__).resolve().parent.parent          # CenterMind/
LOGS_DIR = BASE_DIR / "logs"

# ── Formato ────────────────────────────────────────────────────────────────────
LOG_FORMAT  = "%(asctime)s | %(levelname)-8s | %(name)-22s | %(funcName)-26s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_initialized = False


class _ARFormatter(logging.Formatter):
    """Formatter que usa zona horaria Argentina para el timestamp."""

    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=AR_TZ)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime(DATE_FORMAT)


def setup_logging(
    level: int = logging.INFO,
    console: bool = True,
    log_file: bool = True,
) -> None:
    """
    Configura el sistema de logging global.
    Debe llamarse UNA SOLA VEZ al inicio del proceso principal.

    Args:
        level:    Nivel mínimo de log (default: INFO).
        console:  Si True, también imprime en consola (stdout).
        log_file: Si True, escribe archivos diarios en logs/.
    """
    global _initialized
    if _initialized:
        return
    _initialized = True

    LOGS_DIR.mkdir(exist_ok=True)

    root = logging.getLogger()
    root.setLevel(level)

    # Limpiar handlers existentes (evita duplicados si se llama varias veces)
    root.handlers.clear()

    formatter = _ARFormatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)

    # ── Handler de consola ────────────────────────────────────────────────────
    if console:
        ch = logging.StreamHandler(sys.stdout)
        ch.setFormatter(formatter)
        ch.setLevel(level)
        root.addHandler(ch)

    # ── Handler de archivo con rotación diaria ────────────────────────────────
    if log_file:
        log_path = LOGS_DIR / "centermind.log"
        fh = TimedRotatingFileHandler(
            filename=str(log_path),
            when="midnight",
            interval=1,
            backupCount=30,            # Mantener 30 días de logs
            encoding="utf-8",
            atTime=None,               # Rota a medianoche local
        )
        # Nombre de archivo con fecha: centermind_YYYY-MM-DD.log
        fh.suffix      = "%Y-%m-%d.log"
        fh.namer       = _ar_namer
        fh.rotator     = _ar_rotator
        fh.setFormatter(formatter)
        fh.setLevel(level)
        root.addHandler(fh)

    # Silenciar librerías ruidosas
    for noisy in ("httpx", "httpcore", "telegram", "urllib3", "googleapiclient"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("CenterMind").info(
        f"Sistema de logs inicializado — archivos en: {LOGS_DIR}"
    )


def _ar_namer(default_name: str) -> str:
    """Renombra el log rotado: centermind.log.YYYY-MM-DD → centermind_YYYY-MM-DD.log"""
    base, suffix = default_name.rsplit(".", 1) if "." in default_name else (default_name, "")
    # default_name viene como: /path/centermind.log.2026-02-24.log
    # Lo normalizamos a:       /path/centermind_2026-02-24.log
    parts = Path(default_name)
    stem  = parts.stem   # centermind.log
    date_part = parts.suffix.lstrip(".")  # 2026-02-24.log o 2026-02-24
    # Limpiar doble extensión
    if ".log" in stem:
        stem = stem.replace(".log", "")
    if date_part.endswith(".log"):
        date_part = date_part[:-4]
    return str(parts.parent / f"{stem}_{date_part}.log")


def _ar_rotator(source: str, dest: str) -> None:
    import shutil
    try:
        shutil.move(source, dest)
    except Exception:
        pass


def get_logger(name: str) -> logging.Logger:
    """
    Devuelve un logger con el nombre dado.
    Reemplaza el get_logger() definido en bot_worker.py y centermind_core.py.
    """
    return logging.getLogger(name)
