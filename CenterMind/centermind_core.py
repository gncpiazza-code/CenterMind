# -*- coding: utf-8 -*-
# file: CenterMind/centermind_core.py
"""
Orquestador de CenterMind.
Lee todos los distribuidores activos de la base de datos
y levanta un BotWorker independiente por cada uno,
cada uno en su propio hilo (thread).

Uso:
    python centermind_core.py
    python centermind_core.py --distribuidor-id 1   ← solo un bot (debug)
"""

import argparse
import logging
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
# LOGGING
# ─────────────────────────────────────────────
logging.basicConfig(
    datefmt="%Y-%m-%d %H:%M:%S",
    format="%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("CenterMind-Core")

# ─────────────────────────────────────────────
# IMPORTS LOCALES
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from bot_worker import BotWorker, Database


# ═══════════════════════════════════════════════════════════════════
# WORKER THREAD
# ═══════════════════════════════════════════════════════════════════

class BotThread(threading.Thread):
    """
    Hilo dedicado a un BotWorker.
    Si el bot cae, espera RESTART_DELAY segundos y lo reinicia
    automáticamente (hasta MAX_RESTARTS veces).
    """

    RESTART_DELAY = 15   # segundos entre reinicios
    MAX_RESTARTS  = 10   # máximo de reinicios antes de abandonar

    def __init__(self, distribuidor_id: int, distribuidor_nombre: str):
        super().__init__(
            name=f"Bot-{distribuidor_id}-{distribuidor_nombre}",
            daemon=True,
        )
        self.distribuidor_id     = distribuidor_id
        self.distribuidor_nombre = distribuidor_nombre
        self.restarts            = 0
        self.running             = True
        self.logger              = logging.getLogger(f"Thread-{distribuidor_id}")

    def run(self) -> None:
        self.logger.info(
            f"▶️  Iniciando hilo para '{self.distribuidor_nombre}' (id={self.distribuidor_id})"
        )

        while self.running and self.restarts <= self.MAX_RESTARTS:
            try:
                worker = BotWorker(distribuidor_id=self.distribuidor_id)
                worker.run()  # bloqueante — solo retorna si el bot se detiene
            except Exception as e:
                self.restarts += 1
                self.logger.error(
                    f"❌ Bot '{self.distribuidor_nombre}' caído: {e} "
                    f"(reinicio {self.restarts}/{self.MAX_RESTARTS})"
                )

                if self.restarts > self.MAX_RESTARTS:
                    self.logger.critical(
                        f"🚨 Bot '{self.distribuidor_nombre}' superó el límite de reinicios. "
                        f"Abandonando hilo."
                    )
                    break

                if self.running:
                    self.logger.info(
                        f"⏳ Esperando {self.RESTART_DELAY}s antes de reiniciar "
                        f"'{self.distribuidor_nombre}'..."
                    )
                    time.sleep(self.RESTART_DELAY)

        self.logger.warning(f"⏹️  Hilo de '{self.distribuidor_nombre}' terminado.")

    def stop(self) -> None:
        """Señaliza al hilo que debe detenerse (no reiniciar)."""
        self.running = False


# ═══════════════════════════════════════════════════════════════════
# ORQUESTADOR
# ═══════════════════════════════════════════════════════════════════

class CenterMindCore:
    """
    Orquestador principal de CenterMind.
    Gestiona el ciclo de vida de todos los bots.
    """

    # Cada cuántos segundos verificar si hay distribuidores nuevos
    POLL_INTERVAL = 60

    def __init__(self, solo_distribuidor_id: Optional[int] = None):
        self.solo_distribuidor_id = solo_distribuidor_id
        self.db      = Database()
        self.threads: Dict[int, BotThread] = {}   # distribuidor_id → hilo
        self._stop   = threading.Event()

    # ─────────────────────────────────────────────────────────────
    # GESTIÓN DE HILOS
    # ─────────────────────────────────────────────────────────────

    def _get_distribuidores(self) -> List[dict]:
        """Devuelve la lista de distribuidores a levantar."""
        if self.solo_distribuidor_id:
            dist = self.db.get_distribuidor(self.solo_distribuidor_id)
            return [dist] if dist else []
        return self.db.get_all_distribuidores_activos()

    def _start_bot(self, dist: dict) -> None:
        did    = dist["id"]
        nombre = dist["nombre"]

        if did in self.threads and self.threads[did].is_alive():
            return  # Ya está corriendo

        hilo = BotThread(distribuidor_id=did, distribuidor_nombre=nombre)
        hilo.start()
        self.threads[did] = hilo
        logger.info(f"✅ Bot iniciado: '{nombre}' (id={did})")

    def _stop_bot(self, distribuidor_id: int) -> None:
        hilo = self.threads.get(distribuidor_id)
        if hilo:
            hilo.stop()
            logger.info(f"⏹️  Bot detenido: id={distribuidor_id}")

    def _check_and_reconcile(self) -> None:
        """
        Verifica que todos los distribuidores activos tengan su hilo vivo.
        Levanta los que faltan o cayeron definitivamente.
        """
        distribuidores = self._get_distribuidores()
        ids_activos    = {d["id"] for d in distribuidores}

        # Levantar nuevos o caídos
        for dist in distribuidores:
            did = dist["id"]
            hilo = self.threads.get(did)

            if hilo is None or not hilo.is_alive():
                if hilo and hilo.restarts > BotThread.MAX_RESTARTS:
                    logger.warning(
                        f"⚠️  Bot '{dist['nombre']}' alcanzó el límite de reinicios. "
                        f"No se relanza automáticamente."
                    )
                    continue
                self._start_bot(dist)

        # Detener hilos de distribuidores que ya no están activos
        for did in list(self.threads.keys()):
            if did not in ids_activos:
                self._stop_bot(did)

    # ─────────────────────────────────────────────────────────────
    # SEÑALES (Ctrl+C / kill)
    # ─────────────────────────────────────────────────────────────

    def _setup_signals(self) -> None:
        def _handler(sig, frame):
            logger.warning(f"\n🛑 Señal {sig} recibida — apagando CenterMind...")
            self._stop.set()

        signal.signal(signal.SIGINT,  _handler)
        signal.signal(signal.SIGTERM, _handler)

    # ─────────────────────────────────────────────────────────────
    # ARRANQUE
    # ─────────────────────────────────────────────────────────────

    def run(self) -> None:
        self._setup_signals()

        logger.info("=" * 60)
        logger.info("🚀 CenterMind Core arrancando...")
        logger.info("=" * 60)

        distribuidores = self._get_distribuidores()
        if not distribuidores:
            logger.error("❌ No hay distribuidores activos en la base de datos. Saliendo.")
            sys.exit(1)

        logger.info(f"📋 Distribuidores a levantar: {len(distribuidores)}")
        for d in distribuidores:
            logger.info(f"   • {d['nombre']} (id={d['id']})")

        # Levantar todos los bots
        for dist in distribuidores:
            self._start_bot(dist)

        # Bucle principal — reconciliación periódica
        logger.info(f"♾️  Orquestador activo. Verificación cada {self.POLL_INTERVAL}s.")
        logger.info("    Presioná Ctrl+C para detener.\n")

        while not self._stop.is_set():
            self._stop.wait(timeout=self.POLL_INTERVAL)
            if not self._stop.is_set():
                self._check_and_reconcile()
                self._print_status()

        # Apagado limpio
        self._shutdown()

    def _shutdown(self) -> None:
        logger.info("🛑 Iniciando apagado limpio...")
        for did, hilo in self.threads.items():
            hilo.stop()
            logger.info(f"   ⏹️  Señal de stop enviada a bot id={did}")

        # Dar tiempo a los hilos para terminar
        for hilo in self.threads.values():
            hilo.join(timeout=10)

        logger.info("✅ CenterMind Core detenido correctamente.")

    def _print_status(self) -> None:
        alive = sum(1 for h in self.threads.values() if h.is_alive())
        total = len(self.threads)
        logger.info(f"📊 Estado: {alive}/{total} bots activos")
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
        help="(Opcional) Levantar solo el bot de este distribuidor (útil para debug)"
    )
    args = parser.parse_args()

    core = CenterMindCore(solo_distribuidor_id=args.distribuidor_id)
    core.run()
