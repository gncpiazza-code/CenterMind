# -*- coding: utf-8 -*-
"""
Aislamiento estricto de lecturas ventas_enriched_v2 por tenant.

Reglas:
- Tenant estándar (Aloma, Tabaco, …): tabla SIEMPRE ventas_enriched_v2_d{request_dist},
  filas con id_distribuidor + tenant_id del Consolido correspondiente.
- Franquicia (Bolívar, Caramele, LAG): ventas en tabla Real (d2), filtradas por
  codigo_vendedor IN códigos ERP del dist solicitado (nunca filas de otros códigos Real).
- Nunca leer la tabla base ventas_enriched_v2 en runtime de KPIs/portal.
"""
from __future__ import annotations

import logging
from typing import Any

from db import sb
from core.rpa_tenant_registry import DIST_TO_ID_EMPRESA, TENANT_DIST_MAP
from core.tenant_tables import tenant_table_name

logger = logging.getLogger("ventas_enriched_tenant")

_PAGE_VEND = 1000

# Franquicia → dist donde vive el informe Consolido compartido (Real)
FRANCHISE_VENTAS_SOURCE_DIST: dict[int, int] = {
    7: TENANT_DIST_MAP["real"],
    8: TENANT_DIST_MAP["real"],
    9: TENANT_DIST_MAP["real"],
}

_DIST_TO_TENANT: dict[int, str] = {
    int(dist_id): tenant_id for tenant_id, dist_id in TENANT_DIST_MAP.items()
}


def _codigos_franquicia(vend_rows: list[dict]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in vend_rows or []:
        erp = str(v.get("id_vendedor_erp") or "").strip()
        if not erp or erp.upper() == "SIN VENDEDOR":
            continue
        if erp not in seen:
            seen.add(erp)
            out.append(erp)
    return out


def _codigo_variants(codigo: str) -> set[str]:
    c = str(codigo or "").strip()
    if not c:
        return set()
    stripped = c.lstrip("0") or c
    return {c, stripped}


def load_vendedores_ventas_scope_rows(dist_id: int) -> list[dict]:
    """
    Filas mínimas de vendedores_v2 del tenant para armar codigos de franquicia
    (Bolívar, Caramele, LAG → ventas en tabla Real).
    """
    t_vend = tenant_table_name("vendedores_v2", dist_id)
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table(t_vend)
            .select("id_vendedor,id_vendedor_erp,nombre_erp")
            .eq("id_distribuidor", dist_id)
            .range(offset, offset + _PAGE_VEND - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < _PAGE_VEND:
            break
        offset += _PAGE_VEND
    return rows


def build_ventas_read_context(
    request_dist: int,
    vend_rows: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Contexto único para lecturas de ventas_enriched_v2.

    request_dist: distribuidor del portal / carta / supervisión.
    """
    req = int(request_dist)
    source = FRANCHISE_VENTAS_SOURCE_DIST.get(req)
    is_franchise = source is not None

    if is_franchise:
        table_dist = int(source)
        filter_dist = table_dist
        codigos = _codigos_franquicia(vend_rows or [])
    else:
        table_dist = req
        filter_dist = req
        codigos = None

    data_tenant_id = _DIST_TO_TENANT.get(table_dist)
    table_name = tenant_table_name("ventas_enriched_v2", table_dist)
    # Filas del Informe Consolido: IdEmpresa en raw_json (aislamiento multi-empresa).
    expected_id_empresa = DIST_TO_ID_EMPRESA.get(int(table_dist))

    if not is_franchise and table_dist != req:
        raise ValueError(
            f"ventas tenant leak: request_dist={req} table_dist={table_dist}"
        )

    return {
        "request_dist": req,
        "table_dist": table_dist,
        "filter_dist": filter_dist,
        "table_name": table_name,
        "data_tenant_id": data_tenant_id,
        "expected_id_empresa": expected_id_empresa,
        "codigos": codigos,
        "is_franchise": is_franchise,
    }


def apply_ventas_tenant_filters(
    q,
    ctx: dict[str, Any],
    *,
    vendor_codigos: list[str] | None = None,
):
    """Filtros PostgREST obligatorios antes de paginar ventas_enriched."""
    filter_dist = int(ctx["filter_dist"])
    q = q.eq("id_distribuidor", filter_dist)

    tenant_id = ctx.get("data_tenant_id")
    if tenant_id:
        q = q.eq("tenant_id", tenant_id)

    codigos = vendor_codigos
    if not codigos:
        raw = ctx.get("codigos")
        codigos = list(raw) if raw else None

    if ctx.get("is_franchise"):
        if not codigos:
            logger.warning(
                "[ventas_tenant] franquicia dist=%s sin codigos ERP — scope vacío",
                ctx.get("request_dist"),
            )
            return q.eq("codigo_vendedor", "__NO_CODIGOS_FRANQUICIA__")
        if len(codigos) == 1:
            q = q.eq("codigo_vendedor", codigos[0])
        else:
            q = q.in_("codigo_vendedor", codigos)

    expected_ie = ctx.get("expected_id_empresa")
    if expected_ie:
        q = q.filter("raw_json->>id_empresa", "eq", str(expected_ie))

    return q


def filter_ventas_rows_for_tenant(
    rows: list[dict],
    ctx: dict[str, Any],
) -> list[dict]:
    """Segunda capa: descarta filas que no pertenecen al tenant solicitado."""
    if not rows:
        return []

    filter_dist = int(ctx["filter_dist"])
    tenant_id = (ctx.get("data_tenant_id") or "").strip().lower()
    is_franchise = bool(ctx.get("is_franchise"))
    codigos_raw = ctx.get("codigos") or []
    codigos_norm: set[str] = set()
    for c in codigos_raw:
        codigos_norm |= _codigo_variants(str(c))

    expected_ie = (ctx.get("expected_id_empresa") or "").strip()

    kept: list[dict] = []
    dropped = 0
    for row in rows:
        # Solo validar columnas presentes en el SELECT; la query ya aplicó filtros estrictos.
        if "id_distribuidor" in row:
            try:
                row_dist = int(row.get("id_distribuidor") or 0)
            except (TypeError, ValueError):
                dropped += 1
                continue
            if row_dist != filter_dist:
                dropped += 1
                continue

        if tenant_id and "tenant_id" in row:
            row_tid = (row.get("tenant_id") or "").strip().lower()
            if row_tid and row_tid != tenant_id:
                dropped += 1
                continue

        if is_franchise and "codigo_vendedor" in row:
            cod = str(row.get("codigo_vendedor") or "").strip()
            if not cod or not (codigos_norm & _codigo_variants(cod)):
                dropped += 1
                continue

        if expected_ie:
            raw = row.get("raw_json") if isinstance(row.get("raw_json"), dict) else None
            if raw is not None:
                row_ie = str(raw.get("id_empresa") or "").strip()
                if row_ie and row_ie != expected_ie:
                    dropped += 1
                    continue

        kept.append(row)

    if dropped:
        logger.warning(
            "[ventas_tenant] descartadas %s filas fuera de scope dist=%s tenant=%s",
            dropped,
            ctx.get("request_dist"),
            tenant_id or "?",
        )
    return kept


def resolve_estadisticas_ventas_fetch(
    dist_id: int,
    vend_rows: list[dict] | None = None,
) -> dict[str, object]:
    """Compat con estadisticas_franchise — delega en build_ventas_read_context."""
    ctx = build_ventas_read_context(dist_id, vend_rows)
    return {
        "request_dist": ctx["request_dist"],
        "table_dist": ctx["table_dist"],
        "filter_dist": ctx["filter_dist"],
        "table_name": ctx["table_name"],
        "data_tenant_id": ctx["data_tenant_id"],
        "expected_id_empresa": ctx.get("expected_id_empresa"),
        "codigos": ctx["codigos"],
        "is_franchise": ctx["is_franchise"],
    }


def ventas_enriched_base_query(
    sb_client,
    dist_id: int,
    select: str,
    vend_rows: list[dict] | None = None,
):
    """Query PostgREST con filtros estrictos de tenant ya aplicados."""
    req = int(dist_id)
    if FRANCHISE_VENTAS_SOURCE_DIST.get(req) is not None and not vend_rows:
        vend_rows = load_vendedores_ventas_scope_rows(req)
    ctx = build_ventas_read_context(dist_id, vend_rows)
    q = sb_client.table(ctx["table_name"]).select(select)
    q = apply_ventas_tenant_filters(q, ctx)
    return ctx, q
