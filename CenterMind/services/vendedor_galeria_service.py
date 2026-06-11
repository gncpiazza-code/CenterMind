"""Galería de exhibiciones vendor-scoped para la app móvil."""
from __future__ import annotations

import logging
from collections import defaultdict

from supabase import Client

from core.helpers import tenant_table_name
from core.galeria_publicaciones import group_exhibiciones_publicaciones

logger = logging.getLogger("ShelfyAPI")

_GALERIA_COLS = (
    "id_exhibicion,id_integrante,estado,timestamp_subida,"
    "id_cliente_pdv,id_cliente,cliente_sombra_codigo,"
    "url_foto_drive,comentario_evaluacion,supervisor_nombre"
)


def _get_vendor_integrante_ids(sb: Client, dist_id: int, id_vendedor_v2: int) -> list[int]:
    PAGE = 1000
    offset = 0
    ids: list[int] = []
    while True:
        batch = (
            sb.table("integrantes_grupo")
            .select("id_integrante")
            .eq("id_distribuidor", dist_id)
            .eq("id_vendedor_v2", id_vendedor_v2)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        ids.extend(r["id_integrante"] for r in batch if r.get("id_integrante"))
        if len(batch) < PAGE:
            break
        offset += PAGE
    return ids


def _get_cartera_erp_ids(sb: Client, dist_id: int, id_vendedor: int) -> set[str]:
    """Retorna set de id_cliente_erp de la cartera del vendedor."""
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    rutas = (
        sb.table(rutas_table)
        .select("id_ruta")
        .eq("id_vendedor", id_vendedor)
        .execute().data or []
    )
    ruta_ids = [r["id_ruta"] for r in rutas]
    if not ruta_ids:
        return set()

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    PAGE = 1000
    offset = 0
    erp_ids: set[str] = set()
    while True:
        batch = (
            sb.table(pdv_table)
            .select("id_cliente_erp")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", ruta_ids)
            .range(offset, offset + PAGE - 1)
            .execute().data or []
        )
        for r in batch:
            v = str(r.get("id_cliente_erp") or "").strip()
            if v:
                erp_ids.add(v)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return erp_ids


def _fetch_exhibiciones_vendor(
    sb: Client,
    dist_id: int,
    integrante_ids: list[int],
    id_cliente_pdv: str | None = None,
) -> list[dict]:
    if not integrante_ids:
        return []
    exh_table = tenant_table_name("exhibiciones", dist_id)
    PAGE = 1000
    offset = 0
    rows: list[dict] = []
    while True:
        q = (
            sb.table(exh_table)
            .select(_GALERIA_COLS)
            .eq("id_distribuidor", dist_id)
            .in_("id_integrante", integrante_ids)
            .order("timestamp_subida", desc=True)
        )
        if id_cliente_pdv is not None:
            q = q.eq("id_cliente_pdv", id_cliente_pdv)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def _resolve_integrante_ids(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    integrante_ids: list[int] | None = None,
) -> list[int]:
    if integrante_ids is not None:
        return integrante_ids
    return _get_vendor_integrante_ids(sb, dist_id, id_vendedor_v2)


def get_galeria_clientes_vendedor(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    *,
    integrante_ids: list[int] | None = None,
) -> list[dict]:
    """Lista PDVs de la cartera del vendedor con al menos 1 exhibición."""
    ids = _resolve_integrante_ids(sb, dist_id, id_vendedor_v2, integrante_ids)
    if not ids:
        return []

    rows = _fetch_exhibiciones_vendor(sb, dist_id, ids)

    logical: dict[str, set] = defaultdict(set)
    ultima: dict[str, str] = {}
    for r in rows:
        cid = str(r.get("id_cliente_pdv") or "").strip()
        if not cid:
            continue
        dia = (r.get("timestamp_subida") or "")[:10]
        if dia:
            logical[cid].add(dia)
        ts = r.get("timestamp_subida") or ""
        if ts > ultima.get(cid, ""):
            ultima[cid] = ts

    if not logical:
        return []

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    pdvs: dict[str, dict] = {}
    pdv_ids = list(logical.keys())
    PAGE = 1000
    for i in range(0, len(pdv_ids), PAGE):
        batch = (
            sb.table(pdv_table)
            .select("id_cliente_erp,nombre_fantasia,nombre_razon_social,latitud,longitud")
            .eq("id_distribuidor", dist_id)
            .in_("id_cliente_erp", pdv_ids[i:i + PAGE])
            .execute().data or []
        )
        for p in batch:
            cid = str(p.get("id_cliente_erp") or "")
            pdvs[cid] = p

    result = []
    for cid, dias in logical.items():
        p = pdvs.get(cid, {})
        nombre = (
            (p.get("nombre_fantasia") or "").strip()
            or (p.get("nombre_razon_social") or "").strip()
            or cid
        )
        try:
            lat = float(p["latitud"]) if p.get("latitud") is not None else None
        except (TypeError, ValueError):
            lat = None
        try:
            lng = float(p["longitud"]) if p.get("longitud") is not None else None
        except (TypeError, ValueError):
            lng = None
        result.append({
            "id_cliente_erp": cid,
            "nombre_display": nombre,
            "total_exhibiciones": len(dias),
            "ultima_exhibicion": ultima.get(cid),
            "latitud": lat,
            "longitud": lng,
        })

    return sorted(result, key=lambda x: x["ultima_exhibicion"] or "", reverse=True)


def get_galeria_cliente_timeline(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    id_cliente_erp: str,
    *,
    integrante_ids: list[int] | None = None,
) -> dict:
    """Timeline de exhibiciones de un PDV. Raises ValueError si el PDV no está en cartera."""
    erp_ids = _get_cartera_erp_ids(sb, dist_id, id_vendedor_v2)
    if id_cliente_erp not in erp_ids:
        raise ValueError("PDV no pertenece a la cartera del vendedor")

    ids = _resolve_integrante_ids(sb, dist_id, id_vendedor_v2, integrante_ids)
    rows = _fetch_exhibiciones_vendor(sb, dist_id, ids, id_cliente_pdv=id_cliente_erp)
    publicaciones = group_exhibiciones_publicaciones(rows)

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    nombre_display = id_cliente_erp
    pdv_res = (
        sb.table(pdv_table)
        .select("nombre_fantasia,nombre_razon_social")
        .eq("id_distribuidor", dist_id)
        .eq("id_cliente_erp", id_cliente_erp)
        .limit(1)
        .execute()
    )
    if pdv_res.data:
        p = pdv_res.data[0]
        nombre_display = (
            (p.get("nombre_fantasia") or "").strip()
            or (p.get("nombre_razon_social") or "").strip()
            or id_cliente_erp
        )

    return {
        "id_cliente_erp": id_cliente_erp,
        "nombre_display": nombre_display,
        "publicaciones": [pub.model_dump() for pub in publicaciones],
    }


def get_galeria_mapa_pins(
    sb: Client,
    dist_id: int,
    id_vendedor_v2: int,
    bbox: dict | None = None,
    *,
    integrante_ids: list[int] | None = None,
) -> list[dict]:
    """Pins del mapa con coords válidas. bbox={min_lat,max_lat,min_lng,max_lng}."""
    ids = _resolve_integrante_ids(sb, dist_id, id_vendedor_v2, integrante_ids)
    erp_ids = _get_cartera_erp_ids(sb, dist_id, id_vendedor_v2)
    if not ids or not erp_ids:
        return []

    pdv_table = tenant_table_name("clientes_pdv_v2", dist_id)
    erp_list = list(erp_ids)
    PAGE = 1000
    pdvs: list[dict] = []
    for i in range(0, len(erp_list), PAGE):
        q = (
            sb.table(pdv_table)
            .select("id_cliente_erp,nombre_fantasia,nombre_razon_social,latitud,longitud")
            .eq("id_distribuidor", dist_id)
            .in_("id_cliente_erp", erp_list[i:i + PAGE])
            .not_.is_("latitud", "null")
            .not_.is_("longitud", "null")
        )
        if bbox:
            q = (
                q.gte("latitud", bbox["min_lat"])
                .lte("latitud", bbox["max_lat"])
                .gte("longitud", bbox["min_lng"])
                .lte("longitud", bbox["max_lng"])
            )
        pdvs.extend(q.execute().data or [])

    # Conteo lógico por PDV
    rows = _fetch_exhibiciones_vendor(sb, dist_id, ids)
    logical_days: dict[str, set] = defaultdict(set)
    for r in rows:
        cid = str(r.get("id_cliente_pdv") or "").strip()
        dia = (r.get("timestamp_subida") or "")[:10]
        if cid and dia:
            logical_days[cid].add(dia)

    result = []
    for p in pdvs:
        cid = str(p.get("id_cliente_erp") or "")
        try:
            lat = float(p["latitud"])
            lng = float(p["longitud"])
        except (TypeError, ValueError):
            continue
        nombre = (
            (p.get("nombre_fantasia") or "").strip()
            or (p.get("nombre_razon_social") or "").strip()
            or cid
        )
        result.append({
            "id_cliente_erp": cid,
            "nombre": nombre,
            "latitud": lat,
            "longitud": lng,
            "count_exhibiciones": len(logical_days.get(cid, set())),
        })

    return result
