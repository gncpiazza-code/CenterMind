# -*- coding: utf-8 -*-
"""
Utilidad de proximidad GPS para PDVs de cartera del vendedor.

Dado lat/lng del vendedor, retorna los PDVs de su cartera dentro de
un radio (metros) ordenados por distancia ascendente.
"""
from __future__ import annotations

import math
import logging
from typing import Any

from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ShelfyAPI")

# ─── Haversine ────────────────────────────────────────────────────────────────


def haversine_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos puntos GPS (fórmula haversine)."""
    R = 6_371_000  # Radio de la Tierra en metros
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── Cartera del vendedor ─────────────────────────────────────────────────────


def _fetch_rutas_para_vendedor(sb, t_rutas: str, id_vendedor: int) -> list[int]:
    """Retorna lista de id_ruta asignados al vendedor."""
    # rutas_v2_dN no tiene id_distribuidor, filtrar solo por id_vendedor
    PAGE = 1000
    rutas: list[int] = []
    offset = 0
    while True:
        batch = (
            sb.table(t_rutas)
            .select("id_ruta")
            .eq("id_vendedor", id_vendedor)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for r in batch:
            if r.get("id_ruta") is not None:
                rutas.append(int(r["id_ruta"]))
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rutas


def _pdv_display_name(pdv: dict[str, Any]) -> str:
    return (
        (pdv.get("nombre_fantasia") or "").strip()
        or (pdv.get("nombre_razon_social") or "").strip()
        or "—"
    )


def _fetch_clientes_pdv(sb, t_clientes: str, id_rutas: list[int]) -> list[dict[str, Any]]:
    """
    Retorna clientes_pdv con coordenadas para las rutas dadas.
    Paginado en 1000 filas (regla CLAUDE.md §3).
    """
    if not id_rutas:
        return []

    PAGE = 1000
    clientes: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = (
            sb.table(t_clientes)
            .select(
                "id_cliente_erp, nombre_fantasia, nombre_razon_social, latitud, longitud, id_ruta"
            )
            .in_("id_ruta", id_rutas)
            .not_.is_("latitud", "null")
            .not_.is_("longitud", "null")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        clientes.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return clientes


def pdvs_cercanos_cartera(
    sb,
    dist_id: int,
    id_vendedor: int,
    lat: float,
    lng: float,
    radio_m: float = 100.0,
) -> list[dict[str, Any]]:
    """
    Retorna PDVs de la cartera del vendedor dentro de radio_m metros.

    Resultado ordenado por distancia ascendente.
    Cada item: {id_cliente_erp, nombre_display, distancia_m, latitud, longitud, id_ruta}
    """
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)

    # Paso 1: rutas del vendedor
    id_rutas = _fetch_rutas_para_vendedor(sb, t_rutas, id_vendedor)
    if not id_rutas:
        logger.debug(f"pdvs_cercanos: sin rutas para vendor={id_vendedor} dist={dist_id}")
        return []

    # Paso 2: clientes con coords de esas rutas
    clientes = _fetch_clientes_pdv(sb, t_clientes, id_rutas)
    if not clientes:
        return []

    # Paso 3: filtrar por radio y calcular distancia
    cercanos: list[dict[str, Any]] = []
    for c in clientes:
        plat = c.get("latitud")
        plng = c.get("longitud")
        if plat is None or plng is None:
            continue
        try:
            plat_f = float(plat)
            plng_f = float(plng)
        except (TypeError, ValueError):
            continue
        dist = haversine_metros(lat, lng, plat_f, plng_f)
        if dist <= radio_m:
            cercanos.append(
                {
                    "id_cliente_erp": c.get("id_cliente_erp"),
                    "nombre_display": _pdv_display_name(c),
                    "distancia_m": round(dist, 1),
                    "latitud": plat_f,
                    "longitud": plng_f,
                    "id_ruta": c.get("id_ruta"),
                }
            )

    # Ordenar por distancia
    cercanos.sort(key=lambda x: x["distancia_m"])
    return cercanos


def pdv_buscar_texto(
    sb,
    dist_id: int,
    id_vendedor: int,
    query: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """
    Busca PDVs de la cartera del vendedor por prefijo de NRO o nombre (ilike).

    Resultado: [{id_cliente_erp, nombre_fantasia, nombre_razon_social, nombre_display, en_cartera}]
    """
    q = query.strip()
    if not q:
        return []

    t_rutas = tenant_table_name("rutas_v2", dist_id)
    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)

    id_rutas = _fetch_rutas_para_vendedor(sb, t_rutas, id_vendedor)
    if not id_rutas:
        return []

    try:
        # Buscar por NRO exacto primero
        nro_res = (
            sb.table(t_clientes)
            .select("id_cliente_erp, nombre_fantasia, nombre_razon_social")
            .in_("id_ruta", id_rutas)
            .ilike("id_cliente_erp", f"{q}%")
            .limit(limit)
            .execute()
        )
        nro_hits = nro_res.data or []

        # Completar con búsqueda en nombre si hay cupo
        remaining = limit - len(nro_hits)
        nombre_hits: list[dict] = []
        if remaining > 0:
            nombre_res = (
                sb.table(t_clientes)
                .select("id_cliente_erp, nombre_fantasia, nombre_razon_social")
                .in_("id_ruta", id_rutas)
                .or_(f"nombre_fantasia.ilike.%{q}%,nombre_razon_social.ilike.%{q}%")
                .limit(remaining + len(nro_hits))
                .execute()
            )
            seen = {r["id_cliente_erp"] for r in nro_hits}
            for r in (nombre_res.data or []):
                if r["id_cliente_erp"] not in seen and len(nombre_hits) < remaining:
                    nombre_hits.append(r)
                    seen.add(r["id_cliente_erp"])

        results = []
        for row in nro_hits + nombre_hits:
            results.append({
                "id_cliente_erp": row.get("id_cliente_erp"),
                "nombre_fantasia": row.get("nombre_fantasia") or "",
                "nombre_razon_social": row.get("nombre_razon_social") or "",
                "nombre_display": _pdv_display_name(row),
                "en_cartera": True,
            })
        return results[:limit]

    except Exception as e:
        logger.warning(f"pdv_buscar_texto dist={dist_id} vendor={id_vendedor} q={q!r}: {e}")
        return []
