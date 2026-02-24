# -*- coding: utf-8 -*-
"""
CenterMind — Orquestador Principal
===================================
Lee todos los distribuidores activos de la base de datos y levanta
un BotWorker independiente por cada uno en su propio hilo.

Integra:
  - hardening.logger       → logs diarios con rotación
  - hardening.BackupManager → backup automático a medianoche
  - hardening.BotMonitor   → monitoreo de uptime + alertas Telegram

Uso:
    python centermind_core.py
    python centermind_core.py --distribuidor-id 1   ← solo un bot (debug)
"""

from __future__ import annotations

import argparse
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional

# ─────────────────────────────────────────────
# PARCHE WINDOWS
# ─────────────────────────────────────────────
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# ─────────────────────────────────────────────
# RUTAS Y PATH
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# ─────────────────────────────────────────────
# LOGGING (primero, antes que cualquier otro import local)
# ─────────────────────────────────────────────
from hardening.logger import setup_logging, get_logger
setup_logging()                              # ← inicializa logs/ desde aquí

# ─────────────────────────────────────────────
# IMPORTS LOCALES
# ─────────────────────────────────────────────
from hardening.backup_manager import BackupManager
from hardening.monitor        import BotMonitor
from bot_worker               import BotWorker, Database

logger = get_logger("CenterMind-Core")


# ═══════════════════════════════════════════════════════════════════
# WORKER THREAD
# ═══════════════════════════════════════════════════════════════════

class BotThread(threading.Thread):
    """
    Hilo dedicado a un BotWorker.
    Reinicia automáticamente el bot hasta MAX_RESTARTS veces si cae.
    """

    RESTART_DELAY = 15
    MAX_RESTARTS  = 10

    def __init__(
        self,
        distribuidor_id:     int,
        distribuidor_nombre: str,
        monitor:             Optional[BotMonitor] = None,
    ):
        super().__init__(
            name=f"Bot-{distribuidor_id}-{distribuidor_nombre}",
            daemon=True,
        )
        self.distribuidor_id     = distribuidor_id
        self.distribuidor_nombre = distribuidor_nombre
        self.monitor             = monitor
        self.restarts            = 0
        self.running             = True
        self.logger              = get_logger(f"Thread-{distribuidor_id}")

    def run(self) -> None:
        self.logger.info(
            f"▶️  Iniciando hilo para '{self.distribuidor_nombre}' (id={self.distribuidor_id})"
        )

        while self.running and self.restarts <= self.MAX_RESTARTS:
            try:
                worker = BotWorker(
                    distribuidor_id=self.distribuidor_id,
                    monitor=self.monitor,     # ← inyectamos el monitor
                )
                if self.monitor:
                    self.monitor.bot_up(self.distribuidor_id)
                worker.run()   # bloqueante

            except Exception as e:
                self.restarts += 1
                reason = str(e)
                self.logger.error(
                    f"❌ Bot '{self.distribuidor_nombre}' caído: {reason} "
                    f"(reinicio {self.restarts}/{self.MAX_RESTARTS})"
                )

                if self.monitor:
                    self.monitor.bot_down(self.distribuidor_id, reason=reason)

                if self.restarts > self.MAX_RESTARTS:
                    self.logger.critical(
                        f"🚨 Bot '{self.distribuidor_nombre}' superó el límite. Abandonando."
                    )
                    break

                if self.running:
                    self.logger.info(
                        f"⏳ Esperando {self.RESTART_DELAY}s antes de reiniciar..."
                    )
                    time.sleep(self.RESTART_DELAY)

        self.logger.warning(f"⏹️  Hilo de '{self.distribuidor_nombre}' terminado.")

    def stop(self) -> None:
        self.running = False


# ═══════════════════════════════════════════════════════════════════
# ORQUESTADOR
# ═══════════════════════════════════════════════════════════════════

class CenterMindCore:
    """Orquestador principal. Gestiona bots, backup y monitor."""

    POLL_INTERVAL = 60   # segundos entre reconciliaciones

    def __init__(self, solo_distribuidor_id: Optional[int] = None):
        self.solo_distribuidor_id = solo_distribuidor_id
        self.db                   = Database()
        self.threads:  Dict[int, BotThread] = {}
        self._stop     = threading.Event()

        # ── Hardening ─────────────────────────────────────────────────────────
        self.backup_manager = BackupManager()
        self.monitor        = BotMonitor(db_path=BASE_DIR / "base_datos" / "centermind.db")

    # ── Gestión de bots ────────────────────────────────────────────────────────

    def _get_distribuidores(self) -> List[dict]:
        if self.solo_distribuidor_id:
            d = self.db.get_distribuidor(self.solo_distribuidor_id)
            return [d] if d else []
        return self.db.get_all_distribuidores_activos()

    def _start_bot(self, dist: dict) -> None:
        did    = dist["id"]
        nombre = dist["nombre"]
        token  = dist.get("token_bot", "")
        admin  = dist.get("admin_telegram_id")

        if did in self.threads and self.threads[did].is_alive():
            return

        # Registrar en monitor ANTES de lanzar el hilo
        self.monitor.register(did, nombre, token, admin)

        hilo = BotThread(
            distribuidor_id=did,
            distribuidor_nombre=nombre,
            monitor=self.monitor,
        )
        hilo.start()
        self.threads[did] = hilo
        logger.info(f"✅ Bot iniciado: '{nombre}' (id={did})")

    def _stop_bot(self, distribuidor_id: int) -> None:
        hilo = self.threads.get(distribuidor_id)
        if hilo:
            hilo.stop()
            logger.info(f"⏹️  Bot detenido: id={distribuidor_id}")

    def _check_and_reconcile(self) -> None:
        distribuidores = self._get_distribuidores()
        ids_activos    = {d["id"] for d in distribuidores}

        for dist in distribuidores:
            did  = dist["id"]
            hilo = self.threads.get(did)
            if hilo is None or not hilo.is_alive():
                if hilo and hilo.restarts > BotThread.MAX_RESTARTS:
                    logger.warning(
                        f"⚠️  Bot '{dist['nombre']}' alcanzó el límite. No se relanza."
                    )
                    continue
                self._start_bot(dist)

        for did in list(self.threads.keys()):
            if did not in ids_activos:
                self._stop_bot(did)

    # ── Señales ────────────────────────────────────────────────────────────────

    def _setup_signals(self) -> None:
        def _handler(sig, frame):
            logger.warning(f"\n🛑 Señal {sig} recibida — apagando CenterMind...")
            self._stop.set()

        signal.signal(signal.SIGINT,  _handler)
        signal.signal(signal.SIGTERM, _handler)

    # ── Arranque ───────────────────────────────────────────────────────────────

    def run(self) -> None:
        self._setup_signals()

        logger.info("=" * 60)
        logger.info("🚀 CenterMind Core arrancando...")
        logger.info("=" * 60)

        distribuidores = self._get_distribuidores()
        if not distribuidores:
            logger.error("❌ No hay distribuidores activos. Saliendo.")
            sys.exit(1)

        logger.info(f"📋 Distribuidores: {len(distribuidores)}")
        for d in distribuidores:
            logger.info(f"   • {d['nombre']} (id={d['id']})")

        # ── Iniciar servicios de hardening ─────────────────────────────────────
        self.backup_manager.start()
        self.monitor.start()

        # Hacer un backup inicial al arrancar (si la DB existe y no hay backup de hoy)
        self._maybe_initial_backup()

        # ── Levantar bots ──────────────────────────────────────────────────────
        for dist in distribuidores:
            self._start_bot(dist)

        logger.info(f"♾️  Orquestador activo. Verificación cada {self.POLL_INTERVAL}s.")
        logger.info("    Presioná Ctrl+C para detener.\n")

        while not self._stop.is_set():
            self._stop.wait(timeout=self.POLL_INTERVAL)
            if not self._stop.is_set():
                self._check_and_reconcile()
                self._print_status()

        self._shutdown()

    def _maybe_initial_backup(self) -> None:
        """Hace backup al arrancar si no existe uno de hoy."""
        from datetime import datetime
        from zoneinfo import ZoneInfo
        AR_TZ    = ZoneInfo("America/Argentina/Buenos_Aires")
        hoy      = datetime.now(AR_TZ).strftime("%Y-%m-%d")
        backups  = self.backup_manager.list_backups()
        hoy_exists = any(hoy in b.name for b in backups)
        if not hoy_exists:
            logger.info("Haciendo backup inicial al arrancar...")
            self.backup_manager.backup_now()

    def _shutdown(self) -> None:
        logger.info("🛑 Iniciando apagado limpio...")

        for did, hilo in self.threads.items():
            hilo.stop()

        for hilo in self.threads.values():
            hilo.join(timeout=10)

        self.backup_manager.stop()
        self.monitor.stop()

        # Backup final al apagar
        logger.info("Guardando backup de cierre...")
        self.backup_manager.backup_now()

        logger.info("✅ CenterMind Core detenido correctamente.")

    def _print_status(self) -> None:
        alive = sum(1 for h in self.threads.values() if h.is_alive())
        total = len(self.threads)
        mon   = self.monitor.get_summary()
        bak   = self.backup_manager.get_status()

        logger.info(
            f"📊 Bots: {alive}/{total} activos | "
            f"Monitor: {mon['alive']} OK / {mon['down']} caídos | "
            f"Backups: {bak['total_backups']} ({bak['latest_size_mb']} MB último)"
        )
        for did, hilo in self.threads.items():
            estado = "🟢 ACTIVO" if hilo.is_alive() else "🔴 CAÍDO"
            logger.info(
                f"   • {hilo.distribuidor_nombre} (id={did}) — {estado} "
                f"| Reinicios: {hilo.restarts}"
            )


# ═══════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CenterMind — Orquestador de bots")
    parser.add_argument(
        "--distribuidor-id", type=int, default=None,
        help="Levantar solo el bot de este distribuidor (debug)"
    )
    args = parser.parse_args()

    core = CenterMindCore(solo_distribuidor_id=args.distribuidor_id)
    core.run()
