# -*- coding: utf-8 -*-
"""PDVs pendientes hasta actualización de padrón (flujo app móvil)."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("ShelfyAPI")

_TABLE = "vendedor_pdv_pendientes"


def registrar_pdv_pendiente(
    sb,
    dist_id: int,
    id_vendedor_v2: int,
    nro_cliente: str,
    notas: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    device_id: Optional[str] = None,
) -> dict:
    """
    Registra un PDV no encontrado en padrón/cartera para seguimiento posterior.
    Idempotente: si ya existe un pendiente activo para (dist, vendor, nro), lo retorna.
    """
    nro = nro_cliente.strip()
    if not nro:
        raise ValueError("nro_cliente no puede estar vacío")

    # Verificar si ya existe pendiente activo
    existing = (
        sb.table(_TABLE)
        .select("id, estado, nro_cliente")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
        .eq("nro_cliente", nro)
        .eq("estado", "pendiente")
        .limit(1)
        .execute()
    )
    if existing.data:
        return {
            "id": existing.data[0]["id"],
            "nro_cliente": nro,
            "estado": "pendiente",
            "created": False,
        }

    row = {
        "id_distribuidor": dist_id,
        "id_vendedor_v2": id_vendedor_v2,
        "nro_cliente": nro,
        "estado": "pendiente",
    }
    if notas:
        row["notas"] = notas
    if lat is not None:
        row["lat"] = lat
    if lng is not None:
        row["lng"] = lng
    if device_id:
        row["device_id"] = device_id

    res = sb.table(_TABLE).insert(row).execute()
    inserted = res.data[0] if res.data else {}
    return {
        "id": inserted.get("id"),
        "nro_cliente": nro,
        "estado": "pendiente",
        "created": True,
    }


def listar_pdv_pendientes(
    sb,
    dist_id: int,
    id_vendedor_v2: int,
    solo_activos: bool = True,
) -> list[dict]:
    """Lista PDVs pendientes del vendedor. Por defecto solo los de estado 'pendiente'."""
    q = (
        sb.table(_TABLE)
        .select("id, nro_cliente, notas, lat, lng, estado, created_at")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", id_vendedor_v2)
        .order("created_at", desc=True)
        .limit(100)
    )
    if solo_activos:
        q = q.eq("estado", "pendiente")

    res = q.execute()
    return res.data or []
