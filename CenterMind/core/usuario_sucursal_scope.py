# -*- coding: utf-8 -*-
"""Alcance de sucursales por usuario del portal (JWT + validación en endpoints)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

from core.tenant_tables import tenant_table_name
from db import sb

_MSG_SUCURSAL_VENDEDOR = "No tenés permiso para operar sobre vendedores de esta sucursal"

logger = logging.getLogger("ShelfyAPI")
PAGE = 1000


def _page_select(table: str, select_cols: str, filters: list[tuple[str, Any]]):
    rows: list[dict] = []
    offset = 0
    while True:
        q = sb.table(table).select(select_cols)
        for key, val in filters:
            q = q.eq(key, val)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def load_sucursal_scope_for_user(
    id_usuario: int,
    dist_id: int | None,
    *,
    is_superadmin: bool = False,
) -> dict[str, Any]:
    """
    Devuelve:
      restricted: bool
      ids: list[int]
      names: list[str]  (nombre_erp)
    """
    if is_superadmin or not id_usuario or not dist_id:
        return {"restricted": False, "ids": [], "names": []}

    u_res = (
        sb.table("usuarios_portal")
        .select("restriccion_sucursales")
        .eq("id_usuario", id_usuario)
        .limit(1)
        .execute()
    )
    if not u_res.data or not u_res.data[0].get("restriccion_sucursales"):
        return {"restricted": False, "ids": [], "names": []}

    junction = _page_select(
        "usuario_portal_sucursales",
        "id_sucursal",
        [("id_usuario", id_usuario)],
    )
    ids = sorted({int(r["id_sucursal"]) for r in junction if r.get("id_sucursal") is not None})
    if not ids:
        return {"restricted": True, "ids": [], "names": []}

    t_suc = tenant_table_name("sucursales_v2", dist_id)
    names: list[str] = []
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        res = (
            sb.table(t_suc)
            .select("id_sucursal, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .in_("id_sucursal", chunk)
            .execute()
        )
        for row in res.data or []:
            n = (row.get("nombre_erp") or "").strip()
            if n:
                names.append(n)
    names = sorted(set(names), key=lambda s: s.lower())
    return {"restricted": True, "ids": ids, "names": names}


def jwt_sucursal_claims(scope: dict[str, Any]) -> dict[str, Any]:
    if not scope.get("restricted"):
        return {
            "sucursales_restringidas": False,
            "sucursales_permitidas_ids": [],
            "sucursales_permitidas_nombres": [],
        }
    return {
        "sucursales_restringidas": True,
        "sucursales_permitidas_ids": scope.get("ids") or [],
        "sucursales_permitidas_nombres": scope.get("names") or [],
    }


def is_unrestricted_sucursales(payload: dict) -> bool:
    if payload.get("method") == "api_key":
        return True
    if payload.get("is_superadmin"):
        return True
    return not payload.get("sucursales_restringidas")


def allowed_sucursal_ids(payload: dict) -> set[int] | None:
    if is_unrestricted_sucursales(payload):
        return None
    return {int(x) for x in (payload.get("sucursales_permitidas_ids") or [])}


def allowed_sucursal_names(payload: dict) -> set[str] | None:
    if is_unrestricted_sucursales(payload):
        return None
    return {(n or "").strip() for n in (payload.get("sucursales_permitidas_nombres") or []) if (n or "").strip()}


def assert_sucursal_id_allowed(payload: dict, sucursal_id: int | str | None) -> None:
    if sucursal_id is None:
        return
    raw = str(sucursal_id).strip()
    if not raw or not raw.isdigit():
        return
    allowed = allowed_sucursal_ids(payload)
    if allowed is None:
        return
    sid = int(raw)
    if sid not in allowed:
        raise HTTPException(status_code=403, detail="No tenés acceso a esta sucursal")


def assert_sucursal_nombre_allowed(payload: dict, sucursal_nombre: str | None) -> None:
    if not sucursal_nombre or sucursal_nombre.strip() in ("", "__all__"):
        return
    allowed = allowed_sucursal_names(payload)
    if allowed is None:
        return
    name = sucursal_nombre.strip()
    if name not in allowed:
        raise HTTPException(status_code=403, detail="No tenés acceso a esta sucursal")


def vendedor_sucursal_id(dist_id: int, vendedor_id: int) -> int | None:
    """id_sucursal del vendedor en vendedores_v2 (None si no existe o sin sucursal)."""
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    res = (
        sb.table(t_vend)
        .select("id_sucursal")
        .eq("id_vendedor", int(vendedor_id))
        .eq("id_distribuidor", dist_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    sid = res.data[0].get("id_sucursal")
    return int(sid) if sid is not None else None


def assert_vendedor_id_allowed(
    payload: dict,
    dist_id: int,
    vendedor_id: int | str | None,
) -> None:
    """Mutaciones (objetivos, evaluación): solo vendedores de sucursales permitidas."""
    if vendedor_id is None:
        return
    allowed = allowed_sucursal_ids(payload)
    if allowed is None:
        return
    try:
        vid = int(vendedor_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="id_vendedor inválido")
    sid = vendedor_sucursal_id(dist_id, vid)
    if sid is None or sid not in allowed:
        raise HTTPException(status_code=403, detail=_MSG_SUCURSAL_VENDEDOR)


def filter_sucursal_names(names: list[str], payload: dict) -> list[str]:
    allowed = allowed_sucursal_names(payload)
    if allowed is None:
        return names
    return [n for n in names if n in allowed]


def filter_sucursales_rows(rows: list[dict], payload: dict, name_key: str = "sucursal") -> list[dict]:
    allowed = allowed_sucursal_names(payload)
    if allowed is None:
        return rows
    out = []
    for r in rows:
        n = (r.get(name_key) or r.get("nombre_erp") or "").strip()
        if n in allowed:
            out.append(r)
    return out


def sync_usuario_sucursales(
    user_id: int,
    dist_id: int,
    restricted: bool,
    sucursal_ids: list[int],
) -> None:
    """Persiste restricción y reemplaza filas de la tabla puente."""
    sb.table("usuarios_portal").update({"restriccion_sucursales": restricted}).eq(
        "id_usuario", user_id
    ).execute()
    sb.table("usuario_portal_sucursales").delete().eq("id_usuario", user_id).execute()
    if not restricted:
        return

    unique_ids = sorted({int(x) for x in sucursal_ids if x})
    if not unique_ids:
        return

    t_suc = tenant_table_name("sucursales_v2", dist_id)
    valid: set[int] = set()
    for i in range(0, len(unique_ids), 200):
        chunk = unique_ids[i : i + 200]
        res = (
            sb.table(t_suc)
            .select("id_sucursal")
            .eq("id_distribuidor", dist_id)
            .in_("id_sucursal", chunk)
            .execute()
        )
        for row in res.data or []:
            valid.add(int(row["id_sucursal"]))

    to_insert = [
        {"id_usuario": user_id, "id_distribuidor": dist_id, "id_sucursal": sid}
        for sid in unique_ids
        if sid in valid
    ]
    if to_insert:
        sb.table("usuario_portal_sucursales").insert(to_insert).execute()


def attach_sucursales_to_usuarios(usuarios: list[dict]) -> list[dict]:
    if not usuarios:
        return usuarios
    ids = [u["id_usuario"] for u in usuarios if u.get("id_usuario")]
    if not ids:
        return usuarios

    by_user: dict[int, list[int]] = {uid: [] for uid in ids}
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        res = (
            sb.table("usuario_portal_sucursales")
            .select("id_usuario, id_sucursal")
            .in_("id_usuario", chunk)
            .execute()
        )
        for row in res.data or []:
            uid = int(row["id_usuario"])
            by_user.setdefault(uid, []).append(int(row["id_sucursal"]))

    for u in usuarios:
        uid = u.get("id_usuario")
        restricted = bool(u.get("restriccion_sucursales"))
        u["restriccion_sucursales"] = restricted
        u["sucursales_ids"] = sorted(set(by_user.get(uid, []))) if restricted else []
    return usuarios
