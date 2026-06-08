# -*- coding: utf-8 -*-
"""CRUD capas de planificación mapa supervisión (My Maps)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from core.tenant_tables import tenant_table_name
from db import sb

logger = logging.getLogger("mapa_capas_service")

_TABLE = "mapa_capas_planificacion"
_PAGE = 1000
_VALID_ESTADOS = frozenset({"activo", "archivado"})


def _validate_geojson_polygon(geojson: dict) -> None:
    if not isinstance(geojson, dict):
        raise HTTPException(status_code=400, detail="geojson debe ser un objeto")
    geom = geojson.get("geometry") or geojson
    if not isinstance(geom, dict):
        raise HTTPException(status_code=400, detail="geojson.geometry inválido")
    if geom.get("type") != "Polygon":
        raise HTTPException(status_code=400, detail="geojson debe ser Polygon")
    coords = geom.get("coordinates")
    if not isinstance(coords, list) or not coords or not isinstance(coords[0], list):
        raise HTTPException(status_code=400, detail="coordinates inválidas")
    ring = coords[0]
    if len(ring) < 4:
        raise HTTPException(status_code=400, detail="Polygon requiere al menos 3 vértices")


def _point_in_polygon(lng: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray casting — ring GeoJSON [lng, lat]."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def _polygon_ring_from_geojson(geojson: dict) -> list[list[float]]:
    geom = geojson.get("geometry") or geojson
    coords = geom.get("coordinates") or []
    if not coords:
        return []
    return coords[0]


def _paginate(query_builder) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        res = query_builder.range(offset, offset + _PAGE - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        offset += _PAGE
    return rows


def _validate_ruta_belongs_to_vendedor(dist_id: int, id_vendedor: int, id_ruta: int) -> None:
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    res = (
        sb.table(t_rutas)
        .select("id_ruta, id_vendedor")
        .eq("id_distribuidor", dist_id)
        .eq("id_ruta", id_ruta)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    if int(row.get("id_vendedor") or 0) != int(id_vendedor):
        raise HTTPException(status_code=400, detail="La ruta no pertenece al vendedor de la capa")


def resolve_pdv_ids_in_polygon(
    dist_id: int,
    geojson: dict,
    id_vendedor: int | None = None,
) -> list[int]:
    """PDVs con lat/lng dentro del polígono (opcional filtro vendedor)."""
    _validate_geojson_polygon(geojson)
    ring = _polygon_ring_from_geojson(geojson)
    if len(ring) < 4:
        return []

    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    q = (
        sb.table(t_clientes)
        .select("id_cliente, latitud, longitud, id_vendedor")
        .eq("id_distribuidor", dist_id)
        .not_.is_("latitud", "null")
        .not_.is_("longitud", "null")
    )
    if id_vendedor is not None:
        q = q.eq("id_vendedor", id_vendedor)

    rows = _paginate(q)
    out: list[int] = []
    for row in rows:
        try:
            lat = float(row["latitud"])
            lng = float(row["longitud"])
        except (TypeError, ValueError, KeyError):
            continue
        if _point_in_polygon(lng, lat, ring):
            cid = row.get("id_cliente")
            if cid is not None:
                out.append(int(cid))
    return sorted(set(out))


def list_capas(
    dist_id: int,
    *,
    id_vendedor: int | None = None,
    estado: str = "activo",
    offset: int = 0,
    limit: int = 100,
) -> tuple[list[dict], int]:
    if estado not in _VALID_ESTADOS:
        raise HTTPException(status_code=400, detail="estado inválido")

    base = (
        sb.table(_TABLE)
        .select("*", count="exact")
        .eq("id_distribuidor", dist_id)
        .eq("estado", estado)
        .order("orden")
        .order("id")
    )
    if id_vendedor is not None:
        base = base.eq("id_vendedor", id_vendedor)

    end = offset + max(1, min(limit, _PAGE)) - 1
    res = base.range(offset, end).execute()
    items = res.data or []
    total = res.count if res.count is not None else len(items)
    return items, int(total)


def create_capa(payload: dict, user_id: str | None) -> dict:
    dist_id = int(payload["id_distribuidor"])
    id_vendedor = int(payload["id_vendedor"])
    geojson = payload["geojson"]
    _validate_geojson_polygon(geojson)

    id_ruta = payload.get("id_ruta_anclada")
    if id_ruta is not None:
        _validate_ruta_belongs_to_vendedor(dist_id, id_vendedor, int(id_ruta))

    pdv_ids = payload.get("pdv_ids")
    if not pdv_ids:
        pdv_ids = resolve_pdv_ids_in_polygon(dist_id, geojson, id_vendedor)

    row = {
        "id_distribuidor": dist_id,
        "id_vendedor": id_vendedor,
        "id_ruta_anclada": id_ruta,
        "nombre": str(payload["nombre"]).strip(),
        "geojson": geojson,
        "pdv_ids": pdv_ids,
        "color": payload.get("color") or "#8b5cf6",
        "orden": int(payload.get("orden") or 0),
        "estado": "activo",
        "created_by": user_id,
        "updated_by": user_id,
    }
    if not row["nombre"]:
        raise HTTPException(status_code=400, detail="nombre requerido")

    res = sb.table(_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo crear la capa")
    return res.data[0]


def _get_capa_or_404(capa_id: int, dist_id: int | None = None) -> dict:
    q = sb.table(_TABLE).select("*").eq("id", capa_id)
    if dist_id is not None:
        q = q.eq("id_distribuidor", dist_id)
    res = q.limit(1).execute()
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=404, detail="Capa no encontrada")
    return row


def update_capa(capa_id: int, dist_id: int, payload: dict, user_id: str | None) -> dict:
    existing = _get_capa_or_404(capa_id, dist_id)
    patch: dict[str, Any] = {"updated_by": user_id}

    if "nombre" in payload and payload["nombre"] is not None:
        name = str(payload["nombre"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="nombre inválido")
        patch["nombre"] = name
    if "color" in payload and payload["color"] is not None:
        patch["color"] = payload["color"]
    if "orden" in payload and payload["orden"] is not None:
        patch["orden"] = int(payload["orden"])
    if "geojson" in payload and payload["geojson"] is not None:
        _validate_geojson_polygon(payload["geojson"])
        patch["geojson"] = payload["geojson"]
        id_v = int(payload.get("id_vendedor") or existing["id_vendedor"])
        patch["pdv_ids"] = payload.get("pdv_ids") or resolve_pdv_ids_in_polygon(
            dist_id, payload["geojson"], id_v
        )
    if "pdv_ids" in payload and payload["pdv_ids"] is not None and "geojson" not in patch:
        patch["pdv_ids"] = payload["pdv_ids"]

    res = sb.table(_TABLE).update(patch).eq("id", capa_id).eq("id_distribuidor", dist_id).execute()
    if not res.data:
        return existing
    return res.data[0]


def anclar_ruta(capa_id: int, dist_id: int, id_ruta_anclada: int, user_id: str | None) -> dict:
    existing = _get_capa_or_404(capa_id, dist_id)
    _validate_ruta_belongs_to_vendedor(
        dist_id, int(existing["id_vendedor"]), int(id_ruta_anclada)
    )
    res = (
        sb.table(_TABLE)
        .update({
            "id_ruta_anclada": id_ruta_anclada,
            "updated_by": user_id,
        })
        .eq("id", capa_id)
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo anclar la ruta")
    return res.data[0]


def archive_capa(capa_id: int, dist_id: int, user_id: str | None) -> dict:
    _get_capa_or_404(capa_id, dist_id)
    res = (
        sb.table(_TABLE)
        .update({
            "estado": "archivado",
            "updated_by": user_id,
        })
        .eq("id", capa_id)
        .eq("id_distribuidor", dist_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo archivar la capa")
    return res.data[0]
