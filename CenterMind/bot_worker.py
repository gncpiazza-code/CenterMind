# -*- coding: utf-8 -*-
# file: CenterMind/bot_worker.py
"""
Bot de Telegram por distribuidor.
- Solo carga exhibiciones (sin evaluación en chat)
- Evaluación desde la app React / NextJS
- Edita mensajes cuando se evalúa (sync job)
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
# Google Drive imports eliminados — fotos van a Supabase Storage
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


# ═══════════════════════════════════════════════════════════════════
# BASE DE DATOS
# ═══════════════════════════════════════════════════════════════════

class Database:
    """Interfaz SQLite para CenterMind."""

    def __init__(self, db_path: Path = DB_PATH):
        self.logger = get_logger("Database")
        try:
            from db import sb
            self.sb = sb
        except ImportError as e:
            self.logger.error(f"Error importing Supabase client: {e}")
            self.sb = None

    # ── Distribuidores ──────────────────────────────────────────────

    def get_distribuidor(self, distribuidor_id: int) -> Optional[Dict]:
        res = self.sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, id_carpeta_drive, estado, admin_telegram_id, estado_operativo, motivo_bloqueo").eq("id_distribuidor", distribuidor_id).execute()
        if res.data:
            d = res.data[0]
            return {
                "id": d["id_distribuidor"],
                "nombre": d["nombre_empresa"],
                "token_bot": d["token_bot"],
                "drive_folder_id": d["id_carpeta_drive"],
                "estado": d["estado"],
                "admin_telegram_id": d["admin_telegram_id"],
                "estado_operativo": d.get("estado_operativo", "Activo"),
                "motivo_bloqueo": d.get("motivo_bloqueo")
            }
        return None

    def get_all_distribuidores_activos(self) -> List[Dict]:
        res = self.sb.table("distribuidores").select("id_distribuidor, nombre_empresa, token_bot, id_carpeta_drive, estado, admin_telegram_id").eq("estado", "activo").execute()
        out = []
        for d in res.data:
            out.append({
                "id": d["id_distribuidor"],
                "nombre": d["nombre_empresa"],
                "token_bot": d["token_bot"],
                "drive_folder_id": d["id_carpeta_drive"],
                "estado": d["estado"],
                "admin_telegram_id": d["admin_telegram_id"]
            })
        return out

    # ── Grupos ──────────────────────────────────────────────────────

    def upsert_grupo(self, distribuidor_id: int, chat_id: int, chat_title: str) -> None:
        """Registra o actualiza el nombre del grupo de Telegram."""
        try:
            self.sb.table("grupos").upsert({
                "telegram_chat_id": chat_id,
                "id_distribuidor": distribuidor_id,
                "nombre_grupo": chat_title
            }, on_conflict="telegram_chat_id").execute()
        except Exception as e:
            self.logger.error(f"Error en upsert_grupo: {e}")

    # ── Integrantes / Roles ─────────────────────────────────────────

    def get_rol(self, distribuidor_id: int, chat_id: int, user_id: int) -> str:
        res = self.sb.table("integrantes_grupo").select("rol_telegram").eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).execute()
        return res.data[0]["rol_telegram"] if res.data else "vendedor"

    def get_rol_global(self, distribuidor_id: int, user_id: int) -> Optional[str]:
        res = self.sb.table("integrantes_grupo").select("rol_telegram").eq("id_distribuidor", distribuidor_id).eq("telegram_user_id", user_id).limit(1).execute()
        return res.data[0]["rol_telegram"] if res.data else None

    def upsert_integrante(
        self, distribuidor_id: int, chat_id: int, user_id: int,
        username: str, nombre: str, rol: str = "vendedor"
    ) -> None:
        res = self.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).limit(1).execute()
        if res.data:
            self.sb.table("integrantes_grupo").update({"nombre_integrante": nombre}).eq("id_integrante", res.data[0]["id_integrante"]).execute()
        else:
            self.sb.table("integrantes_grupo").insert({
                "id_distribuidor": distribuidor_id,
                "telegram_group_id": chat_id,
                "telegram_user_id": user_id,
                "nombre_integrante": nombre,
                "rol_telegram": rol
            }).execute()

    def set_rol(self, distribuidor_id: int, chat_id: int, user_id: int, rol: str) -> None:
        self.sb.table("integrantes_grupo").update({"rol_telegram": rol}).eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).execute()

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
    ) -> dict:
        """Registra una exhibición vía RPC con soporte de cuarentena (PASO 5).
        Retorna: {'id_exhibicion': <id>, 'en_cuarentena': <bool>, 'error': <str|None>}
        """
        res = self.sb.rpc("fn_bot_registrar_exhibicion", {
            "p_distribuidor_id": distribuidor_id,
            "p_vendedor_id": vendedor_id,
            "p_nro_cliente": nro_cliente,
            "p_tipo_pdv": tipo_pdv,
            "p_drive_link": drive_link,
            "p_telegram_msg_id": telegram_msg_id,
            "p_telegram_chat_id": telegram_chat_id
        }).execute()
        # La nueva función devuelve un JSON object
        if isinstance(res.data, dict):
            return res.data
        elif isinstance(res.data, list) and res.data:
            return res.data[0]
        return {"id_exhibicion": None, "en_cuarentena": False, "error": "No data returned"}

    def update_telegram_refs(
        self, exhibicion_id: str, telegram_msg_id: int, telegram_chat_id: int
    ) -> None:
        self.sb.table("exhibiciones").update({
            "telegram_msg_id": telegram_msg_id,
            "telegram_chat_id": telegram_chat_id
        }).eq("id_exhibicion", exhibicion_id).execute()

    def get_pendientes_sync(self, distribuidor_id: int) -> List[Dict]:
        res = self.sb.rpc("fn_bot_pendientes_sync", {"p_distribuidor_id": distribuidor_id}).execute()
        return res.data if res.data else []

    def marcar_synced(self, exhibicion_id: str) -> None:
        self.sb.table("exhibiciones").update({"synced_telegram": 1}).eq("id_exhibicion", exhibicion_id).execute()

    def get_stats_vendedor(self, distribuidor_id: int, vendedor_id: int) -> Dict:
        # Identificar PK interna del vendedor por su telegram_user_id
        ig_res = self.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", distribuidor_id).eq("telegram_user_id", vendedor_id).limit(1).execute()
        pk_integrante = ig_res.data[0]["id_integrante"] if ig_res.data else 0

        res = self.sb.rpc("fn_bot_stats_vendedor", {
            "p_distribuidor_id": distribuidor_id,
            "p_vendedor_id": pk_integrante
        }).execute()
        
        mes_actual = {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "pendientes": 0, "total": 0}
        mes_anterior = {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "pendientes": 0, "total": 0}
        
        if res.data:
            for row in res.data:
                if row["rango"] == "mes_actual":
                    mes_actual = row
                elif row["rango"] == "mes_anterior":
                    mes_anterior = row

        def safe(d, key): return d.get(key) or 0

        return {
            "mes_actual": {
                "aprobadas":  safe(mes_actual, "aprobadas"),
                "destacadas": safe(mes_actual, "destacadas"),
                "rechazadas": safe(mes_actual, "rechazadas"),
                "pendientes": safe(mes_actual, "pendientes"),
                "total":      safe(mes_actual, "total"),
                "puntos":     safe(mes_actual, "aprobadas") + safe(mes_actual, "destacadas") * 2,
            },
            "mes_anterior": {
                "aprobadas":  safe(mes_anterior, "aprobadas"),
                "destacadas": safe(mes_anterior, "destacadas"),
                "rechazadas": safe(mes_anterior, "rechazadas"),
                "pendientes": safe(mes_anterior, "pendientes"),
                "total":      safe(mes_anterior, "total"),
                "puntos":     safe(mes_anterior, "aprobadas") + safe(mes_anterior, "destacadas") * 2,
            },
        }

    def get_racha_vendedor(self, distribuidor_id: int, vendedor_id: int) -> int:
        """Racha actual: cuantas exhibiciones consecutivas aprobadas/destacadas."""
        # Get internal id_integrante
        ig_res = self.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", distribuidor_id).eq("telegram_user_id", vendedor_id).limit(1).execute()
        if not ig_res.data:
            return 0
        pk_integrante = ig_res.data[0]["id_integrante"]

        res = self.sb.table("exhibiciones").select("estado").eq("id_distribuidor", distribuidor_id).eq("id_integrante", pk_integrante).in_("estado", ["Aprobado", "Destacado", "Rechazado"]).order("timestamp_subida", desc=True).limit(30).execute()
        
        racha = 0
        if res.data:
            for row in res.data:
                if row["estado"] in ("Aprobado", "Destacado"):
                    racha += 1
                else:
                    break
        return racha

    def get_ranking_mes(self, distribuidor_id: int) -> List[Dict]:
        res = self.sb.rpc("fn_dashboard_ranking", {"p_dist_id": distribuidor_id, "p_periodo": "mes", "p_top": 100}).execute()
        ranking = []
        if res.data:
            for r in res.data:
                ranking.append({
                    "vendedor":   r["vendedor"] or "Sin nombre",
                    "puntos":     r["puntos"],
                    "aprobadas":  r["aprobadas"],
                    "destacadas": r["destacadas"],
                    "rechazadas": r["rechazadas"],
                    "total":      r["aprobadas"] + r["destacadas"] + r["rechazadas"]
                })
        return ranking

    def get_historial_cliente(
        self, distribuidor_id: int, chat_id: int, nro_cliente: str, limit: int = 5
    ) -> List[Dict]:
        res = self.sb.rpc("fn_bot_historial_cliente", {
            "p_distribuidor_id": distribuidor_id,
            "p_chat_id": chat_id,
            "p_nro_cliente": nro_cliente,
            "p_limit": limit
        }).execute()
        
        return res.data if res.data else []

# ═══════════════════════════════════════════════════════════════════
# SUPABASE STORAGE (reemplaza Google Drive)
# ═══════════════════════════════════════════════════════════════════

class SupabaseUploader:
    """Sube fotos a Supabase Storage (bucket público exhibiciones-pdv)."""

    BUCKET = "Exhibiciones-PDV"

    def __init__(self):
        self.logger = get_logger("SupabaseUploader")
        try:
            from db import sb as _sb
            self._sb = _sb
            self.logger.info("✅ SupabaseUploader conectado")
        except Exception as e:
            self._sb = None
            self.logger.error(f"❌ Error conectando Supabase Storage: {e}")

    def upload(
        self,
        file_bytes: bytes,
        filename: str,
        distribuidor_nombre: str,
    ) -> str:
        """
        Sube foto al bucket público y devuelve la URL pública directa.

        Estructura en Storage:
        exhibiciones-pdv/
        └── {distribuidor_nombre}/
            └── {YYYY-MM-DD}/
                └── filename.jpg
        """
        if not self._sb:
            return ""

        date_folder = datetime.now(AR_TZ).strftime("%Y-%m-%d")
        # Limpiar nombre de distribuidora para path seguro
        safe_dist = "".join(c if c.isalnum() or c in "-_ " else "" for c in distribuidor_nombre).strip().replace(" ", "_")
        storage_path = f"{safe_dist}/{date_folder}/{filename}"

        for attempt in range(1, 4):
            try:
                self._sb.storage.from_(self.BUCKET).upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"content-type": "image/jpeg", "upsert": "true"},
                )
                # Construir URL pública
                url = self._sb.storage.from_(self.BUCKET).get_public_url(storage_path)
                self.logger.info(f"✅ Foto subida a Supabase: {filename}")
                return url
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

        self.db      = Database()
        self.storage = SupabaseUploader()

        # Cargar config del distribuidor
        dist = self.db.get_distribuidor(distribuidor_id)
        if not dist:
            raise ValueError(f"Distribuidor {distribuidor_id} no encontrado o inactivo")

        self.token              = dist["token_bot"]
        self.nombre_dist        = dist["nombre"]
        self.admin_telegram_id  = dist.get("admin_telegram_id")
        self.estado_operativo   = dist.get("estado_operativo", "Activo")
        self.motivo_bloqueo     = dist.get("motivo_bloqueo")

        # Estado en memoria
        self.upload_sessions:   Dict[int, Dict[str, Any]] = {}
        self.active_msgs:       Dict[int, Dict[str, Any]] = {}   # msg_id → {exhibicion_id, ...}
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
            # 1. PRIMERO creamos/actualizamos el grupo
            self.db.upsert_grupo(distribuidor_id, chat_id, chat_title)
            # 2. DESPUÉS insertamos al integrante, así la base de datos ya conoce el ID del grupo
            self.db.upsert_integrante(distribuidor_id, chat_id, user_id, username, nombre)
        except Exception as e:
            # Usamos .error para facilitar la depuración si vuelve a fallar
            self.logger.error(f"Error registrando usuario/grupo: {e}")


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
        msg = (
            f"🤖 <b>Estado del Bot — {self.nombre_dist}</b>\n\n"
            f"Estado: ☀️ OPERATIVO 24/7\n"
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
            actual = stats["mes_actual"]
            anterior = stats["mes_anterior"]
            msg = (
                f"📊 <b>Tus Estadísticas — {self.nombre_dist}</b>\n\n"
                f"🗓️ <b>Este mes ({datetime.now(AR_TZ).strftime('%B')}):</b>\n"
                f"   • ✅ Aprobadas:  {actual['aprobadas']}\n"
                f"   • 🔥 Destacadas: {actual['destacadas']}\n"
                f"   • ❌ Rechazadas: {actual['rechazadas']}\n"
                f"   • ⏳ Pendientes: {actual['pendientes']}\n"
                f"   • 📈 Total:      {actual['total']}\n\n"
                f"📅 <b>Mes anterior:</b>\n"
                f"   • ✅ Aprobadas:  {anterior['aprobadas']}\n"
                f"   • 🔥 Destacadas: {anterior['destacadas']}\n"
                f"   • 📈 Total:      {anterior['total']}"
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

        # --- PASO 0: BLOQUEO OPERATIVO ---
        if self.estado_operativo != "Activo":
            motivo = self.motivo_bloqueo or "Consultar con soporte"
            await update.message.reply_text(
                f"⚠️ <b>Carga pausada por disposición de Casa Matriz.</b>\n\n"
                f"Motivo: <i>{motivo}</i>",
                parse_mode=ParseMode.HTML,
                reply_to_message_id=msg_id
            )
            return
        # --------------------------------

        # Registro silencioso del usuario y grupo
        asyncio.create_task(asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, chat_id, chat_title, user_id, username, nombre
        ))



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

                # Subida a Supabase Storage en thread
                self.logger.info(f"📤 Subiendo a Supabase: {filename}...")
                drive_link = await asyncio.to_thread(
                    self.storage.upload,
                    bytes(file_bytes),
                    filename,
                    self.nombre_dist,
                )

                if drive_link:
                    self.logger.info(f"✅ Foto en Supabase: {drive_link[:80]}...")
                    # Registro en SQL (PASO 5: la función ahora devuelve JSON)
                    try:
                        rpc_result = await asyncio.to_thread(
                            self.db.insert_exhibicion,
                            distribuidor_id=self.distribuidor_id,
                            chat_id=chat_id,
                            vendedor_id=uploader_id,
                            nro_cliente=nro_cliente,
                            tipo_pdv=tipo_pdv,
                            drive_link=drive_link,
                            telegram_msg_id=ph_msg_id,
                            telegram_chat_id=chat_id
                        )

                        # PASO 3: Vendedor no mapeado
                        if rpc_result.get("error") == "PENDIENTE_MAPEO":
                            await context.bot.send_message(
                                chat_id=chat_id,
                                text=rpc_result.get("message", "⚠️ Tu usuario no tiene legajo asignado."),
                                parse_mode=ParseMode.HTML,
                                reply_to_message_id=ph_msg_id,
                            )
                            del self.upload_sessions[uploader_id]
                            return

                        ex_id = rpc_result.get("id_exhibicion")
                        en_cuarentena = rpc_result.get("en_cuarentena", False)

                        if ex_id:
                            self.logger.info(f"✅ Exhibición registrada: ID {ex_id} | Cuarentena: {en_cuarentena}")
                            exhibicion_ids.append({"id": ex_id, "en_cuarentena": en_cuarentena})
                            procesadas += 1
                    except Exception as db_err:
                        self.logger.error(f"❌ ERROR REGISTRANDO EN BD: {db_err}")
                        fallidas += 1
                else:
                    self.logger.warning(f"❌ Falló la subida a Supabase (drive_link vacío)")
                    fallidas += 1

            except Exception as e:
                self.logger.error(f"❌ ERROR PROCESANDO FOTO: {e}")
                fallidas += 1

        self.logger.info(f"📊 RESUMEN: {procesadas} exitosas, {fallidas} fallidas")

        if procesadas > 0:
            primera_id = exhibicion_ids[0]["id"]
            en_cuarentena_flag = any(e["en_cuarentena"] for e in exhibicion_ids)

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
            stats = {"mes_actual": {}, "mes_anterior": {}}
            racha = 0
            try:
                # Obtenemos stats directamente usando el telegram_user_id (uploader_id)
                # La función get_stats_vendedor ya se encarga de buscar el id_integrante internamente.
                stats = await asyncio.to_thread(
                    self.db.get_stats_vendedor, self.distribuidor_id, uploader_id
                )
                
                # Para la racha sí necesitamos el PK interno (esto se podría optimizar en el futuro)
                ig_res = self.db.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", self.distribuidor_id).eq("telegram_user_id", uploader_id).limit(1).execute()
                pk_integrante = ig_res.data[0]["id_integrante"] if ig_res.data else 0
                
                if pk_integrante:
                    racha = await asyncio.to_thread(
                        self.db.get_racha_vendedor, self.distribuidor_id, pk_integrante
                    )
            except Exception as e:
                self.logger.error(f"Error cargando stats/racha post-upload: {e}")
                pass

            mes = stats.get("mes_actual", {})
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

            # Link a la foto (ya tenemos la URL de Supabase de la última subida)
            foto_line = f"🔗 <a href='{drive_link}'>Ver foto</a>\n" if drive_link else ""

            estado_label = (
                f"⚠️ <b>Estado: CUARENTENA</b> — Pendiente de validación ERP"
                if en_cuarentena_flag else
                "⏳ <b>Estado:</b> Pendiente de evaluación"
            )

            msg_text = (
                f"📋 <b>Exhibición registrada</b>\n\n"
                f"{fotos_text}"
                f"👤 <b>Vendedor:</b> {uploader_name}\n"
                f"🏪 <b>Cliente:</b> {nro_cliente}\n"
                f"📍 <b>Tipo:</b> {tipo_pdv}\n"
                f"{foto_line}"
                f"{estado_label}"
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
            for ex_data in exhibicion_ids:
                await asyncio.to_thread(
                    self.db.update_telegram_refs,
                    ex_data["id"], sent_msg.message_id, chat_id
                )

            # PASO 6: Mensaje de cuarentena con cuenta regresiva
            if en_cuarentena_flag:
                from datetime import timezone
                now_ar = datetime.now(AR_TZ)
                # Próxima ejecución del ETL → 03:00 AM hora Argentina
                etl_hour = 3
                next_etl = now_ar.replace(hour=etl_hour, minute=0, second=0, microsecond=0)
                if now_ar >= next_etl:
                    next_etl = next_etl.replace(day=next_etl.day + 1)
                delta = next_etl - now_ar
                horas = int(delta.total_seconds() // 3600)
                minutos = int((delta.total_seconds() % 3600) // 60)
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=(
                        f"⚠️ <b>CLIENTE NUEVO DETECTADO.</b> Esta exhibición ha sido puesta en "
                        f"<b>CUARENTENA</b> y se validará al actualizar la base de clientes "
                        f"en <b>{horas}h {minutos}m</b>.\n\n"
                        f"Si te equivocaste de número, ignorá este mensaje y volvé a enviar la foto con el código correcto."
                    ),
                    parse_mode=ParseMode.HTML,
                    reply_to_message_id=photos[0]["message_id"],
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
    # JOB: Sincronizar evaluaciones web → Telegram
    # ─────────────────────────────────────────────────────────────

    async def handle_new_chat_title(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Captura cuando un admin cambia el nombre de un grupo de Telegram en vivo."""
        if not update.message or not update.message.new_chat_title:
            return
        chat_id = update.message.chat.id
        new_title = update.message.new_chat_title
        self.logger.info(f"🔄 Grupo {chat_id} cambió su nombre a: {new_title}")
        
        asyncio.create_task(asyncio.to_thread(
            self.db.upsert_grupo,
            self.distribuidor_id, chat_id, new_title
        ))

    async def sync_evaluaciones_job(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        """
        Cada 30s busca exhibiciones evaluadas que no
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
            f"✅ Bot 24/7 — Todos los sistemas activos"
        )
        self.logger.info(f"🚀 {self.nombre_dist} — Bot online")

    def build_app(self) -> Application:
        """Construye y retorna la app del bot."""
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
        
        # Eventos de grupo
        app.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_TITLE, self.handle_new_chat_title))

        # Callbacks (solo selección de tipo PDV — sin evaluación)
        app.add_handler(CallbackQueryHandler(self.button_callback, pattern="^TYPE_"))

        # Error handler
        app.add_error_handler(self.error_handler)

        # Jobs periódicos
        app.job_queue.run_repeating(self.sync_evaluaciones_job, interval=30, first=10)
        app.job_queue.run_repeating(self.cleanup_sessions_job,  interval=300, first=60)


        app.post_init = self.post_init

        self.logger.info(f"🤖 App construida: {self.nombre_dist}")
        return app


# ═══════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════
# Si se ejecuta este archivo se levantará el bot por polling como testeo rápido.
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    parser = argparse.ArgumentParser(description="CenterMind — Bot Worker")
    parser.add_argument(
        "--distribuidor-id", type=int, required=True,
        help="ID del distribuidor en la base de datos"
    )
    args = parser.parse_args()

    worker = BotWorker(distribuidor_id=args.distribuidor_id)
    app = worker.build_app()
    app.run_polling()