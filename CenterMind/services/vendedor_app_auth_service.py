# -*- coding: utf-8 -*-
"""
Servicio de autenticación para la app móvil de vendedores (SHELFYAPP).

Gestiona el ciclo de vida de API keys, dispositivos y sesiones.

Formato de key: sapp_{key_id}_{random32chars}
  - key_id: ID de la fila en vendedor_app_keys (lookup O(1) sin escaneo tabla).
  - random32chars: el secreto real que se hashea con scrypt y se almacena en key_hash.
  - La key completa se muestra UNA SOLA VEZ al crearla; nunca se almacena en plain text.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from core.vendedor_app_auth import (
    build_full_key,
    generate_random_token,
    hash_key,
    issue_session_jwt,
    parse_key,
    verify_key,
)

logger = logging.getLogger("ShelfyAPI")


# ─── Helpers internos ─────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _fetch_key_row(sb, key_id: int) -> dict | None:
    """Recupera la fila de vendedor_app_keys por ID."""
    res = (
        sb.table("vendedor_app_keys")
        .select("*")
        .eq("id", key_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _fetch_branding(sb, id_distribuidor: int) -> dict:
    """Retorna mobile_branding del distribuidor con defaults razonables."""
    defaults: dict[str, Any] = {
        "primary_color": "#a855f7",
        "logo_url": None,
        "app_name": "Shelfy",
        "accent_color": "#7C3AED",
    }
    try:
        res = (
            sb.table("distribuidores")
            .select("mobile_branding")
            .eq("id_distribuidor", id_distribuidor)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("mobile_branding"):
            branding = res.data[0]["mobile_branding"]
            if isinstance(branding, dict):
                return {**defaults, **branding}
    except Exception as e:
        logger.warning(f"fetch_branding error for dist {id_distribuidor}: {e}")
    return defaults


# ─── Operaciones de clave ─────────────────────────────────────────────────────


def create_vendor_key(
    sb,
    id_distribuidor: int,
    id_vendedor: int,
    label: str | None,
    created_by: str,
) -> dict:
    """
    Crea una nueva API key para un vendedor.

    Flujo:
      1. Insertar fila con key_hash="" (placeholder) para obtener el key_id.
      2. Generar random_token, construir full_key = sapp_{key_id}_{random_token}.
      3. Hashear random_token → key_hash; actualizar la fila.
      4. Retornar {"key": full_key, "key_id": key_id} — plaintext SOLO aquí.
    """
    # Paso 1: insertar fila placeholder para obtener ID auto-incremental
    insert_data = {
        "id_distribuidor": id_distribuidor,
        "id_vendedor": id_vendedor,
        "key_hash": "placeholder",
        "activo": True,
        "label": label or f"Clave {id_vendedor}",
        "created_by": created_by,
    }
    ins = sb.table("vendedor_app_keys").insert(insert_data).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Error al crear clave de vendedor")

    key_id: int = int(ins.data[0]["id"])

    # Paso 2: generar token y construir key completa
    random_token = generate_random_token()
    full_key = build_full_key(key_id, random_token)

    # Paso 3: hashear y actualizar
    hashed = hash_key(random_token)
    upd = (
        sb.table("vendedor_app_keys")
        .update({"key_hash": hashed})
        .eq("id", key_id)
        .execute()
    )
    if not upd.data:
        logger.error(f"No se pudo actualizar key_hash para key_id={key_id}")
        raise HTTPException(status_code=500, detail="Error al finalizar clave de vendedor")

    logger.info(f"API key creada: key_id={key_id} vendor={id_vendedor} dist={id_distribuidor}")
    return {
        "key": full_key,       # plaintext — mostrar UNA SOLA VEZ
        "key_id": key_id,
        "id_vendedor": id_vendedor,
        "id_distribuidor": id_distribuidor,
        "label": label or f"Clave {id_vendedor}",
    }


def activate_key(
    sb,
    plain_key: str,
    device_id: str,
    platform: str,
    app_version: str | None,
) -> dict:
    """
    Activa una API key y registra el dispositivo.

    Flujo:
      1. Parsear key_id del token.
      2. Cargar fila por key_id (O(1)).
      3. Verificar hash del random_token contra key_hash.
      4. Verificar que la clave esté activa y no revocada.
      5. Upsert dispositivo en vendedor_app_devices.
      6. Emitir JWT de sesión.
      7. Retornar session_token, id_vendedor, id_distribuidor, branding.
    """
    # Paso 1: parsear
    try:
        key_id, random_token = parse_key(plain_key)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Formato de clave inválido: {e}")

    # Paso 2: cargar fila
    row = _fetch_key_row(sb, key_id)
    if row is None:
        raise HTTPException(status_code=401, detail="Clave no encontrada")

    # Paso 4: verificar estado
    if not row.get("activo", False):
        raise HTTPException(status_code=401, detail="Clave desactivada o revocada")
    if row.get("revoked_at") is not None:
        raise HTTPException(status_code=401, detail="Clave revocada")

    # Paso 3: verificar hash
    if not verify_key(random_token, row["key_hash"]):
        raise HTTPException(status_code=401, detail="Clave inválida")

    id_distribuidor: int = int(row["id_distribuidor"])
    id_vendedor: int = int(row["id_vendedor"])

    # Paso 5: upsert dispositivo
    register_device(sb, key_id, device_id, platform, app_version)

    # Paso 6: emitir JWT
    session_token = issue_session_jwt(id_distribuidor, id_vendedor, key_id, device_id)

    # Paso 7: retornar
    branding = _fetch_branding(sb, id_distribuidor)
    logger.info(f"Dispositivo activado: key_id={key_id} device={device_id} vendor={id_vendedor}")
    return {
        "session_token": session_token,
        "id_vendedor": id_vendedor,
        "id_distribuidor": id_distribuidor,
        "branding": branding,
    }


def register_device(
    sb,
    key_id: int,
    device_id: str,
    platform: str,
    app_version: str | None,
) -> dict:
    """
    Upsert de dispositivo en vendedor_app_devices.
    Actualiza last_seen, platform, app_version en cada activación.
    """
    now = _now_iso()
    device_data = {
        "key_id": key_id,
        "device_id": device_id,
        "platform": platform or "unknown",
        "app_version": app_version,
        "last_seen": now,
        "activo": True,
    }
    try:
        # Upsert por UNIQUE(key_id, device_id)
        res = (
            sb.table("vendedor_app_devices")
            .upsert(device_data, on_conflict="key_id,device_id")
            .execute()
        )
        return res.data[0] if res.data else device_data
    except Exception as e:
        logger.warning(f"register_device error key_id={key_id} device={device_id}: {e}")
        # Si upsert falla (constraint diferente), intentar insert ignorando conflicto
        try:
            existing = (
                sb.table("vendedor_app_devices")
                .select("*")
                .eq("key_id", key_id)
                .eq("device_id", device_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                upd = (
                    sb.table("vendedor_app_devices")
                    .update({"last_seen": now, "platform": platform, "app_version": app_version, "activo": True})
                    .eq("key_id", key_id)
                    .eq("device_id", device_id)
                    .execute()
                )
                return upd.data[0] if upd.data else device_data
        except Exception as e2:
            logger.error(f"register_device retry failed: {e2}")
        return device_data


def revoke_device(sb, key_id: int, device_id: str) -> None:
    """Marca un dispositivo como inactivo (no lo elimina)."""
    sb.table("vendedor_app_devices").update({"activo": False}).eq("key_id", key_id).eq("device_id", device_id).execute()
    logger.info(f"Dispositivo revocado: key_id={key_id} device={device_id}")


def revoke_key(sb, key_id: int, revoked_by: str) -> None:
    """Desactiva una API key. Los JWTs emitidos siguen siendo válidos hasta expirar."""
    now = _now_iso()
    sb.table("vendedor_app_keys").update({
        "activo": False,
        "revoked_at": now,
        "revoked_by": revoked_by,
    }).eq("id", key_id).execute()
    logger.info(f"API key revocada: key_id={key_id} por {revoked_by}")


def list_vendor_keys(
    sb,
    id_distribuidor: int,
    id_vendedor: int | None = None,
) -> list[dict]:
    """
    Lista claves activas para una distribuidora (opcionalmente filtradas por vendedor).
    Incluye conteo de dispositivos activos.
    """
    query = (
        sb.table("vendedor_app_keys")
        .select("id, id_vendedor, label, activo, created_at, created_by, revoked_at")
        .eq("id_distribuidor", id_distribuidor)
    )
    if id_vendedor is not None:
        query = query.eq("id_vendedor", id_vendedor)

    keys = query.order("created_at", desc=True).execute().data or []

    # Enriquecer con conteo de dispositivos activos
    for k in keys:
        try:
            dev_count = (
                sb.table("vendedor_app_devices")
                .select("id", count="exact")
                .eq("key_id", k["id"])
                .eq("activo", True)
                .execute()
            )
            k["device_count"] = dev_count.count if hasattr(dev_count, "count") else len(dev_count.data or [])
        except Exception:
            k["device_count"] = 0

    return keys
