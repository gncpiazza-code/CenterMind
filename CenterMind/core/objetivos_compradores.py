# -*- coding: utf-8 -*-
"""
core/objetivos_compradores.py
==============================
Módulo compartido para medición del tipo de objetivo COMPRADORES.

Fuente autoritativa de la definición "PDV comprador en un período":
    1) ventas_enriched_v2 del tenant (importe_final >= 0).
    2) Fallback padrón: fecha_ultima_compra dentro del rango.

Regla de dedup: un PDV distinto (id_cliente) cuenta exactamente 1,
sin importar cuántas facturas emitió en el período.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from typing import Any

from db import sb
from core.tenant_tables import tenant_table_name


def _norm_erp(erp_id: Any) -> str | None:
    """Normaliza id_cliente_erp: quita .0 de float y ceros a la izquierda."""
    if erp_id is None:
        return None
    s = str(erp_id).strip()
    if not s:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return (s.lstrip("0") or "0").upper()


def compradores_en_periodo_for_clients(
    dist_id: int,
    client_by_id: dict[int, dict],
    desde: str,
    hasta: str,
) -> set[int]:
    """
    Dado un dict id_cliente → row (clientes_pdv_v2), retorna el conjunto de
    id_cliente que compraron al menos una vez en [desde, hasta].

    Fuentes (en orden):
    1. ventas_enriched_v2 — fecha_factura en rango, importe_final >= 0.
    2. Fallback padrón — fecha_ultima_compra en rango.

    No retorna ultima_compra_mes para mantener la interfaz simple; la supervisión
    usa su propia función _supervision_compradores_mes que mantiene ese campo extra.
    """
    comprador_ids: set[int] = set()
    if not client_by_id:
        return comprador_ids

    desde_d = desde[:10]
    hasta_d = hasta[:10]

    erp_norm_to_id: dict[str, int] = {}
    for cid, row in client_by_id.items():
        n = _norm_erp(row.get("id_cliente_erp"))
        if n:
            erp_norm_to_id[n] = int(cid)

    if erp_norm_to_id:
        t_ventas = tenant_table_name("ventas_enriched_v2", dist_id)
        PAGE = 1000
        offset = 0
        while True:
            batch = (
                sb.table(t_ventas)
                .select("id_cliente_erp,fecha_factura,importe_final")
                .eq("id_distribuidor", dist_id)
                .eq("anulado", False)
                .gte("fecha_factura", desde_d)
                .lte("fecha_factura", hasta_d)
                .range(offset, offset + PAGE - 1)
                .execute()
                .data or []
            )
            for row in batch:
                if float(row.get("importe_final") or 0) < 0:
                    continue
                n = _norm_erp(row.get("id_cliente_erp"))
                cid = erp_norm_to_id.get(n) if n else None
                if cid is not None:
                    comprador_ids.add(cid)
            if len(batch) < PAGE:
                break
            offset += PAGE

    # Fallback padrón
    for cid, row in client_by_id.items():
        fuc = str(row.get("fecha_ultima_compra") or "")[:10]
        if len(fuc) >= 10 and desde_d <= fuc <= hasta_d:
            comprador_ids.add(int(cid))

    return comprador_ids


def compradores_en_periodo(
    dist_id: int,
    id_vendedor: int,
    desde: str,
    hasta: str,
) -> set[int]:
    """
    Retorna id_cliente del vendedor que compraron en [desde, hasta].

    Resuelve la cartera del vendedor via rutas_v2 → clientes_pdv_v2,
    luego delega a compradores_en_periodo_for_clients.
    """
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_res = (
        sb.table(t_rutas)
        .select("id_ruta")
        .eq("id_vendedor", id_vendedor)
        .execute()
    )
    ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
    if not ruta_ids:
        return set()

    t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
    PAGE = 1000
    offset = 0
    client_by_id: dict[int, dict] = {}
    while True:
        batch = (
            sb.table(t_clientes)
            .select("id_cliente,id_cliente_erp,fecha_ultima_compra")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", ruta_ids)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data or []
        )
        for row in batch:
            cid = row.get("id_cliente")
            if cid is not None:
                client_by_id[int(cid)] = row
        if len(batch) < PAGE:
            break
        offset += PAGE

    return compradores_en_periodo_for_clients(dist_id, client_by_id, desde, hasta)


def periodo_desde_hasta_objetivo(obj: dict) -> tuple[str, str]:
    """
    Retorna (desde, hasta) para medir compradores de un objetivo.

    Compañía:   desde = día 1 del mes_referencia (o created_at mes si falta)
                hasta = último día del mes
    Distribuidora: desde = fecha_inicio (campo futuro) o created_at[:10]
                   hasta = fecha_objetivo o hoy
    """
    import unicodedata as _ud

    def _norm_origen(val: Any) -> str:
        raw = str(val or "").strip().lower()
        txt = "".join(c for c in _ud.normalize("NFD", raw) if _ud.category(c) != "Mn")
        txt = " ".join(txt.split())
        if txt in {"compania", "company"}:
            return "compania"
        return txt

    origen = _norm_origen(obj.get("origen"))
    hoy = date.today()

    if origen == "compania":
        mes_ref_raw = obj.get("mes_referencia") or ""
        base_raw = str(mes_ref_raw)[:10] if mes_ref_raw else str(obj.get("created_at") or "")[:10]
        try:
            base_dt = date.fromisoformat(base_raw)
        except (ValueError, TypeError):
            base_dt = hoy
        first_day = base_dt.replace(day=1)
        last_day_num = monthrange(first_day.year, first_day.month)[1]
        last_day = first_day.replace(day=last_day_num)
        return first_day.isoformat(), last_day.isoformat()
    else:
        # fecha_inicio no existe en DB todavía: usar created_at[:10]
        fecha_inicio = (
            str(obj.get("fecha_inicio") or "")[:10]
            or str(obj.get("created_at") or "")[:10]
            or hoy.isoformat()
        )
        fecha_hasta = str(obj.get("fecha_objetivo") or "")[:10] or hoy.isoformat()
        return fecha_inicio, fecha_hasta
