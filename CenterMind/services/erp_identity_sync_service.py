# -*- coding: utf-8 -*-
"""
Sincroniza id_empresa_erp / id_erp en distribuidores y erp_empresa_mapping
desde rpa_consolido_tenants (fuente operativa del RPA padrón).
"""
from __future__ import annotations

import logging
from typing import Any

from db import sb

logger = logging.getLogger("ErpIdentitySync")


def _unique_names(*parts: str | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        name = (p or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def sync_from_consolido_tenants(*, reload_erp_mappings: bool = True) -> dict[str, Any]:
    """
    Para cada tenant activo en rpa_consolido_tenants:
      - SET distribuidores.id_empresa_erp / id_erp = id_empresa
      - UPSERT erp_empresa_mapping (nombre Consolido + nombre Shelfy + tenant_id)
    Además agrega mapping por nombre_empresa para franquicias sin id_empresa propio.
    """
    tenants = (
        sb.table("rpa_consolido_tenants")
        .select("tenant_id, nombre, id_empresa, id_distribuidor, activo")
        .eq("activo", True)
        .order("orden")
        .execute()
    ).data or []

    dist_updates: list[dict[str, Any]] = []
    mapping_upserts: list[dict[str, Any]] = []

    for t in tenants:
        dist_id = int(t["id_distribuidor"])
        id_emp = str(t.get("id_empresa") or "").strip()
        if not id_emp:
            continue

        dist_row = (
            sb.table("distribuidores")
            .select("id_distribuidor, nombre_empresa, id_empresa_erp")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        ).data
        if not dist_row:
            logger.warning("dist %s no existe en distribuidores — omitido", dist_id)
            continue

        nombre_shelfy = (dist_row[0].get("nombre_empresa") or "").strip()
        prev_erp = (dist_row[0].get("id_empresa_erp") or "").strip()

        sb.table("distribuidores").update({
            "id_empresa_erp": id_emp,
            "id_erp": id_emp,
        }).eq("id_distribuidor", dist_id).execute()

        dist_updates.append({
            "id_distribuidor": dist_id,
            "nombre_empresa": nombre_shelfy,
            "id_empresa_erp": id_emp,
            "prev": prev_erp or None,
        })

        for name in _unique_names(t.get("nombre"), nombre_shelfy, t.get("tenant_id")):
            mapping_upserts.append({"nombre_erp": name, "id_distribuidor": dist_id})

    # Franquicias CHESS (sin id_empresa Consolido propio): mapping por nombre Shelfy
    franchise_only = (
        sb.table("distribuidores")
        .select("id_distribuidor, nombre_empresa, id_empresa_erp")
        .eq("estado", "activo")
        .is_("id_empresa_erp", "null")
        .execute()
    ).data or []
    for d in franchise_only:
        dist_id = int(d["id_distribuidor"])
        name = (d.get("nombre_empresa") or "").strip()
        if name:
            mapping_upserts.append({"nombre_erp": name, "id_distribuidor": dist_id})

    mappings_written = 0
    for row in mapping_upserts:
        try:
            sb.table("erp_empresa_mapping").upsert(
                row,
                on_conflict="nombre_erp",
            ).execute()
            mappings_written += 1
        except Exception as e:
            logger.warning("mapping upsert %r: %s", row, e)

    if reload_erp_mappings:
        try:
            from services.erp_ingestion_service import erp_service
            erp_service.reload_mappings()
        except Exception as e:
            logger.warning("reload_mappings: %s", e)

    return {
        "distribuidores_updated": len(dist_updates),
        "distribuidores": dist_updates,
        "erp_empresa_mapping_upserts": mappings_written,
    }
