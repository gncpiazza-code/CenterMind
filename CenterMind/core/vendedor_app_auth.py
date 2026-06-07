# -*- coding: utf-8 -*-
"""
Autenticación para la app móvil de vendedores (SHELFYAPP / Flutter).

Hashing: hashlib.scrypt (Python 3.11 built-in).
  Salt de 16 bytes aleatorios, almacenado inline con el hash como:
  "scrypt$<n>$<r>$<p>$<salt_hex>$<dk_hex>"

Formato de API Key: "sapp_{key_id}_{random32chars}"
  - key_id: ID entero de la fila en vendedor_app_keys (para lookup O(1)).
  - random32chars: secrets.token_urlsafe(32) que se hashea y almacena en key_hash.

JWT de sesión: 7 días, payload {sub, dist, vendor, device, type="vendedor_app"}.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from core.config import JWT_SECRET, JWT_ALGORITHM, JWT_AVAILABLE, JWTError, _jwt

logger = logging.getLogger("ShelfyAPI")

# ─── Constantes scrypt ───────────────────────────────────────────────────────
_SCRYPT_N = 2**14   # 16384 — equilibrio entre seguridad y latencia (<50ms)
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32  # 256 bits

# ─── Generación de clave ─────────────────────────────────────────────────────


def generate_random_token() -> str:
    """Genera un token aleatorio de 32 chars URL-safe (sin prefijo)."""
    return secrets.token_urlsafe(32)


def build_full_key(key_id: int, random_token: str) -> str:
    """Construye la API key completa en formato sapp_{id}_{token}."""
    return f"sapp_{key_id}_{random_token}"


def parse_key(full_key: str) -> tuple[int, str]:
    """
    Parsea 'sapp_{key_id}_{random_token}' → (key_id, random_token).
    Lanza ValueError si el formato es inválido.
    """
    if not full_key.startswith("sapp_"):
        raise ValueError("Formato de API key inválido: debe comenzar con 'sapp_'")
    rest = full_key[len("sapp_"):]
    underscore_idx = rest.index("_")  # primera _ después del prefijo
    key_id_str = rest[:underscore_idx]
    random_token = rest[underscore_idx + 1:]
    if not key_id_str.isdigit():
        raise ValueError("Formato de API key inválido: key_id no es entero")
    if not random_token:
        raise ValueError("Formato de API key inválido: token vacío")
    return int(key_id_str), random_token


# ─── Hashing ─────────────────────────────────────────────────────────────────


def hash_key(plain_token: str) -> str:
    """
    Hashea el token con scrypt.
    Retorna string en formato: "scrypt$N$r$p$<salt_hex>$<dk_hex>"
    """
    salt = os.urandom(16)
    dk = hashlib.scrypt(
        plain_token.encode(),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${dk.hex()}"


def verify_key(plain_token: str, hashed: str) -> bool:
    """
    Verifica que plain_token coincida con el hash almacenado.
    Retorna False (sin excepción) ante cualquier error de formato.
    """
    try:
        parts = hashed.split("$")
        if len(parts) != 6 or parts[0] != "scrypt":
            return False
        _, n_str, r_str, p_str, salt_hex, dk_hex = parts
        salt = bytes.fromhex(salt_hex)
        expected_dk = bytes.fromhex(dk_hex)
        n = int(n_str)
        r = int(r_str)
        p = int(p_str)
        candidate = hashlib.scrypt(
            plain_token.encode(),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected_dk),
        )
        # Comparación de tiempo constante
        return secrets.compare_digest(candidate, expected_dk)
    except Exception as e:
        logger.debug(f"verify_key error: {e}")
        return False


# ─── JWT de sesión ────────────────────────────────────────────────────────────


def issue_session_jwt(
    id_distribuidor: int,
    id_vendedor: int,
    key_id: int,
    device_id: str,
) -> str:
    """
    Emite JWT de sesión para la app móvil.
    Expiración: 7 días.
    Payload incluye type="vendedor_app" para distinguirlo de JWTs del portal.
    """
    if not JWT_AVAILABLE or _jwt is None:
        raise RuntimeError("JWT no disponible — instalar python-jose[cryptography]")
    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(days=7)
    payload = {
        "sub": str(key_id),
        "dist": id_distribuidor,
        "vendor": id_vendedor,
        "device": device_id,
        "type": "vendedor_app",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_session_jwt(token: str) -> dict:
    """
    Decodifica y valida JWT de sesión de la app móvil.
    Lanza HTTPException 401 si inválido/expirado o si type != vendedor_app.
    """
    from fastapi import HTTPException

    if not JWT_AVAILABLE or _jwt is None:
        raise HTTPException(status_code=503, detail="JWT no disponible")
    try:
        payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "vendedor_app":
            raise HTTPException(status_code=401, detail="Token no corresponde a sesión de vendedor app")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token de sesión inválido o expirado")


# ─── Integrante sintético (mobile) ───────────────────────────────────────────


def _mobile_telegram_user_id(device_id: str, id_vendedor_v2: int) -> int:
    """
    Genera un telegram_user_id sintético y estable para el dispositivo.
    Rango positivo: hash(f"mobile_{device_id}_{id_vendedor_v2}") % (2**31 - 1).
    """
    raw = f"mobile_{device_id}_{id_vendedor_v2}"
    digest = int(hashlib.sha256(raw.encode()).hexdigest(), 16)
    return digest % (2**31 - 1)


def ensure_mobile_integrante(
    sb,
    id_distribuidor: int,
    id_vendedor_v2: int,
    device_id: str,
) -> int:
    """
    Get-or-create fila en integrantes_grupo para el dispositivo móvil.

    Invariante:
      - telegram_user_id = hash(f"mobile_{device_id}_{id_vendedor_v2}") % (2**31-1)
      - telegram_group_id = -1  (sentinel: "no es Telegram")
      - source = "mobile_app"
      - id_vendedor_v2 vinculado correctamente

    Retorna el id (PK) de la fila en integrantes_grupo.
    """
    tg_user_id = _mobile_telegram_user_id(device_id, id_vendedor_v2)

    # Buscar existente por telegram_user_id + id_distribuidor
    existing = (
        sb.table("integrantes_grupo")
        .select("id")
        .eq("telegram_user_id", tg_user_id)
        .eq("id_distribuidor", id_distribuidor)
        .limit(1)
        .execute()
    )
    if existing.data:
        return int(existing.data[0]["id"])

    # Crear nuevo integrante sintético
    insert_data = {
        "id_distribuidor": id_distribuidor,
        "telegram_user_id": tg_user_id,
        "telegram_group_id": -1,
        "source": "mobile_app",
        "id_vendedor_v2": id_vendedor_v2,
        "activo": True,
    }
    try:
        result = sb.table("integrantes_grupo").insert(insert_data).execute()
        if result.data:
            return int(result.data[0]["id"])
    except Exception as e:
        # Puede haber race condition si dos requests llegan simultáneamente
        logger.warning(f"ensure_mobile_integrante insert race: {e}")
        retry = (
            sb.table("integrantes_grupo")
            .select("id")
            .eq("telegram_user_id", tg_user_id)
            .eq("id_distribuidor", id_distribuidor)
            .limit(1)
            .execute()
        )
        if retry.data:
            return int(retry.data[0]["id"])
        raise

    raise RuntimeError(f"No se pudo crear integrante sintético para device={device_id}")
