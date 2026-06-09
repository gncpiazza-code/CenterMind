# -*- coding: utf-8 -*-
"""
Fusiona dos filas vendedores_v2 del mismo tenant cuando el ERP cambió y quedó duplicado.

Caso típico: mismo nombre_erp + sucursal, distinto id_vendedor_erp (5082 → 5102).
"""
from __future__ import annotations

import logging
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ShelfyAPI")


def _update_rows(table: str, field: str, dist_id: int | None, keep_id: int, drop_id: int) -> int:
    q = sb.table(table).update({field: keep_id}).eq(field, drop_id)
    if dist_id is not None and _table_has_dist(table):
        q = q.eq("id_distribuidor", dist_id)
    res = q.execute()
    return len(res.data or [])


def _table_has_dist(table: str) -> bool:
    return table in {
        "grupos",
        "integrantes_grupo",
        "objetivos",
        "cc_detalle",
        "cc_kpi_snapshot",
        "vendedores_telegram_binding",
        "vendedores_perfil",
        "telegram_binding_suggestions",
        "bot_pdv_pendiente_aviso",
        "portal_snapshot_recap_vendedor",
        "portal_snapshot_supervision_cc",
        "mapa_capas_planificacion",
    }


def _merge_rutas(dist_id: int, keep_id: int, drop_id: int) -> dict[str, int]:
    """Reasigna rutas del vendedor obsoleto; fusiona clientes si choca id_ruta_erp."""
    rutas_table = tenant_table_name("rutas_v2", dist_id)
    cli_table = tenant_table_name("clientes_pdv_v2", dist_id)
    stats = {"rutas_moved": 0, "rutas_merged": 0, "clientes_moved": 0}

    drop_rutas = (
        sb.table(rutas_table)
        .select("id_ruta, id_ruta_erp")
        .eq("id_vendedor", drop_id)
        .execute()
    ).data or []
    keep_rutas = (
        sb.table(rutas_table)
        .select("id_ruta, id_ruta_erp")
        .eq("id_vendedor", keep_id)
        .execute()
    ).data or []
    keep_by_erp = {str(r["id_ruta_erp"]): r["id_ruta"] for r in keep_rutas if r.get("id_ruta_erp")}

    for dr in drop_rutas:
        drop_ruta_id = dr["id_ruta"]
        erp = str(dr.get("id_ruta_erp") or "")
        keep_ruta_id = keep_by_erp.get(erp)
        if keep_ruta_id:
            moved = (
                sb.table(cli_table)
                .update({"id_ruta": keep_ruta_id})
                .eq("id_ruta", drop_ruta_id)
                .execute()
            )
            stats["clientes_moved"] += len(moved.data or [])
            sb.table(rutas_table).delete().eq("id_ruta", drop_ruta_id).execute()
            sb.table("rutas_v2").delete().eq("id_ruta", drop_ruta_id).execute()
            stats["rutas_merged"] += 1
        else:
            sb.table(rutas_table).update({"id_vendedor": keep_id}).eq("id_ruta", drop_ruta_id).execute()
            sb.table("rutas_v2").update({"id_vendedor": keep_id}).eq("id_ruta", drop_ruta_id).execute()
            keep_by_erp[erp] = drop_ruta_id
            stats["rutas_moved"] += 1
    return stats


def merge_vendedor_v2(
    dist_id: int,
    keep_id: int,
    drop_id: int,
    *,
    new_erp: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Fusiona drop_id → keep_id en todas las tablas conocidas y elimina el vendedor obsoleto.

    keep_id debe ser el vendedor canónico (ERP vigente en Consolido).
    """
    if keep_id == drop_id:
        raise ValueError("keep_id y drop_id deben ser distintos")

    vend_table = tenant_table_name("vendedores_v2", dist_id)
    rows = (
        sb.table(vend_table)
        .select("id_vendedor, id_vendedor_erp, nombre_erp, id_sucursal")
        .in_("id_vendedor", [keep_id, drop_id])
        .eq("id_distribuidor", dist_id)
        .execute()
    ).data or []
    by_id = {int(r["id_vendedor"]): r for r in rows}
    if keep_id not in by_id or drop_id not in by_id:
        raise ValueError(f"Vendedores {keep_id}/{drop_id} no encontrados en {vend_table}")

    erp_target = new_erp or str(by_id[keep_id].get("id_vendedor_erp") or by_id[drop_id].get("id_vendedor_erp") or "")

    plan: dict[str, Any] = {
        "dist_id": dist_id,
        "keep_id": keep_id,
        "drop_id": drop_id,
        "nombre_erp": by_id[keep_id].get("nombre_erp") or by_id[drop_id].get("nombre_erp"),
        "erp_target": erp_target,
        "dry_run": dry_run,
        "updates": {},
    }
    if dry_run:
        return plan

    route_stats = _merge_rutas(dist_id, keep_id, drop_id)
    plan["updates"]["rutas"] = route_stats

    for table, field in (
        ("grupos", "id_vendedor_v2"),
        ("integrantes_grupo", "id_vendedor_v2"),
        ("integrantes_grupo", "id_vendedor"),
        ("objetivos", "id_vendedor"),
        ("cc_detalle", "id_vendedor"),
        ("cc_kpi_snapshot", "id_vendedor"),
        ("supervisor_vendedores", "id_vendedor"),
        ("vendedores_perfil", "id_vendedor_v2"),
        ("telegram_binding_suggestions", "id_vendedor_v2"),
        ("bot_pdv_pendiente_aviso", "id_vendedor_v2"),
        ("portal_snapshot_recap_vendedor", "id_vendedor"),
        ("portal_snapshot_supervision_cc", "id_vendedor"),
        ("mapa_capas_planificacion", "id_vendedor"),
        ("vendedor_app_keys", "id_vendedor"),
    ):
        key = f"{table}.{field}"
        try:
            plan["updates"][key] = _update_rows(table, field, dist_id, keep_id, drop_id)
        except Exception as exc:
            logger.warning("[merge_vendedor] %s falló: %s", key, exc)
            plan["updates"][key] = f"error: {exc}"

    # grupos / integrantes: refrescar ERP
    sb.table("grupos").update({"id_vendedor_erp": erp_target}).eq("id_distribuidor", dist_id).eq("id_vendedor_v2", keep_id).execute()
    sb.table("integrantes_grupo").update({"id_vendedor_erp": erp_target}).eq("id_distribuidor", dist_id).eq("id_vendedor_v2", keep_id).execute()

    # Binding: un solo registro por (dist, vendedor). Eliminar el del obsoleto.
    try:
        sb.table("vendedores_telegram_binding").delete().eq("id_distribuidor", dist_id).eq("id_vendedor_v2", drop_id).execute()
    except Exception as exc:
        logger.warning("[merge_vendedor] binding delete: %s", exc)

    if erp_target:
        patch = {"id_vendedor_erp": erp_target}
        sb.table(vend_table).update(patch).eq("id_vendedor", keep_id).execute()
        sb.table("vendedores_v2").update(patch).eq("id_vendedor", keep_id).execute()

    sb.table(vend_table).delete().eq("id_vendedor", drop_id).execute()
    sb.table("vendedores_v2").delete().eq("id_vendedor", drop_id).execute()
    plan["deleted"] = drop_id
    logger.info("[merge_vendedor] dist=%s keep=%s drop=%s erp=%s", dist_id, keep_id, drop_id, erp_target)
    return plan
