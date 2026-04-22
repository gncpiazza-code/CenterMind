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
from typing import Any, Dict, List, Optional, Tuple, DefaultDict
from collections import defaultdict
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
    ChatMemberHandler,
    filters,
)
# Google Drive imports eliminados — fotos van a Supabase Storage
import json

from core.helpers import build_qa_exhibicion_integrante_ids, is_exhibicion_qa_display_for_dist

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
        return res.data if res.data else []

    def marcar_synced(self, exhibicion_id: str) -> None:
        self.sb.table("exhibiciones").update({"synced_telegram": 1}).eq("id_exhibicion", exhibicion_id).execute()

    @retry_supabase()
    def get_stats_vendedor(self, distribuidor_id: int, vendedor_id: int) -> Dict:
        ig_res = self.sb.table("integrantes_grupo").select("id_integrante").eq("id_distribuidor", distribuidor_id).eq("telegram_user_id", vendedor_id).limit(1).execute()
        if not ig_res.data:
            return None
        pk_integrante = ig_res.data[0]["id_integrante"]

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

            # 2. Fetch Exhibitions (con paginación para > 1000 registros)
            exhibiciones = []
            offset = 0
            while True:
                q = self.sb.table("exhibiciones").select("id_integrante, estado")\
                    .eq("id_distribuidor", distribuidor_id)\
                    .gte("timestamp_subida", start_date)\
                    .order("timestamp_subida")\
                    .range(offset, offset + 999)
                
                if end_date:
                    q = q.lt("timestamp_subida", end_date)
                    
                res_ex = q.execute()
                batch = res_ex.data or []
                exhibiciones.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000

            # 3. Fetch Integrantes y Sucursales para nombres y unificación
            try:
                res_int = self.sb.table("integrantes_grupo")\
                    .select("id_integrante, telegram_user_id, nombre_integrante, id_sucursal_erp, id_vendedor_v2, activo")\
                    .eq("id_distribuidor", distribuidor_id).execute()
            except Exception as e_int:
                # Compatibilidad con esquemas legacy sin columna `activo`.
                if "column integrantes_grupo.activo does not exist" in str(e_int).lower() or "42703" in str(e_int):
                    res_int = self.sb.table("integrantes_grupo")\
                        .select("id_integrante, telegram_user_id, nombre_integrante, id_sucursal_erp, id_vendedor_v2")\
                        .eq("id_distribuidor", distribuidor_id).execute()
                else:
                    raise

            # Mapas para metadata
            int_to_user = {i["id_integrante"]: i["telegram_user_id"] for i in res_int.data or [] if i.get("telegram_user_id")}
            user_meta = {}

            # REGLAS ESPECIALES DIST 3 (MARZO AUDIT)
            EXCLUDE_UIDS = [9001156, 9000101] if distribuidor_id == 3 else [] # Ivan duplicado + Matias Wüthrich (fusionado → Ivan Wuthrich 9000666)
            LUCIANO_UIDS = [6823099488, 9000005, 9000202] if distribuidor_id == 3 else []

            # Fetch nombre_erp desde vendedores_v2 para mostrar nombre ERP en ranking
            vendedor_ids = [i["id_vendedor_v2"] for i in res_int.data or [] if i.get("id_vendedor_v2")]
            nombre_erp_map = {}
            if vendedor_ids:
                try:
                    res_vend = self.sb.table("vendedores_v2")\
                        .select("id_vendedor, nombre_erp")\
                        .in_("id_vendedor", vendedor_ids).execute()
                    nombre_erp_map = {v["id_vendedor"]: v["nombre_erp"] for v in res_vend.data or []}
                except Exception:
                    pass

            for i in res_int.data or []:
                tuid = i.get("telegram_user_id")
                if not tuid or tuid in EXCLUDE_UIDS: continue
                # Filtrar vendedores inactivos (activo=False); si la columna no existe, tratar como activo
                if i.get("activo") is False:
                    continue

                # Unificación Luciano
                identity_key = "LUCIANO_UNIFIED" if tuid in LUCIANO_UIDS else tuid

                # Prefer nombre_erp from vendedores_v2, fallback to nombre_integrante
                id_vend = i.get("id_vendedor_v2")
                display_name = nombre_erp_map.get(id_vend) if id_vend else None
                if not display_name:
                    display_name = "LUCIANO ITURRIA" if identity_key == "LUCIANO_UNIFIED" else i["nombre_integrante"]

                if identity_key not in user_meta:
                    user_meta[identity_key] = {
                        "nombre": "LUCIANO ITURRIA" if identity_key == "LUCIANO_UNIFIED" else display_name,
                        "sucursal_id": i["id_sucursal_erp"]
                    }

            res_suc = self.sb.table("sucursales")\
                .select("id_sucursal_erp, nombre_erp")\
                .eq("id_distribuidor", distribuidor_id).execute()
            suc_map = {s["id_sucursal_erp"]: s["nombre_erp"] for s in res_suc.data or []}

            # 4. Agregación con DEDUPLICACIÓN robusta (URL > MsgID)
            stats = defaultdict(lambda: {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0})
            seen_urls = set()
            seen_msgs = set()

            for e in exhibiciones:
                iid = e.get("id_integrante")
                if iid in qa_ids:
                    continue
                tuid = int_to_user.get(iid)
                if not tuid or tuid in EXCLUDE_UIDS: continue
                
                # Deduplicación
                is_dupe = False
                url = e.get("url_foto_drive")
                msg_id = e.get("telegram_msg_id")
                
                if url:
                    if url in seen_urls: is_dupe = True
                    else: seen_urls.add(url)
                elif msg_id:
                    msg_key = (tuid, e.get("telegram_chat_id"), msg_id)
                    if msg_key in seen_msgs: is_dupe = True
                    else: seen_msgs.add(msg_key)
                
                if is_dupe: continue

                # Identidad unificada (Luciano)
                identity_key = "LUCIANO_UNIFIED" if tuid in LUCIANO_UIDS else tuid
                est = (e.get("estado") or "").lower()
                
                if est in ('aprobado', 'aprobada'):
                    stats[identity_key]["aprobadas"] += 1
                    stats[identity_key]["puntos"] += 1
                elif est in ('destacado', 'destacada'):
                    stats[identity_key]["destacadas"] += 1
                    stats[identity_key]["aprobadas"] += 1 
                    stats[identity_key]["puntos"] += 2
                elif est in ('rechazado', 'rechazada'):
                    stats[identity_key]["rechazadas"] += 1

            # 5. Formatear ranking
            ranking = []
            for tuid, s in stats.items():
                meta = user_meta.get(tuid, {})
                nombre_fin = meta.get("nombre", f"User {tuid}")
                if is_exhibicion_qa_display_for_dist(distribuidor_id, nombre_fin):
                    continue
                suc_id = meta.get("sucursal_id")
                ranking.append({
                    "vendedor":   nombre_fin,
                    "sucursal":   suc_map.get(suc_id, "S/D"),
                    "puntos":     s["puntos"],
                    "aprobadas":  s["aprobadas"],
                    "destacadas": s["destacadas"],
                    "rechazadas": s["rechazadas"]
                })

            ranking.sort(key=lambda x: (x["puntos"], x["aprobadas"]), reverse=True)
            return ranking[:100]

        except Exception as e:
            # Fallback al RPC original si algo falla en Python (aunque probablemente también falle)
            try:
                res = self.sb.rpc("fn_dashboard_ranking", {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_top": 100}).execute()
                return res.data or []
            except:
                raise e

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

    STAGE_WAITING_ID   = "WAITING_ID"
    STAGE_WAITING_TYPE = "WAITING_TYPE"

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
                    f"⚠️ <b>Carga pausada por disposición de Casa Matriz.</b>\n\n"
                    f"Motivo: <i>{motivo}</i>",
                    parse_mode=ParseMode.HTML
                )
                return False
        except Exception as e:
            self.logger.error(f"Error en check_compliance: {e}")
        return True

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
                await m.reply_text("⚠️ <b>Esta cuenta ha sido desactivada o unificada.</b>", parse_mode=ParseMode.HTML)
                return

            related_uids = LUCIANO_UIDS if uid in LUCIANO_UIDS else [uid]
            
            # 1. Obtener todos los id_integrante para este vendedor (scoped a este distribuidor)
            try:
                res_int = await asyncio.to_thread(
                    self.db.sb.table("integrantes_grupo")
                        .select("id_integrante, activo")
                        .eq("id_distribuidor", self.distribuidor_id)
                        .in_("telegram_user_id", related_uids)
                        .execute
                )
            except Exception as e_int:
                # Compatibilidad con esquemas legacy donde `integrantes_grupo` no tiene `activo`.
                if "column integrantes_grupo.activo does not exist" in str(e_int).lower() or "42703" in str(e_int):
                    res_int = await asyncio.to_thread(
                        self.db.sb.table("integrantes_grupo")
                            .select("id_integrante")
                            .eq("id_distribuidor", self.distribuidor_id)
                            .in_("telegram_user_id", related_uids)
                            .execute
                    )
                else:
                    raise
            # Filtrar inactivos (activo=False); si la columna no existe, tratar como activo
            iids = [r["id_integrante"] for r in res_int.data or [] if r.get("activo") is not False]
            if not iids:
                self.logger.warning(f"[stats] uid={uid} dist={self.distribuidor_id} no tiene integrantes activos")
                await m.reply_text("⚠️ <b>No estás registrado en el sistema.</b>", parse_mode=ParseMode.HTML)
                return

            # 2. Calcular rangos: mes actual y mes anterior
            now = datetime.now(AR_TZ)
            start_mes_actual = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            # Mes anterior
            if now.month == 1:
                prev_y, prev_m = now.year - 1, 12
            else:
                prev_y, prev_m = now.year, now.month - 1
            start_mes_prev = now.replace(year=prev_y, month=prev_m, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_mes_prev = start_mes_actual

            # 3. Consultar exhibiciones de ambos meses (paginar en lotes de 1000 por límite PostgREST)
            all_ex: list[dict] = []
            BATCH = 1000
            offset = 0
            while True:
                res_ex = await asyncio.to_thread(
                    self.db.sb.table("exhibiciones")
                        .select("id_integrante, telegram_chat_id, telegram_msg_id, url_foto_drive, timestamp_subida, estado")
                        .eq("id_distribuidor", self.distribuidor_id)
                        .in_("id_integrante", iids)
                        .gte("timestamp_subida", start_mes_prev.isoformat())
                        .range(offset, offset + BATCH - 1)
                        .execute
                )
                batch = res_ex.data or []
                all_ex.extend(batch)
                if len(batch) < BATCH:
                    break
                offset += BATCH
            self.logger.debug(f"[stats] uid={uid} dist={self.distribuidor_id} total_ex={len(all_ex)}")

            def _calc_counts(exhibiciones_list):
                seen_urls = set()
                seen_msgs = set()
                counts = {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "pendientes": 0, "puntos": 0}
                for e in exhibiciones_list:
                    is_dupe = False
                    url = e.get("url_foto_drive")
                    msg_id = e.get("telegram_msg_id")
                    if url:
                        if url in seen_urls: is_dupe = True
                        else: seen_urls.add(url)
                    elif msg_id:
                        msg_key = (e.get("id_integrante"), e.get("telegram_chat_id"), msg_id)
                        if msg_key in seen_msgs: is_dupe = True
                        else: seen_msgs.add(msg_key)
                    if is_dupe: continue
                    est = (e.get("estado") or "").lower()
                    if est in ('aprobado', 'aprobada'):
                        counts["aprobadas"] += 1; counts["puntos"] += 1
                    elif est in ('destacado', 'destacada'):
                        counts["destacadas"] += 1; counts["puntos"] += 2
                    elif est in ('rechazado', 'rechazada'):
                        counts["rechazadas"] += 1
                    else:
                        counts["pendientes"] += 1
                return counts

            # Separar por periodo — comparar como datetime para evitar errores de string con TZ offset
            def _parse_ts(ts: str) -> datetime:
                try:
                    return datetime.fromisoformat(ts)
                except Exception:
                    return datetime.min.replace(tzinfo=AR_TZ)

            ex_actual = [e for e in all_ex if _parse_ts(e.get("timestamp_subida", "")) >= start_mes_actual]
            ex_prev   = [e for e in all_ex if start_mes_prev <= _parse_ts(e.get("timestamp_subida", "")) < end_mes_prev]

            counts_actual = _calc_counts(ex_actual)
            counts_prev = _calc_counts(ex_prev)

            total_actual = counts_actual["aprobadas"] + counts_actual["destacadas"] + counts_actual["rechazadas"] + counts_actual["pendientes"]
            total_prev = counts_prev["aprobadas"] + counts_prev["destacadas"] + counts_prev["rechazadas"] + counts_prev["pendientes"]

            display_name = "LUCIANO ITURRIA" if uid in LUCIANO_UIDS else m.from_user.first_name
            msg = (
                f"📊 <b>Tus Estadísticas — {self.nombre_dist}</b>\n"
                f"👤 Identidad: {display_name}\n\n"
                f"🗓️ <b>Mes Actual ({self.MESES[now.month]}):</b>\n"
                f"   • ✅ Aprobadas:  {counts_actual['aprobadas']}\n"
                f"   • 🔥 Destacadas: {counts_actual['destacadas']}\n"
                f"   • ❌ Rechazadas: {counts_actual['rechazadas']}\n"
                f"   • ⏳ Pendientes: {counts_actual['pendientes']}\n"
                f"   • 🏆 <b>Puntos: {counts_actual['puntos']}</b>  (fotos: {total_actual})\n\n"
                f"📅 <b>Mes Anterior ({self.MESES[prev_m]}):</b>\n"
                f"   • ✅ Aprobadas:  {counts_prev['aprobadas']}\n"
                f"   • 🔥 Destacadas: {counts_prev['destacadas']}\n"
                f"   • ❌ Rechazadas: {counts_prev['rechazadas']}\n"
                f"   • ⏳ Pendientes: {counts_prev['pendientes']}\n"
                f"   • 🏆 <b>Puntos: {counts_prev['puntos']}</b>  (fotos: {total_prev})\n"
                f"<i>(Deduplicadas por ID y URL)</i>"
            )
            await m.reply_text(msg, parse_mode=ParseMode.HTML)
        except Exception as e:
            self.logger.error(f"[stats] Error uid={uid} dist={self.distribuidor_id}: {type(e).__name__}: {e}", exc_info=True)
            await m.reply_text("❌ Error al obtener estadísticas. Intentá de nuevo en un momento.")

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
            "🏆 <b>Ranking de Exhibiciones</b>\nSeleccioná el mes que querés consultar:",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(buttons)
        )

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
        session = self.upload_sessions.get(uploader_id)
        if not session:
            return

        session["tipo_pdv"] = tipo_pdv
        nro_cliente = session["nro_cliente"]
        photos = session["photos"]
        chat_id = session["chat_id"]
        chat_title = session.get("chat_title") or str(chat_id)

        _n_pics = len(photos)
        _pics_str = f"{_n_pics} fotos" if _n_pics > 1 else "1 foto"
        try:
            if status_chat_id and status_message_id:
                await context.bot.edit_message_text(
                    chat_id=status_chat_id,
                    message_id=status_message_id,
                    text=(
                        f"✅ NRO CLIENTE: <code>{nro_cliente}</code>\n"
                        f"📍 <b>{tipo_pdv}</b>\n\n"
                        f"⏳ Registrando {_pics_str}..."
                    ),
                    parse_mode=ParseMode.HTML,
                    reply_markup=None,
                )
            else:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=(
                        f"✅ NRO CLIENTE: <code>{nro_cliente}</code>\n"
                        f"📍 <b>{tipo_pdv}</b>\n\n"
                        f"⏳ Registrando {_pics_str}..."
                    ),
                    parse_mode=ParseMode.HTML,
                    reply_to_message_id=status_reply_to or (photos[0]["message_id"] if photos else None),
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
            msg_text = (
                f"✅ <b>Exhibición registrada</b>\n\n"
                f"🏪 <b>Cliente:</b> {nro_cliente}\n"
                f"📍 <b>Tipo:</b> {tipo_pdv}\n"
                f"📸 <b>Fotos:</b> {procesadas}"
            )
            sent_msg = await context.bot.send_message(
                chat_id=chat_id,
                text=msg_text,
                parse_mode=ParseMode.HTML,
                reply_to_message_id=photos[0]["message_id"],
            )

            for ex_data in exhibicion_ids:
                await asyncio.to_thread(
                    self.db.update_telegram_refs,
                    ex_data["id"], sent_msg.message_id, chat_id
                )
            if en_cuarentena_flag:
                self.logger.info(
                    f"[Cuarentena] exhibición en revisión silenciosa "
                    f"dist={self.distribuidor_id} chat={chat_id} uploader={uploader_id}"
                )
            self.active_msgs[sent_msg.message_id] = {
                "exhibicion_id": primera_id,
                "uploader_id": uploader_id,
                "ref_msg": photos[0]["message_id"],
            }
            if fallidas > 0:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"⚠️ {fallidas} foto(s) no pudieron registrarse. Si falta alguna, reenviala.",
                )
        else:
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

        self.upload_sessions.pop(uploader_id, None)

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

            await q.edit_message_text("⏳ Obteniendo ranking...")
            
            try:
                # Necesitamos un método en DB que acepte mes/año o que soporte periodos.
                # Por ahora, si es el mes actual usamos get_ranking_mes.
                # Si es otro, necesitamos extender la lógica.
                # Por simplicidad en este paso, simularemos o usaremos el actual si coincide.
                # Construir periodo formato YYYY-MM
                periodo = f"{year}-{month:02d}"
                now = datetime.now(AR_TZ)
                if now.month == month and now.year == year:
                    periodo = "mes"
                
                ranking = await asyncio.to_thread(
                    self.db.get_ranking_periodo, self.distribuidor_id, periodo
                )
                
                if not ranking:
                    await q.edit_message_text("📊 No hay datos para ese período.")
                    return

                MESES = {
                    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
                    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
                    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
                }
                month_name = MESES.get(month, "Mes")
                
                msg = f"🏆 <b>RANKING {month_name.upper()} {year} — {self.nombre_dist}</b>\n\n"
                for i, entry in enumerate(ranking[:10], 1):
                    emoji = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
                    sucursal_text = f" ({entry['sucursal']})" if entry.get('sucursal') else ""
                    msg += (
                        f"{emoji} <b>{entry['vendedor']}</b>{sucursal_text}\n"
                        f"   ✅ Aprod: {entry['aprobadas']} | 🔥 Dest: {entry['destacadas']}\n"
                        f"   ⭐ Puntos: {entry['puntos']}\n\n"
                    )

                await q.edit_message_text(msg, parse_mode=ParseMode.HTML)
            except Exception as e:
                self.logger.error(f"Error en callback ranking: {e}")
                await q.edit_message_text("❌ Error al obtener el ranking.")
            return

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
                                    pdv_res = await asyncio.to_thread(
                                        self.db.sb.table("clientes_pdv_v2")
                                        .select("nombre_fantasia, latitud, longitud, domicilio, localidad, fecha_alta")
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
                                                self.db.sb.table("clientes_pdv_v2")
                                                .select("nombre_fantasia, latitud, longitud, domicilio, localidad, fecha_alta")
                                                .eq("id_distribuidor", self.distribuidor_id)
                                                .eq("id_cliente_erp", nro_stripped)
                                                .limit(1)
                                                .execute
                                            )
                                    if pdv_res.data:
                                        pdv = pdv_res.data[0]
                                        lat = float(pdv.get("latitud") or 0.0)
                                        lon = float(pdv.get("longitud") or 0.0)
                                        cliente_nombre = pdv.get("nombre_fantasia") or cliente_nombre
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
                f"⚠️ <b>Estado: REVISIÓN</b> — Pendiente de validación ERP"
                if en_cuarentena_flag else
                "⏳ <b>Estado:</b> Pendiente de evaluación"
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
                pdv_obj_res = self.db.sb.table("clientes_pdv_v2") \
                    .select("id_cliente, nombre_fantasia") \
                    .eq("id_distribuidor", self.distribuidor_id) \
                    .eq("id_cliente_erp", nro_cliente) \
                    .limit(1).execute()
                if not pdv_obj_res.data and nro_cliente:
                    nro_strip = nro_cliente.lstrip("0") or nro_cliente
                    if nro_strip != nro_cliente:
                        pdv_obj_res = self.db.sb.table("clientes_pdv_v2") \
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
                            objetivo_badge = (
                                f"\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
                                f"Esta exhibición cuenta para tu meta general. "
                                f"Quedó a la espera de evaluación del supervisor."
                            )
                        else:
                            objetivo_badge = (
                                f"\n\n🎯 <b>¡Objetivo de Exhibición!</b>\n"
                                f"Este PDV (<b>{pdv_nombre_obj}</b>) está en tus metas. "
                                f"Ha pasado a revisión del supervisor."
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

            # Suprimir enlace de foto cuando hay badge de objetivo para evitar
            # que Telegram genere un segundo preview de imagen en el mismo mensaje.
            foto_line_efectivo = "" if objetivo_badge else foto_line
            msg_text = (
                f"📋 <b>Exhibición registrada</b>\n\n"
                f"{fotos_text}"
                f"👤 <b>Vendedor:</b> {uploader_name}\n"
                f"🏪 <b>Cliente:</b> {nro_cliente}\n"
                f"📍 <b>Tipo:</b> {tipo_pdv}\n"
                f"{foto_line_efectivo}"
                f"{estado_label}"
                f"{objetivo_badge}"
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

            # PASO 6: Cuarentena silenciosa (sin notificación al chat)
            if en_cuarentena_flag:
                self.logger.info(
                    f"[Cuarentena] exhibición en revisión silenciosa "
                    f"dist={self.distribuidor_id} chat={chat_id} uploader={uploader_id}"
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
        self.logger.info(f"🏷️ Nuevo título en chat {chat_id}: {new_title}")
        await asyncio.to_thread(
            self.db.upsert_grupo,
            self.distribuidor_id, chat_id, new_title
        )

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
                # El RPC puede exponer el cliente con distintos aliases según versión.
                cliente = (
                    ex.get("nro_cliente")
                    or ex.get("cliente")
                    or ex.get("id_cliente_erp")
                    or ex.get("cliente_sombra_codigo")
                    or ex.get("id_cliente_pdv")
                )
                tipo     = ex.get("tipo_pdv")
                comentario = ex.get("comentarios") or ""
                supervisor = ex.get("supervisor_nombre") or "Supervisor"

                # Evita textos "None"/vacíos en mensajes de evaluación.
                vendedor_txt = (str(vendedor).strip() if vendedor is not None else "") or "Sin vendedor"
                cliente_txt = (str(cliente).strip() if cliente is not None else "") or "Sin cliente"
                tipo_txt = (str(tipo).strip() if tipo is not None else "") or "Sin tipo"

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
                    f"👤 <b>Vendedor:</b> {vendedor_txt}\n"
                    f"🏪 <b>Cliente:</b> {cliente_txt}\n"
                    f"📍 <b>Tipo:</b> {tipo_txt}\n\n"
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
        app.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_MEMBERS, self.handle_new_chat_members))
        app.add_handler(ChatMemberHandler(self.handle_chat_member_update, ChatMemberHandler.CHAT_MEMBER))

        # Callbacks (solo selección de tipo PDV — sin evaluación)
        app.add_handler(CallbackQueryHandler(self.button_callback))

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