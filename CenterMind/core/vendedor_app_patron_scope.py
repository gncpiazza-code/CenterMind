# -*- coding: utf-8 -*-
"""Scope multi-cuenta para patrón en SHELFYAPP (ej. Ivan Soto → Monchi / Jorge Coronel)."""
from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException

from core.estadisticas_tabaco_rollup import IVAN_SOTO_V2_ID, TABACO_DIST_ID, _tokens

_SYNTHETIC_TG_UID_MIN = 9_000_000
PATRON_CUENTA_EQUIPO = "equipo"


def _slug_label(label: str) -> str:
    t = _tokens(label).replace(" ", "_")
    t = re.sub(r"[^a-z0-9_]+", "", t)
    return t or "cuenta"


def _is_real_telegram_uid(uid: Any) -> bool:
    try:
        return int(uid) < _SYNTHETIC_TG_UID_MIN
    except (TypeError, ValueError):
        return False


def _cuenta_key_from_nombre(nombre: str) -> str:
    t = _tokens(nombre)
    if "monchi" in t:
        return "monchi"
    if "jorge" in t or "coronel" in t:
        return "jorge_coronel"
    if "ivan" in t and "soto" in t:
        return "ivan_soto"
    return _slug_label(nombre)


def _pick_best_integrante_rows(rows: list[dict]) -> list[dict]:
    """Una fila por persona: prioriza UID Telegram real y id_integrante más alto."""
    by_key: dict[str, dict] = {}
    for row in rows or []:
        nombre = (row.get("nombre_integrante") or "").strip()
        if not nombre:
            continue
        key = _cuenta_key_from_nombre(nombre)
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = row
            continue
        prev_real = _is_real_telegram_uid(prev.get("telegram_user_id"))
        cur_real = _is_real_telegram_uid(row.get("telegram_user_id"))
        if cur_real and not prev_real:
            by_key[key] = row
            continue
        if cur_real == prev_real:
            try:
                if int(row.get("id_integrante") or 0) > int(prev.get("id_integrante") or 0):
                    by_key[key] = row
            except (TypeError, ValueError):
                pass
    order = {"monchi": 0, "jorge_coronel": 1, "ivan_soto": 2}
    return sorted(by_key.values(), key=lambda r: order.get(_cuenta_key_from_nombre(r.get("nombre_integrante") or ""), 99))


def list_patron_cuentas(sb, dist_id: int, leader_vid: int) -> list[dict[str, Any]]:
    """
    Cuentas operativas bajo un patrón (líder ERP).
    Hoy: Tabaco dist=3, Ivan Soto id_vendedor=30 → Monchi + Jorge Coronel.
    """
    if dist_id != TABACO_DIST_ID or int(leader_vid) != IVAN_SOTO_V2_ID:
        return []

    ig_res = (
        sb.table("integrantes_grupo")
        .select("id_integrante,nombre_integrante,telegram_user_id,id_vendedor_v2")
        .eq("id_distribuidor", dist_id)
        .eq("id_vendedor_v2", IVAN_SOTO_V2_ID)
        .execute()
    )
    rows = [
        r
        for r in (ig_res.data or [])
        if _cuenta_key_from_nombre(r.get("nombre_integrante") or "") in ("monchi", "jorge_coronel", "ivan_soto")
    ]
    picked = _pick_best_integrante_rows(rows)
    cuentas: list[dict[str, Any]] = []
    for row in picked:
        label = (row.get("nombre_integrante") or "").strip()
        cuenta_id = _cuenta_key_from_nombre(label)
        try:
            iid = int(row["id_integrante"])
        except (TypeError, ValueError, KeyError):
            continue
        cuentas.append(
            {
                "id": cuenta_id,
                "label": label,
                "integrante_ids": [iid],
            }
        )
    return cuentas


def resolve_patron_scope(
    sb,
    dist_id: int,
    leader_vid: int,
    cuenta_id: str | None,
) -> dict[str, Any]:
    """
    Resuelve scope efectivo para endpoints móviles.
    Si no hay cuentas de patrón, integrante_ids=None (comportamiento vendedor único).
    """
    cuentas = list_patron_cuentas(sb, dist_id, leader_vid)
    if not cuentas:
        return {
            "patron_mode": False,
            "cuentas": [],
            "cuenta_id": None,
            "cuenta_label": None,
            "integrante_ids": None,
            "ranking_nombre": None,
        }

    cuenta_clean = (cuenta_id or "").strip().lower()
    if cuenta_clean in (PATRON_CUENTA_EQUIPO, "__equipo__"):
        return {
            "patron_mode": True,
            "cuentas": cuentas,
            "cuenta_id": PATRON_CUENTA_EQUIPO,
            "cuenta_label": "Equipo",
            "integrante_ids": None,
            "ranking_nombre": None,
        }

    active_id = (cuenta_id or cuentas[0]["id"]).strip()
    match = next((c for c in cuentas if c["id"] == active_id), None)
    if match is None:
        raise HTTPException(
            status_code=400,
            detail=f"Cuenta inválida '{active_id}'. Opciones: {', '.join(c['id'] for c in cuentas)}",
        )

    return {
        "patron_mode": True,
        "cuentas": cuentas,
        "cuenta_id": match["id"],
        "cuenta_label": match["label"],
        "integrante_ids": list(match["integrante_ids"]),
        "ranking_nombre": match["label"],
    }


def resolve_patron_cartera_filter(
    sb,
    dist_id: int,
    leader_vid: int,
    scope: dict[str, Any],
) -> tuple[set[str] | None, dict | None]:
    """Si scope patrón activo, retorna (erp_ids filter, asignacion metadata)."""
    if not scope.get("patron_mode") or not scope.get("integrante_ids"):
        return None, None
    from services.vendedor_patron_cartera_service import (
        infer_patron_cartera_scope,
        list_team_integrante_ids,
    )

    team_ids = list_team_integrante_ids(sb, dist_id, leader_vid)
    inferred = infer_patron_cartera_scope(
        sb,
        dist_id,
        leader_vid,
        scope["integrante_ids"],
        all_team_integrante_ids=team_ids,
    )
    erp_ids = inferred.get("erp_ids") or set()
    return erp_ids, inferred.get("asignacion_cartera")

