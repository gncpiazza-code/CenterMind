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
from datetime import datetime, timedelta, time as dt_time
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, DefaultDict
from collections import defaultdict
import io

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LinkPreviewOptions,
    ReplyParameters,
    Update,
    BotCommand,
)
from telegram.constants import ParseMode
from telegram.error import BadRequest
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    ChatMemberHandler,
    filters,
)
# Google Drive imports eliminados — fotos van a Supabase Storage
import json
import html

from core.helpers import (
    build_integrante_to_erp_name,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
    resolve_integrante_ids_for_vendor_v2,
)

# Sin preview del enlace .jpg en «Ver foto»
_NO_LINK_PREVIEW = LinkPreviewOptions(is_disabled=True)


def _reply_to_photo(chat_id: int, photo_message_id: int) -> ReplyParameters:
    """Reply a la foto del vendedor (sin quote: emoji solo dispara Quote_text_invalid)."""
    return ReplyParameters(
        message_id=photo_message_id,
        chat_id=chat_id,
    )


async def _send_summary_reply_photo(
    bot,
    chat_id: int,
    text: str,
    photo_message_id: int,
    *,
    registrando_message_id: int | None = None,
    logger=None,
) -> int:
    """Resumen final: reply a la foto, sin preview del .jpg; borra «Registrando…» solo si envió OK."""
    sent_msg_id = None
    for use_reply in (True, False):
        try:
            kwargs: Dict[str, Any] = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": ParseMode.HTML,
                "link_preview_options": _NO_LINK_PREVIEW,
            }
            if use_reply:
                kwargs["reply_parameters"] = _reply_to_photo(chat_id, photo_message_id)
            sent = await bot.send_message(**kwargs)
            sent_msg_id = sent.message_id
            break
        except BadRequest as e:
            if use_reply and logger:
                logger.warning(f"Resumen con reply falló ({e}), reintento sin reply")
            elif not use_reply:
                raise

    if registrando_message_id is not None:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=registrando_message_id)
        except Exception:
            pass
    return sent_msg_id
from core.bot_cliente_cartera import cliente_en_cartera_vendedor

BOT_VALIDACION_CARTERA = os.getenv("BOT_VALIDACION_CARTERA", "0") == "1"
from core.exhibicion_aggregate import (
    EXHIBICION_ROW_COLS,
    aggregate_exhibicion_counts_vendor_scope,
    aggregate_ranking_by_vendor,
    integrante_ids_for_erp_vendors,
)
from core.tenant_tables import tenant_table_name
from core.bot_dynamic_messages import (
    build_objetivos_item_line,
    build_objetivos_message,
    build_ranking_result_message,
    build_stats_message,
    build_upload_estado_label,
    build_upload_foto_line,
    build_upload_fotos_text,
    build_upload_historial_block,
    build_upload_objetivo_badge,
    build_upload_rich_message,
    build_upload_stats_block,
)

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

# Etiquetas cortas para botones Telegram (el texto largo se trunca en pantalla)
PDV_TYPE_BUTTON_LABELS: dict[str, str] = {
    "Comercio sin Ingreso": "Sin ingreso",
    "Comercio con Ingreso": "Con ingreso",
}


def _pdv_type_button_label(tipo: str) -> str:
    return PDV_TYPE_BUTTON_LABELS.get(tipo, tipo[:28])


def build_pdv_type_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Un botón por fila; callback TYPEIDX_{i}_{user_id} (evita parseo frágil)."""
    rows = [
        [
            InlineKeyboardButton(
                _pdv_type_button_label(t),
                callback_data=f"TYPEIDX_{i}_{user_id}",
            )
        ]
        for i, t in enumerate(PDV_TYPES)
    ]
    return InlineKeyboardMarkup(rows)


def build_cartera_blocked_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Botones de cartera: una acción por fila, texto corto."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔄 Corregir NRO", callback_data=f"RETRY_CLIENTE_{user_id}")],
        [InlineKeyboardButton("✅ PDV nuevo", callback_data=f"PDV_NUEVO_{user_id}")],
    ])


def parse_type_callback(data: str) -> tuple[str, int] | None:
    """Resuelve (tipo_pdv, telegram_user_id) desde TYPEIDX_ o TYPE_ legacy."""
    if data.startswith("TYPEIDX_"):
        parts = data.split("_")
        if len(parts) != 3:
            return None
        try:
            idx = int(parts[1])
            uid = int(parts[2])
        except ValueError:
            return None
        if idx < 0 or idx >= len(PDV_TYPES):
            return None
        return PDV_TYPES[idx], uid
    if data.startswith("TYPE_"):
        try:
            prefix, uid_str = data.rsplit("_", 1)
            uid = int(uid_str)
            clean_code = prefix[5:]
        except (ValueError, IndexError):
            return None
        for t in PDV_TYPES:
            if "".join(c for c in t if c.isalnum()).upper() == clean_code:
                return t, uid
    return None


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
# DECORADOR DE REINTENTOS PARA SUPABASE
# ═══════════════════════════════════════════════════════════════════

def retry_supabase(max_retries: int = 3, initial_delay: float = 1.0):
    """
    Decorador para reintentar operaciones de Supabase en caso de errores de red
    o RemoteProtocolError (HTTP2/1.1 protocol issues).
    """
    def decorator(func):
        import functools
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            last_error = None
            delay = initial_delay
            for attempt in range(max_retries):
                try:
                    return func(self, *args, **kwargs)
                except Exception as e:
                    last_error = e
                    err_msg = str(e).lower()
                    # Si es un error de protocolo o conexión, reintentamos
                    is_transient = any(msg in err_msg for msg in [
                        "connectionterminated", 
                        "remoteprotocolerror",
                        "connection closed",
                        "psycopg2.operationalerror",
                        "timed out"
                    ])
                    if not is_transient:
                        raise e
                    
                    self.logger.warning(f"⚠️ Error en {func.__name__} (intento {attempt+1}/{max_retries}): {e}")
                    if attempt < max_retries - 1:
                        time.sleep(delay)
                        delay *= 2
            self.logger.error(f"❌ Falló {func.__name__} tras {max_retries} intentos. Error final: {last_error}")
            raise last_error
        return wrapper
    return decorator


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
    @retry_supabase()
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

    @retry_supabase()
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
    @retry_supabase()
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
    @retry_supabase()
    def get_rol(self, distribuidor_id: int, chat_id: int, user_id: int) -> str:
        res = self.sb.table("integrantes_grupo").select("rol_telegram").eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).execute()
        return res.data[0]["rol_telegram"] if res.data else "vendedor"

    def get_rol_global(self, distribuidor_id: int, user_id: int) -> Optional[str]:
        res = self.sb.table("integrantes_grupo").select("rol_telegram").eq("id_distribuidor", distribuidor_id).eq("telegram_user_id", user_id).limit(1).execute()
        return res.data[0]["rol_telegram"] if res.data else None

    @retry_supabase()
    def upsert_integrante(
        self, distribuidor_id: int, chat_id: int, user_id: int,
        username: str, nombre: str, rol: str = "vendedor",
        id_vendedor_erp: Optional[str] = None
    ) -> None:
        res = self.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).limit(1).execute()
        
        data = {
            "id_distribuidor": distribuidor_id,
            "telegram_group_id": chat_id,
            "telegram_user_id": user_id,
            "nombre_integrante": nombre,
            "rol_telegram": rol
        }
        if id_vendedor_erp:
            data["id_vendedor_erp"] = id_vendedor_erp

        if res.data:
            self.sb.table("integrantes_grupo").update(data).eq("id_integrante", res.data[0]["id_integrante"]).execute()
        else:
            self.sb.table("integrantes_grupo").insert(data).execute()

    def set_rol(self, distribuidor_id: int, chat_id: int, user_id: int, rol: str) -> None:
        self.sb.table("integrantes_grupo").update({"rol_telegram": rol}).eq("id_distribuidor", distribuidor_id).eq("telegram_group_id", chat_id).eq("telegram_user_id", user_id).execute()

    # ── Exhibiciones ────────────────────────────────────────────────
    def _is_cliente_pdv_fk_error(self, err_text: str) -> bool:
        txt = (err_text or "").lower()
        return "exhibiciones_id_cliente_pdv_v2_fkey" in txt or (
            "id_cliente_pdv" in txt and "violates foreign key constraint" in txt
        )

    def _insert_exhibicion_limbo(
        self,
        distribuidor_id: int,
        vendedor_id: int,
        nro_cliente: str,
        tipo_pdv: str,
        drive_link: str,
        telegram_msg_id: Optional[int] = None,
        telegram_chat_id: Optional[int] = None,
    ) -> dict:
        """
        Fallback para clientes recién creados que aún no están en clientes_pdv_v2.
        Inserta la exhibición sin id_cliente_pdv y guarda cliente_sombra_codigo.
        """
        try:
            ig_res = (
                self.sb.table("integrantes_grupo")
                .select("id_integrante")
                .eq("id_distribuidor", distribuidor_id)
                .eq("telegram_user_id", vendedor_id)
                .limit(1)
                .execute()
            )
            if not ig_res.data:
                return {
                    "id_exhibicion": None,
                    "estado_final": None,
                    "id_cliente_pdv": None,
                    "error": "VENDEDOR_NO_REGISTRADO",
                }

            id_integrante = ig_res.data[0]["id_integrante"]
            payload = {
                "id_distribuidor": distribuidor_id,
                "id_integrante": id_integrante,
                "cliente_sombra_codigo": (nro_cliente or "").strip() or None,
                "id_cliente_pdv": None,
                "tipo_pdv": tipo_pdv,
                "url_foto_drive": drive_link,
                "estado": "Pendiente",
                "telegram_msg_id": telegram_msg_id,
                "telegram_chat_id": telegram_chat_id,
            }

            ins = self.sb.table("exhibiciones").insert(payload).execute()
            inserted = ins.data[0] if isinstance(ins.data, list) and ins.data else (ins.data or {})
            ex_id = inserted.get("id_exhibicion")

            if not ex_id:
                latest = (
                    self.sb.table("exhibiciones")
                    .select("id_exhibicion")
                    .eq("id_distribuidor", distribuidor_id)
                    .eq("id_integrante", id_integrante)
                    .eq("url_foto_drive", drive_link)
                    .order("timestamp_subida", desc=True)
                    .limit(1)
                    .execute()
                )
                if latest.data:
                    ex_id = latest.data[0].get("id_exhibicion")

            return {
                "id_exhibicion": ex_id,
                "estado_final": "PENDIENTE",
                "id_cliente_pdv": None,
                "error": None,
            }
        except Exception as e:
            self.logger.error(f"Error fallback limbo exhibicion: {e}")
            return {"id_exhibicion": None, "estado_final": None, "id_cliente_pdv": None, "error": str(e)}

    @retry_supabase()
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
        """Registra una exhibición vía RPC con soporte de revisión (PASO 5/6).
        Retorna: {'id_exhibicion': <id>, 'estado_final': <str>, 'error': <str|None>}
        """
        try:
            res = self.sb.rpc("fn_bot_registrar_exhibicion", {
                "p_distribuidor_id": distribuidor_id,
                "p_vendedor_id": vendedor_id,
                "p_nro_cliente": nro_cliente,
                "p_tipo_pdv": tipo_pdv,
                "p_drive_link": drive_link,
                "p_telegram_msg_id": telegram_msg_id,
                "p_telegram_chat_id": telegram_chat_id
            }).execute()
            
            data = res.data
            if isinstance(data, list) and data:
                data = data[0]

            if isinstance(data, dict):
                return {
                    **data,
                    "error": None
                }
            
            return {"id_exhibicion": None, "estado_final": None, "error": "Formato de respuesta inválido"}

        except Exception as e:
            err = str(e)
            if self._is_cliente_pdv_fk_error(err):
                self.logger.warning(
                    "RPC registrar_exhibicion cayó por FK id_cliente_pdv; "
                    "registrando en modo limbo para reconciliar en próxima ingesta de padrón."
                )
                return self._insert_exhibicion_limbo(
                    distribuidor_id=distribuidor_id,
                    vendedor_id=vendedor_id,
                    nro_cliente=nro_cliente,
                    tipo_pdv=tipo_pdv,
                    drive_link=drive_link,
                    telegram_msg_id=telegram_msg_id,
                    telegram_chat_id=telegram_chat_id,
                )
            self.logger.error(f"Error en RPC registrar_exhibicion: {e}")
            return {"id_exhibicion": None, "estado_final": None, "error": str(e)}

    # ── Perfil tipo PDV (silent mode) ──────────────────────────────
    def _normalize_cliente_code(self, nro_cliente: str) -> str:
        raw = (nro_cliente or "").strip()
        if not raw:
            return ""
        return raw

    def _is_missing_table_error(self, err: Exception) -> bool:
        txt = str(err).lower()
        return "does not exist" in txt or "42p01" in txt or "pdv_tipo_profiles" in txt

    @retry_supabase()
    def get_pdv_tipo_profile(self, distribuidor_id: int, nro_cliente: str) -> Optional[Dict]:
        code = self._normalize_cliente_code(nro_cliente)
        if not code:
            return None
        try:
            res = (
                self.sb.table("pdv_tipo_profiles")
                .select(
                    "id_distribuidor, id_cliente_erp, tipo_pdv_preferido, trust_level, "
                    "confidence, total_observaciones, tipo_counts, updated_at"
                )
                .eq("id_distribuidor", distribuidor_id)
                .eq("id_cliente_erp", code)
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]
            stripped = code.lstrip("0") or code
            if stripped != code:
                res2 = (
                    self.sb.table("pdv_tipo_profiles")
                    .select(
                        "id_distribuidor, id_cliente_erp, tipo_pdv_preferido, trust_level, "
                        "confidence, total_observaciones, tipo_counts, updated_at"
                    )
                    .eq("id_distribuidor", distribuidor_id)
                    .eq("id_cliente_erp", stripped)
                    .limit(1)
                    .execute()
                )
                if res2.data:
                    return res2.data[0]
            return None
        except Exception as e:
            if self._is_missing_table_error(e):
                self.logger.warning("⚠️ Tabla pdv_tipo_profiles no existe aún; fallback a flujo manual.")
                return None
            raise

    def infer_tipo_pdv_for_cliente(self, distribuidor_id: int, nro_cliente: str) -> Dict[str, Any]:
        profile = self.get_pdv_tipo_profile(distribuidor_id, nro_cliente)
        if not profile:
            return {"use_auto": False, "reason": "no_profile"}
        tipo = profile.get("tipo_pdv_preferido")
        trust = (profile.get("trust_level") or "").lower()
        confidence = float(profile.get("confidence") or 0)
        if tipo and trust == "high" and confidence >= 0.75:
            return {"use_auto": True, "tipo_pdv": tipo, "trust_level": trust, "confidence": confidence}
        return {
            "use_auto": False,
            "reason": "low_trust",
            "tipo_pdv_sugerido": tipo,
            "trust_level": trust or "low",
            "confidence": confidence,
        }

    @retry_supabase()
    def upsert_pdv_tipo_observation(
        self,
        distribuidor_id: int,
        nro_cliente: str,
        tipo_pdv: str,
        source: str = "telegram_manual",
    ) -> Optional[Dict]:
        code = self._normalize_cliente_code(nro_cliente)
        if not code or not tipo_pdv:
            return None
        try:
            profile = self.get_pdv_tipo_profile(distribuidor_id, code)
            counts: Dict[str, int] = {}
            if profile and isinstance(profile.get("tipo_counts"), dict):
                counts = {k: int(v or 0) for k, v in profile["tipo_counts"].items()}
            counts[tipo_pdv] = counts.get(tipo_pdv, 0) + 1

            total = sum(counts.values())
            preferido = max(counts.items(), key=lambda kv: kv[1])[0]
            top = counts[preferido]
            confidence = round((top / total), 4) if total > 0 else 0.0
            if total >= 3 and confidence >= 0.75:
                trust_level = "high"
            elif total >= 2 and confidence >= 0.6:
                trust_level = "medium"
            else:
                trust_level = "low"

            payload = {
                "id_distribuidor": distribuidor_id,
                "id_cliente_erp": code,
                "tipo_pdv_preferido": preferido,
                "trust_level": trust_level,
                "confidence": confidence,
                "total_observaciones": total,
                "tipo_counts": counts,
                "last_seen": datetime.now(AR_TZ).isoformat(),
                "source": source,
            }
            res = (
                self.sb.table("pdv_tipo_profiles")
                .upsert(payload, on_conflict="id_distribuidor,id_cliente_erp")
                .execute()
            )
            return (res.data or [None])[0]
        except Exception as e:
            if self._is_missing_table_error(e):
                self.logger.warning("⚠️ Tabla pdv_tipo_profiles no existe; no se actualiza trust_level.")
                return None
            raise

    def update_telegram_refs(
        self, exhibicion_id: str, telegram_msg_id: int, telegram_chat_id: int
    ) -> None:
        self.sb.table("exhibiciones").update({
            "telegram_msg_id": telegram_msg_id,
            "telegram_chat_id": telegram_chat_id
        }).eq("id_exhibicion", exhibicion_id).execute()

    def get_pendientes_sync(self, distribuidor_id: int) -> List[Dict]:
        res = self.sb.rpc("fn_bot_pendientes_sync", {"p_distribuidor_id": distribuidor_id}).execute()
        data = res.data if res.data else []
        if not data:
            return []
            
        try:
            ex_ids = [d["id"] for d in data]
            ex_res = self.sb.table("exhibiciones").select("id_exhibicion, cliente_sombra_codigo, id_cliente_pdv, id_integrante, comentario_evaluacion").in_("id_exhibicion", ex_ids).execute()
            ex_map = {r["id_exhibicion"]: r for r in ex_res.data}
            
            # Fetch ERP names from integrantes_grupo
            ig_ids = list(set(r["id_integrante"] for r in ex_res.data if r.get("id_integrante")))
            ig_map = {}
            if ig_ids:
                ig_res = self.sb.table("integrantes_grupo").select("id_integrante, id_vendedor_v2").in_("id_integrante", ig_ids).execute()
                ig_map = {r["id_integrante"]: r.get("id_vendedor_v2") for r in ig_res.data}
            
            # Fetch seller names from vendedores_v2
            v_ids = list(set(v for v in ig_map.values() if v))
            v_map = {}
            if v_ids:
                v_res = self.sb.table(f"vendedores_v2_d{distribuidor_id}").select("id_vendedor, nombre_erp").in_("id_vendedor", v_ids).execute()
                v_map = {r["id_vendedor"]: r.get("nombre_erp") for r in v_res.data}
                
            # Fetch client names
            client_erp_ids = list(set(r["cliente_sombra_codigo"] for r in ex_res.data if r.get("cliente_sombra_codigo")))
            client_pdv_ids = list(set(r["id_cliente_pdv"] for r in ex_res.data if r.get("id_cliente_pdv")))
            
            c_map_erp = {}
            c_map_pdv = {}
            
            if client_erp_ids or client_pdv_ids:
                # We can query by both if needed, but it's easier to just query all matching either
                query = self.sb.table(f"clientes_pdv_v2_d{distribuidor_id}").select("id_cliente, id_cliente_erp, nombre_razon_social, nombre_fantasia")
                if client_erp_ids and client_pdv_ids:
                    # PostgREST doesn't support OR easily with IN, so we do two queries
                    c_res_erp = self.sb.table(f"clientes_pdv_v2_d{distribuidor_id}").select("id_cliente, id_cliente_erp, nombre_razon_social, nombre_fantasia").in_("id_cliente_erp", client_erp_ids).execute()
                    c_res_pdv = self.sb.table(f"clientes_pdv_v2_d{distribuidor_id}").select("id_cliente, id_cliente_erp, nombre_razon_social, nombre_fantasia").in_("id_cliente", client_pdv_ids).execute()
                    all_clients = (c_res_erp.data or []) + (c_res_pdv.data or [])
                elif client_erp_ids:
                    c_res = self.sb.table(f"clientes_pdv_v2_d{distribuidor_id}").select("id_cliente, id_cliente_erp, nombre_razon_social, nombre_fantasia").in_("id_cliente_erp", client_erp_ids).execute()
                    all_clients = c_res.data or []
                else:
                    c_res = self.sb.table(f"clientes_pdv_v2_d{distribuidor_id}").select("id_cliente, id_cliente_erp, nombre_razon_social, nombre_fantasia").in_("id_cliente", client_pdv_ids).execute()
                    all_clients = c_res.data or []
                    
                for r in all_clients:
                    if r.get("id_cliente_erp"):
                        c_map_erp[str(r["id_cliente_erp"])] = r
                    if r.get("id_cliente"):
                        c_map_pdv[r["id_cliente"]] = r
                
            for d in data:
                ex_data = ex_map.get(d["id"], {})
                
                # Enrich vendedor
                id_int = ex_data.get("id_integrante")
                id_vend = ig_map.get(id_int)
                nombre_erp = v_map.get(id_vend)
                if nombre_erp:
                    d["vendedor_nombre"] = nombre_erp
                    
                # Enrich cliente
                sombra = ex_data.get("cliente_sombra_codigo")
                id_pdv = ex_data.get("id_cliente_pdv")
                
                c_info = None
                if sombra and str(sombra) in c_map_erp:
                    c_info = c_map_erp[str(sombra)]
                elif id_pdv and id_pdv in c_map_pdv:
                    c_info = c_map_pdv[id_pdv]
                    
                if c_info:
                    rs = c_info.get("nombre_razon_social") or ""
                    nf = c_info.get("nombre_fantasia") or ""
                    erp_code = c_info.get("id_cliente_erp") or sombra or id_pdv
                    if rs and nf and rs != nf:
                        d["cliente"] = f"{erp_code} - {rs} ({nf})"
                    elif rs or nf:
                        d["cliente"] = f"{erp_code} - {rs or nf}"
                    else:
                        d["cliente"] = str(erp_code)
                elif sombra:
                    d["cliente"] = str(sombra)
                elif id_pdv:
                    d["cliente"] = str(id_pdv)
                
                # Enrich comentarios if missing
                if not d.get("comentarios"):
                    d["comentarios"] = ex_data.get("comentario_evaluacion")
                    
        except Exception as e:
            # Si falla el enriquecimiento, devolvemos la data original para no romper el flujo
            pass
            
        return data

    def marcar_synced(self, exhibicion_id: str) -> None:
        self.sb.table("exhibiciones").update({"synced_telegram": 1}).eq("id_exhibicion", exhibicion_id).execute()

    def _fetch_exhibiciones(
        self,
        distribuidor_id: int,
        since_iso: str,
        *,
        end_iso: str | None = None,
        integrante_ids: list[int] | None = None,
    ) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            q = (
                self.sb.table("exhibiciones")
                .select(EXHIBICION_ROW_COLS)
                .eq("id_distribuidor", distribuidor_id)
                .gte("timestamp_subida", since_iso)
                .order("timestamp_subida")
                .range(offset, offset + 999)
            )
            if end_iso:
                q = q.lt("timestamp_subida", end_iso)
            if integrante_ids:
                q = q.in_("id_integrante", integrante_ids)
            batch = q.execute().data or []
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
        return rows

    @staticmethod
    def _parse_exhibicion_ts(ts: str) -> datetime:
        try:
            return datetime.fromisoformat(ts)
        except Exception:
            return datetime.min.replace(tzinfo=AR_TZ)

    @retry_supabase()
    def get_stats_vendedor(
        self,
        distribuidor_id: int,
        *,
        telegram_user_id: int | None = None,
        telegram_user_ids: list[int] | None = None,
        telegram_group_id: int | None = None,
        vendor_v2_id: int | None = None,
    ) -> Dict | None:
        """Stats mes actual/anterior con dedup de exhibición lógica (alineado a ranking)."""
        seed_iids: list[int] = []

        if vendor_v2_id is not None:
            # Vendor-scope: todos los integrantes del ERP (varios grupos Telegram → 1 vendedor)
            seed_iids = resolve_integrante_ids_for_vendor_v2(distribuidor_id, vendor_v2_id)
        else:
            uids: list[int] = list(telegram_user_ids or [])
            if telegram_user_id is not None and telegram_user_id not in uids:
                uids.append(telegram_user_id)
            if not uids:
                return None

            ig_q = (
                self.sb.table("integrantes_grupo")
                .select("id_integrante")
                .eq("id_distribuidor", distribuidor_id)
                .in_("telegram_user_id", uids)
            )
            if telegram_group_id is not None:
                ig_q = ig_q.eq("telegram_group_id", telegram_group_id)
            ig_res = ig_q.execute()
            seed_iids = [r["id_integrante"] for r in (ig_res.data or [])]

        if not seed_iids:
            return None

        iid_to_erp = build_integrante_to_erp_name(distribuidor_id)
        iids = integrante_ids_for_erp_vendors(seed_iids, iid_to_erp)
        qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id)

        now = datetime.now(AR_TZ)
        start_mes_actual = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 1:
            prev_y, prev_m = now.year - 1, 12
        else:
            prev_y, prev_m = now.year, now.month - 1
        start_mes_prev = now.replace(year=prev_y, month=prev_m, day=1, hour=0, minute=0, second=0, microsecond=0)

        all_ex = self._fetch_exhibiciones(
            distribuidor_id,
            start_mes_prev.isoformat(),
            integrante_ids=iids,
        )

        def _filter_vendor_rows(ex_rows: list[dict]) -> list[dict]:
            out: list[dict] = []
            for e in ex_rows:
                iid_raw = e.get("id_integrante")
                if iid_raw is None:
                    continue
                try:
                    iid = int(iid_raw)
                except (TypeError, ValueError):
                    continue
                if iid in qa_ids:
                    continue
                vendedor = iid_to_erp.get(iid, "Desconocido")
                if is_exhibicion_qa_display_for_dist(distribuidor_id, vendedor):
                    continue
                out.append(e)
            return out

        ex_actual = _filter_vendor_rows([
            e for e in all_ex
            if self._parse_exhibicion_ts(e.get("timestamp_subida", "")) >= start_mes_actual
        ])
        ex_prev = _filter_vendor_rows([
            e for e in all_ex
            if start_mes_prev <= self._parse_exhibicion_ts(e.get("timestamp_subida", "")) < start_mes_actual
        ])

        counts_actual = aggregate_exhibicion_counts_vendor_scope(ex_actual)
        counts_prev = aggregate_exhibicion_counts_vendor_scope(ex_prev)

        def _pack(c: dict[str, int]) -> dict:
            return {
                "aprobadas": c["aprobadas"],
                "destacadas": c["destacadas"],
                "rechazadas": c["rechazadas"],
                "pendientes": c["pendientes"],
                "total": c["total_logicas"],
                "puntos": c["puntos"],
            }

        return {"mes_actual": _pack(counts_actual), "mes_anterior": _pack(counts_prev)}

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
        return self.get_ranking_periodo(distribuidor_id, "mes")

    @retry_supabase()
    def get_ranking_periodo(self, distribuidor_id: int, periodo: str) -> List[Dict]:
        """
        Calcula el ranking en Python para evitar errores de RPC por cambios de esquema.
        """
        try:
            # 1. Determinar rango de fechas
            now = datetime.now(AR_TZ)
            if periodo == 'hoy':
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
                end_date = None
            elif periodo == 'mes':
                start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
                end_date = None
            elif periodo == 'semana':
                start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
                end_date = None
            elif len(periodo) == 7 and '-' in periodo: # YYYY-MM
                y, m = map(int, periodo.split('-'))
                start_date = f"{y:04d}-{m:02d}-01T00:00:00-03:00"
                if m == 12: next_y, next_m = y + 1, 1
                else: next_y, next_m = y, m + 1
                end_date = f"{next_y:04d}-{next_m:02d}-01T00:00:00-03:00"
            else:
                start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
                end_date = None

            qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id)

            exhibiciones = self._fetch_exhibiciones(
                distribuidor_id, start_date, end_iso=end_date
            )

            # 3. Fetch Integrantes y Sucursales para nombres y unificación
            try:
                res_int = self.sb.table("integrantes_grupo")\
                    .select("id_integrante, id_sucursal_erp")\
                    .eq("id_distribuidor", distribuidor_id).execute()
            except Exception:
                res_int = None

            iid_to_erp = build_integrante_to_erp_name(distribuidor_id)
            
            # Mapas para metadata
            erp_to_suc_id = {}
            if res_int and res_int.data:
                for i in res_int.data:
                    iid_raw = i.get("id_integrante")
                    if iid_raw is not None:
                        try:
                            iid = int(iid_raw)
                            erp_name = iid_to_erp.get(iid)
                            if erp_name and erp_name not in erp_to_suc_id:
                                erp_to_suc_id[erp_name] = i.get("id_sucursal_erp")
                        except (TypeError, ValueError):
                            pass

            res_suc = self.sb.table("sucursales")\
                .select("id_sucursal_erp, nombre_erp")\
                .eq("id_distribuidor", distribuidor_id).execute()
            suc_map = {s["id_sucursal_erp"]: s["nombre_erp"] for s in res_suc.data or []}

            filtered_ex: list[dict] = []
            for e in exhibiciones:
                iid_raw = e.get("id_integrante")
                if iid_raw is None:
                    continue
                try:
                    iid = int(iid_raw)
                except (TypeError, ValueError):
                    continue
                if iid in qa_ids:
                    continue
                vendedor = iid_to_erp.get(iid, "Desconocido")
                if is_exhibicion_qa_display_for_dist(distribuidor_id, vendedor):
                    continue
                filtered_ex.append(e)

            stats = aggregate_ranking_by_vendor(filtered_ex, iid_to_erp)

            # 5. Formatear ranking
            ranking = []
            for vendedor, s in stats.items():
                suc_id = erp_to_suc_id.get(vendedor)
                ranking.append({
                    "vendedor":   vendedor,
                    "sucursal":   suc_map.get(suc_id, "S/D"),
                    "puntos":     s["puntos"],
                    "aprobadas":  s["aprobadas"],
                    "destacadas": s["destacadas"],
                    "rechazadas": s["rechazadas"]
                })

            ranking.sort(key=lambda x: (x["puntos"], x["aprobadas"]), reverse=True)
            return ranking[:100]

        except Exception as e:
            # fn_dashboard_ranking (RPC legacy) fue deprecado — ver arquitectura.md §exhibicion_logica.
            # No hacer fallback al RPC: su lógica no garantiza dedup lógico y puede dar rankings distintos.
            self.logger.error(
                f"get_ranking_periodo dist={distribuidor_id} periodo={periodo} falló: {e}. "
                "RPC fn_dashboard_ranking no se usa como fallback (deprecado)."
            )
            raise

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

    def lookup_soto_intercept(
        self, distribuidor_id: int, uploader_tuid: int, id_cliente_erp: str
    ) -> Optional[Dict]:
        """
        Interceptor de franquiciados.
        Si el par (distribuidor, uploader, cliente) está en matcheo_rutas_excepciones,
        devuelve {'telegram_user_id_real': ..., 'nombre_vendedor_real': ...}.
        Retorna None si no hay intercepción o si la tabla no existe aún.
        """
        try:
            res = self.sb.table("matcheo_rutas_excepciones") \
                .select("telegram_user_id_real, nombre_vendedor_real") \
                .eq("id_distribuidor", distribuidor_id) \
                .eq("telegram_user_id_franquiciado", uploader_tuid) \
                .eq("id_cliente_erp", id_cliente_erp) \
                .limit(1).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            self.logger.warning(f"⚠️ lookup_soto_intercept no disponible: {e}")
        return None

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

    STAGE_WAITING_ID         = "WAITING_ID"
    STAGE_WAITING_ID_BLOCKED = "WAITING_ID_BLOCKED"
    STAGE_WAITING_TYPE       = "WAITING_TYPE"

    # Diccionario manual para evitar problemas de locale en diferentes SO
    MESES = {
        1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
        5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
        9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
    }

    def __init__(self, distribuidor_id: int, monitor=None, ws_manager=None):
        self.distribuidor_id = distribuidor_id
        self.ws_manager      = ws_manager
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
        self.application:       Application | None = None  # se inicializa en post_init

        self.logger.info(f"✅ BotWorker listo para: {self.nombre_dist}")

    # ─────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────

    async def _check_compliance(self, update: Update) -> bool:
        """
        Verifica en tiempo real si el Tenant está bloqueado.
        Si está bloqueado, responde al usuario y retorna False.
        """
        try:
            # Consultar estado fresco de la DB
            res = self.db.sb.table("distribuidores").select("estado_operativo, motivo_bloqueo").eq("id_distribuidor", self.distribuidor_id).execute()
            if res.data:
                d = res.data[0]
                self.estado_operativo = d.get("estado_operativo", "Activo")
                self.motivo_bloqueo = d.get("motivo_bloqueo")
            
            if self.estado_operativo != "Activo" and update.effective_message:
                motivo = self.motivo_bloqueo or "Consultar con soporte"
                await update.effective_message.reply_text(
                    self._msg("compliance_blocked", motivo=motivo),
                    parse_mode=ParseMode.HTML,
                )
                return False
        except Exception as e:
            self.logger.error(f"Error en check_compliance: {e}")
        return True

    def _msg(self, key: str, *, fallback: str | None = None, **variables) -> str:
        from core.bot_messages import resolve_bot_message
        return resolve_bot_message(
            self.db.sb,
            key,
            fallback=fallback,
            nombre_dist=self.nombre_dist,
            **variables,
        )

    def _uptime(self) -> str:
        return str(timedelta(seconds=int(time.time() - self.start_time)))

    def _is_admin(self, user_id: int) -> bool:
        if self.admin_telegram_id and str(user_id) == str(self.admin_telegram_id):
            return True
        return False

    def _can_reset_session(self, user_id: int) -> bool:
        """Admin siempre; en dist Test + validación cartera cualquier vendedor (QA local)."""
        if self._is_admin(user_id):
            return True
        if BOT_VALIDACION_CARTERA and self.distribuidor_id == 1:
            return True
        return False

    UPLOAD_SESSION_TTL_SECS = 600

    def _upload_session_get(self, user_id: int) -> dict | None:
        """Memoria + Supabase (sobrevive redeploy de la API)."""
        sess = self.upload_sessions.get(user_id)
        if sess is not None:
            return sess
        from core.bot_upload_session_store import load_upload_session

        loaded = load_upload_session(self.distribuidor_id, user_id)
        if loaded:
            self.upload_sessions[user_id] = loaded
        return loaded

    async def _upload_session_save(self, user_id: int) -> None:
        sess = self.upload_sessions.get(user_id)
        if not sess:
            return
        from core.bot_upload_session_store import save_upload_session

        await asyncio.to_thread(
            save_upload_session,
            self.distribuidor_id,
            user_id,
            sess,
            ttl_secs=self.UPLOAD_SESSION_TTL_SECS,
        )

    async def _upload_session_delete(self, user_id: int) -> None:
        self.upload_sessions.pop(user_id, None)
        from core.bot_upload_session_store import delete_upload_session

        await asyncio.to_thread(
            delete_upload_session, self.distribuidor_id, user_id
        )

    @staticmethod
    def _text_looks_like_nro_cliente(text: str) -> bool:
        clean = (
            text.lower()
            .replace("cliente", "")
            .replace("#", "")
            .replace("nro", "")
            .strip()
        )
        return bool(clean) and clean.isnumeric()

    async def _registrar_pdv_pendiente_aviso(
        self,
        session: dict,
        ex_id: int,
        nro_cliente: str,
        chat_id: int,
        uploader_id: int,
    ) -> None:
        if not session.get("pdv_nuevo_declarado"):
            return
        try:
            await asyncio.to_thread(
                self.db.sb.table("bot_pdv_pendiente_aviso").insert({
                    "id_distribuidor": self.distribuidor_id,
                    "id_exhibicion": ex_id,
                    "id_cliente_erp": nro_cliente,
                    "id_vendedor_v2": session.get("_vendedor_v2_id"),
                    "telegram_chat_id": chat_id,
                    "telegram_user_id": uploader_id,
                }).execute
            )
            self.logger.info(f"[PDVNuevo] Pendiente aviso creado para exhibición {ex_id}")
        except Exception as e_pend:
            self.logger.warning(f"[PDVNuevo] No se pudo insertar pendiente aviso: {e_pend}")

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

    def _register_user_and_group(self, distribuidor_id, chat_id, chat_title, user_id, username, nombre) -> bool:
        """Actualiza la información del usuario y del grupo en la base de datos."""
        try:
            # 1. PRIMERO creamos/actualizamos el grupo
            self.db.upsert_grupo(distribuidor_id, chat_id, chat_title)
            
            # 2. Buscamos si el grupo tiene un id_vendedor_erp asignado
            res_grupo = self.db.sb.table("grupos").select("id_vendedor_erp").eq("telegram_chat_id", chat_id).execute()
            id_vendedor_erp = res_grupo.data[0].get("id_vendedor_erp") if res_grupo.data else None
            
            # 3. DESPUÉS insertamos al integrante, pasando el mapeo si existe
            self.db.upsert_integrante(distribuidor_id, chat_id, user_id, username, nombre, id_vendedor_erp=id_vendedor_erp)
            self.logger.debug(f"✅ Registro exitoso: {nombre} ({user_id}) en {chat_id}")
            return True
        except Exception as e:
            self.logger.error(f"❌ Error registrando usuario/grupo: {e}")
            return False


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
            self._msg("start"),
            parse_mode=ParseMode.HTML,
        )

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        text = self._msg("help")
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
        if not await self._check_compliance(update):
            return
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

        if not await self._check_compliance(update):
            return

        try:
            # REGLAS ESPECIALES DIST 3 (MARZO AUDIT)
            EXCLUDE_UIDS = [9001156] if self.distribuidor_id == 3 else []
            LUCIANO_UIDS = [6823099488, 9000005, 9000202] if self.distribuidor_id == 3 else []

            if uid in EXCLUDE_UIDS:
                await m.reply_text(self._msg("stats_account_disabled"), parse_mode=ParseMode.HTML)
                return

            now = datetime.now(AR_TZ)
            prev_m = 12 if now.month == 1 else now.month - 1

            # ── Misma resolución que /objetivos (grupo → integrantes → no el remitente) ──
            group_vid, vendor_name = await asyncio.to_thread(
                self._resolve_vendor_for_group_command,
                self.distribuidor_id,
                m.chat.id,
                uid,
            )
            stats = None
            if uid in LUCIANO_UIDS:
                display_name = "LUCIANO ITURRIA"
            elif vendor_name:
                display_name = vendor_name
            else:
                display_name = m.from_user.first_name or "Vendedor"

            if group_vid is not None:
                stats = await asyncio.to_thread(
                    self.db.get_stats_vendedor,
                    self.distribuidor_id,
                    vendor_v2_id=group_vid,
                )

            if not stats and group_vid is None:
                related_uids = LUCIANO_UIDS if uid in LUCIANO_UIDS else [uid]
                stats = await asyncio.to_thread(
                    self.db.get_stats_vendedor,
                    self.distribuidor_id,
                    telegram_user_ids=related_uids,
                    telegram_group_id=m.chat.id,
                )
                if uid in LUCIANO_UIDS:
                    display_name = "LUCIANO ITURRIA"
                else:
                    display_name = m.from_user.first_name or "Vendedor"

            if not stats:
                hint = (
                    "Usá /vincular para asignar un vendedor a este grupo."
                    if group_vid is not None
                    else "Contactá al supervisor o usá /vincular en este grupo."
                )
                await m.reply_text(self._msg("stats_no_data", hint=hint), parse_mode=ParseMode.HTML)
                return

            counts_actual = {
                **stats["mes_actual"],
                "total_logicas": stats["mes_actual"]["total"],
            }
            counts_prev = {
                **stats["mes_anterior"],
                "total_logicas": stats["mes_anterior"]["total"],
            }

            ranking_pos: int | None = None
            ranking_total = 0
            ranking_delta = 0
            ranking_name = display_name
            if group_vid is not None:
                try:
                    t_vend = tenant_table_name("vendedores_v2", self.distribuidor_id)
                    v_info = (
                        self.db.sb.table(t_vend)
                        .select("nombre_erp")
                        .eq("id_distribuidor", self.distribuidor_id)
                        .eq("id_vendedor", group_vid)
                        .limit(1)
                        .execute()
                    )
                    if v_info.data and v_info.data[0].get("nombre_erp"):
                        ranking_name = v_info.data[0]["nombre_erp"]
                except Exception:
                    pass
            try:
                from core.bot_ranking_delta import find_ranking_position, ranking_with_deltas
                ranking_data = await asyncio.to_thread(
                    ranking_with_deltas, self.db.sb, self.distribuidor_id
                )
                ranking_pos, ranking_total, ranking_delta = find_ranking_position(
                    ranking_data, ranking_name
                )
            except Exception:
                pass

            msg = build_stats_message(
                self.db.sb,
                nombre_dist=self.nombre_dist,
                display_name=display_name,
                mes_actual_nombre=self.MESES[now.month],
                mes_anterior_nombre=self.MESES[prev_m],
                counts_actual=counts_actual,
                counts_prev=counts_prev,
                ranking_pos=ranking_pos,
                ranking_total=ranking_total,
                ranking_delta=ranking_delta,
            )
            await m.reply_text(msg, parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.error(f"[stats] Error uid={uid} dist={self.distribuidor_id}: {type(e).__name__}: {e}", exc_info=True)
            await m.reply_text(self._msg("stats_error"), parse_mode=ParseMode.HTML)

    async def cmd_vincular(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Vincula el grupo actual a un vendedor ERP."""
        if not update.message:
            return
        m = update.message
        chat_id = m.chat.id
        dist_id = self.distribuidor_id

        # Solo funciona en grupos
        if m.chat.type not in ("group", "supergroup"):
            await m.reply_text(self._msg("vincular_solo_grupo"))
            return

        await m.reply_text(self._msg("vincular_buscando"))

        try:
            from core.telegram_group_matcher import score_group_vendor_candidates, apply_group_binding

            candidates = await asyncio.to_thread(
                score_group_vendor_candidates, dist_id, chat_id
            )

            if not candidates:
                await m.reply_text(self._msg("vincular_sin_candidatos"))
                return

            top = candidates[:5]

            # Semi-auto: un solo candidato con score >= 0.95
            if len(top) == 1 and top[0]["score"] >= 0.95:
                cand = top[0]
                keyboard = InlineKeyboardMarkup([[
                    InlineKeyboardButton("✅ Sí, confirmar", callback_data=f"VINCULAR_CONFIRM_{chat_id}_{cand['id_vendedor']}"),
                    InlineKeyboardButton("❌ No", callback_data=f"VINCULAR_CANCEL_{chat_id}"),
                ]])
                await m.reply_text(
                    self._msg(
                        "vincular_confirm_auto",
                        nombre_erp=cand["nombre_erp"],
                        confianza=int(cand["score"] * 100),
                    ),
                    parse_mode=ParseMode.HTML,
                    reply_markup=keyboard,
                )
                return

            # Varios candidatos: mostrar lista
            buttons = []
            for c in top:
                label = f"{c['nombre_erp']} ({int(c['score']*100)}%)"
                buttons.append([InlineKeyboardButton(
                    label,
                    callback_data=f"VINCULAR_CONFIRM_{chat_id}_{c['id_vendedor']}"
                )])
            buttons.append([InlineKeyboardButton("❌ Cancelar", callback_data=f"VINCULAR_CANCEL_{chat_id}")])

            await m.reply_text(
                self._msg("vincular_select_list"),
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(buttons),
            )
        except Exception as e:
            self.logger.error(f"[vincular] Error chat={chat_id}: {e}", exc_info=True)
            await m.reply_text(self._msg("vincular_error"))

    async def cmd_ranking(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        
        if not await self._check_compliance(update):
            return
        # Generar botones para los últimos 3 meses
        from datetime import datetime
        buttons = []
        now = datetime.now(AR_TZ)
        for i in range(3):
            # Restamos meses de forma simple (para ranking de los últimos 3)
            m = now.month - i
            y = now.year
            if m <= 0:
                m += 12
                y -= 1
            
            month_name = self.MESES[m]
            # Callback data: RANKING_<month>_<year>_<user_id>
            buttons.append([InlineKeyboardButton(f"📊 {month_name} {y}", callback_data=f"RANKING_{m}_{y}_{update.message.from_user.id}")])

        await update.message.reply_text(
            self._msg("ranking_picker"),
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(buttons)
        )

    async def _apply_menu_commands(self) -> None:
        """Llama setMyCommands en este bot con los comandos visibles desde bot_commands."""
        try:
            from core.bot_settings import get_settings_cache
            commands = get_settings_cache().get_visible_menu_commands(self.db.sb)
            tg_cmds = [
                BotCommand(command=c["command"], description=c["menu_description"])
                for c in commands
                if c.get("kind") not in ("admin_only",) and len(c.get("menu_description", "")) > 0
            ]
            if tg_cmds:
                await self.application.bot.set_my_commands(tg_cmds)
                self.logger.info(f"[menu] {self.nombre_dist}: {len(tg_cmds)} comandos configurados desde bot_commands")
        except Exception as e:
            self.logger.warning(f"[menu] No se pudo configurar menú desde bot_commands: {e}")

    async def cmd_cartera(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        force_mode: str | None = None,
    ) -> None:
        """Envía PDF de cartera del vendedor. Si force_mode='hoy' envía directo sin botones."""
        if not update.message:
            return
        m = update.message
        chat_id = m.chat.id

        if not await self._check_compliance(update):
            return

        vid, _ = await asyncio.to_thread(
            self._resolve_vendor_for_group_command,
            self.distribuidor_id,
            chat_id,
            m.from_user.id,
        )
        if vid is None:
            await m.reply_text(self._msg("vendor_not_linked"), parse_mode=ParseMode.HTML)
            return

        if force_mode:
            await self._send_cartera_pdf(update, context, vid, force_mode)
            return

        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("📅 Hoy", callback_data=f"CARTERA_HOY_{chat_id}_{vid}"),
                InlineKeyboardButton("📋 General", callback_data=f"CARTERA_GENERAL_{chat_id}_{vid}"),
            ]
        ])
        await m.reply_text(
            self._msg("cartera_prompt"),
            parse_mode=ParseMode.HTML,
            reply_markup=keyboard,
        )

    async def _send_cartera_pdf(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        id_vendedor: int,
        mode: str,
        *,
        callback_query=None,
    ) -> None:
        chat_id = update.effective_chat.id
        prompt_msg_id = callback_query.message.message_id if callback_query and callback_query.message else None

        if callback_query and prompt_msg_id:
            try:
                await callback_query.edit_message_text(
                    self._msg("cartera_loading"),
                    parse_mode=ParseMode.HTML,
                    reply_markup=None,
                )
            except Exception:
                pass

        try:
            await context.bot.send_chat_action(chat_id=chat_id, action="upload_document")
            pdf_bytes, snapshot_label = await asyncio.to_thread(
                __import__(
                    "services.bot_cartera_pdf_service",
                    fromlist=["build_cartera_pdf"],
                ).build_cartera_pdf,
                self.db.sb,
                self.distribuidor_id,
                id_vendedor,
                mode,
            )
            from io import BytesIO
            await context.bot.send_document(
                chat_id=chat_id,
                document=BytesIO(pdf_bytes),
                filename=f"cartera_{mode}.pdf",
                caption=f"📋 <b>Cartera {'de hoy' if mode == 'hoy' else 'general'}</b>\n<i>{snapshot_label}</i>",
                parse_mode=ParseMode.HTML,
            )
            if prompt_msg_id:
                try:
                    await context.bot.delete_message(chat_id=chat_id, message_id=prompt_msg_id)
                except Exception:
                    pass
        except Exception as e:
            self.logger.error(f"[cartera] Error generando PDF mode={mode}: {e}", exc_info=True)
            err_text = self._msg("cartera_error")
            try:
                if prompt_msg_id:
                    await context.bot.edit_message_text(
                        chat_id=chat_id,
                        message_id=prompt_msg_id,
                        text=err_text,
                        reply_markup=None,
                    )
                else:
                    await context.bot.send_message(chat_id=chat_id, text=err_text)
            except Exception:
                pass

    async def _handle_cartera_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Maneja callbacks CARTERA_HOY_ y CARTERA_GENERAL_."""
        q = update.callback_query
        if not q:
            return
        await q.answer("⏳ Generando PDF...")
        data = q.data or ""
        try:
            # Formato: CARTERA_HOY_<chat_id>_<vid> o CARTERA_GENERAL_<chat_id>_<vid>
            parts = data.split("_", 3)
            mode = "hoy" if parts[1] == "HOY" else "general"
            vid = int(parts[3])
        except (IndexError, ValueError):
            return
        await self._send_cartera_pdf(update, context, vid, mode, callback_query=q)

    async def cmd_ventas(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Envía PDF de ventas MTD del vendedor."""
        if not update.message:
            return
        m = update.message
        chat_id = m.chat.id

        if not await self._check_compliance(update):
            return

        vid, _ = await asyncio.to_thread(
            self._resolve_vendor_for_group_command,
            self.distribuidor_id,
            chat_id,
            m.from_user.id,
        )
        if vid is None:
            await m.reply_text(self._msg("vendor_not_linked"), parse_mode=ParseMode.HTML)
            return

        await m.reply_text(self._msg("ventas_loading"), parse_mode=ParseMode.HTML)
        try:
            await context.bot.send_chat_action(chat_id=chat_id, action="upload_document")
            from services.bot_ventas_pdf_service import build_ventas_pdf
            pdf_bytes, snapshot_label = await asyncio.to_thread(
                build_ventas_pdf, self.db.sb, self.distribuidor_id, vid
            )
            from io import BytesIO
            now_ar = datetime.now(AR_TZ)
            mes_label = f"{self.MESES[now_ar.month]} {now_ar.year}"
            await context.bot.send_document(
                chat_id=chat_id,
                document=BytesIO(pdf_bytes),
                filename=f"ventas_{now_ar.year}{now_ar.month:02d}.pdf",
                caption=f"📦 <b>Ventas {mes_label}</b>\n<i>{snapshot_label}</i>",
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            self.logger.error(f"[ventas] Error generando PDF: {e}", exc_info=True)
            await m.reply_text(self._msg("ventas_error"))

    async def cmd_cuentas(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Envía PDF de cuentas corrientes del vendedor."""
        if not update.message:
            return
        m = update.message
        chat_id = m.chat.id

        if not await self._check_compliance(update):
            return

        vid, _ = await asyncio.to_thread(
            self._resolve_vendor_for_group_command,
            self.distribuidor_id,
            chat_id,
            m.from_user.id,
        )
        if vid is None:
            await m.reply_text(self._msg("vendor_not_linked"), parse_mode=ParseMode.HTML)
            return

        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("📅 Hoy", callback_data=f"CUENTAS_HOY_{chat_id}_{vid}"),
                InlineKeyboardButton("💳 General", callback_data=f"CUENTAS_GENERAL_{chat_id}_{vid}"),
            ]
        ])
        await m.reply_text(
            self._msg("cuentas_prompt"),
            parse_mode=ParseMode.HTML,
            reply_markup=keyboard,
        )

    async def _handle_cuentas_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Maneja callbacks CUENTAS_HOY_ y CUENTAS_GENERAL_."""
        q = update.callback_query
        if not q:
            return
        await q.answer("⏳ Generando PDF...")
        data = q.data or ""
        try:
            parts = data.split("_", 3)
            modo = "hoy" if parts[1] == "HOY" else "general"
            vid = int(parts[3])
        except (IndexError, ValueError):
            return
        chat_id = update.effective_chat.id
        prompt_msg_id = q.message.message_id if q.message else None

        if prompt_msg_id:
            try:
                await q.edit_message_text(
                    self._msg("cuentas_loading"),
                    parse_mode=ParseMode.HTML,
                    reply_markup=None,
                )
            except Exception:
                pass

        try:
            await context.bot.send_chat_action(chat_id=chat_id, action="upload_document")
            from services.cc_difusion_service import export_cc_pdf_supervision
            pdf_bytes, media_type, filename = await asyncio.to_thread(
                export_cc_pdf_supervision,
                self.distribuidor_id,
                id_vendedor=vid,
                modo=modo,
            )
            from io import BytesIO
            caption = (
                f"💳 <b>CC {'de hoy' if modo == 'hoy' else 'general'}</b>"
            )
            await context.bot.send_document(
                chat_id=chat_id,
                document=BytesIO(pdf_bytes),
                filename=filename,
                caption=caption,
                parse_mode=ParseMode.HTML,
            )
            if prompt_msg_id:
                try:
                    await context.bot.delete_message(chat_id=chat_id, message_id=prompt_msg_id)
                except Exception:
                    pass
        except ValueError as e:
            err = f"⚠️ {e}"
            if prompt_msg_id:
                try:
                    await context.bot.edit_message_text(
                        chat_id=chat_id, message_id=prompt_msg_id, text=err, reply_markup=None,
                    )
                except Exception:
                    await context.bot.send_message(chat_id=chat_id, text=err)
            else:
                await context.bot.send_message(chat_id=chat_id, text=err)
        except Exception as e:
            self.logger.error(f"[cuentas] Error generando PDF: {e}", exc_info=True)
            err_text = self._msg("cuentas_error")
            if prompt_msg_id:
                try:
                    await context.bot.edit_message_text(
                        chat_id=chat_id, message_id=prompt_msg_id, text=err_text, reply_markup=None,
                    )
                except Exception:
                    await context.bot.send_message(chat_id=chat_id, text=err_text)
            else:
                await context.bot.send_message(chat_id=chat_id, text=err_text)

    async def _handle_custom_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Maneja comandos custom de tipo static_media registrados en bot_commands."""
        if not update.message:
            return
        m = update.message
        raw_text = m.text or ""
        cmd_text = raw_text.lstrip("/").split("@")[0].split()[0].lower()
        if not cmd_text:
            return

        if not await self._check_compliance(update):
            return

        try:
            from core.bot_settings import get_settings_cache
            commands = get_settings_cache().list_commands(self.db.sb)
            cmd_row = next(
                (c for c in commands if c.get("command") == cmd_text and c.get("enabled")),
                None,
            )
            if not cmd_row or cmd_row.get("kind") != "static_media":
                return

            caption = (cmd_row.get("caption_html") or "").strip()
            image_path = (cmd_row.get("image_path") or "").strip()

            if image_path:
                try:
                    from io import BytesIO
                    from services.objetivos_notification_service import sanitize_telegram_html

                    raw = self.db.sb.storage.from_("bot-command-assets").download(image_path)
                    photo_bytes = raw if isinstance(raw, (bytes, bytearray)) else b"".join(raw)
                    safe_caption = sanitize_telegram_html(caption) if caption else None
                    await m.reply_photo(
                        photo=BytesIO(photo_bytes),
                        caption=safe_caption or None,
                        parse_mode=ParseMode.HTML if safe_caption else None,
                    )
                    return
                except Exception as e:
                    self.logger.warning(f"[custom_cmd] {cmd_text}: error foto storage: {e}")

            if caption:
                from services.objetivos_notification_service import sanitize_telegram_html
                await m.reply_text(sanitize_telegram_html(caption), parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.warning(f"[custom_cmd] {cmd_text}: {e}")

    def _resolve_group_vendor(self, chat_id: int) -> int | None:
        """Group-first vendor resolution. Llama a helpers.resolve_vendedor_for_group."""
        try:
            from core.helpers import resolve_vendedor_for_group
            return resolve_vendedor_for_group(self.distribuidor_id, chat_id)
        except Exception as e:
            self.logger.warning(f"[group-vendor] chat={chat_id}: {e}")
            return None

    def _resolve_vendor_for_group_command(
        self, dist_id: int, chat_id: int, uid: int
    ) -> tuple[int | None, str | None]:
        """
        Vendedor para comandos de grupo (/stats, /objetivos): misma cadena en ambos.
        1) grupos / FV binding (resolve_vendedor_for_group)
        2) integrantes_grupo del chat (como /objetivos legacy)
        """
        vid = self._resolve_group_vendor(chat_id)
        nombre: str | None = None
        if vid is None:
            row = self._resolve_vendedor_v2_for_objetivos(dist_id, uid, chat_id)
            vid = row.get("id_vendedor_v2")
            nombre = row.get("nombre_integrante")
        if vid is not None:
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            v_info = (
                self.db.sb.table(t_vend)
                .select("nombre_erp")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", vid)
                .limit(1)
                .execute()
            )
            if v_info.data and v_info.data[0].get("nombre_erp"):
                nombre = v_info.data[0]["nombre_erp"]
        return vid, nombre

    def _resolve_vendedor_v2_for_objetivos(self, dist_id: int, uid: int, chat_id: int) -> dict:
        """
        Vendedor para /objetivos: usuario+grupo → cualquier integrante del grupo → ERP en tabla grupos.
        """
        res_uid = (
            self.db.sb.table("integrantes_grupo")
            .select("id_vendedor_v2, nombre_integrante")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_group_id", chat_id)
            .eq("telegram_user_id", uid)
            .limit(1)
            .execute()
        )
        if res_uid.data and res_uid.data[0].get("id_vendedor_v2"):
            return res_uid.data[0]

        res_grp = (
            self.db.sb.table("integrantes_grupo")
            .select("id_vendedor_v2, nombre_integrante")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_group_id", chat_id)
            .not_.is_("id_vendedor_v2", "null")
            .limit(1)
            .execute()
        )
        if res_grp.data and res_grp.data[0].get("id_vendedor_v2"):
            return res_grp.data[0]

        g_res = (
            self.db.sb.table("grupos")
            .select("id_vendedor_erp")
            .eq("telegram_chat_id", chat_id)
            .limit(1)
            .execute()
        )
        erp = (g_res.data or [{}])[0].get("id_vendedor_erp") if g_res.data else None
        if erp:
            v_res = (
                self.db.sb.table(tenant_table_name("vendedores_v2", dist_id))
                .select("id_vendedor, nombre_erp")
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor_erp", str(erp).strip())
                .limit(1)
                .execute()
            )
            if v_res.data:
                return {
                    "id_vendedor_v2": v_res.data[0]["id_vendedor"],
                    "nombre_integrante": v_res.data[0].get("nombre_erp"),
                }
        return {}

    async def cmd_objetivos(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return

        if not await self._check_compliance(update):
            return

        m = update.message
        uid = m.from_user.id
        chat_id = m.chat.id
        dist_id = self.distribuidor_id

        try:
            group_vid, vendedor_nombre = await asyncio.to_thread(
                self._resolve_vendor_for_group_command, dist_id, chat_id, uid
            )
            id_vendedor = group_vid
            if not vendedor_nombre:
                vendedor_nombre = m.from_user.first_name or "Vendedor"

            if not id_vendedor:
                await m.reply_text(self._msg("objetivos_no_vendor"), parse_mode=ParseMode.HTML)
                return

            objetivos_res = await asyncio.to_thread(
                self.db.sb.table("objetivos")
                .select(
                    "id, tipo, descripcion, fecha_objetivo, valor_actual, valor_objetivo, "
                    "cumplido, id_target_pdv, created_at, lanzado_at, origen, mes_referencia, "
                    "tasa_pendientes, desglose_cache"
                )
                .eq("id_distribuidor", dist_id)
                .eq("id_vendedor", id_vendedor)
                .order("fecha_objetivo", desc=False)
                .limit(40)
                .execute
            )
            # Filtrar: solo activos por fecha (excluye vencidos, ruteo y planificados sin lanzar)
            from core.objetivos_filters import objetivo_activo_para_vendedor, hoy_ar
            hoy = hoy_ar()
            objetivos = [o for o in (objetivos_res.data or []) if objetivo_activo_para_vendedor(o, hoy)]

            if not objetivos:
                await m.reply_text(self._msg("objetivos_empty"), parse_mode=ParseMode.HTML)
                return

            obj_ids = [str(o["id"]) for o in objetivos if o.get("id")]
            items_map: dict[str, list[int]] = defaultdict(list)
            if obj_ids:
                for i in range(0, len(obj_ids), 80):
                    chunk_ids = obj_ids[i : i + 80]
                    items_res = await asyncio.to_thread(
                        self.db.sb.table("objetivo_items")
                        .select("id_objetivo, id_cliente_pdv")
                        .in_("id_objetivo", chunk_ids)
                        .execute
                    )
                    for it in items_res.data or []:
                        oid = str(it.get("id_objetivo") or "")
                        cid = it.get("id_cliente_pdv")
                        if oid and cid:
                            items_map[oid].append(int(cid))

            pdv_ids: set[int] = set()
            for o in objetivos:
                oid = str(o.get("id") or "")
                if o.get("id_target_pdv"):
                    pdv_ids.add(int(o["id_target_pdv"]))
                for cid in items_map.get(oid, []):
                    pdv_ids.add(int(cid))

            pdv_map: dict[int, dict[str, Any]] = {}
            if pdv_ids:
                pdv_list = list(pdv_ids)
                for i in range(0, len(pdv_list), 200):
                    chunk_pdv = pdv_list[i : i + 200]
                    pdv_res = await asyncio.to_thread(
                        self.db.sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
                        .select(
                            "id_cliente, id_cliente_erp, id_ruta, nombre_fantasia, nombre_razon_social"
                        )
                        .in_("id_cliente", chunk_pdv)
                        .eq("id_distribuidor", dist_id)
                        .execute
                    )
                    for r in pdv_res.data or []:
                        pdv_map[int(r["id_cliente"])] = r

            ruta_ids = set()
            for r in pdv_map.values():
                rid = r.get("id_ruta")
                if rid is not None and str(rid).strip():
                    try:
                        ruta_ids.add(int(rid))
                    except ValueError:
                        pass
            rutas_map: dict[int, str] = {}
            if ruta_ids:
                rutas_res = await asyncio.to_thread(
                    self.db.sb.table(tenant_table_name("rutas_v2", dist_id))
                    .select("id_ruta, id_ruta_erp, dia_semana")
                    .in_("id_ruta", list(ruta_ids))
                    .execute
                )
                for rr in rutas_res.data or []:
                    rid = int(rr["id_ruta"])
                    rid_erp = rr.get("id_ruta_erp")
                    dia = (rr.get("dia_semana") or "").capitalize()
                    if rid_erp and dia:
                        rutas_map[rid] = f"id {rid} · Ruta ERP {rid_erp} — {dia}"
                    elif rid_erp:
                        rutas_map[rid] = f"id {rid} · Ruta ERP {rid_erp}"
                    elif dia:
                        rutas_map[rid] = f"id {rid} — {dia}"
                    else:
                        rutas_map[rid] = f"id {rid}"

            tipo_label = {
                "exhibicion": "Exhibición",
                "conversion_estado": "Activación",
                "activacion": "Activación",
                "cobranza": "Cobranza",
                "ruteo": "Ruteo",
                "ruteo_alteo": "Alteo",
                "compradores": "Compradores",
            }

            from datetime import date as _date_cls, timezone as _tz_cls

            item_lines: list[str] = []
            shown = 0
            for obj in objetivos:
                shown += 1
                if shown > 8:
                    break
                oid = str(obj.get("id") or "")
                tipo = str(obj.get("tipo") or "").strip().lower()
                tipo_txt = tipo_label.get(tipo, tipo.replace("_", " ").title() or "Objetivo")
                origen = obj.get("origen", "distribuidora")
                origen_tag = " [Cía]" if origen == "compania" else ""
                cumplido = bool(obj.get("cumplido"))
                estado_icon = "✅" if cumplido else "⏳"
                try:
                    vo = float(obj.get("valor_objetivo") or 0)
                except (ValueError, TypeError):
                    vo = 0.0
                try:
                    va = float(obj.get("valor_actual") or 0)
                except (ValueError, TypeError):
                    va = 0.0
                tasa_p = obj.get("tasa_pendientes")
                try:
                    tasa_val = float(tasa_p) if tasa_p is not None and str(tasa_p).strip() else 0.0
                except ValueError:
                    tasa_val = 0.0
                umbral = max(0.0, vo - tasa_val) if (vo > 0 and tasa_p is not None) else vo
                pct = 0 if umbral <= 0 else int(max(0, min(100, round((va / umbral) * 100))))

                fecha = str(obj.get("fecha_objetivo") or "")[:10]
                fecha_fmt = ""
                dias_restantes_txt = ""
                if fecha and len(fecha) == 10 and fecha.count("-") == 2:
                    y, mo, d = fecha.split("-")
                    fecha_fmt = f"{d}/{mo}/{y}"
                    try:
                        hoy = _date_cls.today()
                        fecha_limite = _date_cls.fromisoformat(fecha)
                        dias = (fecha_limite - hoy).days
                        if dias > 0:
                            dias_restantes_txt = f" ⏱ {dias}d restantes"
                        elif dias == 0:
                            dias_restantes_txt = " ⏱ ¡Vence hoy!"
                        else:
                            dias_restantes_txt = f" ⏱ Vencido hace {abs(dias)}d"
                    except Exception:
                        pass

                # Mes de referencia (solo objetivos de compañía)
                mes_ref_txt = ""
                if origen == "compania":
                    mes_ref = str(obj.get("mes_referencia") or "")[:7]  # YYYY-MM
                    if mes_ref and len(mes_ref) == 7:
                        try:
                            yr, mn = mes_ref.split("-")
                            MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                                        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
                            mes_ref_txt = f"\n   • Mes: {MESES_ES[int(mn)-1]} {yr}"
                        except Exception:
                            mes_ref_txt = f"\n   • Mes: {mes_ref}"

                tasa_txt = ""
                desglose = obj.get("desglose_cache") or {}
                if isinstance(desglose, str):
                    import json
                    try:
                        desglose = json.loads(desglose)
                    except Exception:
                        desglose = {}
                if tasa_p is not None:
                    pend_count = desglose.get("pendientes_count", "–")
                    tasa_txt = f"\n   • Tasa P={tasa_p} · {pend_count} pendiente{'s' if pend_count != 1 else ''}"

                # Avance semanal acumulado para objetivos de compañía (si está en desglose_cache)
                avance_semanal_txt = ""
                if origen == "compania" and desglose.get("avance_semanal") is not None:
                    avance_semanal_txt = f"\n   • Avance semanal: {desglose['avance_semanal']}"

                pdv_candidates = []
                if obj.get("id_target_pdv"):
                    try:
                        pdv_candidates.append(int(obj["id_target_pdv"]))
                    except ValueError:
                        pass
                pdv_candidates.extend(items_map.get(oid, []))
                pdv_candidates = list(dict.fromkeys(pdv_candidates))

                pdv_line = ""
                if pdv_candidates and tipo in {"exhibicion", "conversion_estado", "activacion", "cobranza"}:
                    ref = pdv_map.get(pdv_candidates[0], {})
                    erp = ref.get("id_cliente_erp")
                    try:
                        ruta_label_val = rutas_map.get(int(ref.get("id_ruta"))) if ref.get("id_ruta") and str(ref.get("id_ruta")).strip() else ""
                    except ValueError:
                        ruta_label_val = ""
                    count_txt = f" (+{len(pdv_candidates)-1} PDV)" if len(pdv_candidates) > 1 else ""
                    parts = []
                    if erp:
                        parts.append(f"NRO CLIENTE ERP: {html.escape(str(erp), quote=False)}")
                    if ruta_label_val:
                        parts.append(f"Ruta: {html.escape(str(ruta_label_val), quote=False)}")
                    if parts:
                        pdv_line = f"\n   • {' · '.join(parts)}{count_txt}"

                progreso = (
                    f"{int(va) if va.is_integer() else round(va, 2)}/"
                    f"{int(vo) if vo.is_integer() else round(vo, 2)}"
                )
                vence_line = (
                    f" · Vence: {fecha_fmt}{dias_restantes_txt}" if fecha_fmt else ""
                )

                item_lines.append(
                    build_objetivos_item_line(
                        self.db.sb,
                        estado_icon=estado_icon,
                        tipo_txt=tipo_txt,
                        origen_tag=origen_tag,
                        progreso=progreso,
                        pct=pct,
                        vence_line=vence_line,
                        mes_ref_line=mes_ref_txt,
                        tasa_line=tasa_txt,
                        avance_semanal_line=avance_semanal_txt,
                        pdv_line=pdv_line,
                    )
                )

            full_text = build_objetivos_message(
                self.db.sb,
                vendedor_nombre=vendedor_nombre,
                item_lines=item_lines,
                total_count=len(objetivos),
                shown_count=min(8, len(objetivos)),
            )

            # Enviar dividiendo si supera el límite de Telegram (~4096 chars)
            TELE_MAX = 4000
            if len(full_text) <= TELE_MAX:
                await m.reply_text(full_text, parse_mode=ParseMode.HTML)
            else:
                header = build_objetivos_message(
                    self.db.sb,
                    vendedor_nombre=vendedor_nombre,
                    item_lines=[],
                    total_count=len(objetivos),
                    shown_count=min(8, len(objetivos)),
                )
                chunks: list[str] = []
                current = header.rstrip()
                for line in item_lines:
                    if len(current) + len(line) > TELE_MAX:
                        chunks.append(current)
                        current = line.lstrip("\n")
                    else:
                        current += line
                if current:
                    chunks.append(current)
                for chunk in chunks:
                    await m.reply_text(chunk, parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.error(
                f"[objetivos] Error uid={uid} chat={chat_id} dist={dist_id}: {type(e).__name__}: {e}",
                exc_info=True,
            )
            await m.reply_text(self._msg("objetivos_error"))

    async def cmd_cadenaone(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return

        if not await self._check_compliance(update):
            return

        m = update.message
        dist_id = self.distribuidor_id
        chat_id = m.chat.id

        await m.reply_text("⏳ Generando reporte de Cadena One (Federico Alvarez)...", parse_mode=ParseMode.HTML)

        from services.cc_difusion_service import enviar_cc_cadenaone
        try:
            res = await asyncio.to_thread(
                enviar_cc_cadenaone,
                dist_id,
                self.token,
                self.nombre_dist,
                chat_id
            )
            if not res.get("ok"):
                await m.reply_text(f"❌ Error: {res.get('error', 'Desconocido')}")
        except Exception as e:
            self.logger.error(f"[cadenaone] exc dist={dist_id}: {e}")
            await m.reply_text("❌ Error interno al generar reporte.")

    async def cmd_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        uid = update.message.from_user.id
        if not self._can_reset_session(uid):
            await update.message.reply_text("❌ Solo el administrador puede usar /reset")
            return
        self.upload_sessions.clear()
        self.active_msgs.clear()
        from core.bot_upload_session_store import clear_upload_sessions_for_dist

        await asyncio.to_thread(
            clear_upload_sessions_for_dist, self.distribuidor_id
        )
        await update.message.reply_text("✅ Memoria limpiada (reset suave)")
        self.logger.info(f"Reset ejecutado por uid={uid}")

    async def cmd_hardreset(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.message:
            return
        if not self._can_reset_session(update.message.from_user.id):
            await update.message.reply_text("❌ Solo el administrador puede usar /hardreset")
            return
        await update.message.reply_text("🔄 Reiniciando bot...")
        self.logger.warning("Hard reset solicitado por admin")
        await asyncio.sleep(1)
        os._exit(0)

    async def cmd_sync(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Fuerza el registro del grupo y del usuario que envía el comando."""
        if not update.message:
            return
        m = update.message
        chat_id = m.chat.id
        chat_title = getattr(m.chat, "title", None) or getattr(m.chat, "username", "Privado")
        
        await asyncio.to_thread(
            self._register_user_and_group,
            self.distribuidor_id, chat_id, chat_title, m.from_user.id,
            m.from_user.username or "", m.from_user.first_name or "Usuario"
        )
        await m.reply_text(
            f"✅ <b>Sincronización Exitosa</b>\n"
            f"Grupo: <code>{chat_title}</code>\n"
            f"Usuario: <code>{m.from_user.first_name}</code> registrado.",
            parse_mode=ParseMode.HTML
        )

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

        # --- PASO 0: BLOQUEO OPERATIVO REAL-TIME ---
        if not await self._check_compliance(update):
            return
        # -------------------------------------------
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
        existing = self._upload_session_get(user_id)
        session_exists = existing is not None

        # ── Lógica de ráfaga (múltiples fotos, hasta 5 en 8 segundos) ──
        if session_exists and existing:
            session  = existing
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
                await self._upload_session_save(user_id)
                self.logger.info(f"📸 Ráfaga: {username} ({n_photos + 1} fotos)")
                return

        # ── Sesiones colgadas o viejas ──
        is_stuck = session_exists and existing and existing.get("stage") == self.STAGE_WAITING_TYPE
        is_old   = session_exists and existing and (now - existing.get("last_photo_time", 0) > 8)

        if session_exists and is_stuck and existing:
            old_photos = existing.get("photos", [])
            if old_photos:
                try:
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=self._msg("upload_incomplete"),
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
        await self._upload_session_save(user_id)
        self.logger.info(f"✅ Nueva sesión creada para {username}")

        await asyncio.sleep(0.5)  # Pequeño delay anti-race

        n = len(self.upload_sessions[user_id]["photos"])
        if n > 1:
            texto = self._msg("foto_recibida_multi", n_fotos=n)
        else:
            texto = self._msg("foto_recibida")

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



        session = self._upload_session_get(user_id)
        if not session:
            if self._text_looks_like_nro_cliente(text):
                await update.message.reply_text(
                    self._msg("no_active_session"),
                    parse_mode=ParseMode.HTML,
                    reply_to_message_id=msg_id,
                )
            return

        if session.get("stage") == self.STAGE_WAITING_ID_BLOCKED:
            await update.message.reply_text(
                self._msg("use_buttons"),
                parse_mode=ParseMode.HTML,
            )
            return
        if session.get("stage") != self.STAGE_WAITING_ID:
            return

        # Limpiar y validar número
        clean = text.lower().replace("cliente", "").replace("#", "").replace("nro", "").strip()
        if not clean.isnumeric():
            await update.message.reply_text(
                self._msg("nro_invalid"),
                parse_mode=ParseMode.HTML,
                reply_to_message_id=msg_id,
            )
            return

        # Quitar ceros a la izquierda (ej: "00194" -> "194"), evitando que quede vacío si envían "0"
        clean = clean.lstrip("0") or "0"

        # ── Validación de cartera (BOT_VALIDACION_CARTERA=1) ──────────────
        if BOT_VALIDACION_CARTERA:
            row_v = await asyncio.to_thread(
                self._resolve_vendedor_v2_for_objetivos,
                self.distribuidor_id, user_id, chat_id
            )
            id_vendedor_v2 = row_v.get("id_vendedor_v2")
            if id_vendedor_v2:
                en_cartera = await asyncio.to_thread(
                    cliente_en_cartera_vendedor,
                    self.distribuidor_id, id_vendedor_v2, clean, self.db.sb
                )
                if not en_cartera:
                    session["nro_cliente"] = clean
                    session["stage"] = self.STAGE_WAITING_ID_BLOCKED
                    session["_vendedor_v2_id"] = id_vendedor_v2
                    kb = build_cartera_blocked_keyboard(user_id)
                    try:
                        await update.message.reply_text(
                            self._msg("cartera_not_found", nro_cliente=clean),
                            parse_mode=ParseMode.HTML,
                            reply_markup=kb,
                            reply_to_message_id=msg_id,
                        )
                    except Exception as e_kb:
                        self.logger.error(f"Error enviando botones cartera: {e_kb}")
                    await self._upload_session_save(user_id)
                    return
                session["_vendedor_v2_id"] = id_vendedor_v2

        session["nro_cliente"] = clean
        session["stage"] = self.STAGE_WAITING_TYPE
        await self._upload_session_save(user_id)

        # Safety-first (producción): aunque el perfil tenga alta confianza,
        # mantenemos el flujo único de selección manual para no desviar
        # de la ruta legacy ya validada en calle.
        inferred = await asyncio.to_thread(
            self.db.infer_tipo_pdv_for_cliente,
            self.distribuidor_id,
            clean,
        )
        if inferred.get("use_auto") and inferred.get("tipo_pdv"):
            session["tipo_pdv_sugerido"] = inferred["tipo_pdv"]

        # Buscar nombre del PDV para mostrarlo en el mensaje
        try:
            pdv_info_res = await asyncio.to_thread(
                self.db.sb.table(f"clientes_pdv_v2_d{self.distribuidor_id}")
                .select("nombre_fantasia, nombre_razon_social")
                .eq("id_cliente_erp", clean)
                .limit(1)
                .execute
            )
            pdv_name_display = ""
            if pdv_info_res.data:
                nf_raw = pdv_info_res.data[0].get("nombre_fantasia") or ""
                rs_raw = pdv_info_res.data[0].get("nombre_razon_social") or ""
                if nf_raw and rs_raw and nf_raw != rs_raw:
                    pdv_name_display = f" - {nf_raw} / {rs_raw}"
                elif nf_raw or rs_raw:
                    pdv_name_display = f" - {nf_raw or rs_raw}"
            session["pdv_name_display"] = pdv_name_display
        except Exception:
            pdv_name_display = ""

        try:
            await update.message.reply_text(
                self._msg("nro_ok_select_tipo", nro_cliente=clean, pdv_name=pdv_name_display),
                parse_mode=ParseMode.HTML,
                reply_markup=build_pdv_type_keyboard(user_id),
            )
        except Exception as e:
            self.logger.error(f"Error enviando botones: {e}")
            await self._upload_session_delete(user_id)

    # ─────────────────────────────────────────────────────────────
    # CALLBACK — TIPO PDV seleccionado
    # ─────────────────────────────────────────────────────────────

    async def _process_upload_with_selected_type(
        self,
        context: ContextTypes.DEFAULT_TYPE,
        uploader_id: int,
        uploader_name: str,
        tipo_pdv: str,
        clean_code: str,
        source: str = "telegram_manual",
        status_chat_id: Optional[int] = None,
        status_message_id: Optional[int] = None,
        status_reply_to: Optional[int] = None,
    ) -> None:
        session = self._upload_session_get(uploader_id)
        if not session:
            return

        session["tipo_pdv"] = tipo_pdv
        await self._upload_session_save(uploader_id)
        nro_cliente = session["nro_cliente"]
        pdv_name_display = session.get("pdv_name_display", "")
        photos = session["photos"]
        chat_id = session["chat_id"]
        chat_title = session.get("chat_title") or str(chat_id)

        _pics_str = f"{_n_pics} fotos" if _n_pics > 1 else "1 foto"
        _reg_msg = self._msg(
            "registering",
            nro_cliente=nro_cliente,
            pdv_name=pdv_name_display,
            tipo_pdv=tipo_pdv,
            fotos_label=_pics_str,
        )
        try:
            if status_chat_id and status_message_id:
                await context.bot.edit_message_text(
                    chat_id=status_chat_id,
                    message_id=status_message_id,
                    text=_reg_msg,
                    parse_mode=ParseMode.HTML,
                    reply_markup=None,
                    link_preview_options=_NO_LINK_PREVIEW,
                )
            else:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=_reg_msg,
                    parse_mode=ParseMode.HTML,
                    link_preview_options=_NO_LINK_PREVIEW,
                )
        except Exception:
            pass

        # ── Subida y registro ────────────────────────────────────
        procesadas = 0
        fallidas = 0
        exhibicion_ids: List[str] = []

        self.logger.info(f"🚀 Iniciando procesamiento de {len(photos)} foto(s)...")

        for photo_data in photos:
            file_id = photo_data["file_id"]
            ph_msg_id = photo_data["message_id"]

            try:
                file = await context.bot.get_file(file_id)
                file_bytes = await file.download_as_bytearray()
                self.logger.info(f"✅ Foto descargada: {len(file_bytes)} bytes")

                filename = f"{nro_cliente}_{clean_code}_{int(time.time())}.jpg"
                self.logger.info(f"📤 Subiendo a Supabase: {filename}...")
                drive_link = await asyncio.to_thread(
                    self.storage.upload,
                    bytes(file_bytes),
                    filename,
                    self.nombre_dist,
                )

                if drive_link:
                    self.logger.info(f"✅ Foto en Supabase: {drive_link[:80]}...")
                    try:
                        effective_uploader_id = uploader_id
                        intercept = await asyncio.to_thread(
                            self.db.lookup_soto_intercept,
                            self.distribuidor_id, uploader_id, nro_cliente
                        )
                        if intercept:
                            real_tuid = intercept.get("telegram_user_id_real")
                            real_nombre = intercept.get("nombre_vendedor_real", "")
                            if real_tuid:
                                self.logger.info(
                                    f"🔀 Intercepción franquiciado: UID {uploader_id} → "
                                    f"UID {real_tuid} ({real_nombre}) para cliente '{nro_cliente}'"
                                )
                                effective_uploader_id = real_tuid

                        params = {
                            "distribuidor_id": self.distribuidor_id,
                            "chat_id": chat_id,
                            "vendedor_id": effective_uploader_id,
                            "nro_cliente": nro_cliente,
                            "tipo_pdv": tipo_pdv,
                            "drive_link": drive_link,
                            "telegram_msg_id": ph_msg_id,
                            "telegram_chat_id": chat_id
                        }
                        rpc_result = await asyncio.to_thread(self.db.registrar_exhibicion, **params)

                        if rpc_result.get("error") == "VENDEDOR_NO_REGISTRADO":
                            self.logger.warning(f"⚠️ Vendedor {uploader_id} no registrado en DB. Reintentando registro...")
                            success = await asyncio.to_thread(
                                self._register_user_and_group,
                                self.distribuidor_id, chat_id, chat_title, uploader_id,
                                "", uploader_name
                            )
                            if success:
                                rpc_result = await asyncio.to_thread(self.db.registrar_exhibicion, **params)

                        estado_final = rpc_result.get("estado_final")
                        ex_id = rpc_result.get("id_exhibicion")
                        if ex_id:
                            self.logger.info(f"✅ Exhibición registrada: ID {ex_id} | Estado: {estado_final}")
                            exhibicion_ids.append({"id": ex_id, "estado": estado_final})
                            procesadas += 1
                            if session and session.get("pdv_nuevo_declarado"):
                                await self._registrar_pdv_pendiente_aviso(
                                    session, ex_id, nro_cliente, chat_id, uploader_id
                                )
                        else:
                            self.logger.warning(f"❌ Falló registro RPC: {rpc_result.get('error')}")
                            fallidas += 1
                    except Exception as db_err:
                        self.logger.error(f"❌ ERROR REGISTRANDO EN BD: {db_err}")
                        fallidas += 1
                else:
                    self.logger.warning("❌ Falló la subida a Supabase (drive_link vacío)")
                    fallidas += 1
            except Exception as e:
                self.logger.error(f"❌ ERROR PROCESANDO FOTO: {e}")
                fallidas += 1

        self.logger.info(f"📊 RESUMEN: {procesadas} exitosas, {fallidas} fallidas")

        if procesadas > 0:
            await asyncio.to_thread(
                self.db.upsert_pdv_tipo_observation,
                self.distribuidor_id,
                nro_cliente,
                tipo_pdv,
                source,
            )
            primera_id = exhibicion_ids[0]["id"]
            en_cuarentena_flag = any(e["estado"] == "PENDIENTE" for e in exhibicion_ids)
            msg_text = self._msg(
                "upload_success",
                nro_cliente=nro_cliente,
                tipo_pdv=tipo_pdv,
                procesadas=procesadas,
            )
            photo_msg_id = photos[0]["message_id"] if photos else None
            if photo_msg_id:
                sent_msg_id = await _send_summary_reply_photo(
                    context.bot,
                    chat_id,
                    msg_text,
                    photo_msg_id,
                    logger=self.logger,
                )
            else:
                sent = await context.bot.send_message(
                    chat_id=chat_id,
                    text=msg_text,
                    parse_mode=ParseMode.HTML,
                    link_preview_options=_NO_LINK_PREVIEW,
                )
                sent_msg_id = sent.message_id

            for ex_data in exhibicion_ids:
                await asyncio.to_thread(
                    self.db.update_telegram_refs,
                    ex_data["id"], sent_msg_id, chat_id
                )
            if en_cuarentena_flag:
                self.logger.info(
                    f"[Cuarentena] exhibición en revisión silenciosa "
                    f"dist={self.distribuidor_id} chat={chat_id} uploader={uploader_id}"
                )
            self.active_msgs[sent_msg_id] = {
                "exhibicion_id": primera_id,
                "uploader_id": uploader_id,
                "ref_msg": photos[0]["message_id"],
            }
            if fallidas > 0:
                fail_kw: Dict[str, Any] = {}
                if photo_msg_id:
                    fail_kw["reply_parameters"] = _reply_to_photo(chat_id, photo_msg_id)
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=self._msg("upload_partial_fail", fallidas=fallidas),
                    link_preview_options=_NO_LINK_PREVIEW,
                    **fail_kw,
                )
        else:
            err_kw: Dict[str, Any] = {}
            if photos:
                err_kw["reply_parameters"] = _reply_to_photo(chat_id, photos[0]["message_id"])
            await context.bot.send_message(
                chat_id=chat_id,
                text=self._msg("upload_error", uploader_name=uploader_name),
                parse_mode=ParseMode.HTML,
                link_preview_options=_NO_LINK_PREVIEW,
                **err_kw,
            )

        await self._upload_session_delete(uploader_id)

    async def button_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.callback_query:
            return
        q = update.callback_query
        await q.answer()

        data = q.data
        uid  = q.from_user.id

        # --- Manejo de RANKING ---
        if data.startswith("RANKING_"):
            parts = data.split("_")
            if len(parts) < 4: return

            month = int(parts[1])
            year  = int(parts[2])
            target_uid = int(parts[3])

            if uid != target_uid:
                await q.answer("❌ Esta consulta no es para vos.", show_alert=True)
                return

            await q.edit_message_text(self._msg("ranking_loading"))

            try:
                periodo = f"{year}-{month:02d}"
                now = datetime.now(AR_TZ)
                is_mes_actual = (now.month == month and now.year == year)

                MESES = {
                    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
                    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
                    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
                }
                month_name = MESES.get(month, "Mes")

                # Usar ranking_with_deltas para el mes actual (incluye flechas)
                # Para meses anteriores, usar el ranking histórico sin deltas
                if is_mes_actual:
                    from core.bot_ranking_delta import ranking_with_deltas
                    ranking_raw = await asyncio.to_thread(
                        ranking_with_deltas, self.db.sb, self.distribuidor_id, periodo
                    )
                    # Convertir al formato usado abajo
                    ranking = []
                    for r in ranking_raw:
                        ranking.append({
                            "vendedor": r["vendedor"],
                            "puntos": r["puntos"],
                            "aprobadas": r.get("aprobadas", 0),
                            "destacadas": r.get("destacadas", 0),
                            "rechazadas": r.get("rechazadas", 0),
                            "sucursal": "",
                            "delta": r.get("delta", 0),
                        })
                else:
                    ranking_legacy = await asyncio.to_thread(
                        self.db.get_ranking_periodo, self.distribuidor_id, periodo
                    )
                    ranking = [{**r, "delta": 0} for r in (ranking_legacy or [])]

                if not ranking:
                    await q.edit_message_text(self._msg("ranking_empty"))
                    return

                msg = build_ranking_result_message(
                    self.db.sb,
                    nombre_dist=self.nombre_dist,
                    mes_nombre=month_name,
                    year=year,
                    entries=ranking,
                    limit=10,
                )

                await q.edit_message_text(msg, parse_mode=ParseMode.HTML)
            except Exception as e:
                self.logger.error(f"Error en callback ranking: {e}")
                await q.edit_message_text(self._msg("ranking_error"))
            return

        # ── CARTERA_: PDF de cartera ─────────────────────────────────────────
        if data.startswith("CARTERA_"):
            await self._handle_cartera_callback(update, context)
            return

        # ── CUENTAS_: PDF de cuentas corrientes ──────────────────────────────
        if data.startswith("CUENTAS_"):
            await self._handle_cuentas_callback(update, context)
            return

        # ── RETRY_CLIENTE_: volver a pedir NRO ───────────────────────────────
        if data.startswith("RETRY_CLIENTE_"):
            try:
                target_uid = int(data.split("_", 2)[2])
            except (ValueError, IndexError):
                return
            if uid != target_uid:
                await q.answer("❌ Esta no es tu sesión.", show_alert=True)
                return
            sess = self._upload_session_get(target_uid)
            if not sess:
                await q.answer("⚠️ Sesión expirada. Enviá la foto de nuevo.", show_alert=True)
                return
            sess["stage"] = self.STAGE_WAITING_ID
            sess.pop("nro_cliente", None)
            sess.pop("_vendedor_v2_id", None)
            await self._upload_session_save(target_uid)
            try:
                await q.edit_message_text(
                    self._msg("retry_nro"),
                    parse_mode=ParseMode.HTML,
                )
            except Exception:
                pass
            return

        # ── PDV_NUEVO_: declarar PDV nuevo y avanzar a tipo PDV ──────────────
        if data.startswith("PDV_NUEVO_"):
            try:
                target_uid = int(data.split("_", 2)[2])
            except (ValueError, IndexError):
                return
            if uid != target_uid:
                await q.answer("❌ Esta no es tu sesión.", show_alert=True)
                return
            sess = self._upload_session_get(target_uid)
            if not sess:
                await q.answer("⚠️ Sesión expirada. Enviá la foto de nuevo.", show_alert=True)
                return
            nro = sess.get("nro_cliente") or ""
            if not nro:
                await q.answer("⚠️ Sin NRO de cliente. Usá «Corregir NRO».", show_alert=True)
                return
            sess["pdv_nuevo_declarado"] = True
            sess["stage"] = self.STAGE_WAITING_TYPE
            await self._upload_session_save(target_uid)
            try:
                await q.edit_message_text(
                    self._msg("pdv_nuevo_ok", nro_cliente=nro),
                    parse_mode=ParseMode.HTML,
                    reply_markup=build_pdv_type_keyboard(target_uid),
                )
            except Exception:
                pass
            return

        # ── VINCULAR_CONFIRM_ / VINCULAR_CANCEL_ ─────────────────────────────
        if data.startswith("VINCULAR_CONFIRM_"):
            parts = data.split("_")
            # VINCULAR_CONFIRM_{chat_id}_{id_vendedor}
            if len(parts) >= 4:
                target_chat_id = int(parts[2])
                id_vendedor_v2 = int(parts[3])
                try:
                    from core.telegram_group_matcher import apply_group_binding
                    await asyncio.to_thread(
                        apply_group_binding,
                        self.distribuidor_id, target_chat_id, id_vendedor_v2,
                        "bot_vincular",
                        str(update.callback_query.from_user.id),
                    )
                    # Obtener nombre del vendedor para confirmación
                    t_vend = f"vendedores_v2_d{self.distribuidor_id}"
                    v_res = await asyncio.to_thread(
                        lambda: self.db.sb.table(t_vend)
                        .select("nombre_erp")
                        .eq("id_vendedor", id_vendedor_v2)
                        .limit(1)
                        .execute()
                    )
                    nombre = v_res.data[0]["nombre_erp"] if v_res.data else f"Vendedor #{id_vendedor_v2}"
                    await update.callback_query.edit_message_text(
                        self._msg("vincular_ok", nombre_erp=nombre),
                        parse_mode=ParseMode.HTML,
                    )
                except Exception as e:
                    self.logger.error(f"[vincular-confirm] {e}", exc_info=True)
                    await update.callback_query.answer("Error al vincular. Intentá de nuevo.", show_alert=True)
            return

        if data.startswith("VINCULAR_CANCEL_"):
            await update.callback_query.edit_message_text(self._msg("vincular_cancel"))
            return

        parsed = parse_type_callback(data)
        if not parsed:
            return

        tipo_pdv, uploader_id = parsed
        clean_code = "".join(c for c in tipo_pdv if c.isalnum()).upper()

        if uid != uploader_id:
            await q.answer("❌ Esta no es tu sesión.", show_alert=True)
            return

        session = self._upload_session_get(uploader_id)
        if not session or session.get("stage") != self.STAGE_WAITING_TYPE:
            await q.answer("⚠️ Sesión expirada.", show_alert=True)
            return

        if not session.get("nro_cliente"):
            await q.answer("⚠️ Falta el NRO de cliente. Enviá /reset y la foto de nuevo.", show_alert=True)
            return

        session["tipo_pdv"] = tipo_pdv
        await self._upload_session_save(uploader_id)
        nro_cliente    = session["nro_cliente"]
        pdv_name_display = session.get("pdv_name_display", "")
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
                    f"✅ NRO CLIENTE: <code>{nro_cliente}</code>{pdv_name_display}\n"
                    f"📍 <b>{tipo_pdv}</b>\n\n"
                    f"⏳ Registrando {_pics_str}..."
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=None,
                link_preview_options=_NO_LINK_PREVIEW,
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
                        # ── INTERCEPTOR DE FRANQUICIADOS (Soto → Monchi/Jorge) ──────
                        # Si el uploader está mapeado en matcheo_rutas_excepciones para
                        # este cliente, la exhibición se registra a nombre del vendedor real.
                        effective_uploader_id = uploader_id
                        intercept = await asyncio.to_thread(
                            self.db.lookup_soto_intercept,
                            self.distribuidor_id, uploader_id, nro_cliente
                        )
                        if intercept:
                            real_tuid = intercept.get("telegram_user_id_real")
                            real_nombre = intercept.get("nombre_vendedor_real", "")
                            if real_tuid:
                                self.logger.info(
                                    f"🔀 Intercepción franquiciado: UID {uploader_id} → "
                                    f"UID {real_tuid} ({real_nombre}) para cliente '{nro_cliente}'"
                                )
                                effective_uploader_id = real_tuid
                        # ── FIN INTERCEPTOR ─────────────────────────────────────────

                        params = {
                            "distribuidor_id": self.distribuidor_id,
                            "chat_id": chat_id,
                            "vendedor_id": effective_uploader_id,
                            "nro_cliente": nro_cliente,
                            "tipo_pdv": tipo_pdv,
                            "drive_link": drive_link,
                            "telegram_msg_id": ph_msg_id,
                            "telegram_chat_id": chat_id
                        }
                        rpc_result = await asyncio.to_thread(self.db.registrar_exhibicion, **params)

                        # REINTENTO SI NO ESTÁ REGISTRADO
                        if rpc_result.get("error") == "VENDEDOR_NO_REGISTRADO":
                            self.logger.warning(f"⚠️ Vendedor {uploader_id} no registrado en DB. Reintentando registro...")
                            success = await asyncio.to_thread(
                                self._register_user_and_group,
                                self.distribuidor_id, chat_id, chat_title, uploader_id,
                                q.from_user.username or "", uploader_name
                            )
                            if success:
                                rpc_result = await asyncio.to_thread(self.db.registrar_exhibicion, **params)

                        # PASO 6/7: Feedback Táctico PENDIENTE
                        estado_final = rpc_result.get("estado_final")
                        ex_id = rpc_result.get("id_exhibicion")

                        if ex_id:
                            self.logger.info(f"✅ Exhibición registrada: ID {ex_id} | Estado: {estado_final}")
                            exhibicion_ids.append({"id": ex_id, "estado": estado_final})
                            procesadas += 1
                            await self._registrar_pdv_pendiente_aviso(
                                session, ex_id, nro_cliente, chat_id, uploader_id
                            )

                            # ── NUEVO: Matchear identidad y datos del PDV para real-time ──
                            lat, lon = 0.0, 0.0
                            cliente_nombre = "Punto de Venta"
                            vendedor_real = uploader_name or "Desconocido"
                            domicilio, localidad, telefono, fecha_alta = "", "", "", ""
                            
                            # A. Buscar nombre real del integrante (vendedor) por Telegram ID
                            if uploader_id:
                                try:
                                    int_res = await asyncio.to_thread(
                                        self.db.sb.table("integrantes_grupo")
                                        .select("nombre_integrante")
                                        .eq("id_distribuidor", self.distribuidor_id)
                                        .eq("telegram_user_id", uploader_id)
                                        .limit(1)
                                        .execute,
                                    )
                                    if int_res.data:
                                        vendedor_real = int_res.data[0].get("nombre_integrante") or vendedor_real
                                except Exception as ex_vend:
                                    self.logger.warning(f"⚠️ Error lookup vendedor real-time: {ex_vend}")

                            # B. Buscar datos completos del PDV por nro_cliente (independiente de A)
                            if nro_cliente and nro_cliente != "0":
                                try:
                                    self.logger.info(f"🔍 Lookup PDV clientes_pdv_v2: id_cliente_erp='{nro_cliente}' dist={self.distribuidor_id}")
                                    _t_pdv_bot = tenant_table_name("clientes_pdv_v2", self.distribuidor_id)
                                    pdv_res = await asyncio.to_thread(
                                        self.db.sb.table(_t_pdv_bot)
                                        .select("nombre_fantasia, nombre_razon_social, latitud, longitud, domicilio, localidad, fecha_alta")
                                        .eq("id_distribuidor", self.distribuidor_id)
                                        .eq("id_cliente_erp", nro_cliente)
                                        .limit(1)
                                        .execute
                                    )
                                    # Fallback: el ERP puede almacenar el código sin ceros iniciales
                                    # mientras el vendedor los tipea (o viceversa). Se reintenta
                                    # con el valor stripped para cubrir ambos casos.
                                    if not pdv_res.data:
                                        nro_stripped = nro_cliente.lstrip("0") or nro_cliente
                                        if nro_stripped != nro_cliente:
                                            self.logger.info(f"🔍 Reintento sin ceros iniciales: id_cliente_erp='{nro_stripped}'")
                                            pdv_res = await asyncio.to_thread(
                                                self.db.sb.table(_t_pdv_bot)
                                                .select("nombre_fantasia, nombre_razon_social, latitud, longitud, domicilio, localidad, fecha_alta")
                                                .eq("id_distribuidor", self.distribuidor_id)
                                                .eq("id_cliente_erp", nro_stripped)
                                                .limit(1)
                                                .execute
                                            )
                                    if pdv_res.data:
                                        pdv = pdv_res.data[0]
                                        lat = float(pdv.get("latitud") or 0.0)
                                        lon = float(pdv.get("longitud") or 0.0)
                                        
                                        nf_raw = pdv.get("nombre_fantasia") or cliente_nombre or ""
                                        rs_raw = pdv.get("nombre_razon_social") or ""
                                        if nf_raw and rs_raw and nf_raw != rs_raw:
                                            cliente_nombre = f"{nf_raw} / {rs_raw}"
                                        else:
                                            cliente_nombre = nf_raw or rs_raw
                                            
                                        domicilio = pdv.get("domicilio") or ""
                                        localidad = pdv.get("localidad") or ""
                                        fecha_alta = pdv.get("fecha_alta") or ""
                                        self.logger.info(f"✅ PDV encontrado: '{cliente_nombre}' lat={lat} lon={lon}")
                                    else:
                                        self.logger.warning(f"⚠️ PDV no encontrado en clientes_pdv_v2 para id_cliente_erp='{nro_cliente}' dist={self.distribuidor_id} — resultado vacío")
                                except Exception as ex_pdv:
                                    self.logger.warning(f"⚠️ Error lookup PDV real-time: {ex_pdv}")

                            # Real-time Broadcast via WebSocket
                            if self.ws_manager:
                                try:
                                    # Mapear datos para el "FlyTo" instantáneo
                                    msg_ws = {
                                        "type": "new_exhibition",
                                        "payload": {
                                            "id_ex": ex_id,
                                            "id_dist": self.distribuidor_id,
                                            "vendedor_nombre": vendedor_real,
                                            "lat": lat,
                                            "lng": lon,  # Mapear lon -> lng para el frontend
                                            "timestamp_evento": datetime.now().isoformat(),
                                            "nro_cliente": nro_cliente or "S/C",
                                            "nombre_fantasia": cliente_nombre,
                                            "drive_link": drive_link,
                                            "domicilio": domicilio,
                                            "localidad": localidad,
                                            "telefono": telefono,
                                            "fecha_alta": fecha_alta
                                        }
                                    }
                                    asyncio.create_task(self.ws_manager.broadcast(self.distribuidor_id, msg_ws))
                                    self.logger.info(f"📡 Broadcast WS enviado: {vendedor_real} en {cliente_nombre} ({lat}, {lon})")
                                except Exception as e:
                                    self.logger.error(f"❌ Error en broadcast WS: {e}")
                            # Log silencioso: cliente no está en el padrón aún (id_cliente_pdv = NULL)
                            # Se vincula automáticamente en la próxima ingesta del padrón.
                            if not rpc_result.get("id_cliente_pdv"):
                                self.logger.debug(
                                    f"[Limbo] Cliente '{nro_cliente}' no encontrado en clientes_pdv "
                                    f"(dist {self.distribuidor_id}). "
                                    f"Se vinculará en la próxima carga del padrón."
                                )
                        else:
                            self.logger.warning(f"❌ Falló registro RPC: {rpc_result.get('error')}")
                            fallidas += 1
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
            en_cuarentena_flag = any(e["estado"] == "PENDIENTE" for e in exhibicion_ids)

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
                    self.db.get_stats_vendedor,
                    self.distribuidor_id,
                    telegram_user_id=uploader_id,
                    telegram_group_id=chat_id,
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
            now_ar = datetime.now(AR_TZ)
            stats_text = build_upload_stats_block(
                self.db.sb,
                mes_nombre=self.MESES.get(now_ar.month, now_ar.strftime("%B")),
                aprobadas=mes.get("aprobadas", 0),
                destacadas=mes.get("destacadas", 0),
                rechazadas=mes.get("rechazadas", 0),
                pendientes=mes.get("pendientes", 0),
                puntos=mes.get("puntos", 0),
                total=mes.get("total", 0),
                racha=racha,
            )

            # Historial del cliente en este PDV
            historial_text = ""
            if historial:
                estado_emoji = {"Aprobado": "✅", "Destacado": "🔥", "Rechazado": "❌", "Pendiente": "⏳"}
                lineas = "\n".join(
                    f"   • {h['fecha']} — {h['tipo_pdv']} — {estado_emoji.get(h['estado'], '❓')} {h['estado']}"
                    for h in historial
                )
                historial_text = build_upload_historial_block(
                    self.db.sb,
                    lineas=lineas,
                    count=len(historial),
                )

            fotos_text = build_upload_fotos_text(self.db.sb, procesadas)
            foto_line = build_upload_foto_line(self.db.sb, drive_link or "")
            estado_label = build_upload_estado_label(
                self.db.sb,
                en_cuarentena=en_cuarentena_flag,
            )

            # ── INTERCEPTOR DE OBJETIVO DE EXHIBICIÓN ──────────────────────
            # Si existe un objetivo activo de tipo 'exhibicion' para este
            # vendedor y PDV, se añade un badge al mensaje de confirmación
            # y se notifica al supervisor en tiempo real.
            objetivo_badge = ""
            obj_ids_watcher_refresh: list = []
            try:
                self.logger.info(
                    f"[ObjInterceptor] Iniciando para nro_cliente='{nro_cliente}' "
                    f"uid={effective_uploader_id} dist={self.distribuidor_id}"
                )
                # Filtrar por telegram_group_id=chat_id para obtener el integrante
                # correcto cuando el mismo uid está en múltiples grupos/distribuidoras.
                ig_obj_res = self.db.sb.table("integrantes_grupo") \
                    .select("id_vendedor_v2") \
                    .eq("id_distribuidor", self.distribuidor_id) \
                    .eq("telegram_user_id", effective_uploader_id) \
                    .eq("telegram_group_id", chat_id) \
                    .limit(1).execute()
                id_vendedor_v2_obj = (
                    ig_obj_res.data[0].get("id_vendedor_v2")
                    if ig_obj_res.data else None
                )
                if id_vendedor_v2_obj is None:
                    self.logger.warning(
                        "[ObjInterceptor] Sin id_vendedor_v2 por grupo/uid; "
                        "se desactiva fallback sin grupo para evitar cruce entre vendedores"
                    )
                self.logger.info(
                    f"[ObjInterceptor] id_vendedor_v2={id_vendedor_v2_obj} "
                    f"uid={effective_uploader_id}"
                )
                # Proceed even without id_vendedor_v2 — PDV match is enough
                _t_pdv_obj = tenant_table_name("clientes_pdv_v2", self.distribuidor_id)
                pdv_obj_res = self.db.sb.table(_t_pdv_obj) \
                    .select("id_cliente, nombre_fantasia") \
                    .eq("id_distribuidor", self.distribuidor_id) \
                    .eq("id_cliente_erp", nro_cliente) \
                    .limit(1).execute()
                if not pdv_obj_res.data and nro_cliente:
                    nro_strip = nro_cliente.lstrip("0") or nro_cliente
                    if nro_strip != nro_cliente:
                        pdv_obj_res = self.db.sb.table(_t_pdv_obj) \
                            .select("id_cliente, nombre_fantasia") \
                            .eq("id_distribuidor", self.distribuidor_id) \
                            .eq("id_cliente_erp", nro_strip) \
                            .limit(1).execute()
                if not pdv_obj_res.data:
                    self.logger.warning(
                        f"[ObjInterceptor] PDV no encontrado en clientes_pdv_v2 "
                        f"para id_cliente_erp='{nro_cliente}' dist={self.distribuidor_id} — saliendo"
                    )
                else:
                    id_pdv_obj = pdv_obj_res.data[0]["id_cliente"]
                    pdv_nombre_obj = pdv_obj_res.data[0].get("nombre_fantasia") or nro_cliente
                    self.logger.info(f"[ObjInterceptor] PDV id={id_pdv_obj} '{pdv_nombre_obj}'")
                    obj_match_es_global = False
                    # Build base query — vendor filter applied only when known
                    def _obj_q():
                        q = self.db.sb.table("objetivos") \
                            .select("id") \
                            .eq("id_distribuidor", self.distribuidor_id) \
                            .eq("tipo", "exhibicion") \
                            .eq("cumplido", False)
                        if id_vendedor_v2_obj:
                            q = q.eq("id_vendedor", id_vendedor_v2_obj)
                        return q
                    # Match strategy 1: id_target_pdv == id_pdv_obj
                    obj_match_res = _obj_q().eq("id_target_pdv", id_pdv_obj).limit(1).execute()

                    if obj_match_res.data:
                        self.logger.info(f"[ObjInterceptor] ✅ Match por id_target_pdv={id_pdv_obj} ENCONTRADO")
                    else:
                        # Diagnostic: check if the PDV exists for OTHER sellers
                        try:
                            other_v_res = self.db.sb.table("objetivos") \
                                .select("id_vendedor, nombre_vendedor") \
                                .eq("id_distribuidor", self.distribuidor_id) \
                                .eq("tipo", "exhibicion") \
                                .eq("cumplido", False) \
                                .eq("id_target_pdv", id_pdv_obj) \
                                .limit(1).execute()
                            if other_v_res.data:
                                other_v = other_v_res.data[0]
                                self.logger.warning(
                                    f"[ObjInterceptor] ⚠️ PDV {id_pdv_obj} tiene objetivo pero para OTRO vendedor: "
                                    f"ID {other_v['id_vendedor']} ({other_v['nombre_vendedor']})"
                                )
                        except Exception:
                            pass

                        # Match strategy 2: PDV listado en objetivo_items (multi-PDV).
                        # Requiere id_vendedor_v2 para no cruzar objetivos entre vendedores/sucursales.
                        if not obj_match_res.data and id_vendedor_v2_obj is not None:
                            try:
                                # Sin filtrar id_distribuidor en ítems: filas legacy con NULL no matcheaban
                                # y la exhibición quedaba sin id_objetivo.
                                items_match_res = self.db.sb.table("objetivo_items") \
                                    .select("id_objetivo") \
                                    .eq("id_cliente_pdv", id_pdv_obj) \
                                    .execute()
                                item_obj_ids = list(
                                    {
                                        r["id_objetivo"]
                                        for r in (items_match_res.data or [])
                                        if r.get("id_objetivo")
                                    }
                                )
                                if item_obj_ids:
                                    obj_via_items = (
                                        _obj_q().in_("id", item_obj_ids).order("created_at", desc=True).limit(1).execute()
                                    )
                                    if obj_via_items.data:
                                        obj_match_res = obj_via_items
                                        self.logger.info(
                                            f"[ObjInterceptor] ✅ Match por objetivo_items pdv={id_pdv_obj} ENCONTRADO"
                                        )
                            except Exception as e_items:
                                self.logger.warning(f"[ObjInterceptor] Error en match via items: {e_items}")

                        # Match strategy 3: objetivo global (sin PDV fijo ni filas en objetivo_items).
                        # Requiere id_vendedor_v2 para no asociar la foto a metas de otro vendedor.
                        if not obj_match_res.data and id_vendedor_v2_obj is not None:
                            try:
                                global_cand = (
                                    _obj_q()
                                    .is_("id_target_pdv", "null")
                                    .order("created_at", desc=True)
                                    .limit(25)
                                    .execute()
                                )
                                for row in global_cand.data or []:
                                    oid = row.get("id")
                                    if not oid:
                                        continue
                                    it_chk = (
                                        self.db.sb.table("objetivo_items")
                                        .select("id")
                                        .eq("id_objetivo", oid)
                                        .limit(1)
                                        .execute()
                                    )
                                    if it_chk.data:
                                        continue
                                    obj_match_res = (
                                        self.db.sb.table("objetivos")
                                        .select("id")
                                        .eq("id", oid)
                                        .limit(1)
                                        .execute()
                                    )
                                    obj_match_es_global = True
                                    self.logger.info(
                                        f"[ObjInterceptor] ✅ Match por objetivo global exhibicion "
                                        f"id={oid} (sin id_target_pdv, sin ítems)"
                                    )
                                    break
                            except Exception as e_glob:
                                self.logger.warning(f"[ObjInterceptor] Error match global: {e_glob}")

                        if not obj_match_res.data:
                            self.logger.info(
                                f"[ObjInterceptor] Sin objetivo activo para PDV={id_pdv_obj} "
                                f"vend={id_vendedor_v2_obj} — sin badge"
                            )

                    # ── Objetivo encontrado (por cualquier estrategia) ─────────
                    if obj_match_res.data:
                        obj_id_match = obj_match_res.data[0]["id"]
                        obj_ids_watcher_refresh.append(obj_id_match)
                        if obj_match_es_global:
                            objetivo_badge = build_upload_objetivo_badge(
                                self.db.sb,
                                es_global=True,
                            )
                        else:
                            objetivo_badge = build_upload_objetivo_badge(
                                self.db.sb,
                                es_global=False,
                                pdv_nombre=pdv_nombre_obj,
                            )

                        # 1. Patch id_cliente_pdv + id_objetivo en exhibiciones
                        try:
                            ids_a_patchear = [e["id"] for e in exhibicion_ids if e.get("id")]
                            if ids_a_patchear:
                                self.db.sb.table("exhibiciones") \
                                    .update({"id_cliente_pdv": id_pdv_obj, "id_objetivo": obj_id_match}) \
                                    .in_("id_exhibicion", ids_a_patchear) \
                                    .execute()
                        except Exception as e_patch:
                            self.logger.warning(f"⚠️ Error patching id_cliente_pdv/id_objetivo: {e_patch}")

                        # 2. Insertar tracking exhibicion_pendiente para que el
                        #    watcher no duplique la notificación al correr después
                        try:
                            tracking_rows = [
                                {
                                    "id_objetivo": obj_id_match,
                                    "id_referencia": e["id"],
                                    "tipo_evento": "exhibicion_pendiente",
                                    "metadata": {"nro_cliente": nro_cliente},
                                }
                                for e in exhibicion_ids if e.get("id")
                            ]
                            if tracking_rows:
                                self.db.sb.table("objetivos_tracking") \
                                    .upsert(
                                        tracking_rows,
                                        on_conflict="id_objetivo,id_referencia,tipo_evento"
                                    ).execute()
                        except Exception as e_track:
                            self.logger.warning(f"⚠️ Error insertando tracking pendiente: {e_track}")

                        # 2b. Marcar objetivo_items.estado_item = "foto_subida" para este PDV.
                        # Debe hacerse ANTES del WS broadcast para que cuando el frontend
                        # invalide la query, _compute_kanban_phase encuentre items_con_foto > 0.
                        try:
                            from datetime import timezone as _tz_utc
                            self.db.sb.table("objetivo_items").update({
                                "estado_item": "foto_subida",
                                "updated_at": datetime.now(_tz_utc.utc).isoformat(),
                            }).eq("id_objetivo", obj_id_match).eq("id_cliente_pdv", id_pdv_obj).execute()
                            self.logger.info(
                                f"[ObjInterceptor] objetivo_items.estado_item=foto_subida "
                                f"para obj={obj_id_match} pdv={id_pdv_obj}"
                            )
                        except Exception as e_item:
                            self.logger.warning(f"⚠️ Error actualizando objetivo_items: {e_item}")

                        # 2c. valor_actual coherente con PDVs únicos (N fotos del mismo PDV = 1).
                        #     Antes: +=1 por tanda → 2 fotos en un mensaje contaban como 2 PDVs.
                        #     Objetivo global (sin ítems): no forzar valor_actual aquí — el watcher
                        #     recalcula por PDVs únicos y no pisaría mal un umbral > 1.
                        if not obj_match_es_global:
                            try:
                                items_vc = self.db.sb.table("objetivo_items") \
                                    .select("estado_item") \
                                    .eq("id_objetivo", obj_id_match) \
                                    .execute()
                                rows_it = items_vc.data or []
                                if rows_it:
                                    new_val = sum(
                                        1 for it in rows_it
                                        if it.get("estado_item") in ("foto_subida", "cumplido")
                                    )
                                else:
                                    # Objetivo sólo con id_target_pdv (sin filas en objetivo_items)
                                    new_val = 1
                                self.db.sb.table("objetivos") \
                                    .update({"valor_actual": float(new_val)}) \
                                    .eq("id", obj_id_match).execute()
                                self.logger.info(
                                    f"[ObjInterceptor] valor_actual → {new_val} (recalculado, "
                                    f"{procesadas} foto(s) mismo PDV cuenta una vez) obj={obj_id_match}"
                                )
                            except Exception as e_upd:
                                self.logger.warning(f"⚠️ Error actualizando valor_actual: {e_upd}")
                        else:
                            self.logger.info(
                                f"[ObjInterceptor] valor_actual delegado al watcher (objetivo global) "
                                f"obj={obj_id_match}"
                            )

                        # 3. Notificar al supervisor vía WebSocket
                        from services.objetivos_notification_service import objetivos_notification
                        objetivos_notification.notify_supervisor_ws(
                            dist_id=self.distribuidor_id,
                            event_data={
                                "tipo_evento": "exhibicion_pendiente",
                                "id_objetivo": obj_id_match,
                                "pdv": {"nombre": pdv_nombre_obj, "id_cliente_erp": nro_cliente},
                                "vendedor": uploader_name,
                            },
                        )
                        self.logger.info(
                            f"🎯 Objetivo exhibicion match: PDV '{pdv_nombre_obj}' "
                            f"vend={id_vendedor_v2_obj} obj={obj_id_match}"
                        )
            except Exception as e_obj:
                self.logger.warning(f"⚠️ Error en intercept objetivo exhibicion: {e_obj}", exc_info=True)
            # ── FIN INTERCEPTOR OBJETIVO ────────────────────────────────────
            # Watcher DESPUÉS del interceptor: evita carrera que ponga valor_actual=0
            # antes de patch id_cliente_pdv / foto_subida en objetivo_items.
            if obj_ids_watcher_refresh:
                try:
                    import threading
                    from services.objetivos_watcher_service import objetivos_watcher as _watcher_post
                    _dist_w = self.distribuidor_id
                    _oids = list({str(x) for x in obj_ids_watcher_refresh})

                    def _run_post_interceptor_watcher():
                        try:
                            for _oid in _oids:
                                _watcher_post.run_watcher(_dist_w, obj_id=_oid)
                        except Exception as _ew:
                            import logging
                            logging.getLogger("BotWorker").warning(
                                f"[Watcher] post-interceptor error: {_ew}"
                            )

                    threading.Thread(
                        target=_run_post_interceptor_watcher,
                        daemon=True,
                    ).start()
                    self.logger.debug(
                        f"[Watcher] post-interceptor dist={_dist_w} objs={_oids}"
                    )
                except Exception as _e_wpost:
                    self.logger.warning(f"[Watcher] No se pudo disparar post-interceptor: {_e_wpost}")

            msg_text = build_upload_rich_message(
                self.db.sb,
                fotos_text=fotos_text,
                uploader_name=uploader_name,
                nro_cliente=nro_cliente,
                cliente_nombre=cliente_nombre,
                tipo_pdv=tipo_pdv,
                foto_line=foto_line,
                estado_label=estado_label,
                objetivo_badge=objetivo_badge,
                stats_text=stats_text,
                historial_text=historial_text,
            )

            photo_msg_id = photos[0]["message_id"]
            sent_msg_id = await _send_summary_reply_photo(
                context.bot,
                chat_id,
                msg_text,
                photo_msg_id,
                registrando_message_id=q.message.message_id,
                logger=self.logger,
            )

            # Guardar referencias Telegram en todas las exhibiciones
            for ex_data in exhibicion_ids:
                await asyncio.to_thread(
                    self.db.update_telegram_refs,
                    ex_data["id"], sent_msg_id, chat_id
                )

            # PASO 6: Cuarentena silenciosa (sin notificación al chat)
            if en_cuarentena_flag:
                self.logger.info(
                    f"[Cuarentena] exhibición en revisión silenciosa "
                    f"dist={self.distribuidor_id} chat={chat_id} uploader={uploader_id}"
                )

            # Cache local para sync
            self.active_msgs[sent_msg_id] = {
                "exhibicion_id": primera_id,
                "uploader_id":   uploader_id,
                "ref_msg":       photos[0]["message_id"],
            }

            if fallidas > 0:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"⚠️ {fallidas} foto(s) no pudieron registrarse. Si falta alguna, reenviala.",
                    link_preview_options=_NO_LINK_PREVIEW,
                )
        else:
            # Todas fallaron
            await context.bot.send_message(
                chat_id=chat_id,
                text=(
                    "⚠️ <b>Error de conexión con el servidor.</b>\n\n"
                    f"No se pudo registrar la exhibición, {uploader_name}.\n"
                    "Por favor <b>reenviá la foto</b>."
                ),
                parse_mode=ParseMode.HTML,
                link_preview_options=_NO_LINK_PREVIEW,
            )

        await self._upload_session_delete(uploader_id)

    # ─────────────────────────────────────────────────────────────
    # JOB: Sincronizar evaluaciones web → Telegram
    # ─────────────────────────────────────────────────────────────

    async def handle_new_chat_title(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Captura cuando un admin cambia el nombre de un grupo de Telegram en vivo."""
        if not update.message or not update.message.new_chat_title:
            return
        chat_id = update.message.chat.id
        new_title = update.message.new_chat_title
        self.logger.info(f"🏷️ Nuevo título en chat {chat_id}: {new_title}")

        # Guardar nuevo título (upsert existente)
        await asyncio.to_thread(self.db.upsert_grupo, self.distribuidor_id, chat_id, new_title)

        # Detectar drift si el grupo tenía un vendedor anclado
        try:
            from core.telegram_group_matcher import (
                detect_group_drift,
                unlink_group,
                create_suggestion,
                score_group_vendor_candidates,
            )
            drift = await asyncio.to_thread(detect_group_drift, self.distribuidor_id, chat_id)
            if drift and drift.get("drift_type") == "title_changed":
                self.logger.info(f"[drift] title_changed chat={chat_id}: {drift.get('details')}")
                # Desvincular y crear sugerencia con los nuevos candidatos
                await asyncio.to_thread(unlink_group, self.distribuidor_id, chat_id, "title_changed", "auto_drift")
                candidates = await asyncio.to_thread(score_group_vendor_candidates, self.distribuidor_id, chat_id)
                for c in candidates[:3]:
                    if c["score"] > 0.5:
                        await asyncio.to_thread(
                            create_suggestion,
                            self.distribuidor_id, chat_id,
                            c["id_vendedor"], c["score"], c["reasons"], "drift_title",
                        )
        except Exception as e:
            self.logger.warning(f"[drift-check] chat={chat_id}: {e}")

    async def handle_new_chat_members(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Se activa cuando alguien entra al grupo (o el bot es añadido)."""
        if not update.message or not update.message.new_chat_members:
            return
        
        chat = update.message.chat
        chat_title = chat.title or "Grupo"
        
        for member in update.message.new_chat_members:
            self.logger.info(f"➕ Nuevo integrante en {chat_title}: {member.full_name} ({member.id})")
            await asyncio.to_thread(
                self._register_user_and_group,
                self.distribuidor_id, chat.id, chat_title, member.id,
                member.username or "", member.first_name or "Usuario"
            )

    async def handle_chat_member_update(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Monitorea cambios de estado (joins/leaves) vía ChatMemberHandler."""
        result = update.chat_member
        if not result:
            return
        
        # Solo nos interesan los que 'entran' de alguna forma
        if result.new_chat_member.status in ("member", "administrator", "creator"):
            user = result.new_chat_member.user
            chat = update.effective_chat
            chat_title = chat.title or "Grupo"
            
            self.logger.info(f"👤 Update de miembro en {chat_title}: {user.full_name}")
            await asyncio.to_thread(
                self._register_user_and_group,
                self.distribuidor_id, chat.id, chat_title, user.id,
                user.username or "", user.first_name or "Usuario"
            )

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
                vendedor = ex.get("vendedor_nombre")

                def _clean_text(val: object) -> str:
                    if val is None:
                        return ""
                    txt = str(val).strip()
                    if not txt:
                        return ""
                    # Normalizar placeholders comunes que no sirven para mostrar.
                    if txt.lower() in {"none", "null", "nan", "sin cliente", "s/c", "0"}:
                        return ""
                    return txt

                # El campo "Cliente" debe priorizar el string enriquecido si existe
                cliente = (
                    _clean_text(ex.get("cliente"))
                    or _clean_text(ex.get("nro_cliente"))
                    or _clean_text(ex.get("id_cliente_erp"))
                    or _clean_text(ex.get("cliente_sombra_codigo"))
                    or _clean_text(ex.get("id_cliente_pdv"))
                )
                tipo = (
                    _clean_text(ex.get("tipo_pdv"))
                    or _clean_text(ex.get("tipo"))
                    or _clean_text(ex.get("canal"))
                )
                comentario = ex.get("comentarios") or ""
                supervisor = ex.get("supervisor_nombre") or "Supervisor"

                # Evita textos "None"/vacíos en mensajes de evaluación.
                vendedor_txt = (str(vendedor).strip() if vendedor is not None else "") or "Sin vendedor"
                cliente_txt = (str(cliente).strip() if cliente is not None else "") or "Sin cliente"
                tipo_txt = (str(tipo).strip() if tipo is not None else "") or "Sin tipo"

                icon = {"Aprobado": "✅", "Rechazado": "❌", "Destacado": "🔥"}.get(estado, "⏳")

                if estado == "Destacado":
                    estado_text = self._msg("eval_destacada")
                elif estado == "Aprobado":
                    estado_text = self._msg("eval_aprobada", supervisor=supervisor)
                elif estado == "Rechazado":
                    estado_text = self._msg("eval_rechazada", supervisor=supervisor)
                else:
                    estado_text = f"{icon} <b>{estado}</b> por {supervisor}"

                if comentario:
                    estado_text += self._msg("eval_nota", comentario=comentario)

                msg_text = self._msg(
                    "eval_header",
                    vendedor=vendedor_txt,
                    cliente=cliente_txt,
                    tipo=tipo_txt,
                    estado_bloque=estado_text,
                    __raw_estado_bloque=True,
                    __raw_vendedor=True,
                    __raw_cliente=True,
                    __raw_tipo=True,
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
                    await asyncio.to_thread(self.db.marcar_synced, ex["id"])
                except BadRequest as e:
                    self.logger.warning(f"⚠️ No se pudo editar msg {msg_id}: {e}")
                    # Mismo contenido → Telegram no edita; evitar reintentos eternos
                    if "message is not modified" in str(e).lower():
                        await asyncio.to_thread(self.db.marcar_synced, ex["id"])
                except Exception as e:
                    self.logger.error(f"❌ Error editando msg {msg_id}: {e}")

        except Exception as e:
            self.logger.error(f"Error en sync_evaluaciones_job: {e}")

    # ─────────────────────────────────────────────────────────────
    # JOB: Limpiar sesiones expiradas
    # ─────────────────────────────────────────────────────────────

    async def cleanup_sessions_job(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        from core.bot_upload_session_store import purge_expired_upload_sessions

        now = time.time()
        expired = [
            uid
            for uid, s in self.upload_sessions.items()
            if now - s.get("created_at", now) > self.UPLOAD_SESSION_TTL_SECS
        ]
        for uid in expired:
            await self._upload_session_delete(uid)
        purged = await asyncio.to_thread(purge_expired_upload_sessions)
        if expired or purged:
            self.logger.info(
                f"🧹 sesiones expiradas: memoria={len(expired)} db={purged}"
            )

    async def objetivos_daily_reminder_job(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        """
        Recordatorio diario 08:00 AR para vendedores con objetivos activos.
        Resume progreso y fecha límite para impulsar ejecución diaria.
        """
        from services.objetivos_notification_service import objetivos_telegram_seguimiento_enabled

        if not objetivos_telegram_seguimiento_enabled():
            return

        dist_id = self.distribuidor_id
        try:
            rows = await asyncio.to_thread(
                self.db.sb.table("integrantes_grupo")
                .select("id_vendedor_v2, telegram_group_id, nombre_integrante")
                .eq("id_distribuidor", dist_id)
                .execute
            )
            integrantes = [
                r for r in (rows.data or [])
                if r.get("id_vendedor_v2")
                and r.get("telegram_group_id") not in (None, "", "0")
            ]
            if not integrantes:
                return

            vendors_map: dict[int, dict[str, Any]] = {}
            for r in integrantes:
                vid = int(r["id_vendedor_v2"])
                if vid not in vendors_map:
                    vendors_map[vid] = {
                        "chat_id": int(r["telegram_group_id"]),
                        "nombre": r.get("nombre_integrante") or "Vendedor",
                    }

            objetivos_res = await asyncio.to_thread(
                self.db.sb.table("objetivos")
                .select("id, id_vendedor, tipo, valor_actual, valor_objetivo, fecha_objetivo, cumplido, tasa_pendientes")
                .eq("id_distribuidor", dist_id)
                .eq("cumplido", False)
                .in_("id_vendedor", list(vendors_map.keys()))
                .order("fecha_objetivo", desc=False)
                .execute
            )
            # Filtrar objetivos de ruteo (uso interno de supervisores)
            objetivos = [o for o in (objetivos_res.data or []) if str(o.get("tipo") or "") != "ruteo"]
            if not objetivos:
                return

            by_vendor: DefaultDict[int, list[dict[str, Any]]] = defaultdict(list)
            for obj in objetivos:
                try:
                    by_vendor[int(obj["id_vendedor"])].append(obj)
                except Exception:
                    continue

            tipo_label = {
                "exhibicion": "Exhibición",
                "conversion_estado": "Activación",
                "activacion": "Activación",
                "cobranza": "Cobranza",
                "ruteo": "Ruteo",
                "ruteo_alteo": "Alteo",
                "compradores": "Compradores",
            }
            hoy = datetime.now(AR_TZ).date()
            sent = 0
            for vendor_id, objs in by_vendor.items():
                info = vendors_map.get(vendor_id)
                if not info:
                    continue
                lines = [
                    f"⏰ <b>Recordatorio diario de objetivos</b>",
                    f"👤 <b>{html.escape(str(info['nombre']), quote=False)}</b>",
                    f"📊 Tenés <b>{len(objs)}</b> objetivo{'s' if len(objs) != 1 else ''} activo{'s' if len(objs) != 1 else ''}:",
                ]
                for o in objs[:6]:
                    tipo = str(o.get("tipo") or "").strip().lower()
                    tipo_txt = tipo_label.get(tipo, tipo.replace("_", " ").title() or "Objetivo")
                    try:
                        vo = float(o.get("valor_objetivo") or 0)
                    except (ValueError, TypeError):
                        vo = 0.0
                    try:
                        va = float(o.get("valor_actual") or 0)
                    except (ValueError, TypeError):
                        va = 0.0
                    tasa = o.get("tasa_pendientes")
                    try:
                        tasa_val = float(tasa) if tasa is not None and str(tasa).strip() else 0.0
                    except ValueError:
                        tasa_val = 0.0
                    umbral = max(0.0, vo - tasa_val) if (vo > 0 and tasa is not None) else vo
                    pct = 0 if umbral <= 0 else int(max(0, min(100, round((va / umbral) * 100))))
                    fecha = str(o.get("fecha_objetivo") or "")[:10]
                    vence_txt = ""
                    if len(fecha) == 10 and fecha.count("-") == 2:
                        try:
                            fl = datetime.fromisoformat(fecha).date()
                            dias = (fl - hoy).days
                            if dias > 0:
                                vence_txt = f" · vence en {dias}d"
                            elif dias == 0:
                                vence_txt = " · vence hoy"
                            else:
                                vence_txt = f" · vencido {abs(dias)}d"
                        except Exception:
                            pass
                    lines.append(f"• <b>{tipo_txt}</b>: {int(va) if va.is_integer() else round(va, 1)}/{int(vo) if vo.is_integer() else round(vo, 1)} ({pct}%){vence_txt}")

                lines.append("\n📲 Usá <code>/objetivos</code> para ver el detalle completo.")
                await context.bot.send_message(
                    chat_id=info["chat_id"],
                    text="\n".join(lines),
                    parse_mode=ParseMode.HTML,
                )
                sent += 1
            if sent:
                self.logger.info(f"[objetivos_daily_reminder] dist={dist_id} recordatorios enviados={sent}")
        except Exception as e:
            self.logger.warning(f"[objetivos_daily_reminder] dist={dist_id}: {e}")

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

        # Guardar referencia a la app para _apply_menu_commands
        self.application = application

        # Intentar configurar menú desde bot_commands (DB); fallback a lista fija
        try:
            await self._apply_menu_commands()
        except Exception:
            # Fallback: lista fija de comandos
            try:
                await application.bot.set_my_commands([
                    BotCommand("start",     "Iniciar el bot"),
                    BotCommand("help",      "Cómo usar el bot"),
                    BotCommand("stats",     "Mis estadísticas"),
                    BotCommand("ranking",   "Ranking del mes"),
                    BotCommand("objetivos", "Mis objetivos y progreso"),
                    BotCommand("cartera",   "Mi cartera de clientes"),
                    BotCommand("ventas",    "Mis ventas del mes"),
                    BotCommand("cuentas",   "Cuentas corrientes"),
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
        app.add_handler(CommandHandler("vincular",   self.cmd_vincular))
        app.add_handler(CommandHandler("ranking",    self.cmd_ranking))
        app.add_handler(CommandHandler("objetivos",  self.cmd_objetivos))
        app.add_handler(CommandHandler("cadenaone",  self.cmd_cadenaone))
        app.add_handler(CommandHandler("reset",      self.cmd_reset))
        app.add_handler(CommandHandler("hardreset",  self.cmd_hardreset))
        app.add_handler(CommandHandler("cartera",    self.cmd_cartera))
        app.add_handler(CommandHandler("carterahoy", lambda u, c: self.cmd_cartera(u, c, force_mode="hoy")))
        app.add_handler(CommandHandler("ventas",     self.cmd_ventas))
        app.add_handler(CommandHandler("cuentas",    self.cmd_cuentas))
        app.add_handler(MessageHandler(filters.COMMAND, self._handle_custom_command))

        # Foto y texto
        app.add_handler(MessageHandler(filters.PHOTO, self.handle_photo))
        app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_text))
        
        # Eventos de grupo
        app.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_TITLE, self.handle_new_chat_title))
        app.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_MEMBERS, self.handle_new_chat_members))
        app.add_handler(ChatMemberHandler(self.handle_chat_member_update, ChatMemberHandler.CHAT_MEMBER))

        # Callbacks (solo selección de tipo PDV — sin evaluación)
        app.add_handler(CallbackQueryHandler(self.button_callback))

        # Error handler
        app.add_error_handler(self.error_handler)

        # Jobs periódicos
        app.job_queue.run_repeating(self.sync_evaluaciones_job, interval=30, first=10)
        app.job_queue.run_repeating(self.cleanup_sessions_job,  interval=300, first=60)
        from services.objetivos_notification_service import objetivos_telegram_seguimiento_enabled
        if objetivos_telegram_seguimiento_enabled():
            app.job_queue.run_daily(
                self.objetivos_daily_reminder_job,
                time=dt_time(hour=8, minute=0, tzinfo=AR_TZ),
                days=(0, 1, 2, 3, 4, 5),  # Lunes a Sábado, excluye Domingo (6)
                name=f"objetivos_daily_reminder_{self.distribuidor_id}",
            )


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