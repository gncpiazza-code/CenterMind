# -*- coding: utf-8 -*-
"""
core/objetivos_alteo_venta.py
==============================
Módulo para determinar si los PDVs dados de alta en una ruta tienen una venta
válida posterior al alta (objetivos ruteo_alteo con alteo_con_venta=True).

Regla de venta válida:
  - Fuente: ventas_enriched_v2 del tenant.
  - Filtro: importe_final > 0 (no anulado implícito, se verifica anulado=False).
  - Período: [fecha_alta del PDV, fecha_objetivo del objetivo].
  - Matching ERP: usa erp_query_variants para cubrir variantes con ceros.

Función principal:
  split_alteos_con_sin_venta — clasifica la lista de PDVs (clientes_pdv_v2)
  en aquellos que ya tienen al menos una venta en el período y los que no.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date
from typing import Any

from db import sb
from core.objetivos_compradores import _norm_erp
from core.tenant_tables import tenant_table_name
from core.ultima_compra import erp_query_variants
from core.ventas_enriched_tenant import (
    filter_ventas_rows_for_tenant,
    ventas_enriched_base_query,
)

logger = logging.getLogger("ObjetivosAlteoVenta")

PAGE = 1000
_VENTAS_SELECT = (
    "id_cliente_erp,fecha_factura,importe_final,anulado"
)


def venta_valida_pdv_en_periodo(
    dist_id: int,
    id_vendedor: int,
    id_cliente_erp: str,
    desde: str,  # YYYY-MM-DD
    hasta: str,  # YYYY-MM-DD
) -> bool:
    """
    Retorna True si el PDV (identificado por id_cliente_erp) tiene al menos
    una venta con importe_final > 0 en [desde, hasta].

    Nota: el filtro por vendedor NO se aplica aquí porque en alteo_con_venta
    el vendedor ya está implícito en la cartera de rutas. La función standalone
    es conveniente para verificar un PDV individual.
    """
    desde_d = str(desde or "")[:10]
    hasta_d = str(hasta or "")[:10]
    if not desde_d or not hasta_d:
        return False

    variants = erp_query_variants(id_cliente_erp)
    if not variants:
        return False

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)

    chunk_size = 400
    for i in range(0, len(variants), chunk_size):
        chunk = variants[i : i + chunk_size]
        _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
        offset = 0
        while True:
            batch = (
                q_ventas.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .gt("importe_final", 0)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            if batch:
                return True
            if len(batch) < PAGE:
                break
            offset += PAGE

    return False


def split_alteos_con_sin_venta(
    clients: list[dict],
    dist_id: int,
    id_vendedor: int,
    hasta: str,  # fecha_objetivo del objetivo (YYYY-MM-DD)
) -> tuple[list[dict], list[dict], dict, dict]:
    """
    Clasifica la lista de PDVs (filas clientes_pdv_v2 con id_cliente, id_cliente_erp, fecha_alta)
    en:
      - con_venta: PDVs con al menos 1 venta en [fecha_alta, hasta]
      - sin_venta: PDVs sin venta en ese período
      - progreso_diario_con: {YYYY-MM-DD: count} por fecha_alta de los con_venta
      - progreso_diario_total: {YYYY-MM-DD: count} por fecha_alta de todos

    Implementación eficiente: batch query de todos los ERPs para evitar N queries individuales.

    Supuesto clave: la venta debe ocurrir DESPUÉS del alta del PDV (desde=fecha_alta).
    Si fecha_alta no está disponible, el PDV se clasifica como sin_venta por precaución.
    """
    hasta_d = str(hasta or "")[:10]
    if not hasta_d:
        hasta_d = date.today().isoformat()

    if not clients:
        return [], [], {}, {}

    # 1. Recolectar todos los ERPs únicos y sus variantes
    #    Mapa: erp_norm → lista de id_cliente que tienen ese ERP norm
    #    Mapa: id_cliente → fecha_alta (para filtrado por período)
    erp_norm_to_cids: dict[str, list[int]] = defaultdict(list)
    cid_to_fecha_alta: dict[int, str] = {}
    erp_list: list[str] = []  # variantes para query (sin duplicados)
    erp_list_set: set[str] = set()

    for row in clients:
        cid = row.get("id_cliente")
        if cid is None:
            continue
        cid = int(cid)
        raw_erp = str(row.get("id_cliente_erp") or "").strip()
        fecha_alta = str(row.get("fecha_alta") or "")[:10]
        cid_to_fecha_alta[cid] = fecha_alta

        if not raw_erp:
            continue
        n = _norm_erp(raw_erp)
        if n:
            erp_norm_to_cids[n].append(cid)
        for variant in erp_query_variants(raw_erp):
            if variant and variant not in erp_list_set:
                erp_list.append(variant)
                erp_list_set.add(variant)

    # 2. Calcular el rango global: desde el fecha_alta mínima hasta hasta_d
    #    Para optimizar, hacemos una sola query amplia y filtramos por fecha_alta en Python.
    min_fecha_alta = ""
    for row in clients:
        fa = str(row.get("fecha_alta") or "")[:10]
        if fa and (not min_fecha_alta or fa < min_fecha_alta):
            min_fecha_alta = fa

    if not min_fecha_alta:
        min_fecha_alta = hasta_d  # no hay fechas_alta → todos sin_venta

    # 3. Batch query ventas en rango global [min_fecha_alta, hasta_d]
    #    Acumular: erp_norm → set de fechas de venta con importe > 0
    erp_norm_venta_fechas: dict[str, set[str]] = defaultdict(set)

    if erp_list and min_fecha_alta <= hasta_d:
        ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
        chunk_size = 400
        for i in range(0, len(erp_list), chunk_size):
            chunk = erp_list[i : i + chunk_size]
            _, q_ventas = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
            offset = 0
            while True:
                batch = (
                    q_ventas.eq("anulado", False)
                    .in_("id_cliente_erp", chunk)
                    .gte("fecha_factura", min_fecha_alta)
                    .lte("fecha_factura", hasta_d)
                    .gt("importe_final", 0)
                    .order("id")
                    .range(offset, offset + PAGE - 1)
                    .execute()
                    .data or []
                )
                batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
                for row in batch:
                    n = _norm_erp(row.get("id_cliente_erp"))
                    fecha_venta = str(row.get("fecha_factura") or "")[:10]
                    if n and fecha_venta:
                        erp_norm_venta_fechas[n].add(fecha_venta)
                if len(batch) < PAGE:
                    break
                offset += PAGE

    # 4. Clasificar cada PDV: tiene venta en [su_fecha_alta, hasta_d]?
    cids_con_venta: set[int] = set()
    for n, fechas_venta in erp_norm_venta_fechas.items():
        cids_de_este_erp = erp_norm_to_cids.get(n, [])
        for cid in cids_de_este_erp:
            fa = cid_to_fecha_alta.get(cid, "")
            # Venta válida = al menos una fecha_venta >= fecha_alta del PDV
            if any(fv >= fa for fv in fechas_venta if fa):
                cids_con_venta.add(cid)

    # 5. Construir listas y progreso_diario
    con_venta: list[dict] = []
    sin_venta: list[dict] = []
    progreso_diario_con: dict[str, int] = {}
    progreso_diario_total: dict[str, int] = {}

    for row in clients:
        cid = row.get("id_cliente")
        if cid is None:
            sin_venta.append(row)
            continue
        cid = int(cid)
        fa = str(row.get("fecha_alta") or "")[:10]
        if fa:
            progreso_diario_total[fa] = progreso_diario_total.get(fa, 0) + 1

        if cid in cids_con_venta:
            con_venta.append(row)
            if fa:
                progreso_diario_con[fa] = progreso_diario_con.get(fa, 0) + 1
        else:
            sin_venta.append(row)

    logger.info(
        f"[AlteoVenta] dist={dist_id} vend={id_vendedor}: "
        f"total={len(clients)} con_venta={len(con_venta)} sin_venta={len(sin_venta)}"
    )

    return con_venta, sin_venta, progreso_diario_con, progreso_diario_total
