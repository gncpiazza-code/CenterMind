# -*- coding: utf-8 -*-
"""
Endpoints de reportes, dashboard, bonos y landing pública.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.config import AR_OFFSET
from core.tenant_tables import tenant_table_name
from core.helpers import (
    _get_erp_name_map,
    build_integrante_to_erp_name,
    build_qa_exhibicion_integrante_ids,
    is_exhibicion_qa_display_for_dist,
    resolve_vendedor_v2_for_integrante,
    should_apply_exhibicion_qa_filter,
)
from core.exhibicion_aggregate import (
    aggregate_kpi_totals,
    aggregate_ranking_by_vendor,
    aggregate_ranking_by_vendor_compania,
    count_active_vendors,
)
from core.security import verify_auth, check_dist_permission, require_compania_role
from db import sb
from models.schemas import BonusConfigPayload, ReporteQuery

logger = logging.getLogger("ShelfyAPI")
router = APIRouter()


def _build_erp_sucursal_map(distribuidor_id: int) -> dict[str, str]:
    """Devuelve {nombre_erp_vendedor: sucursal_nombre} para el distribuidor."""
    t_vendedores = tenant_table_name("vendedores_v2", distribuidor_id)
    t_sucursales = tenant_table_name("sucursales_v2", distribuidor_id)
    suc_rows = (
        sb.table(t_sucursales)
        .select("id_sucursal,nombre_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data or []
    )
    suc_map = {s["id_sucursal"]: (s.get("nombre_erp") or "") for s in suc_rows}
    vend_rows = (
        sb.table(t_vendedores)
        .select("nombre_erp,id_sucursal")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data or []
    )
    result: dict[str, str] = {}
    for v in vend_rows:
        nombre = (v.get("nombre_erp") or "").strip()
        id_suc = v.get("id_sucursal")
        if nombre and id_suc is not None:
            result[nombre] = suc_map.get(id_suc, "")
    return result


def _build_ciudad_dominante_map(distribuidor_id: int) -> dict[int, str]:
    """Devuelve {id_vendedor: ciudad_dominante} según rutas del vendedor (sin cruzar homónimos ERP)."""
    from collections import Counter
    t_vendedores = tenant_table_name("vendedores_v2", distribuidor_id)
    t_rutas = tenant_table_name("rutas_v2", distribuidor_id)
    t_clientes = tenant_table_name("clientes_pdv_v2", distribuidor_id)

    vend_rows = (
        sb.table(t_vendedores)
        .select("id_vendedor,nombre_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data or []
    )

    # Tablas tenant rutas_v2_* no tienen id_distribuidor (aislamiento por sufijo).
    ruta_rows = (
        sb.table(t_rutas)
        .select("id_vendedor,id_ruta")
        .execute()
        .data or []
    )
    vid_to_rutas: dict[int, list[int]] = {}
    all_ruta_ids: set[int] = set()
    for r in ruta_rows:
        vid = _ultimas_safe_int(r.get("id_vendedor"))
        rid = _ultimas_safe_int(r.get("id_ruta"))
        if vid is None or rid is None:
            continue
        vid_to_rutas.setdefault(vid, []).append(rid)
        all_ruta_ids.add(rid)

    if not all_ruta_ids:
        return {}

    PAGE = 1000
    offset = 0
    cliente_rows: list[dict] = []
    all_ruta_ids_list = list(all_ruta_ids)
    while True:
        chunk = (
            sb.table(t_clientes)
            .select("id_ruta,localidad")
            .eq("id_distribuidor", distribuidor_id)
            .in_("id_ruta", all_ruta_ids_list)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        cliente_rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE

    ruta_to_localidades: dict[int, list[str]] = {}
    for c in cliente_rows:
        rid = _ultimas_safe_int(c.get("id_ruta"))
        loc = (c.get("localidad") or "").strip()
        if rid is not None and loc:
            ruta_to_localidades.setdefault(rid, []).append(loc)

    result: dict[int, str] = {}
    for vid in {_ultimas_safe_int(v.get("id_vendedor")) for v in vend_rows}:
        if vid is None:
            continue
        localidades: list[str] = []
        for rid in vid_to_rutas.get(vid, []):
            localidades.extend(ruta_to_localidades.get(rid, []))
        if localidades:
            result[vid] = Counter(localidades).most_common(1)[0][0]
    return result


def _resolve_ciudad_dominante_for_nombre(
    nombre_erp: str,
    vend_rows: list[dict],
    ciudad_by_vid: dict[int, str],
) -> str | None:
    """Ciudad dominante para un nombre ERP; None si hay homónimos en ciudades distintas."""
    nombre = nombre_erp.strip()
    if not nombre:
        return None
    cities: list[str] = []
    for v in vend_rows:
        if (v.get("nombre_erp") or "").strip() != nombre:
            continue
        vid = _ultimas_safe_int(v.get("id_vendedor"))
        if vid is None:
            continue
        city = (ciudad_by_vid.get(vid) or "").strip()
        if city:
            cities.append(city)
    if not cities:
        return None
    unique = set(cities)
    if len(unique) == 1:
        return cities[0]
    return None


def _resolve_sucursal_pk(distribuidor_id: int, sucursal_param: str | int | None) -> int | None:
    """Resuelve filtro de sucursal: acepta id_sucursal (PK) o id_sucursal_erp (location_id del dashboard)."""
    if sucursal_param is None:
        return None
    raw = str(sucursal_param).strip()
    if not raw:
        return None

    t_sucursales = tenant_table_name("sucursales_v2", distribuidor_id)

    if raw.isdigit():
        sid = int(raw)
        chk = (
            sb.table(t_sucursales)
            .select("id_sucursal")
            .eq("id_distribuidor", distribuidor_id)
            .eq("id_sucursal", sid)
            .limit(1)
            .execute()
        )
        if chk.data:
            return sid

    for erp_key in (raw, raw.lstrip("0") or "0"):
        res = (
            sb.table(t_sucursales)
            .select("id_sucursal")
            .eq("id_distribuidor", distribuidor_id)
            .eq("id_sucursal_erp", erp_key)
            .limit(1)
            .execute()
        )
        if res.data:
            return int(res.data[0]["id_sucursal"])

    try:
        res_legacy = (
            sb.table("sucursales")
            .select("id_sucursal")
            .eq("id_distribuidor", distribuidor_id)
            .eq("id_sucursal_erp", raw)
            .limit(1)
            .execute()
        )
        if res_legacy.data:
            return int(res_legacy.data[0]["id_sucursal"])
    except Exception:
        pass

    return None


def _ultimas_safe_text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def _ultimas_safe_int(value: Any) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _ultimas_normalize_erp_code(value: Any) -> str:
    raw = _ultimas_safe_text(value).strip()
    if not raw:
        return ""
    return raw.lstrip("0") or "0"


def _build_ruta_to_vendedor_map(distribuidor_id: int) -> dict[int, int]:
    """Mapa id_ruta → id_vendedor desde rutas_v2_d{dist} (tabla tenant, no rutas_v2 base)."""
    t_rutas = tenant_table_name("rutas_v2", distribuidor_id)
    rows = (
        sb.table(t_rutas)
        .select("id_ruta,id_vendedor")
        .execute()
        .data
        or []
    )
    out: dict[int, int] = {}
    for r in rows:
        rid = _ultimas_safe_int(r.get("id_ruta"))
        vid = _ultimas_safe_int(r.get("id_vendedor"))
        if rid is not None and vid is not None:
            out[rid] = vid
    return out


def _cliente_vendedor_id(cliente: dict, ruta_to_vendedor: dict[int, int]) -> int | None:
    rid = _ultimas_safe_int(cliente.get("id_ruta"))
    if rid is None:
        return None
    return ruta_to_vendedor.get(rid)


def _fetch_cliente_padron_for_vendor(
    distribuidor_id: int,
    erp_code: str,
    id_vendedor: int,
    ruta_to_vendedor: dict[int, int],
) -> dict | None:
    """Busca cliente por código ERP solo si su ruta pertenece al vendedor de la exhibición."""
    if not erp_code or id_vendedor is None:
        return None
    t_clientes = tenant_table_name("clientes_pdv_v2", distribuidor_id)
    candidates = [erp_code.strip()]
    norm = _ultimas_normalize_erp_code(erp_code)
    if norm and norm not in candidates:
        candidates.append(norm)
    for code in candidates:
        if not code:
            continue
        try:
            batch = (
                sb.table(t_clientes)
                .select(
                    "id_cliente,id_cliente_erp,nombre_razon_social,nombre_fantasia,localidad,id_ruta"
                )
                .eq("id_distribuidor", distribuidor_id)
                .eq("id_cliente_erp", code)
                .limit(5)
                .execute()
                .data
                or []
            )
        except Exception:
            batch = (
                sb.table(t_clientes)
                .select(
                    "id_cliente,id_cliente_erp,nombre_razon_social,nombre_fantasia,localidad,id_ruta"
                )
                .eq("id_cliente_erp", code)
                .limit(5)
                .execute()
                .data
                or []
            )
        for c in batch:
            if _cliente_vendedor_id(c, ruta_to_vendedor) == id_vendedor:
                return c
    return None


def _build_integrante_vendor_maps(distribuidor_id: int) -> tuple[dict[int, str], dict[int, int]]:
    """Resuelve nombre ERP e id_vendedor por id_integrante (binding → id_vendedor_v2)."""
    t_vendedores = tenant_table_name("vendedores_v2", distribuidor_id)
    vendedores_res = (
        sb.table(t_vendedores)
        .select("id_vendedor, nombre_erp, id_vendedor_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
    )
    vendedores = vendedores_res.data or []
    vend_ids = {
        _ultimas_safe_int(v.get("id_vendedor"))
        for v in vendedores
        if _ultimas_safe_int(v.get("id_vendedor")) is not None
    }
    vend_erp_to_id: dict[str, int] = {}
    vend_id_to_name: dict[int, str] = {}
    for v in vendedores:
        vid = _ultimas_safe_int(v.get("id_vendedor"))
        if vid is None:
            continue
        vend_id_to_name[vid] = _ultimas_safe_text(v.get("nombre_erp")).strip()
        id_erp = _ultimas_safe_text(v.get("id_vendedor_erp")).strip()
        if id_erp and id_erp not in vend_erp_to_id:
            vend_erp_to_id[id_erp] = vid
        norm = _ultimas_normalize_erp_code(id_erp)
        if norm and norm not in vend_erp_to_id:
            vend_erp_to_id[norm] = vid

    binding_by_tg_user: dict[int, int] = {}
    try:
        bind_r = (
            sb.table("vendedores_telegram_binding")
            .select("id_vendedor_v2, telegram_user_id")
            .eq("id_distribuidor", distribuidor_id)
            .execute()
        )
        for b in (bind_r.data or []):
            vid = _ultimas_safe_int(b.get("id_vendedor_v2"))
            tg_uid = _ultimas_safe_int(b.get("telegram_user_id"))
            if vid is not None and tg_uid is not None and vid in vend_ids:
                binding_by_tg_user[tg_uid] = vid
    except Exception:
        pass

    integrantes_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante, telegram_user_id, nombre_integrante, id_vendedor_v2, id_vendedor_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
    )
    name_out: dict[int, str] = {}
    id_out: dict[int, int] = {}
    for ig in integrantes_res.data or []:
        iid = _ultimas_safe_int(ig.get("id_integrante"))
        if iid is None:
            continue
        vid = None
        tg_uid = _ultimas_safe_int(ig.get("telegram_user_id"))
        if tg_uid is not None and tg_uid in binding_by_tg_user:
            vid = binding_by_tg_user[tg_uid]
        if vid is None:
            v2 = _ultimas_safe_int(ig.get("id_vendedor_v2"))
            if v2 is not None and v2 in vend_ids:
                vid = v2
        if vid is None:
            erp = _ultimas_safe_text(ig.get("id_vendedor_erp")).strip()
            if erp:
                vid = vend_erp_to_id.get(erp) or vend_erp_to_id.get(_ultimas_normalize_erp_code(erp))
        if vid is not None and vid in vend_id_to_name:
            id_out[iid] = vid
            name = vend_id_to_name[vid]
            if name:
                name_out[iid] = name
    return name_out, id_out


def _build_integrante_vendor_name_map(distribuidor_id: int) -> dict[int, str]:
    """Resuelve nombre ERP por id_integrante (binding → id_vendedor_v2 → id_vendedor_erp)."""
    name_map, _ = _build_integrante_vendor_maps(distribuidor_id)
    return name_map


_EXHIBICION_SNAPSHOT_SELECT = (
    "id_exhibicion,id_integrante,id_cliente,id_cliente_pdv,cliente_sombra_codigo,tipo_pdv"
)


def _exhibition_snapshot_from_row(row: dict) -> dict:
    """Campos de exhibición embebidos en fila de últimas (RPC o query directa)."""
    shadow = _ultimas_safe_text(row.get("cliente_sombra_codigo")).strip()
    nro = _ultimas_safe_text(row.get("nro_cliente")).strip()
    return {
        "id_exhibicion": row.get("id_exhibicion"),
        "id_integrante": row.get("id_integrante"),
        "id_cliente": row.get("id_cliente"),
        "id_cliente_pdv": row.get("id_cliente_pdv"),
        "cliente_sombra_codigo": shadow or nro or None,
    }


def _hydrate_exhibiciones_map(rows: list[dict], distribuidor_id: int) -> dict[int, dict]:
    """Carga exhibiciones por id_exhibicion (RPC no trae id_integrante ni cliente)."""
    ex_map: dict[int, dict] = {}
    for row in rows:
        eid = _ultimas_safe_int(row.get("id_exhibicion"))
        if eid is not None:
            ex_map[eid] = _exhibition_snapshot_from_row(row)

    ex_ids = list(ex_map.keys())
    if not ex_ids:
        return ex_map

    for i in range(0, len(ex_ids), 200):
        chunk = ex_ids[i : i + 200]
        ex_res = (
            sb.table("exhibiciones")
            .select(_EXHIBICION_SNAPSHOT_SELECT)
            .in_("id_exhibicion", chunk)
            .eq("id_distribuidor", distribuidor_id)
            .execute()
        )
        for ex in ex_res.data or []:
            eid = _ultimas_safe_int(ex.get("id_exhibicion"))
            if eid is not None:
                ex_map[eid] = ex
    return ex_map


def _enrich_ultimas_dashboard_rows(rows: list[dict], distribuidor_id: int) -> list[dict]:
    """Enriquece últimas evaluadas con padrón tenant (clientes_pdv_v2_d*, rutas_v2_d*, vendedores_v2_d*)."""
    if not rows:
        return rows

    ex_map = _hydrate_exhibiciones_map(rows, distribuidor_id)

    # Padrón: solo por PK de cliente al momento de la exhibición (id_cliente_pdv / id_cliente).
    cliente_pks: set[int] = set()
    for row in rows:
        ex = ex_map.get(_ultimas_safe_int(row.get("id_exhibicion")) or -1, {})
        for pk_field in ("id_cliente_pdv", "id_cliente"):
            pk = _ultimas_safe_int(ex.get(pk_field))
            if pk is not None:
                cliente_pks.add(pk)

    t_clientes = tenant_table_name("clientes_pdv_v2", distribuidor_id)
    clientes: list[dict] = []
    if cliente_pks:
        pk_list = list(cliente_pks)
        for i in range(0, len(pk_list), 200):
            try:
                batch = (
                    sb.table(t_clientes)
                    .select(
                        "id_cliente,id_cliente_erp,nombre_razon_social,nombre_fantasia,localidad,id_ruta"
                    )
                    .eq("id_distribuidor", distribuidor_id)
                    .in_("id_cliente", pk_list[i : i + 200])
                    .execute()
                    .data
                    or []
                )
            except Exception:
                batch = (
                    sb.table(t_clientes)
                    .select(
                        "id_cliente,id_cliente_erp,nombre_razon_social,nombre_fantasia,localidad,id_ruta"
                    )
                    .eq("id_distribuidor", distribuidor_id)
                    .in_("id_cliente", pk_list[i : i + 200])
                    .execute()
                    .data
                    or []
                )
            clientes.extend(batch)

    by_pk: dict[int, dict] = {}
    for c in clientes:
        pk = _ultimas_safe_int(c.get("id_cliente"))
        if pk is not None:
            by_pk[pk] = c

    ruta_to_vendedor = _build_ruta_to_vendedor_map(distribuidor_id)
    vendor_map, vendor_id_map = _build_integrante_vendor_maps(distribuidor_id)
    fallback_vendor = build_integrante_to_erp_name(distribuidor_id)
    erp_name_map = _get_erp_name_map(distribuidor_id)

    def _resolve_cliente_asignado(ex: dict, ex_vendor_id: int | None) -> tuple[dict | None, bool]:
        """PDV del padrón solo si la ruta del cliente pertenece al vendedor que subió la foto."""
        if ex_vendor_id is None:
            return None, False
        for pk_field in ("id_cliente_pdv", "id_cliente"):
            pk = _ultimas_safe_int(ex.get(pk_field))
            if pk is None:
                continue
            cliente = by_pk.get(pk)
            if cliente and _cliente_vendedor_id(cliente, ruta_to_vendedor) == ex_vendor_id:
                return cliente, True
        for erp_field in ("cliente_sombra_codigo", "nro_cliente"):
            erp = _ultimas_safe_text(ex.get(erp_field)).strip()
            if not erp:
                continue
            cliente = _fetch_cliente_padron_for_vendor(
                distribuidor_id, erp, ex_vendor_id, ruta_to_vendedor
            )
            if cliente:
                return cliente, True
        return None, False

    for row in rows:
        ex = ex_map.get(_ultimas_safe_int(row.get("id_exhibicion")) or -1, {})
        row["razon_social"] = ""
        row["ciudad"] = ""
        row["pdv_asignado_vendedor"] = False
        if row.get("id_integrante") is None and ex.get("id_integrante") is not None:
            row["id_integrante"] = ex.get("id_integrante")

        pk_pdv = _ultimas_safe_int(ex.get("id_cliente_pdv"))
        pk_cli = _ultimas_safe_int(ex.get("id_cliente"))
        if pk_pdv is not None:
            row["id_cliente_pdv"] = pk_pdv
        if pk_cli is not None:
            row["id_cliente"] = pk_cli

        iid = _ultimas_safe_int(row.get("id_integrante"))
        if iid is None:
            iid = _ultimas_safe_int(ex.get("id_integrante"))
        ex_vendor_id = vendor_id_map.get(iid) if iid is not None else None

        cliente, asignado = _resolve_cliente_asignado(ex, ex_vendor_id)
        row["pdv_asignado_vendedor"] = asignado
        if ex_vendor_id is not None:
            row["id_vendedor"] = ex_vendor_id
        if cliente:
            erp_id = _ultimas_safe_text(cliente.get("id_cliente_erp")).strip()
            row["nro_cliente"] = erp_id or row.get("nro_cliente") or ""
            row["razon_social"] = (
                _ultimas_safe_text(cliente.get("nombre_razon_social")).strip()
                or _ultimas_safe_text(cliente.get("nombre_fantasia")).strip()
            )
            row["ciudad"] = _ultimas_safe_text(cliente.get("localidad")).strip()

        erp_name = vendor_map.get(iid) if iid is not None else None
        if not erp_name and iid is not None:
            erp_name = fallback_vendor.get(iid)
        tg_vendedor = _ultimas_safe_text(row.get("vendedor")).strip()
        if erp_name:
            row["vendedor_erp"] = erp_name
            row["vendedor"] = erp_name
        elif tg_vendedor:
            mapped = erp_name_map.get(tg_vendedor.lower(), tg_vendedor)
            row["vendedor_erp"] = mapped
            row["vendedor"] = mapped

    return rows


_ULTIMAS_ESTADOS = ("Aprobado", "Destacado", "Destacada")


def _fetch_ultimas_evaluadas_rows(distribuidor_id: int, n: int) -> list[dict]:
    """Últimas exhibiciones evaluadas desde tabla exhibiciones (fuente con id_integrante y cliente)."""
    ar_today = (datetime.utcnow() - timedelta(hours=3)).date()
    pool: list[dict] = []
    seen_ex: set[int] = set()

    for days_back in range(90):
        if len(pool) >= n:
            break
        fecha = ar_today - timedelta(days=days_back)
        start_iso = f"{fecha.isoformat()}T03:00:00"
        end_iso = f"{(fecha + timedelta(days=1)).isoformat()}T03:00:00"
        try:
            chunk = (
                sb.table("exhibiciones")
                .select(
                    "id_exhibicion,id_integrante,estado,url_foto_drive,timestamp_subida,evaluated_at,"
                    "tipo_pdv,id_cliente_pdv,id_cliente,cliente_sombra_codigo"
                )
                .eq("id_distribuidor", distribuidor_id)
                .in_("estado", list(_ULTIMAS_ESTADOS))
                .gte("timestamp_subida", start_iso)
                .lt("timestamp_subida", end_iso)
                .order("timestamp_subida", desc=True)
                .limit(max(n * 2, 16))
                .execute()
                .data
                or []
            )
        except Exception as e:
            logger.warning(f"[ultimas] query exhibiciones dist={distribuidor_id} fecha={fecha}: {e}")
            continue

        for ex in chunk:
            eid = _ultimas_safe_int(ex.get("id_exhibicion"))
            if eid is None or eid in seen_ex:
                continue
            seen_ex.add(eid)
            pool.append(
                {
                    "id_exhibicion": eid,
                    "drive_link": _ultimas_safe_text(ex.get("url_foto_drive")),
                    "estado": _ultimas_safe_text(ex.get("estado")),
                    "tipo_pdv": _ultimas_safe_text(ex.get("tipo_pdv")),
                    "nro_cliente": _ultimas_safe_text(ex.get("cliente_sombra_codigo")).strip(),
                    "id_integrante": ex.get("id_integrante"),
                    "id_cliente_pdv": ex.get("id_cliente_pdv"),
                    "id_cliente": ex.get("id_cliente"),
                    "cliente_sombra_codigo": ex.get("cliente_sombra_codigo"),
                    "timestamp_subida": ex.get("timestamp_subida"),
                    "fecha_evaluacion": ex.get("evaluated_at"),
                }
            )

    pool.sort(
        key=lambda r: (
            _ultimas_safe_text(r.get("fecha_evaluacion")) or _ultimas_safe_text(r.get("timestamp_subida"))
        ),
        reverse=True,
    )
    return pool[:n]


def _filter_ultimas_by_sucursal(rows: list[dict], allowed_integrantes: set[int] | None) -> list[dict]:
    if allowed_integrantes is None:
        return rows
    out: list[dict] = []
    for row in rows:
        iid = row.get("id_integrante")
        if iid is None:
            continue
        try:
            if int(iid) in allowed_integrantes:
                out.append(row)
        except (TypeError, ValueError):
            continue
    return out


def _enrich_por_sucursal_rows(rows: list[dict], distribuidor_id: int) -> list[dict]:
    """Agrega id_sucursal (PK) para que el filtro del dashboard use la misma clave que el backend."""
    if not rows:
        return rows
    t_sucursales = tenant_table_name("sucursales_v2", distribuidor_id)
    suc_rows = (
        sb.table(t_sucursales)
        .select("id_sucursal,id_sucursal_erp,nombre_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data
        or []
    )
    erp_to_pk: dict[str, int] = {}
    nombre_to_pk: dict[str, int] = {}
    for s in suc_rows:
        pk = s.get("id_sucursal")
        if pk is None:
            continue
        erp_code = str(s.get("id_sucursal_erp") or "").strip()
        if erp_code:
            erp_to_pk[erp_code] = int(pk)
            erp_to_pk[erp_code.lstrip("0") or "0"] = int(pk)
        nombre = (s.get("nombre_erp") or "").strip().upper()
        if nombre:
            nombre_to_pk[nombre] = int(pk)
    enriched: list[dict] = []
    for row in rows:
        loc = str(row.get("location_id") or "").strip()
        suc_name = (row.get("sucursal") or "").strip().upper()
        pk = erp_to_pk.get(loc) or erp_to_pk.get(loc.lstrip("0") or "0") or nombre_to_pk.get(suc_name)
        enriched.append({**row, "id_sucursal": pk})
    return enriched


def _resolve_period_bounds(periodo: str) -> tuple[str, str]:
    try:
        ar_offset_hours = float(AR_OFFSET)
    except Exception:
        ar_offset_hours = -3.0
    ar_now = datetime.utcnow() + timedelta(hours=ar_offset_hours)
    p = (periodo or "mes").strip()
    if p == "hoy":
        start_dt = datetime(ar_now.year, ar_now.month, ar_now.day)
        end_dt = start_dt + timedelta(days=1)
    elif p == "semana":
        # Lunes 00:00 → domingo 23:59:59 de la semana corriente en AR
        weekday = ar_now.weekday()  # 0=lunes, 6=domingo
        start_dt = datetime(ar_now.year, ar_now.month, ar_now.day) - timedelta(days=weekday)
        end_dt = start_dt + timedelta(days=7)
    elif p == "mes":
        start_dt = datetime(ar_now.year, ar_now.month, 1)
        if ar_now.month == 12:
            end_dt = datetime(ar_now.year + 1, 1, 1)
        else:
            end_dt = datetime(ar_now.year, ar_now.month + 1, 1)
    elif len(p) == 7 and p[4] == "-":
        y, m = p.split("-")
        start_dt = datetime(int(y), int(m), 1)
        if int(m) == 12:
            end_dt = datetime(int(y) + 1, 1, 1)
        else:
            end_dt = datetime(int(y), int(m) + 1, 1)
    elif len(p) == 10 and p[4] == "-" and p[7] == "-":
        y, m, d = p.split("-")
        start_dt = datetime(int(y), int(m), int(d))
        end_dt = start_dt + timedelta(days=1)
    else:
        start_dt = datetime(ar_now.year, ar_now.month, 1)
        if ar_now.month == 12:
            end_dt = datetime(ar_now.year + 1, 1, 1)
        else:
            end_dt = datetime(ar_now.year, ar_now.month + 1, 1)
            
    from datetime import timezone
    tz = timezone(timedelta(hours=ar_offset_hours))
    start_dt = start_dt.replace(tzinfo=tz)
    end_dt = end_dt.replace(tzinfo=tz)
    return start_dt.isoformat(), end_dt.isoformat()


def _allowed_integrantes_for_sucursal(distribuidor_id: int, sucursal_id: int | None) -> set[int] | None:
    if sucursal_id is None:
        return None

    integ_rows = (
        sb.table("integrantes_grupo")
        .select("id_integrante,id_vendedor_v2,id_vendedor_erp,telegram_user_id,telegram_group_id")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data
        or []
    )
    bindings_rows = (
        sb.table("vendedores_telegram_binding")
        .select("telegram_user_id,id_vendedor_v2,telegram_group_id")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data
        or []
    )

    t_vendedores = tenant_table_name("vendedores_v2", distribuidor_id)
    vend_rows = (
        sb.table(t_vendedores)
        .select("id_vendedor,id_sucursal,id_vendedor_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data
        or []
    )
    vend_ids_suc = {
        int(v["id_vendedor"])
        for v in vend_rows
        if v.get("id_vendedor") is not None and int(v.get("id_sucursal") or 0) == int(sucursal_id)
    }
    vend_erp_to_id: dict[str, int] = {}
    for v in vend_rows:
        vid = _ultimas_safe_int(v.get("id_vendedor"))
        if vid is None:
            continue
        erp = _ultimas_safe_text(v.get("id_vendedor_erp")).strip()
        if erp:
            vend_erp_to_id[erp] = vid
            vend_erp_to_id[_ultimas_normalize_erp_code(erp)] = vid

    allowed: set[int] = set()
    for ig in integ_rows:
        iid = _ultimas_safe_int(ig.get("id_integrante"))
        if iid is None:
            continue
        vid = None
        tg_uid = _ultimas_safe_int(ig.get("telegram_user_id"))
        binding_by_tg = {
            _ultimas_safe_int(b.get("telegram_user_id")): _ultimas_safe_int(b.get("id_vendedor_v2"))
            for b in bindings_rows
            if _ultimas_safe_int(b.get("telegram_user_id")) is not None
        }
        if tg_uid is not None and tg_uid in binding_by_tg:
            vid = binding_by_tg[tg_uid]
        if vid is None:
            v2 = _ultimas_safe_int(ig.get("id_vendedor_v2"))
            if v2 is not None:
                vid = v2
        if vid is None:
            erp = _ultimas_safe_text(ig.get("id_vendedor_erp")).strip()
            if erp:
                vid = vend_erp_to_id.get(erp) or vend_erp_to_id.get(_ultimas_normalize_erp_code(erp))
        if vid is not None and int(vid) in vend_ids_suc:
            allowed.add(iid)
    return allowed


def _fetch_exhibiciones_periodo(distribuidor_id: int, start_iso: str, end_iso: str) -> list[dict[str, Any]]:
    PAGE = 1000
    offset = 0
    rows: list[dict[str, Any]] = []
    while True:
        chunk = (
            sb.table("exhibiciones")
            .select(
                "id_exhibicion,id_integrante,estado,url_foto_drive,telegram_msg_id,telegram_chat_id,timestamp_subida,"
                "id_cliente_pdv,id_cliente,cliente_sombra_codigo"
            )
            .eq("id_distribuidor", distribuidor_id)
            .gte("timestamp_subida", start_iso)
            .lt("timestamp_subida", end_iso)
            .order("timestamp_subida")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE
    return rows


# ─── Landing pública ─────────────────────────────────────────────────────────

@router.get("/api/public/landing-stats", summary="Estadísticas públicas para la Landing Page")
def public_landing_stats():
    try:
        result = sb.rpc("fn_landing_stats", {}).execute()
        if result.data:
            return result.data[0]
        return {"auditorias_pdv": 0, "miembros_activos": 0, "sucursales_vinculadas": 0}
    except Exception:
        return {"auditorias_pdv": 2500, "miembros_activos": 150, "sucursales_vinculadas": 50}


# ─── Reports ─────────────────────────────────────────────────────────────────

@router.get("/api/reports/performance/{id_distribuidor}", tags=["Reports"])
def get_reporte_performance(id_distribuidor: int, mes: int = Query(...), anio: int = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_vendedor_objetivos", {"p_dist_id": id_distribuidor, "p_mes": mes, "p_anio": anio}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/ventas-resumen/{id_distribuidor}", tags=["Reports"])
def get_ventas_resumen(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_resumen", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas resumen: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/ventas-bultos/{id_distribuidor}", tags=["Reports"])
def get_ventas_bultos(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), proveedor: str | None = Query(None), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_comprobantes_detallado", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta, "p_proveedor_busqueda": proveedor}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte ventas bultos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/sigo-detail/{dist_id}", tags=["Reports"])
def get_sigo_detail(
    dist_id: int,
    snapshot_key: str = Query(None, description="Path en Storage sigo-rpa/{dist_id}/... (opcional; si se omite usa el más reciente)"),
    date_from: str = Query("", description="YYYY-MM-DD; inferido del archivo si se omite"),
    date_to: str   = Query("", description="YYYY-MM-DD; inferido del archivo si se omite"),
    user_payload=Depends(verify_auth),
):
    """
    Descarga el último (o un snapshot específico) xlsx SIGO de Storage y lo parsea.
    Devuelve kpis, por_vendedor_y_dia, serie_temporal y top_vendedores.
    """
    check_dist_permission(user_payload, dist_id)

    from services.reporting.parsers._normalization import read_excel_robust
    from services.reporting.parsers.sigo_parser import parse_sigo

    BUCKET = "Exhibiciones-PDV"
    prefix = f"sigo-rpa/{dist_id}/"

    try:
        if snapshot_key:
            path = snapshot_key
        else:
            # Listar archivos bajo el prefix y tomar el más reciente por nombre (timestamp en el path)
            try:
                files = sb.storage.from_(BUCKET).list(prefix)
            except Exception:
                files = []

            # Flatten nested listing (Storage devuelve directamente archivos o carpetas según versión)
            def _collect_paths(folder: str, depth: int = 0) -> list[str]:
                if depth > 5:
                    return []
                try:
                    items = sb.storage.from_(BUCKET).list(folder)
                except Exception:
                    return []
                paths: list[str] = []
                for item in (items or []):
                    name = item.get("name", "")
                    if not name:
                        continue
                    full = f"{folder}{name}" if folder.endswith("/") else f"{folder}/{name}"
                    # Si no tiene extensión probablemente es carpeta
                    if "." not in name.split("/")[-1]:
                        paths.extend(_collect_paths(full + "/", depth + 1))
                    else:
                        paths.append(full)
                return paths

            all_paths = _collect_paths(prefix)
            xlsx_paths = [p for p in all_paths if p.lower().endswith((".xlsx", ".xls"))]

            if not xlsx_paths:
                return {"disponible": False, "mensaje": "Sin datos SIGO para este distribuidor"}

            # El más reciente: sort descendente por nombre (contiene timestamp YYYYMMDD_HHMMSS)
            path = sorted(xlsx_paths, reverse=True)[0]

        # Descargar archivo
        try:
            file_bytes: bytes = sb.storage.from_(BUCKET).download(path)
        except Exception as dl_err:
            logger.error(f"[sigo-detail] download dist={dist_id} path={path}: {dl_err}")
            return {"disponible": False, "mensaje": f"No se pudo descargar el archivo: {dl_err}"}

        if not file_bytes:
            return {"disponible": False, "mensaje": "Archivo vacío en Storage"}

        fname = path.split("/")[-1]
        import pandas as pd
        df = read_excel_robust(file_bytes, fname)
        result = parse_sigo(df, date_from, date_to)
        result["storage_path"] = path
        result["disponible"] = True
        return result

    except Exception as e:
        logger.error(f"[sigo-detail] dist={dist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reports/auditoria-sigo/{id_distribuidor}", tags=["Reports"])
def get_auditoria_sigo(id_distribuidor: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, id_distribuidor)
    try:
        res = sb.rpc("fn_reporte_sigo_audit", {"p_dist_id": id_distribuidor, "p_desde": desde, "p_hasta": hasta}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en reporte sigo audit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Alias de reports con path alternativo /api/reports/ventas-* y /dist_id
@router.get("/api/reports/ventas-resumen/{dist_id}")
def report_ventas_resumen(dist_id: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_resumen", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta}).execute()
    return res.data or []


@router.get("/api/reports/ventas-bultos/{dist_id}")
def report_ventas_bultos(dist_id: int, desde: str = Query(...), hasta: str = Query(...), proveedor: str = Query(None), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_comprobantes_detallado", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta, "p_proveedor_busqueda": proveedor}).execute()
    return res.data or []


@router.get("/api/reports/auditoria-sigo/{dist_id}")
def report_auditoria_sigo(dist_id: int, desde: str = Query(...), hasta: str = Query(...), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    res = sb.rpc("fn_reporte_sigo_audit", {"p_dist_id": dist_id, "p_desde": desde, "p_hasta": hasta}).execute()
    return res.data or []


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/api/dashboard/kpis/{distribuidor_id}", summary="KPIs del dashboard por período")
def dashboard_kpis(
    distribuidor_id: int,
    periodo: str = "mes",
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    start_iso, end_iso = _resolve_period_bounds(periodo)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    allowed_integrantes = _allowed_integrantes_for_sucursal(distribuidor_id, suc_pk)
    ex_rows = _fetch_exhibiciones_periodo(distribuidor_id, start_iso, end_iso)

    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    iid_to_erp = build_integrante_to_erp_name(distribuidor_id)

    filtered: list[dict] = []
    for ex in ex_rows:
        iid = ex.get("id_integrante")
        if iid is None:
            continue
        try:
            iid_i = int(iid)
        except (TypeError, ValueError):
            continue
        if allowed_integrantes is not None and iid_i not in allowed_integrantes:
            continue
        vendedor = iid_to_erp.get(iid_i, "Desconocido")
        if hide_qa and is_exhibicion_qa_display_for_dist(distribuidor_id, vendedor):
            continue
        filtered.append(ex)

    kpi_totals = aggregate_kpi_totals(filtered)
    vendedores_activos = count_active_vendors(filtered, iid_to_erp)
    total_logicas = kpi_totals["total"]
    exhibiciones_por_vendedor = (
        round(total_logicas / vendedores_activos, 1) if vendedores_activos > 0 else 0.0
    )
    return {
        **kpi_totals,
        "vendedores_activos": vendedores_activos,
        "exhibiciones_por_vendedor": exhibiciones_por_vendedor,
    }


@router.get("/api/dashboard/ranking/{distribuidor_id}", summary="Ranking de vendedores por período")
def dashboard_ranking(
    distribuidor_id: int,
    periodo: str = "mes",
    top: int = 999,
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    start_iso, end_iso = _resolve_period_bounds(periodo)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    allowed_integrantes = _allowed_integrantes_for_sucursal(distribuidor_id, suc_pk)
    ex_rows = _fetch_exhibiciones_periodo(distribuidor_id, start_iso, end_iso)

    iid_to_erp = build_integrante_to_erp_name(distribuidor_id)
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)

    filtered: list[dict] = []
    for ex in ex_rows:
        iid = ex.get("id_integrante")
        if iid is None:
            continue
        try:
            iid_i = int(iid)
        except (TypeError, ValueError):
            continue
        if allowed_integrantes is not None and iid_i not in allowed_integrantes:
            continue
        vendedor = iid_to_erp.get(iid_i, "Desconocido")
        if hide_qa and is_exhibicion_qa_display_for_dist(distribuidor_id, vendedor):
            continue
        filtered.append(ex)

    stats = aggregate_ranking_by_vendor(filtered, iid_to_erp)
    erp_to_sucursal = _build_erp_sucursal_map(distribuidor_id)
    t_vendedores = tenant_table_name("vendedores_v2", distribuidor_id)
    vend_rows = (
        sb.table(t_vendedores)
        .select("nombre_erp,id_sucursal")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
        .data
        or []
    )
    erp_to_suc_pk: dict[str, int] = {}
    for v in vend_rows:
        nombre = (v.get("nombre_erp") or "").strip()
        sid = v.get("id_sucursal")
        if nombre and sid is not None:
            erp_to_suc_pk[nombre] = int(sid)
    unique_sucursales = {s for s in erp_to_sucursal.values() if s}
    is_mono = len(unique_sucursales) <= 1
    try:
        ciudad_by_vid = _build_ciudad_dominante_map(distribuidor_id) if is_mono else {}
    except Exception as e:
        logger.warning(f"[ranking] ciudad_dominante fallback dist={distribuidor_id}: {e}")
        ciudad_by_vid = {}

    aggregated: dict[str, dict[str, Any]] = {
        vendedor: {
            "vendedor": vendedor,
            "aprobadas": s["aprobadas"],
            "destacadas": s["destacadas"],
            "rechazadas": s["rechazadas"],
            "puntos": s["puntos"],
            "location_id": str(erp_to_suc_pk[vendedor]) if vendedor in erp_to_suc_pk else None,
            "sucursal": "" if is_mono else erp_to_sucursal.get(vendedor, ""),
            "ciudad_dominante": (
                _resolve_ciudad_dominante_for_nombre(vendedor, vend_rows, ciudad_by_vid) if is_mono else None
            ),
        }
        for vendedor, s in stats.items()
    }

    sorted_rows = sorted(aggregated.values(), key=lambda x: x.get("puntos") or 0, reverse=True)
    return sorted_rows[:top]


@router.get("/api/dashboard/ranking-compania/{distribuidor_id}", summary="Ranking paralelo de Compañía (overlay re-evaluaciones)")
def dashboard_ranking_compania(
    distribuidor_id: int,
    periodo: str = "mes",
    top: int = 999,
    sucursal_id: Optional[str] = Query(None),
    solo_cambios: bool = Query(False),
    payload=Depends(verify_auth),
):
    """
    Ranking de compañía: aplica overlay de re-evaluaciones sobre el ranking oficial.
    Solo visible para roles Compañía (superadmin / directorio).
    El ranking oficial del distribuidor NO se modifica.
    """
    require_compania_role(payload)
    check_dist_permission(payload, distribuidor_id)

    start_iso, end_iso = _resolve_period_bounds(periodo)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    allowed_integrantes = _allowed_integrantes_for_sucursal(distribuidor_id, suc_pk)
    ex_rows = _fetch_exhibiciones_periodo(distribuidor_id, start_iso, end_iso)

    iid_to_erp = build_integrante_to_erp_name(distribuidor_id)
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)

    filtered: list[dict] = []
    for ex in ex_rows:
        iid = ex.get("id_integrante")
        if iid is None:
            continue
        try:
            iid_i = int(iid)
        except (TypeError, ValueError):
            continue
        if allowed_integrantes is not None and iid_i not in allowed_integrantes:
            continue
        vendedor = iid_to_erp.get(iid_i, "Desconocido")
        if hide_qa and is_exhibicion_qa_display_for_dist(distribuidor_id, vendedor):
            continue
        filtered.append(ex)

    # Obtener últimas re-evaluaciones de compañía para el período
    ex_ids = [int(r["id_exhibicion"]) for r in filtered if r.get("id_exhibicion") is not None]
    from routers.compania_revision import fetch_latest_reevaluaciones_for_dist
    latest_by_ex_id = fetch_latest_reevaluaciones_for_dist(distribuidor_id, ex_ids)

    stats_compania = aggregate_ranking_by_vendor_compania(filtered, iid_to_erp, latest_by_ex_id)

    # También obtener el ranking oficial para calcular Δ puntos
    stats_oficial = aggregate_ranking_by_vendor(filtered, iid_to_erp)

    all_vendors = sorted(
        set(list(stats_compania.keys()) + list(stats_oficial.keys()))
    )

    result = []
    for vendedor in all_vendors:
        sc = stats_compania.get(vendedor, {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0})
        so = stats_oficial.get(vendedor, {"aprobadas": 0, "destacadas": 0, "rechazadas": 0, "puntos": 0})
        result.append({
            "vendedor": vendedor,
            "puntos_compania": sc["puntos"],
            "aprobadas_compania": sc["aprobadas"],
            "destacadas_compania": sc["destacadas"],
            "rechazadas_compania": sc["rechazadas"],
            "puntos_oficial": so["puntos"],
            "aprobadas_oficial": so["aprobadas"],
            "destacadas_oficial": so["destacadas"],
            "rechazadas_oficial": so["rechazadas"],
            "delta_puntos": sc["puntos"] - so["puntos"],
        })

    sorted_rows = sorted(result, key=lambda x: x["puntos_compania"], reverse=True)
    if solo_cambios:
        sorted_rows = [r for r in sorted_rows if r["delta_puntos"] != 0]
    return sorted_rows[:top]


@router.get("/api/dashboard/ranking-historico/{distribuidor_id}", summary="Ranking histórico diario del mes en curso")
def dashboard_ranking_historico(distribuidor_id: int, sucursal_id: int = Query(None), payload=Depends(verify_auth)):
    check_dist_permission(payload, distribuidor_id)
    ar_now    = datetime.utcnow() - timedelta(hours=3)
    primer_dia = ar_now.date().replace(day=1).isoformat()
    hoy        = ar_now.date().isoformat()

    result = (
        sb.table("exhibiciones")
        .select(
            "timestamp_subida, estado, id_integrante, id_cliente_pdv, id_cliente, cliente_sombra_codigo"
        )
        .eq("id_distribuidor", distribuidor_id)
        .gte("timestamp_subida", primer_dia)
        .lte("timestamp_subida", hoy + "T23:59:59")
        .execute()
    )
    rows = result.data or []
    if not rows: return []

    integrante_resolver = build_integrante_to_erp_name(distribuidor_id)

    daily: dict[tuple[str, str], int] = {}
    seen_daily_logic: set[tuple[str, str, str]] = set()
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    for r in rows:
        ts     = r.get("timestamp_subida") or ""
        fecha  = ts.split("T")[0]
        id_int = r.get("id_integrante")
        erp_name = integrante_resolver.get(id_int, "Desconocido") if id_int is not None else "Desconocido"
        if hide_qa and is_exhibicion_qa_display_for_dist(distribuidor_id, erp_name):
            continue

        client_key_raw = (
            r.get("id_cliente_pdv")
            or r.get("id_cliente")
            or r.get("cliente_sombra_codigo")
        )
        client_key = str(client_key_raw).strip() if client_key_raw is not None else ""
        if fecha and client_key:
            k_logic = (fecha, erp_name, client_key)
            if k_logic in seen_daily_logic:
                continue
            seen_daily_logic.add(k_logic)

        est = (r.get("estado") or "").lower()
        pts = 2 if "destacad" in est else (1 if "aprobad" in est else 0)
        if pts > 0:
            key = (fecha, erp_name)
            daily[key] = daily.get(key, 0) + pts

    fechas    = sorted({k[0] for k in daily})
    vendedores = sorted({k[1] for k in daily})
    acumulado: dict[str, int] = {v: 0 for v in vendedores}
    resultado = []
    for fecha in fechas:
        for vend in vendedores:
            pts_dia = daily.get((fecha, vend), 0)
            acumulado[vend] += pts_dia
            if pts_dia > 0 or acumulado[vend] > 0:
                resultado.append({"fecha": fecha, "vendedor": vend, "puntos_dia": pts_dia, "puntos_acumulados": acumulado[vend]})
    resultado.sort(key=lambda x: (x["fecha"], -x["puntos_acumulados"]))
    return resultado


@router.get("/api/dashboard/evolucion-tiempo/{distribuidor_id}", summary="Evolución temporal de exhibiciones")
def dashboard_evolucion(
    distribuidor_id: int,
    periodo: str = "mes",
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    res = sb.rpc(
        "fn_dashboard_evolucion_tiempo",
        {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_sucursal_id": suc_pk},
    ).execute()
    return res.data or []


@router.get("/api/dashboard/por-ciudad/{distribuidor_id}", summary="Rendimiento agrupado por ciudad")
def dashboard_por_ciudad(
    distribuidor_id: int,
    periodo: str = "mes",
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    res = sb.rpc(
        "fn_dashboard_por_ciudad",
        {"p_dist_id": distribuidor_id, "p_periodo": periodo, "p_sucursal_id": suc_pk},
    ).execute()
    return res.data or []


@router.get("/api/dashboard/por-empresa", summary="Rendimiento por empresa (Superadmin)")
def dashboard_por_empresa(
    periodo: str = "mes",
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    if not payload.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Acceso solo para Superadmins")
    suc_pk = _resolve_sucursal_pk(0, sucursal_id) if sucursal_id else None
    res = sb.rpc("fn_dashboard_por_empresa", {"p_periodo": periodo, "p_sucursal_id": suc_pk}).execute()
    return res.data or []


@router.get("/api/dashboard/por-sucursal/{distribuidor_id}", summary="Exhibiciones agrupadas por sucursal")
def dashboard_por_sucursal(
    distribuidor_id: int,
    periodo: str = "mes",
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    res = sb.rpc("fn_dashboard_por_sucursal", {"p_dist_id": distribuidor_id, "p_periodo": periodo}).execute()
    return _enrich_por_sucursal_rows(res.data or [], distribuidor_id)


@router.get("/api/dashboard/ultimas-evaluadas/{distribuidor_id}", summary="Últimas fotos evaluadas")
def dashboard_ultimas(
    distribuidor_id: int,
    n: int = 8,
    sucursal_id: Optional[str] = Query(None),
    payload=Depends(verify_auth),
):
    check_dist_permission(payload, distribuidor_id)
    suc_pk = _resolve_sucursal_pk(distribuidor_id, sucursal_id)
    allowed_integrantes = _allowed_integrantes_for_sucursal(distribuidor_id, suc_pk)
    ar_today = (datetime.utcnow() - timedelta(hours=3)).date()
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, payload)
    qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id) if hide_qa else frozenset()
    erp_name_map = _get_erp_name_map(distribuidor_id) if hide_qa else {}

    def _safe_enrich(rows: list[dict]) -> list[dict]:
        try:
            return _enrich_ultimas_dashboard_rows(rows, distribuidor_id)
        except Exception as e:
            logger.exception(f"[ultimas] enrich dist={distribuidor_id}: {e}")
            return rows

    fetch_n = max(n * 4, 24)
    rows = _fetch_ultimas_evaluadas_rows(distribuidor_id, fetch_n)

    if hide_qa:
        filtered_qa: list[dict] = []
        for row in rows:
            iid = _ultimas_safe_int(row.get("id_integrante"))
            if iid is not None and iid in qa_ids:
                continue
            tg = _ultimas_safe_text(row.get("vendedor")).strip()
            erp = erp_name_map.get(tg.lower(), tg) if tg else ""
            if is_exhibicion_qa_display_for_dist(distribuidor_id, erp):
                continue
            filtered_qa.append(row)
        rows = filtered_qa

    rows = _filter_ultimas_by_sucursal(rows, allowed_integrantes)
    rows = rows[:n]
    if rows:
        return _safe_enrich(rows)

    # Fallback RPC si la query directa no devolvió filas (esquema legacy)
    for days_back in range(90):
        fecha = (ar_today - timedelta(days=days_back)).isoformat()
        result = sb.rpc(
            "fn_ultimas_evaluadas",
            {"p_dist_id": distribuidor_id, "p_fecha": fecha, "p_limit": n},
        ).execute()
        if not result.data:
            continue
        rpc_rows = result.data
        if hide_qa:
            rpc_rows = [
                r
                for r in rpc_rows
                if _ultimas_safe_int(r.get("id_integrante")) not in qa_ids
                and not is_exhibicion_qa_display_for_dist(
                    distribuidor_id,
                    erp_name_map.get((_ultimas_safe_text(r.get("vendedor")).strip().lower()), ""),
                )
            ]
        rpc_rows = _filter_ultimas_by_sucursal(rpc_rows, allowed_integrantes)
        if rpc_rows:
            return _safe_enrich(rpc_rows[:n])
    return []


@router.get("/api/dashboard/imagen/{file_id}", summary="Proxy de imagen — Removido")
def dashboard_imagen(file_id: str):
    raise HTTPException(status_code=410, detail="Endpoint removido. Las fotos se sirven directamente desde Supabase Storage.")


# ─── Reportes de exhibiciones / ERP ──────────────────────────────────────────

@router.get("/api/reportes/vendedores/{distribuidor_id}")
def reportes_vendedores(distribuidor_id: int, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, distribuidor_id)
    integrante_resolver = build_integrante_to_erp_name(distribuidor_id)
    hide_qa = should_apply_exhibicion_qa_filter(distribuidor_id, user_payload)
    qa_ids = build_qa_exhibicion_integrante_ids(distribuidor_id) if hide_qa else frozenset()
    q = sb.table("exhibiciones").select("id_integrante")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    ex_result = q.execute()
    integrante_ids = list(set(r["id_integrante"] for r in (ex_result.data or []) if r.get("id_integrante")))
    if not integrante_ids: return []
    vendedores_unicos = set()
    for iid in integrante_ids:
        if hide_qa and iid in qa_ids:
            continue
        erp_name = integrante_resolver.get(iid)
        if not erp_name:
            continue
        if hide_qa and is_exhibicion_qa_display_for_dist(distribuidor_id, erp_name):
            continue
        vendedores_unicos.add(erp_name)
    return sorted(list(vendedores_unicos))


@router.get("/api/reportes/tipos-pdv/{distribuidor_id}")
def reportes_tipos_pdv(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("exhibiciones").select("tipo_pdv")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    result = q.not_.is_("tipo_pdv", "null").execute()
    return sorted(set(r["tipo_pdv"] for r in (result.data or []) if r.get("tipo_pdv")))


@router.get("/api/reportes/sucursales/{distribuidor_id}")
def reportes_sucursales(distribuidor_id: int, _=Depends(verify_auth)):
    q = sb.table("sucursales").select("nombre_erp")
    if distribuidor_id > 0: q = q.eq("id_distribuidor", distribuidor_id)
    result = q.execute()
    return sorted(list(set(r["nombre_erp"] for r in (result.data or []) if r.get("nombre_erp"))))


@router.post("/api/reportes/exhibiciones/{distribuidor_id}")
def reportes_exhibiciones(distribuidor_id: int, q_body: ReporteQuery, _=Depends(verify_auth)):
    def _safe_text(value: Any) -> str:
        if value is None:
            return ""
        return value if isinstance(value, str) else str(value)

    def _safe_int(value: Any) -> Optional[int]:
        try:
            return int(value) if value is not None else None
        except Exception:
            return None

    def _normalize(value: Any) -> str:
        import unicodedata
        txt = _safe_text(value).strip().lower()
        return "".join(ch for ch in unicodedata.normalize("NFD", txt) if unicodedata.category(ch) != "Mn")

    def _normalize_erp_code(value: Any) -> str:
        raw = _safe_text(value).strip()
        if not raw:
            return ""
        return raw.lstrip("0") or "0"

    query = sb.table("exhibiciones").select(
        "id_exhibicion, estado, tipo_pdv, supervisor_nombre, comentario_evaluacion, "
        "timestamp_subida, evaluated_at, url_foto_drive, id_integrante, id_cliente, id_cliente_pdv, cliente_sombra_codigo"
    )
    query = query.gte("timestamp_subida", f"{q_body.fecha_desde}T03:00:00Z").lte("timestamp_subida", f"{q_body.fecha_hasta}T23:59:59Z")
    if distribuidor_id > 0: query = query.eq("id_distribuidor", distribuidor_id)
    if q_body.estados:    query = query.in_("estado", q_body.estados)
    if q_body.tipos_pdv:  query = query.in_("tipo_pdv", q_body.tipos_pdv)
    result = query.order("timestamp_subida", desc=True).execute()
    rows   = result.data or []

    # Resolver vendedor de forma robusta (binding moderno + legado).
    vendedores_res = (
        sb.table(tenant_table_name("vendedores_v2", distribuidor_id))
        .select("id_vendedor, nombre_erp, id_vendedor_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
    )
    vendedores = vendedores_res.data or []
    vend_ids = {
        _safe_int(v.get("id_vendedor"))
        for v in vendedores
        if _safe_int(v.get("id_vendedor")) is not None
    }
    vend_erp_to_id: dict[str, int] = {}
    vend_name_to_id: dict[str, int] = {}
    vend_name_ambiguous: set[str] = set()
    vend_id_to_name: dict[int, str] = {}
    for v in vendedores:
        vid = _safe_int(v.get("id_vendedor"))
        if vid is None:
            continue
        vend_id_to_name[vid] = _safe_text(v.get("nombre_erp")).strip()
        id_erp = _safe_text(v.get("id_vendedor_erp")).strip()
        if id_erp and id_erp not in vend_erp_to_id:
            vend_erp_to_id[id_erp] = vid
        name_norm = _normalize(v.get("nombre_erp"))
        if name_norm:
            if name_norm in vend_name_to_id and vend_name_to_id[name_norm] != vid:
                vend_name_ambiguous.add(name_norm)
            else:
                vend_name_to_id[name_norm] = vid

    binding_by_tg_user: dict[int, int] = {}
    try:
        bind_r = (
            sb.table("vendedores_telegram_binding")
            .select("id_vendedor_v2, telegram_user_id")
            .eq("id_distribuidor", distribuidor_id)
            .execute()
        )
        for b in (bind_r.data or []):
            vid = _safe_int(b.get("id_vendedor_v2"))
            tg_uid = _safe_int(b.get("telegram_user_id"))
            if vid is not None and tg_uid is not None and vid in vend_ids:
                binding_by_tg_user[tg_uid] = vid
    except Exception:
        pass

    integrantes_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante, telegram_user_id, nombre_integrante, id_vendedor_v2, id_vendedor_erp")
        .eq("id_distribuidor", distribuidor_id)
        .execute()
    )
    integrantes = integrantes_res.data or []
    integrante_to_vendor_name: dict[int, str] = {}
    int_map = {r["id_integrante"]: r.get("nombre_integrante", "") for r in integrantes if r.get("id_integrante") is not None}
    for ig in integrantes:
        iid = _safe_int(ig.get("id_integrante"))
        if iid is None:
            continue
        vid = None
        tg_uid = _safe_int(ig.get("telegram_user_id"))
        if tg_uid is not None and tg_uid in binding_by_tg_user:
            vid = binding_by_tg_user[tg_uid]
        if vid is None:
            v2 = _safe_int(ig.get("id_vendedor_v2"))
            if v2 is not None and v2 in vend_ids:
                vid = v2
        if vid is None:
            erp = _safe_text(ig.get("id_vendedor_erp")).strip()
            if erp and erp in vend_erp_to_id:
                vid = vend_erp_to_id[erp]
        if vid is None:
            name_norm = _normalize(ig.get("nombre_integrante"))
            if name_norm and name_norm not in vend_name_ambiguous and name_norm in vend_name_to_id:
                vid = vend_name_to_id[name_norm]
        if vid is not None and vid in vend_id_to_name:
            integrante_to_vendor_name[iid] = vend_id_to_name[vid]

    erp_name_map = _get_erp_name_map(distribuidor_id)

    filtered_rows = []
    for r in rows:
        id_int = _safe_int(r.get("id_integrante"))
        tg_name = int_map.get(id_int, "Desconocido") if id_int is not None else "Desconocido"
        if distribuidor_id == 3 and tg_name.lower() == "nacho": continue
        erp_name = integrante_to_vendor_name.get(id_int) if id_int is not None else None
        if not erp_name:
            erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if distribuidor_id == 3 and erp_name.lower() == "nacho": continue
        r["vendedor"] = erp_name
        filtered_rows.append(r)
    rows = filtered_rows

    cliente_ids = list(
        set(
            cid for cid in (
                _safe_int(r.get("id_cliente_pdv")) or _safe_int(r.get("id_cliente"))
                for r in rows
            ) if cid is not None
        )
    )
    shadow_codes = list(
        set(
            _safe_text(r.get("cliente_sombra_codigo")).strip()
            for r in rows
            if _safe_text(r.get("cliente_sombra_codigo")).strip()
        )
    )
    # Resolver canónico: binding → id_vendedor_v2 → nombre_erp (fuente de verdad)
    vendedores_map: dict[int, str] = build_integrante_to_erp_name(distribuidor_id)
    clientes_map:   dict = {}
    if cliente_ids:
        cl = sb.table(tenant_table_name("clientes_pdv_v2", distribuidor_id)).select("id_cliente, id_cliente_erp").in_("id_cliente", cliente_ids).execute()
        clientes_map = {r["id_cliente"]: r["id_cliente_erp"] for r in (cl.data or [])}
    shadow_map: dict[str, str] = {}
    if shadow_codes:
        cl_shadow = (
            sb.table(tenant_table_name("clientes_pdv_v2", distribuidor_id))
            .select("id_cliente_erp")
            .eq("id_distribuidor", distribuidor_id)
            .in_("id_cliente_erp", shadow_codes)
            .execute()
        )
        for c in (cl_shadow.data or []):
            erp = _safe_text(c.get("id_cliente_erp")).strip()
            if not erp:
                continue
            shadow_map.setdefault(erp, erp)
            shadow_map.setdefault(_normalize_erp_code(erp), erp)

    output = []
    for r in rows:
        if q_body.vendedores:
            vendedor_name = vendedores_map.get(r.get("id_integrante"), "")
            if vendedor_name not in q_body.vendedores: continue
        output.append({
            "id_exhibicion": r["id_exhibicion"],
            "vendedor": r.get("vendedor") or vendedores_map.get(r.get("id_integrante"), "Sin nombre"),
            "sucursal": "",
            "cliente": (
                clientes_map.get(_safe_int(r.get("id_cliente_pdv")) or _safe_int(r.get("id_cliente")))
                or shadow_map.get(_safe_text(r.get("cliente_sombra_codigo")).strip())
                or shadow_map.get(_normalize_erp_code(r.get("cliente_sombra_codigo")))
                or str(r.get("id_cliente_pdv") or r.get("id_cliente") or r.get("cliente_sombra_codigo") or "")
            ),
            "tipo_pdv": r.get("tipo_pdv", ""), "estado": r["estado"],
            "supervisor": r.get("supervisor_nombre", ""), "comentario": r.get("comentario_evaluacion", ""),
            "fecha_carga": r.get("timestamp_subida"), "fecha_evaluacion": r.get("evaluated_at"),
            "link_foto": r.get("url_foto_drive", ""),
        })
    return output


@router.get("/api/reportes/recaudacion/{dist_id}")
def get_recaudacion_summary(dist_id: int, desde: str = Query(None), hasta: str = Query(None), vendedor: str = Query(None), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_recaudacion_kpis", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor,
    }).execute()
    return res.data or {}


@router.get("/api/reportes/recaudacion-detallada/{dist_id}")
def get_recaudacion_detallada(dist_id: int, desde: str = Query(None), hasta: str = Query(None), vendedor: str = Query(None), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_recaudacion_detallada", {
        "p_dist_id": dist_id,
        "p_desde": desde or (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
        "p_hasta": hasta or datetime.now().strftime("%Y-%m-%d"),
        "p_vendedor": vendedor,
    }).execute()
    return res.data or []


@router.get("/api/reportes/clientes-muertos/{dist_id}")
def get_clientes_muertos(dist_id: int, dias: int = 30, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_muertos", {"p_dist_id": dist_id, "p_dias": dias}).execute()
    return res.data or []


@router.get("/api/reportes/clientes/listado/{dist_id}", tags=["Reportes"])
def get_clientes_listado(dist_id: int, search: str = "", sucursal_id: str = "", vendedor_id: str = "", limit: int = 200, user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_reporte_clientes_maestro", {"p_dist_id": dist_id, "p_search": search, "p_sucursal_id": sucursal_id, "p_vendedor_id": vendedor_id, "p_limit": limit}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en listado de clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/reportes/clientes/stats/{dist_id}", tags=["Reportes"])
def get_clientes_stats(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_stats", {"p_dist_id": dist_id}).execute()
    return res.data or {}


@router.get("/api/reportes/clientes/temporal/{dist_id}")
def get_clientes_temporal(dist_id: int, _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_temporal", {"p_dist_id": dist_id}).execute()
    return res.data or []


@router.get("/api/reportes/clientes/desglose/{dist_id}")
def get_clientes_desglose(dist_id: int, tipo: str = Query("vendedor"), _=Depends(verify_auth)):
    res = sb.rpc("fn_reporte_clientes_desglose", {"p_dist_id": dist_id, "p_tipo": tipo}).execute()
    return res.data or []


@router.get("/api/reportes/sucursales/cruce/{dist_id}", tags=["Reportes"])
def get_sucursales_cruce(dist_id: int, periodo: str = Query("mes"), user_payload=Depends(verify_auth)):
    check_dist_permission(user_payload, dist_id)
    try:
        res = sb.rpc("fn_reporte_sucursales_cruce", {"p_dist_id": dist_id, "p_periodo": periodo}).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error en cruce de sucursales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Bonos ────────────────────────────────────────────────────────────────────

@router.get("/api/bonos/config/{id_distribuidor}", summary="Obtener config de bonos del mes")
def bonos_get_config(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    if not result.data:
        return {"id_config": None, "anio": anio, "mes": mes, "umbral": 0, "monto_bono_fijo": 0.0, "monto_por_punto": 0.0, "edicion_bloqueada": 0, "puestos": []}
    cfg = result.data[0]
    puestos_result = sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", cfg["id_config"]).order("puesto").execute()
    cfg["puestos"] = puestos_result.data or []
    return cfg


@router.post("/api/bonos/config/{id_distribuidor}/guardar", summary="Guardar config de bonos del mes")
def bonos_guardar_config(id_distribuidor: int, payload: BonusConfigPayload, _=Depends(verify_auth)):
    existing = sb.table("bonos_config").select("id_config, edicion_bloqueada").eq("id_distribuidor", id_distribuidor).eq("anio", payload.anio).eq("mes", payload.mes).execute()
    if existing.data and existing.data[0].get("edicion_bloqueada"):
        raise HTTPException(status_code=403, detail="Configuracion bloqueada por el superadmin")
    config_data = {"id_distribuidor": id_distribuidor, "anio": payload.anio, "mes": payload.mes, "umbral": payload.umbral, "monto_bono_fijo": payload.monto_bono_fijo, "monto_por_punto": payload.monto_por_punto}
    result   = sb.table("bonos_config").upsert(config_data, on_conflict="id_distribuidor,anio,mes").execute()
    id_config = result.data[0]["id_config"]
    sb.table("bonos_ranking").delete().eq("id_config", id_config).execute()
    for p in payload.puestos:
        sb.table("bonos_ranking").insert({"id_config": id_config, "puesto": p["puesto"], "premio_si_llego": p.get("premio_si_llego", 0), "premio_si_no_llego": p.get("premio_si_no_llego", 0)}).execute()
    return {"ok": True, "id_config": id_config}


@router.post("/api/bonos/config/{id_distribuidor}/bloquear")
def bonos_bloquear(id_distribuidor: int, anio: int, mes: int, bloquear: int = 1, _=Depends(verify_auth)):
    sb.table("bonos_config").update({"edicion_bloqueada": bloquear}).eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    return {"ok": True, "edicion_bloqueada": bloquear}


@router.get("/api/bonos/liquidacion/{id_distribuidor}", summary="Liquidacion de bonos del mes")
def bonos_liquidacion(id_distribuidor: int, anio: int, mes: int, _=Depends(verify_auth)):
    cfg_result = sb.table("bonos_config").select("*").eq("id_distribuidor", id_distribuidor).eq("anio", anio).eq("mes", mes).execute()
    cfg        = cfg_result.data[0] if cfg_result.data else None
    umbral     = cfg["umbral"] if cfg else 0
    bono_fijo  = cfg["monto_bono_fijo"] if cfg else 0.0
    por_punto  = cfg["monto_por_punto"] if cfg else 0.0
    id_config  = cfg["id_config"] if cfg else None
    puestos_map: dict = {}
    if id_config:
        for p in (sb.table("bonos_ranking").select("puesto, premio_si_llego, premio_si_no_llego").eq("id_config", id_config).order("puesto").execute().data or []):
            puestos_map[p["puesto"]] = p
    rows_result = sb.rpc("fn_bonos_liquidacion", {"p_dist_id": id_distribuidor, "p_anio": anio, "p_mes": mes}).execute()
    rows = rows_result.data or []
    erp_name_map = _get_erp_name_map(id_distribuidor)
    aggregated: dict = {}
    for d in rows:
        tg_name = (d.get("vendedor") or "").strip()
        if id_distribuidor == 3 and tg_name.lower() == "nacho": continue
        erp_name = erp_name_map.get(tg_name.lower(), tg_name)
        if id_distribuidor == 3 and erp_name.lower() == "nacho": continue
        if erp_name not in aggregated:
            aggregated[erp_name] = {"aprobadas": d["aprobadas"], "destacadas": d["destacadas"], "puntos": d["puntos"]}
        else:
            aggregated[erp_name]["aprobadas"]  += d["aprobadas"]
            aggregated[erp_name]["destacadas"] += d["destacadas"]
            aggregated[erp_name]["puntos"]     += d["puntos"]
    sorted_vends = sorted(aggregated.items(), key=lambda x: x[1]["puntos"], reverse=True)
    resultado = []
    for pos, (vendedor, d) in enumerate(sorted_vends, start=1):
        puntos     = d["puntos"]
        info_puesto = puestos_map.get(pos, {})
        llego      = puntos >= umbral
        bono       = (bono_fijo + info_puesto.get("premio_si_llego", 0.0)) if llego else (puntos * por_punto + info_puesto.get("premio_si_no_llego", 0.0))
        resultado.append({"puesto": pos, "vendedor": vendedor, "aprobadas": d["aprobadas"], "destacadas": d["destacadas"], "puntos": puntos, "llego_umbral": llego, "bono": round(bono, 2)})
    return {"anio": anio, "mes": mes, "umbral": umbral, "monto_bono_fijo": bono_fijo, "monto_por_punto": por_punto, "vendedores": resultado}


@router.get("/api/bonos/detalle/{id_distribuidor}", summary="Detalle exhibiciones de un vendedor")
def bonos_detalle(id_distribuidor: int, id_integrante: int, anio: int, mes: int, _=Depends(verify_auth)):
    result = sb.rpc("fn_bonos_detalle", {"p_dist_id": id_distribuidor, "p_integrante": id_integrante, "p_anio": anio, "p_mes": mes}).execute()
    return result.data or []
