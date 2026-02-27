# -*- coding: utf-8 -*-
# file: CenterMind/bot_worker.py
"""
Bot de Telegram por distribuidor.
- Solo carga exhibiciones (sin evaluación en chat)
- Evaluación desde la app Streamlit
- Edita mensajes cuando Streamlit evalúa (sync job)
- SQL (SQLite) en lugar de Google Sheets
- Drive con service account
"""

import os
import sys
import time
import logging
import asyncio
import sqlite3
import uuid
import atexit
import errno
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import io

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, BotCommand
from telegram.constants import ParseMode
from telegram.error import BadRequest
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import json

# PARCHE SSL (fix PostgreSQL sobreescribe SSL_CERT_FILE)
# ─────────────────────────────────────────────
try:
    import certifi
    import os
    os.environ["SSL_CERT_FILE"]      = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass

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
# ZONA HORARIA
# ─────────────────────────────────────────────
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

# ============================================================
# CONFIGURACIÓN RÁPIDA — Editá estos valores según necesites
# ============================================================
HIBERNACION_ACTIVA: bool = False   # True = 22:00-06:00 sin fotos | False = siempre activo
# ============================================================
# TIPOS DE PDV — Editá esta lista para agregar/quitar tipos
# ============================================================
PDV_TYPES: List[str] = [
    "Comercio sin Ingreso",
    "Comercio con Ingreso",
]
# ============================================================

# ─────────────────────────────────────────────
# RUTAS BASE
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = BASE_DIR / "base_datos" / "centermind.db"
CRED_PATH  = BASE_DIR / "credencial_oauth.json"   # Client secrets de Google Cloud
TOKEN_PATH = BASE_DIR / "token_drive.json"          # Se genera automático al autorizar

# ─────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────
logging.basicConfig(
    datefmt="%Y-%m-%d %H:%M:%S",
    format="%(asctime)s | %(levelname)-8s | %(name)-20s | %(funcName)-25s | %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)


try:
    from hardening.logger import get_logger
except ImportError:
    def get_logger(name: str) -> logging.Logger:
        return logging.getLogger(name)


# ═══════════════════════════════════════════════════════════════════
# INSTANCE LOCK — evita múltiples instancias del mismo bot
# ═══════════════════════════════════════════════════════════════════

def _pid_exists(pid: int) -> bool:
    """
    Verifica si un proceso con ese PID existe (cross-platform, sin psutil).
    Windows: usa OpenProcess via ctypes.
    Unix:    usa os.kill(pid, 0).
    """
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
        except Exception:
            pass
        return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError as exc:
            # EPERM = proceso existe pero sin permiso para señalarlo
            return exc.errno == errno.EPERM


def acquire_instance_lock(dist_id: int, log: logging.Logger) -> Optional[Path]:
    """
    Adquiere el lock de instancia única para este distribuidor.
    - Si el lock existe y el PID sigue vivo → retorna None (no arrancar).
    - Si el lock existe pero el PID murió (zombie cleanup) → lo sobreescribe.
    - Si no existe → lo crea con nuestro PID.
    Retorna el Path del lock file si se adquirió, None si hay conflicto.
    """
    lock_dir = BASE_DIR / "logs"
    lock_dir.mkdir(exist_ok=True)
    lf      = lock_dir / f"bot_{dist_id}.lock"
    my_pid  = os.getpid()

    if lf.exists():
        try:
            existing_pid = int(lf.read_text().strip())
        except (ValueError, OSError):
            existing_pid = 0

        if existing_pid and existing_pid != my_pid:
            if _pid_exists(existing_pid):
                log.error(
                    f"❌ Ya hay una instancia activa de bot_{dist_id} "
                    f"(PID {existing_pid}). Saliendo para evitar "
                    f"'Conflict: terminated by other getUpdates request'."
                )
                return None
            log.warning(
                f"⚠️ Lock zombie encontrado (PID {existing_pid} ya no existe). "
                "Limpiando y continuando."
            )

    try:
        lf.write_text(str(my_pid))
    except OSError as exc:
        log.warning(f"⚠️ No se pudo crear lock file: {exc} — continuando sin lock.")
        return None
    return lf


def release_instance_lock(lf: Optional[Path]) -> None:
    """Elimina el lock file al salir (registrado con atexit)."""
    if not lf:
        return
    try:
        if lf.exists() and int(lf.read_text().strip()) == os.getpid():
            lf.unlink()
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════
# BASE DE DATOS
# ═══════════════════════════════════════════════════════════════════

class Database:
    """Interfaz SQLite para CenterMind."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.logger = get_logger("Database")

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    # ── Distribuidores ──────────────────────────────────────────────

    def get_distribuidor(self, distribuidor_id: int) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT
                       id_distribuidor  AS id,
                       nombre_empresa   AS nombre,
                       token_bot,
                       id_carpeta_drive AS drive_folder_id,
                       estado,
                       admin_telegram_id
                   FROM distribuidores
                   WHERE id_distribuidor = ? AND estado = 'activo'""",
                (distribuidor_id,)
            ).fetchone()
            return dict(row) if row else None

    def get_all_distribuidores_activos(self) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT
                       id_distribuidor  AS id,
                       nombre_empresa   AS nombre,
                       token_bot,
                       id_carpeta_drive AS drive_folder_id,
                       estado,
                       admin_telegram_id
                   FROM distribuidores
                   WHERE estado = 'activo'"""
            ).fetchall()
            return [dict(r) for r in rows]

    # ── Grupos ──────────────────────────────────────────────────────

    def upsert_grupo(self, distribuidor_id: int, chat_id: int, chat_title: str) -> None:
        """Registra o actualiza el nombre del grupo de Telegram."""
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO grupos (id_distribuidor, telegram_chat_id, nombre_grupo)
                   VALUES (?, ?, ?)
                   ON CONFLICT(id_distribuidor, telegram_chat_id)
                   DO UPDATE SET nombre_grupo = excluded.nombre_grupo""",
                (distribuidor_id, chat_id, chat_title)
            )
            conn.commit()

    # ── Integrantes / Roles ─────────────────────────────────────────

    def get_rol(self, distribuidor_id: int, chat_id: int, user_id: int) -> str:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT rol_telegram AS rol FROM integrantes_grupo
                   WHERE id_distribuidor = ? AND telegram_group_id = ? AND telegram_user_id = ?""",
                (distribuidor_id, chat_id, user_id)
            ).fetchone()
            return row["rol"] if row else "vendedor"

    def get_rol_global(self, distribuidor_id: int, user_id: int) -> Optional[str]:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT rol_telegram AS rol FROM integrantes_grupo
                   WHERE id_distribuidor = ? AND telegram_user_id = ?
                   LIMIT 1""",
                (distribuidor_id, user_id)
            ).fetchone()
            return row["rol"] if row else None

    def upsert_integrante(
        self, distribuidor_id: int, chat_id: int, user_id: int,
        username: str, nombre: str, rol: str = "vendedor"
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO integrantes_grupo
                       (id_distribuidor, telegram_group_id, telegram_user_id, nombre_integrante, rol_telegram)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(id_distribuidor, telegram_group_id, telegram_user_id)
                   DO UPDATE SET nombre_integrante = excluded.nombre_integrante""",
                (distribuidor_id, chat_id, user_id, nombre, rol)
            )
            conn.commit()

    def set_rol(self, distribuidor_id: int, chat_id: int, user_id: int, rol: str) -> None:
        with self._conn() as conn:
            conn.execute(
                """UPDATE integrantes_grupo SET rol_telegram = ?
                   WHERE id_distribuidor = ? AND telegram_group_id = ? AND telegram_user_id = ?""",
                (rol, distribuidor_id, chat_id, user_id)
            )
            conn.commit()

    # ── Exhibiciones ────────────────────────────────────────────────

    def registrar_exhibicion(
        self,
        distribuidor_id: int,
        chat_id: int,
        vendedor_id: int,
        nro_cliente: str,
        tipo_pdv: str,
        drive_link: str,
        telegram_msg_id: Optional[int] = None,
        telegram_chat_id: Optional[int] = None,
    ) -> str:
        with self._conn() as conn:
            # 1. Obtener ID del integrante (Vendedor)
            row = conn.execute(
                """SELECT id_integrante FROM integrantes_grupo
                   WHERE id_distribuidor = ? AND telegram_user_id = ?
                   LIMIT 1""",
                (distribuidor_id, vendedor_id)
            ).fetchone()
            if row is None:
                raise ValueError(f"Vendedor {vendedor_id} no encontrado en integrantes_grupo")
            pk_integrante = row[0]

            # 2. Buscar o crear el Cliente (Lógica de Clientes)
            cliente_row = conn.execute(
                """SELECT id_cliente FROM clientes
                   WHERE id_distribuidor = ? AND numero_cliente_local = ? LIMIT 1""",
                (distribuidor_id, nro_cliente)
            ).fetchone()

            if cliente_row:
                id_cliente = cliente_row["id_cliente"]
            else:
                cur_cliente = conn.execute(
                    """INSERT INTO clientes (id_distribuidor, numero_cliente_local)
                       VALUES (?, ?)""",
                    (distribuidor_id, nro_cliente)
                )
                id_cliente = cur_cliente.lastrowid

            # 3. Insertar la Exhibición limpia (usando id_cliente)
            cur = conn.execute(
                """INSERT INTO exhibiciones
                   (id_distribuidor, id_integrante, id_cliente,
                    tipo_pdv, url_foto_drive,
                    estado, telegram_msg_id, telegram_chat_id, synced_telegram)
                   VALUES (?, ?, ?, ?, ?, 'Pendiente', ?, ?, 0)""",
                (distribuidor_id, pk_integrante, id_cliente,
                 tipo_pdv, drive_link,
                 telegram_msg_id, telegram_chat_id)
            )
            conn.commit()
            return str(cur.lastrowid)

    def update_telegram_refs(
        self, exhibicion_id: str, telegram_msg_id: int, telegram_chat_id: int
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """UPDATE exhibiciones
                   SET telegram_msg_id = ?, telegram_chat_id = ?
                   WHERE id_exhibicion = ?""",
                (telegram_msg_id, telegram_chat_id, exhibicion_id)
            )
            conn.commit()

    def get_pendientes_sync(self, distribuidor_id: int) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT
                       e.id_exhibicion        AS id,
                       e.id_distribuidor,
                       e.telegram_chat_id     AS chat_id,
                       e.id_integrante        AS vendedor_id,
                       c.numero_cliente_local AS nro_cliente,
                       e.tipo_pdv             AS tipo_pdv,
                       e.url_foto_drive       AS drive_link,
                       e.estado,
                       e.supervisor_nombre,
                       e.comentario_evaluacion AS comentarios,
                       e.telegram_msg_id,
                       e.telegram_chat_id
                   FROM exhibiciones e
                   LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
                   WHERE e.id_distribuidor = ?
                     AND e.estado != 'Pendiente'
                     AND e.synced_telegram = 0
                     AND e.telegram_msg_id IS NOT NULL
                     AND e.telegram_chat_id IS NOT NULL""",
                (distribuidor_id,)
            ).fetchall()
            
            result = []
            for r in rows:
                d = dict(r)
                d["vendedor_nombre"] = self._get_nombre_integrante(distribuidor_id, d["vendedor_id"])
                result.append(d)
            return result

    def _get_nombre_integrante(self, distribuidor_id: int, user_id: int) -> str:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT nombre_integrante FROM integrantes_grupo
                   WHERE id_distribuidor = ? AND telegram_user_id = ? LIMIT 1""",
                (distribuidor_id, user_id)
            ).fetchone()
            return row["nombre_integrante"] if row else "Vendedor"

    def marcar_synced(self, exhibicion_id: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE exhibiciones SET synced_telegram = 1 WHERE id_exhibicion = ?",
                (exhibicion_id,)
            )
            conn.commit()

    def get_stats_vendedor(self, distribuidor_id: int, vendedor_id: int) -> Dict:
        with self._conn() as conn:
            hist = conn.execute(
                """SELECT
                       SUM(CASE WHEN estado = 'Aprobado'   THEN 1 ELSE 0 END) aprobadas,
                       SUM(CASE WHEN estado = 'Destacado'  THEN 1 ELSE 0 END) destacadas,
                       SUM(CASE WHEN estado = 'Rechazado'  THEN 1 ELSE 0 END) rechazadas,
                       SUM(CASE WHEN estado = 'Pendiente'  THEN 1 ELSE 0 END) pendientes,
                       COUNT(*) total
                   FROM exhibiciones
                   WHERE id_distribuidor = ? AND id_integrante = ?""",
                (distribuidor_id, vendedor_id)
            ).fetchone()

            mes_inicio = datetime.now(AR_TZ).replace(day=1).strftime("%Y-%m-%d")
            mes = conn.execute(
                """SELECT
                       SUM(CASE WHEN estado = 'Aprobado'   THEN 1 ELSE 0 END) aprobadas,
                       SUM(CASE WHEN estado = 'Destacado'  THEN 1 ELSE 0 END) destacadas,
                       SUM(CASE WHEN estado = 'Rechazado'  THEN 1 ELSE 0 END) rechazadas,
                       SUM(CASE WHEN estado = 'Pendiente'  THEN 1 ELSE 0 END) pendientes,
                       COUNT(*) total
                   FROM exhibiciones
                   WHERE id_distribuidor = ? AND id_integrante = ?
                     AND timestamp_subida >= ?""",
                (distribuidor_id, vendedor_id, mes_inicio)
            ).fetchone()

        def safe(row, key):
            return row[key] if row and row[key] is not None else 0

        return {
            "historico": {
                "aprobadas":  safe(hist, "aprobadas"),
                "destacadas": safe(hist, "destacadas"),
                "rechazadas": safe(hist, "rechazadas"),
                "pendientes": safe(hist, "pendientes"),
                "total":      safe(hist, "total"),
                "puntos":     safe(hist, "aprobadas") + safe(hist, "destacadas") * 2,
            },
            "mes": {
                "aprobadas":  safe(mes, "aprobadas"),
                "destacadas": safe(mes, "destacadas"),
                "rechazadas": safe(mes, "rechazadas"),
                "pendientes": safe(mes, "pendientes"),
                "total":      safe(mes, "total"),
                "puntos":     safe(mes, "aprobadas") + safe(mes, "destacadas") * 2,
            },
        }

    def get_racha_vendedor(self, distribuidor_id: int, vendedor_id: int) -> int:
        """Racha actual: cuantas exhibiciones consecutivas aprobadas/destacadas
        contando desde la mas reciente hacia atras (sin contar pendientes)."""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT estado FROM exhibiciones
                   WHERE id_distribuidor = ? AND id_integrante = ?
                     AND estado IN ('Aprobado','Destacado','Rechazado')
                   ORDER BY timestamp_subida DESC
                   LIMIT 30""",
                (distribuidor_id, vendedor_id)
            ).fetchall()
        racha = 0
        for row in rows:
            if row["estado"] in ("Aprobado", "Destacado"):
                racha += 1
            else:
                break
        return racha

    def get_ranking_mes(self, distribuidor_id: int) -> List[Dict]:
        mes_inicio = datetime.now(AR_TZ).replace(day=1).strftime("%Y-%m-%d")
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT
                       i.nombre_integrante AS vendedor_nombre,
                       SUM(CASE WHEN e.estado IN ('Aprobado','Destacado') THEN 1 ELSE 0 END) aprobadas,
                       SUM(CASE WHEN e.estado = 'Destacado' THEN 1 ELSE 0 END) destacadas,
                       SUM(CASE WHEN e.estado = 'Rechazado' THEN 1 ELSE 0 END) rechazadas,
                       COUNT(*) total
                   FROM exhibiciones e
                   LEFT JOIN integrantes_grupo i
                       ON i.id_distribuidor = e.id_distribuidor
                      AND i.telegram_user_id = e.id_integrante
                   WHERE e.id_distribuidor = ? AND e.timestamp_subida >= ?
                   GROUP BY e.id_integrante
                   ORDER BY aprobadas DESC, destacadas DESC""",
                (distribuidor_id, mes_inicio)
            ).fetchall()
        ranking = []
        for r in rows:
            puntos = r["aprobadas"] + r["destacadas"]
            ranking.append({
                "vendedor":   r["vendedor_nombre"] or "Sin nombre",
                "puntos":     puntos,
                "aprobadas":  r["aprobadas"],
                "destacadas": r["destacadas"],
                "rechazadas": r["rechazadas"],
                "total":      r["total"],
            })
        return ranking

    def get_historial_cliente(
        self, distribuidor_id: int, chat_id: int, nro_cliente: str, limit: int = 5
    ) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT e.tipo_pdv, e.estado, e.timestamp_subida AS created_at
                   FROM exhibiciones e
                   JOIN clientes c ON e.id_cliente = c.id_cliente
                   WHERE e.id_distribuidor = ? AND e.telegram_chat_id = ? AND c.numero_cliente_local = ?
                   ORDER BY e.timestamp_subida DESC LIMIT ?""",
                (distribuidor_id, chat_id, nro_cliente, limit)
            ).fetchall()
        result = []
        for r in rows:
            fecha = r["created_at"][:10] if r["created_at"] else ""
            try:
                dt = datetime.strptime(fecha, "%Y-%m-%d")
                fecha = dt.strftime("%d/%m")
            except Exception:
                pass
            result.append({
                "fecha":    fecha,
                "tipo_pdv": r["tipo_pdv"],
                "estado":   r["estado"],
            })
        return result

# ═══════════════════════════════════════════════════════════════════
# DRIVE (Service Account)
# ═══════════════════════════════════════════════════════════════════

class DriveUploader:
    """Sube fotos a Google Drive usando OAuth2 (usuario real, sin límite de cuota)."""

    SCOPES = ["https://www.googleapis.com/auth/drive"]

    def __init__(self, cred_path: Path = CRED_PATH, token_path: Path = TOKEN_PATH):
        self.logger     = get_logger("DriveUploader")
        self._service   = None
        self._folder_cache: Dict[Tuple[str, str], str] = {}
        try:
            creds = None
            # Cargar token guardado si existe
            if token_path.exists():
                creds = Credentials.from_authorized_user_file(str(token_path), self.SCOPES)

            # Refrescar si expiró
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                token_path.write_text(creds.to_json())
                self.logger.info("🔄 Token de Drive refrescado automáticamente")

            if not creds or not creds.valid:
                raise RuntimeError(
                    f"Token de Drive no encontrado o inválido.\n"
                    f"Ejecutá: python setup_drive_oauth.py"
                )

            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            self.logger.info("✅ DriveUploader conectado con OAuth2")
        except Exception as e:
            self.logger.error(f"❌ Error conectando Drive: {e}")

    def _ensure_folder(self, parent_id: str, name: str) -> str:
        key = (parent_id, name)
        if key in self._folder_cache:
            return self._folder_cache[key]

        safe = name.replace("'", "\\'")
        q = (
            f"mimeType='application/vnd.google-apps.folder' and trashed=false "
            f"and name='{safe}' and '{parent_id}' in parents"
        )
        try:
            res = self._service.files().list(q=q, fields="files(id)", pageSize=5).execute()
            files = res.get("files", [])
            if files:
                fid = files[0]["id"]
                self._folder_cache[key] = fid
                return fid
        except Exception:
            pass

        # Crear carpeta
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        created = self._service.files().create(body=meta, fields="id").execute()
        fid = created.get("id", "")
        if fid:
            self._folder_cache[key] = fid
        return fid

    def upload(
        self,
        file_bytes: bytes,
        filename: str,
        root_folder_id: str,
        distribuidor_nombre: str,
        group_title: str,
    ) -> str:
        """
        Sube foto y devuelve el webViewLink.

        Estructura en Drive:
        root_folder/
        └── [Distribuidor]/
            └── [Grupo]/
                └── [DD-MM-YYYY]/
                    └── filename.jpg
        """
        if not self._service:
            return ""

        date_folder = datetime.now(AR_TZ).strftime("%d-%m-%Y")

        try:
            dist_id   = self._ensure_folder(root_folder_id, distribuidor_nombre)
            group_id  = self._ensure_folder(dist_id, group_title or "SIN_GRUPO")
            date_id   = self._ensure_folder(group_id, date_folder)
        except Exception as e:
            self.logger.error(f"❌ Error creando carpetas Drive: {e}")
            return ""

        for attempt in range(1, 4):
            try:
                meta  = {"name": filename, "parents": [date_id]}
                media = MediaIoBaseUpload(
                    io.BytesIO(file_bytes), mimetype="image/jpeg", resumable=True
                )
                f = self._service.files().create(
                    body=meta,
                    media_body=media,
                    fields="id,webViewLink",
                ).execute()
                file_id = f.get("id", "")
                link    = f.get("webViewLink", "")

                # Hacer el archivo visible con el link
                if file_id:
                    try:
                        self._service.permissions().create(
                            fileId=file_id,
                            body={"type": "anyone", "role": "reader"},
                        ).execute()
                    except Exception as perm_err:
                        self.logger.warning(f"⚠️ No se pudo setear permisos públicos: {perm_err}")

                self.logger.info(f"✅ Foto subida: {filename}")
                return link
            except Exception as e:
                self.logger.warning(f"⚠️ Intento {attempt}/3 fallido: {e}")
                time.sleep(attempt * 2)

        self.logger.error(f"❌ Falló definitivamente la subida: {filename}")
        return ""


# ═══════════════════════════════════════════════════════════════════
# BOT WORKER
# ═══════════════════════════════════════════════════════════════════

class BotWorker:
    """
    Bot de Telegram para un distribuidor.
    Instanciar con el distribuidor_id y llamar a run().
    """

    STAGE_WAITING_ID   = "WAITING_ID"
    STAGE_WAITING_TYPE = "WAITING_TYPE"

    def __init__(self, distribuidor_id: int, monitor=None):
        self.distribuidor_id = distribuidor_id
        self.logger = get_logger(f"Bot-{distribuidor_id}")

        self.db     = Database()
        self.drive  = DriveUploader()

        # Cargar config del distribuidor
        dist = self.db.get_distribuidor(distribuidor_id)
        if not dist:
            raise ValueError(f"Distribuidor {distribuidor_id} no encontrado o inactivo")

        self.token              = dist["token_bot"]
        self.nombre_dist        = dist["nombre"]
        self.drive_folder_id    = dist["drive_folder_id"]
        self.admin_telegram_id  = dist.get("admin_telegram_id")  # opcional en la tabla

        # Estado en memoria
        self.upload_sessions:   Dict[int, Dict[str, Any]] = {}
        self.active_msgs:       Dict[int, Dict[str, Any]] = {}   # msg_id → {exhibicion_id, ...}
        self.bot_hibernating    = False
        self.start_time         = time.time()
        self.monitor            = monitor   # BotMonitor (puede ser None si corre standalone)

        self.logger.info(f"✅ BotWorker listo para: {self.nombre_dist}")

    # ─────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────

    def _uptime(self) -> str:
        return str(timedelta(seconds=int(time.time() - self.start_time)))

    def _is_admin(self, user_id: int) -> bool:
        if self.admin_telegram_id and str(user_id) == str(self.admin_telegram_id):
            return True
        return False

    async def _ensure_ready(self, bot) -> None:
        try:
            if not getattr(bot, "_initialized", False) and hasattr(bot, "initialize"):
                await bot.initialize()
        except Exception:
            pass

    async def _notify_admin(self, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
        if not self.admin_telegram_id:
            return
        try:
            await self._ensure_ready(context.bot)
            await context.bot.send_message(
                chat_id=int(self.admin_telegram_id),
                text=text,
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            self.logger.warning(f"⚠️ No se pudo notificar admin: {e}")

    def _register_user_and_group(self, distribuidor_id, chat_id, chat_title, user_id, username, nombre) -> None:
        """Actualiza la información del usuario y del grupo en la base de datos."""
        try:
            self.db.upsert_integrante(distribuidor_id, chat_id, user_id, username, nombre)
            self.db.upsert_grupo(distribuidor_id, chat_id, chat_title)
        except Exception as e:
            self.logger.debug(f"Error registrando usuario/grupo: {e}")

    # ─────────────────────────────────────────────────────────────
    # HIBERNACIÓN
    # ─────────────────────────────────────────────────────────────

    def _is_hibernation_time(self) -> bool:
        if not HIBERNACION_ACTIVA:
            return False
        hour = datetime.now(AR_TZ).hour
        return hour >= 22 or hour < 6

    async def _start_hibernation(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        self.bot_hibernating = True
        self.logger.info("🌙 Hibernación iniciada (22:00-06:00)")
        await self._notify_admin(
            context,
            f"🌙 <b>{self.nombre_dist} — Bot en hibernación</b>\n"
            f"Horario: 22:00-06:00 (ARG)\n"
            f"✅ Sync de evaluaciones sigue activo"
        )

    async def _end_hibernation(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        self.bot_hibernating = False
        self.logger.info("☀️ Hibernación finalizada")
        await self._notify_admin(
            context,
            f"☀️ <b>{self.nombre_dist} — Bot operativo</b>\n"
            f"✅ Todos los sistemas activos"
        )

    # ─────────────────────────────────────────────────────────────
    # COMANDOS
    # ─────────────────────────────────────────────────────────────

    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        m = update.message
        chat_title = getattr(m.chat, "title", None) or getattr(m.chat, "username", "Privado")
        
        asyncio.create_task(asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, m.chat.id, chat_title, m.from_user.id,
            m.from_user.username or "", m.from_user.first_name or "Usuario"
        ))
        await m.reply_text(
            f"¡Hola! Soy el bot de <b>{self.nombre_dist}</b>.\n"
            "Enviá una foto para cargar una exhibición.\n"
            "Usá /help para ver los comandos disponibles.",
            parse_mode=ParseMode.HTML,
        )

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        text = (
            f"📘 <b>Ayuda — {self.nombre_dist}</b>\n\n"
            "📸 <b>Cómo cargar una exhibición:</b>\n"
            "1️⃣ Enviá una foto al grupo\n"
            "2️⃣ El bot te pedirá el <b>NRO CLIENTE</b> (solo números)\n"
            "3️⃣ Seleccioná el <b>tipo de PDV</b> en los botones\n"
            "4️⃣ La exhibición queda registrada como <b>Pendiente</b>\n"
            "5️⃣ Un supervisor la aprueba desde la app\n\n"
            "📊 <b>Comandos:</b>\n"
            "• /stats — Tus estadísticas\n"
            "• /ranking — Ranking del mes\n"
            "• /help — Esta ayuda"
        )
        await update.message.reply_text(text, parse_mode=ParseMode.HTML)

    async def cmd_id(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        await update.message.reply_text(
            f"Chat ID: <code>{update.message.chat.id}</code>\n"
            f"Tipo: {update.message.chat.type}",
            parse_mode=ParseMode.HTML,
        )

    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        uid = update.message.from_user.id
        if not self._is_admin(uid):
            await update.message.reply_text("❌ Solo el administrador puede usar /status")
            return
        estado = "🌙 HIBERNANDO" if self.bot_hibernating else "☀️ OPERATIVO"
        msg = (
            f"🤖 <b>Estado del Bot — {self.nombre_dist}</b>\n\n"
            f"Estado: {estado}\n"
            f"⏱️ Uptime: {self._uptime()}\n"
            f"📋 Sesiones activas: {len(self.upload_sessions)}\n"
        )
        await update.message.reply_text(msg, parse_mode=ParseMode.HTML)

    async def cmd_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        uid = update.message.from_user.id
        m = update.message
        chat_title = getattr(m.chat, "title", None) or getattr(m.chat, "username", "Privado")
        
        asyncio.create_task(asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, m.chat.id, chat_title, uid,
            m.from_user.username or "", m.from_user.first_name or "Usuario"
        ))
        try:
            stats = await asyncio.to_thread(
                self.db.get_stats_vendedor, self.distribuidor_id, uid
            )
            h = stats["historico"]
            mes = stats["mes"]
            msg = (
                f"📊 <b>Tus Estadísticas — {self.nombre_dist}</b>\n\n"
                f"📅 <b>Histórico total:</b>\n"
                f"   • Aprobadas:  {h['aprobadas']}\n"
                f"   • Rechazadas: {h['rechazadas']}\n"
                f"   • Pendientes: {h['pendientes']}\n"
                f"   • Total:      {h['total']}\n\n"
                f"🗓️ <b>Este mes:</b>\n"
                f"   • Aprobadas:  {mes['aprobadas']}\n"
                f"   • Rechazadas: {mes['rechazadas']}\n"
                f"   • Pendientes: {mes['pendientes']}\n"
                f"   • Total:      {mes['total']}"
            )
            await m.reply_text(msg, parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.error(f"Error en /stats: {e}")
            await m.reply_text("❌ Error al obtener estadísticas.")

    async def cmd_ranking(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        try:
            ranking = await asyncio.to_thread(
                self.db.get_ranking_mes, self.distribuidor_id
            )
            if not ranking:
                await update.message.reply_text("📊 No hay datos de ranking aún.")
                return

            msg = f"🏆 <b>RANKING DEL MES — {self.nombre_dist}</b>\n\n"
            for i, entry in enumerate(ranking[:10], 1):
                emoji = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
                msg += (
                    f"{emoji} <b>{entry['vendedor']}</b>\n"
                    f"   ✅ Aprobadas: {entry['aprobadas']}"
                )
                if entry["destacadas"] > 0:
                    msg += f" (🔥 {entry['destacadas']} destacadas)"
                if entry["rechazadas"] > 0:
                    msg += f"\n   ❌ Rechazadas: {entry['rechazadas']}"
                msg += "\n\n"

            await update.message.reply_text(msg, parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.error(f"Error en /ranking: {e}")
            await update.message.reply_text("❌ Error al obtener ranking.")

    async def cmd_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        if not self._is_admin(update.message.from_user.id):
            await update.message.reply_text("❌ Solo el administrador puede usar /reset")
            return
        self.upload_sessions.clear()
        self.active_msgs.clear()
        await update.message.reply_text("✅ Memoria limpiada (reset suave)")
        self.logger.info("Reset ejecutado por admin")

    async def cmd_hardreset(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        if not self._is_admin(update.message.from_user.id):
            await update.message.reply_text("❌ Solo el administrador puede usar /hardreset")
            return
        await update.message.reply_text("🔄 Reiniciando bot...")
        self.logger.warning("Hard reset solicitado por admin")
        await asyncio.sleep(1)
        os._exit(0)

    # ─────────────────────────────────────────────────────────────
    # HANDLER DE FOTOS
    # ─────────────────────────────────────────────────────────────

    async def handle_photo(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message or not update.message.photo:
            self.logger.debug("❌ handle_photo: No hay mensaje o foto")
            return

        chat_id    = update.message.chat.id
        chat_title = getattr(update.message.chat, "title", None) or getattr(update.message.chat, "username", "Privado")
        user_id    = update.message.from_user.id
        username   = update.message.from_user.username or ""
        nombre     = update.message.from_user.first_name or "Usuario"
        msg_id     = update.message.message_id
        file_id    = update.message.photo[-1].file_id

        self.logger.info(f"📸 Foto recibida de {username} (UID: {user_id}) en chat {chat_id}")

        # Registro silencioso del usuario y grupo
        asyncio.create_task(asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, chat_id, chat_title, user_id, username, nombre
        ))

        # Hibernación — no procesar fotos
        if self.bot_hibernating:
            self.logger.debug(f"❌ Foto ignorada (hibernando): {username}")
            return

        # Verificar rol
        rol = await asyncio.to_thread(
            self.db.get_rol, self.distribuidor_id, chat_id, user_id
        )
        self.logger.info(f"👤 Rol de {username}: {rol}")

        if rol == "observador":
            self.logger.debug(f"❌ Foto ignorada — observador: {username}")
            return

        now = time.time()
        session_exists = user_id in self.upload_sessions

        # ── Lógica de ráfaga (múltiples fotos, hasta 5 en 8 segundos) ──
        if session_exists:
            session  = self.upload_sessions[user_id]
            last_t   = session.get("last_photo_time", 0)
            n_photos = len(session.get("photos", []))
            is_burst = (
                now - last_t < 8
                and n_photos < 5
                and session.get("stage") == self.STAGE_WAITING_ID
            )
            if is_burst:
                session["photos"].append({"file_id": file_id, "message_id": msg_id})
                session["last_photo_time"] = now
                self.logger.info(f"📸 Ráfaga: {username} ({n_photos + 1} fotos)")
                return

        # ── Sesiones colgadas o viejas ──
        is_stuck = session_exists and self.upload_sessions[user_id].get("stage") == self.STAGE_WAITING_TYPE
        is_old   = session_exists and (now - self.upload_sessions[user_id].get("last_photo_time", 0) > 8)

        if session_exists and is_stuck:
            old_photos = self.upload_sessions[user_id].get("photos", [])
            if old_photos:
                try:
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text="⚠️ <b>Tu carga anterior quedó incompleta.</b>\nPor favor, <b>reenviá la imagen</b>.",
                        parse_mode=ParseMode.HTML,
                        reply_to_message_id=old_photos[0]["message_id"],
                    )
                except Exception:
                    pass

        # ── Nueva sesión ──
        self.upload_sessions[user_id] = {
            "chat_id":         chat_id,
            "chat_title":      chat_title,
            "vendor_id":       user_id,
            "vendor_name":     nombre,
            "stage":           self.STAGE_WAITING_ID,
            "photos":          [],
            "nro_cliente":     None,
            "tipo_pdv":        None,
            "created_at":      now,
            "last_photo_time": now,
        }
        self.upload_sessions[user_id]["photos"].append({"file_id": file_id, "message_id": msg_id})
        self.logger.info(f"✅ Nueva sesión creada para {username}")

        await asyncio.sleep(0.5)  # Pequeño delay anti-race

        n = len(self.upload_sessions[user_id]["photos"])
        if n > 1:
            texto = f"📸 <b>{n} fotos recibidas.</b> Enviá el <b>NRO CLIENTE</b> (solo números):"
        else:
            texto = "📸 Foto recibida. Enviá el <b>NRO CLIENTE</b> (solo números):"

        try:
            await update.message.reply_text(texto, parse_mode=ParseMode.HTML, reply_to_message_id=msg_id)
            self.logger.info(f"✅ Respuesta enviada pidiendo NRO CLIENTE")
        except Exception as e:
            self.logger.error(f"❌ Error enviando respuesta: {e}")

    # ─────────────────────────────────────────────────────────────
    # HANDLER DE TEXTO (NRO CLIENTE)
    # ─────────────────────────────────────────────────────────────

    async def handle_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message or not update.message.text:
            return

        chat_id    = update.message.chat.id
        chat_title = getattr(update.message.chat, "title", None) or getattr(update.message.chat, "username", "Privado")
        user_id    = update.message.from_user.id
        username   = update.message.from_user.username or ""
        nombre     = update.message.from_user.first_name or "Usuario"
        msg_id     = update.message.message_id
        text       = update.message.text.strip()

        asyncio.create_task(asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, chat_id, chat_title, user_id, username, nombre
        ))

        if self.bot_hibernating:
            return

        session = self.upload_sessions.get(user_id)
        if not session:
            return

        if session.get("stage") != self.STAGE_WAITING_ID:
            return

        # Limpiar y validar número
        clean = text.lower().replace("cliente", "").replace("#", "").replace("nro", "").strip()
        if not clean.isnumeric():
            await update.message.reply_text(
                "⚠️ Por favor, enviá <b>solo números</b> para el NRO CLIENTE.",
                parse_mode=ParseMode.HTML,
                reply_to_message_id=msg_id,
            )
            return

        session["nro_cliente"] = clean
        session["stage"] = self.STAGE_WAITING_TYPE

        # Botones de tipo PDV (de la lista editable)
        botones = [
            InlineKeyboardButton(t, callback_data=f"TYPE_{''.join(c for c in t if c.isalnum()).upper()}_{user_id}")
            for t in PDV_TYPES
        ]
        keyboard = [botones[i:i+2] for i in range(0, len(botones), 2)]

        try:
            await update.message.reply_text(
                f"✅ NRO CLIENTE: <code>{clean}</code>\n\n"
                f"Seleccioná el <b>tipo de PDV</b>:",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
        except Exception as e:
            self.logger.error(f"Error enviando botones: {e}")
            del self.upload_sessions[user_id]

    # ─────────────────────────────────────────────────────────────
    # CALLBACK — TIPO PDV seleccionado
    # ─────────────────────────────────────────────────────────────

    async def button_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.callback_query:
            return
        q = update.callback_query
        await q.answer()

        data = q.data
        uid  = q.from_user.id

        if not data.startswith("TYPE_"):
            return

        parts = data.split("_")
        if len(parts) < 3:
            await q.answer("⚠️ Datos inválidos.", show_alert=True)
            return

        clean_code   = parts[1]
        uploader_id  = int(parts[2])

        if uid != uploader_id:
            await q.answer("❌ Esta no es tu sesión.", show_alert=True)
            return

        session = self.upload_sessions.get(uploader_id)
        if not session or session.get("stage") != self.STAGE_WAITING_TYPE:
            await q.answer("⚠️ Sesión expirada.", show_alert=True)
            return

        # Recuperar nombre legible del tipo de PDV
        tipo_pdv = clean_code
        for t in PDV_TYPES:
            if "".join(c for c in t if c.isalnum()).upper() == clean_code:
                tipo_pdv = t
                break

        session["tipo_pdv"] = tipo_pdv
        nro_cliente    = session["nro_cliente"]
        photos         = session["photos"]
        chat_id        = session["chat_id"]
        chat_title     = session.get("chat_title") or str(chat_id)
        uploader_name  = q.from_user.first_name or "Usuario"

        # ── Eliminar botones INMEDIATAMENTE ──────────────────────────────────
        # UX: los botones desaparecen en < 1 segundo sin esperar la subida a Drive
        _n_pics = len(photos)
        _pics_str = f"{_n_pics} fotos" if _n_pics > 1 else "1 foto"
        try:
            await q.edit_message_text(
                text=(
                    f"✅ NRO CLIENTE: <code>{nro_cliente}</code>\n"
                    f"📍 <b>{tipo_pdv}</b>\n\n"
                    f"⏳ Registrando {_pics_str}..."
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=None,
            )
        except Exception:
            # Si falla el edit de texto, al menos intentar quitar el markup
            try:
                await q.edit_message_reply_markup(reply_markup=None)
            except Exception:
                pass

        # ── Subida y registro ────────────────────────────────────
        procesadas   = 0
        fallidas     = 0
        exhibicion_ids: List[str] = []

        self.logger.info(f"🚀 Iniciando procesamiento de {len(photos)} foto(s)...")

        for photo_data in photos:
            file_id    = photo_data["file_id"]
            ph_msg_id  = photo_data["message_id"]

            try:
                file       = await context.bot.get_file(file_id)
                file_bytes = await file.download_as_bytearray()
                self.logger.info(f"✅ Foto descargada: {len(file_bytes)} bytes")

                filename = (
                    f"{nro_cliente}_{clean_code}_{int(time.time())}.jpg"
                )

                # Subida a Drive en thread
                self.logger.info(f"📤 Subiendo a Drive: {filename}...")
                drive_link = await asyncio.to_thread(
                    self.drive.upload,
                    bytes(file_bytes),
                    filename,
                    self.drive_folder_id,
                    self.nombre_dist,
                    chat_title,
                )

                if drive_link:
                    self.logger.info(f"✅ Foto en Drive: {drive_link[:80]}...")
                    # Registro en SQL
                    try:
                        ex_id = await asyncio.to_thread(
                            self.db.registrar_exhibicion,
                            distribuidor_id=self.distribuidor_id,
                            chat_id=chat_id,
                            vendedor_id=uploader_id,
                            nro_cliente=nro_cliente,
                            tipo_pdv=tipo_pdv,
                            drive_link=drive_link,
                            telegram_msg_id=ph_msg_id,
                            telegram_chat_id=chat_id
                        )
                        self.logger.info(f"✅ Exhibición registrada: ID {ex_id}")
                        exhibicion_ids.append(ex_id)
                        procesadas += 1
                    except Exception as db_err:
                        self.logger.error(f"❌ ERROR REGISTRANDO EN BD: {db_err}")
                        fallidas += 1
                else:
                    self.logger.warning(f"❌ Falló la subida a Drive (drive_link vacío)")
                    fallidas += 1

            except Exception as e:
                self.logger.error(f"❌ ERROR PROCESANDO FOTO: {e}")
                fallidas += 1

        self.logger.info(f"📊 RESUMEN: {procesadas} exitosas, {fallidas} fallidas")

        if procesadas > 0:
            primera_id = exhibicion_ids[0]

            # Historial del cliente en este grupo
            historial = []
            try:
                historial = await asyncio.to_thread(
                    self.db.get_historial_cliente,
                    self.distribuidor_id, chat_id, nro_cliente, 5
                )
            except Exception:
                pass

            # Stats y racha del vendedor
            stats = {"mes": {}, "historico": {}}
            racha = 0
            try:
                with self.db._conn() as conn:
                    r = conn.execute(
                        """SELECT id_integrante FROM integrantes_grupo
                           WHERE id_distribuidor = ? AND telegram_user_id = ? LIMIT 1""",
                        (self.distribuidor_id, uploader_id)
                    ).fetchone()
                    pk_vend = r[0] if r else None
                if pk_vend:
                    stats = await asyncio.to_thread(
                        self.db.get_stats_vendedor, self.distribuidor_id, pk_vend
                    )
                    racha = await asyncio.to_thread(
                        self.db.get_racha_vendedor, self.distribuidor_id, pk_vend
                    )
            except Exception:
                pass

            mes = stats.get("mes", {})
            racha_text = f"   🔥 Racha: {racha} consecutivas aprobadas\n" if racha >= 2 else ""
            stats_text = (
                f"\n\n📊 <b>Tu mes ({datetime.now(AR_TZ).strftime('%B').capitalize()}):</b>\n"
                f"   ✅ {mes.get('aprobadas', 0)} aprobadas   "
                f"🔥 {mes.get('destacadas', 0)} destacadas\n"
                f"   ❌ {mes.get('rechazadas', 0)} rechazadas   "
                f"⏳ {mes.get('pendientes', 0)} pendientes\n"
                f"   🏆 Puntos: {mes.get('puntos', 0)}   📦 Total: {mes.get('total', 0)}\n"
                f"{racha_text}"
            )

            # Historial del cliente en este PDV
            historial_text = ""
            if historial:
                estado_emoji = {"Aprobado": "✅", "Destacado": "🔥", "Rechazado": "❌", "Pendiente": "⏳"}
                lineas = [
                    f"   • {h['fecha']} — {h['tipo_pdv']} — {estado_emoji.get(h['estado'], '❓')} {h['estado']}"
                    for h in historial
                ]
                historial_text = (
                    f"\n\n📂 <b>Historial en este PDV ({len(historial)} anteriores):</b>\n"
                    + "\n".join(lineas)
                )

            fotos_text = f"📸 <b>{procesadas} fotos subidas</b>\n\n" if procesadas > 1 else ""

            # Obtener link real de Drive
            drive_link_url = ""
            try:
                with self.db._conn() as conn:
                    row = conn.execute(
                        "SELECT url_foto_drive FROM exhibiciones WHERE id_exhibicion = ?", (primera_id,)
                    ).fetchone()
                    if row:
                        drive_link_url = row[0]
            except Exception:
                pass

            foto_line = f"🔗 <a href='{drive_link_url}'>Ver foto en Drive</a>\n" if drive_link_url else ""

            msg_text = (
                f"📋 <b>Exhibición registrada</b>\n\n"
                f"{fotos_text}"
                f"👤 <b>Vendedor:</b> {uploader_name}\n"
                f"🏪 <b>Cliente:</b> {nro_cliente}\n"
                f"📍 <b>Tipo:</b> {tipo_pdv}\n"
                f"{foto_line}"
                f"⏳ <b>Estado:</b> Pendiente de evaluación"
                f"{stats_text}"
                f"{historial_text}"
            )

            sent_msg = await context.bot.send_message(
                chat_id=chat_id,
                text=msg_text,
                parse_mode=ParseMode.HTML,
                reply_to_message_id=photos[0]["message_id"],
            )

            # Guardar referencias Telegram en todas las exhibiciones
            for ex_id in exhibicion_ids:
                await asyncio.to_thread(
                    self.db.update_telegram_refs,
                    ex_id, sent_msg.message_id, chat_id
                )

            # Cache local para sync
            self.active_msgs[sent_msg.message_id] = {
                "exhibicion_id": primera_id,
                "uploader_id":   uploader_id,
                "ref_msg":       photos[0]["message_id"],
            }

            if fallidas > 0:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"⚠️ {fallidas} foto(s) no pudieron registrarse. Si falta alguna, reenviala.",
                )
        else:
            # Todas fallaron
            first_msg = photos[0]["message_id"] if photos else None
            await context.bot.send_message(
                chat_id=chat_id,
                text=(
                    "⚠️ <b>Error de conexión con el servidor.</b>\n\n"
                    f"No se pudo registrar la exhibición, {uploader_name}.\n"
                    "Por favor <b>reenviá la foto</b>."
                ),
                parse_mode=ParseMode.HTML,
                reply_to_message_id=first_msg,
            )

        del self.upload_sessions[uploader_id]

    # ─────────────────────────────────────────────────────────────
    # JOB: Sincronizar evaluaciones de Streamlit → Telegram
    # ─────────────────────────────────────────────────────────────

    async def sync_evaluaciones_job(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        """
        Cada 30s busca exhibiciones evaluadas (desde Streamlit) que no
        tienen el mensaje de Telegram actualizado y lo edita.
        """
        # Heartbeat al monitor de uptime
        if self.monitor:
            self.monitor.heartbeat(self.distribuidor_id, status="running")

        try:
            pendientes = await asyncio.to_thread(
                self.db.get_pendientes_sync, self.distribuidor_id
            )
            if not pendientes:
                return

            self.logger.info(f"🔄 Sincronizando {len(pendientes)} evaluaciones...")

            for ex in pendientes:
                chat_id = ex["telegram_chat_id"]
                msg_id  = ex["telegram_msg_id"]
                estado  = ex["estado"]
                vendedor = ex["vendedor_nombre"]
                cliente  = ex["nro_cliente"]
                tipo     = ex["tipo_pdv"]
                comentario = ex.get("comentarios") or ""
                supervisor = ex.get("supervisor_nombre") or "Supervisor"

                icon = {"Aprobado": "✅", "Rechazado": "❌", "Destacado": "🔥"}.get(estado, "⏳")

                if estado == "Destacado":
                    estado_text = (
                        "🔥 <b>¡EXHIBICIÓN DESTACADA!</b> 🔥\n"
                        "🚀 ¡Ejecución perfecta!"
                    )
                else:
                    estado_text = f"{icon} <b>{estado}</b> por {supervisor}"

                if comentario:
                    estado_text += f"\n\n📝 <b>Nota:</b> <i>{comentario}</i>"

                msg_text = (
                    f"📋 <b>Exhibición evaluada</b>\n\n"
                    f"👤 <b>Vendedor:</b> {vendedor}\n"
                    f"🏪 <b>Cliente:</b> {cliente}\n"
                    f"📍 <b>Tipo:</b> {tipo}\n\n"
                    f"{estado_text}"
                )

                try:
                    await context.bot.edit_message_text(
                        chat_id=chat_id,
                        message_id=msg_id,
                        text=msg_text,
                        parse_mode=ParseMode.HTML,
                        reply_markup=None,
                    )
                    self.logger.info(f"✅ Mensaje {msg_id} actualizado → {estado}")
                except BadRequest as e:
                    self.logger.warning(f"⚠️ No se pudo editar msg {msg_id}: {e}")
                except Exception as e:
                    self.logger.error(f"❌ Error editando msg {msg_id}: {e}")

                # Marcar como sincronizado (aunque haya fallado — evita bucle infinito en mensajes viejos)
                await asyncio.to_thread(self.db.marcar_synced, ex["id"])

        except Exception as e:
            self.logger.error(f"Error en sync_evaluaciones_job: {e}")

    # ─────────────────────────────────────────────────────────────
    # JOB: Limpiar sesiones expiradas
    # ─────────────────────────────────────────────────────────────

    async def cleanup_sessions_job(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        now = time.time()
        expired = [uid for uid, s in self.upload_sessions.items()
                   if now - s.get("created_at", now) > 600]
        for uid in expired:
            del self.upload_sessions[uid]
        if expired:
            self.logger.info(f"🧹 {len(expired)} sesiones expiradas eliminadas")

    # ─────────────────────────────────────────────────────────────
    # ERROR HANDLER
    # ─────────────────────────────────────────────────────────────

    async def error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        error = context.error
        if isinstance(error, BadRequest):
            self.logger.warning(f"BadRequest ignorado: {error}")
            return

        # ── Instancia duplicada — salida automática ──────────────────────
        err_str = str(error).lower()
        if "conflict" in err_str and "getupdates" in err_str:
            self.logger.critical(
                f"🔴 INSTANCIA DUPLICADA — bot_{self.distribuidor_id} ya está corriendo "
                "en otro proceso. Esta instancia se auto-termina para evitar el conflicto."
            )
            time.sleep(0.3)   # Dar tiempo a que el logger vacíe el buffer
            os._exit(1)
            return
        # ─────────────────────────────────────────────────────────────────

        self.logger.error(f"Error no manejado: {error}", exc_info=True)

    # ─────────────────────────────────────────────────────────────
    # ARRANQUE
    # ─────────────────────────────────────────────────────────────

    async def post_init(self, application: Application) -> None:
        await self._ensure_ready(application.bot)

        # Verificar hibernación al iniciar
        if self._is_hibernation_time():
            self.bot_hibernating = True
            self.logger.warning("🌙 Bot iniciado en horario de hibernación")

        # Configurar menú de comandos
        try:
            await application.bot.set_my_commands([
                BotCommand("start",   "Iniciar el bot"),
                BotCommand("help",    "Cómo usar el bot"),
                BotCommand("stats",   "Mis estadísticas"),
                BotCommand("ranking", "Ranking del mes"),
            ])
        except Exception as e:
            self.logger.warning(f"No se pudo configurar menú: {e}")

        await self._notify_admin(
            application,
            f"🚀 <b>{self.nombre_dist} — Bot iniciado</b>\n"
            f"🕐 {datetime.now(AR_TZ).strftime('%H:%M:%S')}\n"
            f"{'🌙 Modo hibernación' if self.bot_hibernating else '✅ Todos los sistemas activos'}"
        )
        self.logger.info(f"🚀 {self.nombre_dist} — Bot online")

    def run(self) -> None:
        """Construye y corre el bot (bloqueante)."""
        if not self.token:
            raise ValueError("Token de bot vacío")

        app = ApplicationBuilder().token(self.token).build()

        # Comandos
        app.add_handler(CommandHandler("start",      self.cmd_start))
        app.add_handler(CommandHandler("help",       self.cmd_help))
        app.add_handler(CommandHandler("id",         self.cmd_id))
        app.add_handler(CommandHandler("status",     self.cmd_status))
        app.add_handler(CommandHandler("stats",      self.cmd_stats))
        app.add_handler(CommandHandler("ranking",    self.cmd_ranking))
        app.add_handler(CommandHandler("reset",      self.cmd_reset))
        app.add_handler(CommandHandler("hardreset",  self.cmd_hardreset))

        # Foto y texto
        app.add_handler(MessageHandler(filters.PHOTO, self.handle_photo))
        app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_text))

        # Callbacks (solo selección de tipo PDV — sin evaluación)
        app.add_handler(CallbackQueryHandler(self.button_callback, pattern="^TYPE_"))

        # Error handler
        app.add_error_handler(self.error_handler)

        # Jobs periódicos
        app.job_queue.run_repeating(self.sync_evaluaciones_job, interval=30, first=10)
        app.job_queue.run_repeating(self.cleanup_sessions_job,  interval=300, first=60)

        # Jobs de hibernación (22:00-06:00 Argentina)
        from datetime import time as dt_time
        app.job_queue.run_daily(
            lambda ctx: asyncio.create_task(self._start_hibernation(ctx)),
            time=dt_time(22, 0, tzinfo=AR_TZ),
            name="hibernation_start",
        )
        app.job_queue.run_daily(
            lambda ctx: asyncio.create_task(self._end_hibernation(ctx)),
            time=dt_time(6, 0, tzinfo=AR_TZ),
            name="hibernation_end",
        )

        app.post_init = self.post_init

        self.logger.info(f"🤖 Iniciando polling: {self.nombre_dist}")
        app.run_polling()


# ═══════════════════════════════════════════════════════════════════
# ENTRY POINT (un solo bot)
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    # En Windows, ProactorEventLoop falla cuando el proceso no tiene consola
    # (ej: lanzado desde una GUI como Flet). SelectorEventLoop funciona en todos los contextos.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    parser = argparse.ArgumentParser(description="CenterMind — Bot Worker")
    parser.add_argument(
        "--distribuidor-id", type=int, required=True,
        help="ID del distribuidor en la base de datos"
    )
    args = parser.parse_args()

    # ── Verificar instancia única ─────────────────────────────────────────
    _startup_log  = get_logger(f"Bot-{args.distribuidor_id}")
    _lock_file    = acquire_instance_lock(args.distribuidor_id, _startup_log)
    if _lock_file is None:
        # Otra instancia activa → salir silenciosamente (el error ya fue logueado)
        sys.exit(1)
    # Registrar limpieza del lock al salir (funciona con exit() normal y excepciones;
    # NOT con os._exit() ni SIGKILL, pero esos casos los cubre el PID check al arrancar)
    atexit.register(release_instance_lock, _lock_file)
    # ─────────────────────────────────────────────────────────────────────

    worker = BotWorker(distribuidor_id=args.distribuidor_id)
    worker.run()