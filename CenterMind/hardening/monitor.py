# -*- coding: utf-8 -*-
"""
CenterMind / hardening / monitor.py
=====================================
Monitor de uptime de bots con alertas por Telegram.

Cómo funciona:
  1. Cada BotThread llama a monitor.heartbeat(dist_id) periódicamente.
  2. El monitor corre un job cada CHECK_INTERVAL segundos.
  3. Si un bot no mandó heartbeat en > DEAD_THRESHOLD segundos → alerta.
  4. Cuando el bot se recupera → alerta de recuperación.
  5. Las alertas se envían al admin_telegram_id vía el bot de esa distribuidora.

Uso desde centermind_core.py:
    from hardening import BotMonitor
    monitor = BotMonitor(db_path=DB_PATH)
    monitor.start()

Uso desde BotThread (en cada iteración del loop de reinicio):
    monitor.heartbeat(distribuidor_id, status="running")
    monitor.bot_down(distribuidor_id, reason="excepción X")
    monitor.bot_up(distribuidor_id)
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
from zoneinfo import ZoneInfo

AR_TZ    = ZoneInfo("America/Argentina/Buenos_Aires")
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Configuración ──────────────────────────────────────────────────────────────
CHECK_INTERVAL  = 60     # segundos entre chequeos del monitor
DEAD_THRESHOLD  = 180    # segundos sin heartbeat para considerar bot caído
ALERT_COOLDOWN  = 600    # segundos entre alertas repetidas del mismo bot


@dataclass
class BotState:
    dist_id:       int
    nombre:        str
    token:         str
    admin_chat_id: Optional[str]
    last_heartbeat: float    = field(default_factory=time.time)
    status:         str      = "starting"   # starting | running | down | restarting
    last_alert_sent:float    = 0.0
    restart_count:  int      = 0
    start_time:     float    = field(default_factory=time.time)

    @property
    def uptime_str(self) -> str:
        secs = int(time.time() - self.start_time)
        h, r = divmod(secs, 3600)
        m, s = divmod(r, 60)
        return f"{h}h {m}m {s}s"

    @property
    def last_seen_str(self) -> str:
        secs = int(time.time() - self.last_heartbeat)
        if secs < 60:
            return f"hace {secs}s"
        return f"hace {secs//60}m {secs%60}s"


class BotMonitor:
    """
    Monitor central de todos los bots del orquestador.
    Thread-safe. Corre como daemon.
    """

    def __init__(self, db_path: Path = BASE_DIR / "base_datos" / "centermind.db"):
        self.db_path = db_path
        self._states: Dict[int, BotState] = {}
        self._lock    = threading.Lock()
        self._stop_ev = threading.Event()
        self._thread: Optional[threading.Thread] = None

        from hardening.logger import get_logger
        self.logger = get_logger("BotMonitor")

    # ── Registro de bots ───────────────────────────────────────────────────────

    def register(self, dist_id: int, nombre: str, token: str, admin_chat_id: Optional[str]) -> None:
        """Registrar un bot en el monitor (llamar al iniciar cada BotThread)."""
        with self._lock:
            self._states[dist_id] = BotState(
                dist_id=dist_id,
                nombre=nombre,
                token=token,
                admin_chat_id=admin_chat_id,
            )
        self.logger.info(f"Monitor: bot registrado — {nombre} (id={dist_id})")

    # ── Señales desde BotThread ────────────────────────────────────────────────

    def heartbeat(self, dist_id: int, status: str = "running") -> None:
        """Señal de vida desde el bot. Llamar cada 30-60s desde sync_evaluaciones_job."""
        with self._lock:
            st = self._states.get(dist_id)
            if st:
                st.last_heartbeat = time.time()
                st.status         = status

    def bot_down(self, dist_id: int, reason: str = "") -> None:
        """Notificar que el bot cayó (llamar en el except del BotThread)."""
        with self._lock:
            st = self._states.get(dist_id)
            if not st:
                return
            prev = st.status
            st.status        = "down"
            st.restart_count += 1

        self.logger.error(f"🔴 Bot caído: {st.nombre} (id={dist_id}) — {reason}")

        # Solo alertar si no estaba ya marcado como down
        if prev != "down":
            self._send_alert_async(st, down=True, reason=reason)

    def bot_up(self, dist_id: int) -> None:
        """Notificar que el bot se recuperó."""
        with self._lock:
            st = self._states.get(dist_id)
            if not st:
                return
            prev       = st.status
            st.status  = "running"
            st.last_heartbeat = time.time()

        self.logger.info(f"🟢 Bot recuperado: {st.nombre} (id={dist_id})")

        if prev == "down":
            self._send_alert_async(st, down=False)

    # ── Control del monitor ────────────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_ev.clear()
        self._thread = threading.Thread(
            target=self._monitor_loop,
            name="BotMonitor",
            daemon=True,
        )
        self._thread.start()
        self.logger.info(f"BotMonitor iniciado — chequeo cada {CHECK_INTERVAL}s")

    def stop(self) -> None:
        self._stop_ev.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.logger.info("BotMonitor detenido")

    def get_all_states(self) -> Dict[int, BotState]:
        """Snapshot de todos los estados (para el Panel Maestro)."""
        with self._lock:
            return dict(self._states)

    def get_summary(self) -> dict:
        """Resumen rápido para logs."""
        with self._lock:
            total  = len(self._states)
            alive  = sum(1 for s in self._states.values() if s.status == "running")
            down   = sum(1 for s in self._states.values() if s.status == "down")
        return {"total": total, "alive": alive, "down": down}

    # ── Loop principal ─────────────────────────────────────────────────────────

    def _monitor_loop(self) -> None:
        while not self._stop_ev.is_set():
            self._stop_ev.wait(timeout=CHECK_INTERVAL)
            if self._stop_ev.is_set():
                break
            self._check_all()

    def _check_all(self) -> None:
        now = time.time()
        with self._lock:
            states = list(self._states.values())

        for st in states:
            if st.status in ("starting", "down"):
                continue

            secs_since = now - st.last_heartbeat
            if secs_since > DEAD_THRESHOLD:
                # Bot silencioso — probablemente colgado
                if now - st.last_alert_sent > ALERT_COOLDOWN:
                    self.logger.warning(
                        f"⚠️ Sin heartbeat: {st.nombre} — último: {st.last_seen_str}"
                    )
                    with self._lock:
                        st.status         = "down"
                        st.last_alert_sent = now
                    self._send_alert_async(
                        st, down=True,
                        reason=f"Sin señal de vida por {int(secs_since)}s"
                    )

        # Log periódico de estado
        summ = self.get_summary()
        self.logger.info(
            f"Monitor: {summ['alive']}/{summ['total']} bots activos "
            f"{'🔴 ' + str(summ['down']) + ' caído(s)' if summ['down'] else '✅ Todos OK'}"
        )

    # ── Alertas Telegram ───────────────────────────────────────────────────────

    def _send_alert_async(self, state: BotState, down: bool, reason: str = "") -> None:
        """Dispara la alerta en un thread separado para no bloquear el monitor."""
        if not state.admin_chat_id or not state.token:
            return
        t = threading.Thread(
            target=self._send_telegram_sync,
            args=(state, down, reason),
            daemon=True,
        )
        t.start()

    def _send_telegram_sync(self, state: BotState, down: bool, reason: str) -> None:
        """Envía el mensaje de alerta por Telegram (síncrono, en thread)."""
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            loop.run_until_complete(self._send_telegram_async(state, down, reason))
            loop.close()
        except Exception as e:
            self.logger.error(f"Error enviando alerta Telegram: {e}")

    async def _send_telegram_async(self, state: BotState, down: bool, reason: str) -> None:
        try:
            from telegram import Bot
            from telegram.constants import ParseMode

            now_str = datetime.now(AR_TZ).strftime("%d/%m %H:%M:%S")

            if down:
                text = (
                    f"🔴 <b>BOT CAÍDO — {state.nombre}</b>\n\n"
                    f"🕐 {now_str}\n"
                    f"📋 Motivo: {reason or 'Desconocido'}\n"
                    f"🔄 Reinicio #{state.restart_count}\n\n"
                    f"El orquestador intentará reiniciarlo automáticamente."
                )
            else:
                text = (
                    f"🟢 <b>BOT RECUPERADO — {state.nombre}</b>\n\n"
                    f"🕐 {now_str}\n"
                    f"⏱️ Uptime: {state.uptime_str}\n"
                    f"✅ Todos los sistemas activos."
                )

            bot = Bot(token=state.token)
            await bot.send_message(
                chat_id=int(state.admin_chat_id),
                text=text,
                parse_mode=ParseMode.HTML,
            )
            self.logger.info(f"Alerta enviada a admin de {state.nombre}")

        except Exception as e:
            self.logger.error(f"Error en alerta Telegram async: {e}")
