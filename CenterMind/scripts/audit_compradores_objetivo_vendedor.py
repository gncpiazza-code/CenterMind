#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/audit_compradores_objetivo_vendedor.py
===============================================
Auditoría de compradores para un vendedor/mes — compara Consolido-only
vs + FUC para diagnosticar inflación en objetivos tipo COMPRADORES.

Uso:
    python CenterMind/scripts/audit_compradores_objetivo_vendedor.py \
        --dist <id> --vendedor "ALDECOA" --mes 2026-06 \
        --breakdown fuc,fuzzy,nombre,importe_cero

    python CenterMind/scripts/audit_compradores_objetivo_vendedor.py \
        --dist 1 --vendedor "ALDECOA ALEJANDRO GASTON" --mes 2026-06

Salida: total Consolido-only, +FUC, delta, top 20 ERPs discordantes.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from calendar import monthrange
from collections import defaultdict
from datetime import date
from pathlib import Path

# Añadir raíz del proyecto al path
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from db import sb
from core.tenant_tables import tenant_table_name
from core.objetivos_compradores import (
    _client_by_id_for_vendedor,
    _norm_erp,
    _periodo_bounds,
)
from core.ultima_compra import _venta_cuenta_como_compra, erp_query_variants
from core.ventas_enriched_tenant import (
    filter_ventas_rows_for_tenant,
    ventas_enriched_base_query,
)

PAGE = 1000
_VENTAS_SELECT = "id_cliente_erp,fecha_factura,importe_final,anulado,codigo_vendedor,nombre_vendedor"


def _find_vendedor(dist_id: int, nombre_fragment: str) -> list[dict]:
    t = tenant_table_name("vendedores_v2", dist_id)
    res = (
        sb.table(t)
        .select("id_vendedor,nombre_vendedor,codigo_vendedor_erp")
        .eq("id_distribuidor", dist_id)
        .ilike("nombre_vendedor", f"%{nombre_fragment}%")
        .limit(10)
        .execute()
    )
    return res.data or []


def _audit_compradores(
    dist_id: int,
    id_vendedor: int,
    desde: str,
    hasta: str,
    *,
    breakdown: list[str] | None = None,
) -> dict:
    """
    Retorna métricas de compradores para el vendedor en el período.
    """
    from services.estadisticas_service import _venta_matches_vendor, _vendor_context

    client_by_id = _client_by_id_for_vendedor(dist_id, id_vendedor)
    if not client_by_id:
        return {"error": "Cartera vacía", "id_vendedor": id_vendedor}

    desde_d, hasta_d = _periodo_bounds(desde, hasta)
    vctx = _vendor_context(dist_id, str(id_vendedor))

    erp_list: list[str] = []
    erp_to_cid: dict[str, int] = {}
    for cid, row in client_by_id.items():
        raw = str(row.get("id_cliente_erp") or "").strip()
        if not raw:
            continue
        for v in erp_query_variants(raw):
            if v not in erp_list:
                erp_list.append(v)
        n = _norm_erp(raw)
        if n:
            erp_to_cid[n] = int(cid)

    ventas_ctx, _ = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)

    # Recoger todas las ventas del período para estos ERPs
    ventas_en_periodo: list[dict] = []
    for i in range(0, len(erp_list), 400):
        chunk = erp_list[i : i + 400]
        _, q = ventas_enriched_base_query(sb, dist_id, _VENTAS_SELECT)
        offset = 0
        while True:
            batch = (
                q.eq("anulado", False)
                .in_("id_cliente_erp", chunk)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            batch = filter_ventas_rows_for_tenant(batch, ventas_ctx)
            ventas_en_periodo.extend(batch)
            if len(batch) < PAGE:
                break
            offset += PAGE

    # Análisis por categoría
    consolido_matches: set[int] = set()
    fuc_only_cids: set[int] = set()
    importe_cero_cids: set[int] = set()
    fuzzy_only_cids: set[int] = set()
    erps_en_ventas: set[str] = set()

    for row in ventas_en_periodo:
        n = _norm_erp(row.get("id_cliente_erp"))
        if n:
            erps_en_ventas.add(n)

        if not _venta_cuenta_como_compra(row):
            # Tiene importe 0 o es anulado
            n_zero = _norm_erp(row.get("id_cliente_erp"))
            cid_zero = erp_to_cid.get(n_zero) if n_zero else None
            if cid_zero is not None:
                importe_cero_cids.add(cid_zero)
            continue

        if not _venta_matches_vendor(row, vctx):
            continue

        n = _norm_erp(row.get("id_cliente_erp"))
        cid = erp_to_cid.get(n) if n else None
        if cid is not None:
            consolido_matches.add(cid)

    # FUC fallback (con lógica vieja — sin gating)
    fuc_cids_legacy: set[int] = set()
    for cid, row in client_by_id.items():
        if int(cid) in consolido_matches:
            continue
        fuc = str(row.get("fecha_ultima_compra") or "")[:10]
        if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
            fuc_cids_legacy.add(int(cid))

    # FUC con nuevo gating (solo ERPs sin ventas en consolido)
    fuc_cids_gated: set[int] = set()
    for cid, row in client_by_id.items():
        if int(cid) in consolido_matches:
            continue
        raw = str(row.get("id_cliente_erp") or "").strip()
        n = _norm_erp(raw)
        if n and n in erps_en_ventas:
            continue  # tiene ventas en consolido pero no matcheó → excluir
        fuc = str(row.get("fecha_ultima_compra") or "")[:10]
        if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
            fuc_cids_gated.add(int(cid))

    total_consolido = len(consolido_matches)
    total_fuc_legacy = total_consolido + len(fuc_cids_legacy)
    total_fuc_gated = total_consolido + len(fuc_cids_gated)

    return {
        "id_vendedor": id_vendedor,
        "dist_id": dist_id,
        "desde": desde_d,
        "hasta": hasta_d,
        "clientes_en_cartera": len(client_by_id),
        "consolido_only": total_consolido,
        "fuc_legacy_total": total_fuc_legacy,
        "fuc_gated_total": total_fuc_gated,
        "delta_fuc_legacy_vs_consolido": total_fuc_legacy - total_consolido,
        "delta_fuc_gated_vs_consolido": total_fuc_gated - total_consolido,
        "fuc_legacy_cids": sorted(fuc_cids_legacy)[:20],
        "fuc_gated_cids": sorted(fuc_cids_gated)[:20],
        "erps_con_ventas_en_periodo": len(erps_en_ventas),
        "ventas_totales_en_periodo": len(ventas_en_periodo),
        "cids_con_importe_cero": len(importe_cero_cids),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit compradores objetivo vendedor vs Consolido"
    )
    parser.add_argument("--dist", type=int, required=True, help="id_distribuidor")
    parser.add_argument("--vendedor", type=str, required=True, help="Nombre o fragmento del vendedor")
    parser.add_argument("--mes", type=str, required=True, help="Mes YYYY-MM (ej. 2026-06)")
    parser.add_argument("--breakdown", type=str, default="", help="Comma-separated: fuc,importe_cero")
    parser.add_argument("--csv", type=str, default="", help="Guardar CSV de ERPs discordantes en esta ruta")
    args = parser.parse_args()

    dist_id = args.dist
    mes = args.mes.strip()
    if len(mes) == 7:
        yr, mo = mes.split("-")
        desde = f"{mes}-01"
        last_day = monthrange(int(yr), int(mo))[1]
        hasta = f"{mes}-{last_day:02d}"
    else:
        print(f"Formato de mes inválido: {mes!r}. Usar YYYY-MM", file=sys.stderr)
        sys.exit(1)

    # Buscar vendedor
    vendedores = _find_vendedor(dist_id, args.vendedor)
    if not vendedores:
        print(f"No se encontró vendedor con '{args.vendedor}' en dist {dist_id}", file=sys.stderr)
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"AUDIT COMPRADORES — dist={dist_id} mes={mes}")
    print(f"{'='*60}")

    for v in vendedores:
        id_vend = v["id_vendedor"]
        nombre = v["nombre_vendedor"]
        print(f"\nVendedor: {nombre} (id={id_vend})")
        print(f"Período: {desde} → {hasta}")

        result = _audit_compradores(
            dist_id,
            id_vend,
            desde,
            hasta,
            breakdown=(args.breakdown.split(",") if args.breakdown else None),
        )

        if "error" in result:
            print(f"  ERROR: {result['error']}")
            continue

        print(f"\n  Clientes en cartera:     {result['clientes_en_cartera']}")
        print(f"  Ventas en período:       {result['ventas_totales_en_periodo']}")
        print(f"  ERPs con ventas:         {result['erps_con_ventas_en_periodo']}")
        print(f"  Clientes c/ importe=0:   {result['cids_con_importe_cero']}")
        print()
        print(f"  Consolido-only:          {result['consolido_only']}")
        print(f"  + FUC legacy (viejo):    {result['fuc_legacy_total']}  (+{result['delta_fuc_legacy_vs_consolido']})")
        print(f"  + FUC gated (nuevo):     {result['fuc_gated_total']}  (+{result['delta_fuc_gated_vs_consolido']})")
        print()
        if result["fuc_legacy_cids"]:
            print(f"  Cids solo por FUC legacy: {result['fuc_legacy_cids'][:10]}{'...' if len(result['fuc_legacy_cids']) > 10 else ''}")
        if result["fuc_gated_cids"]:
            print(f"  Cids por FUC gated:       {result['fuc_gated_cids'][:10]}{'...' if len(result['fuc_gated_cids']) > 10 else ''}")

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()
