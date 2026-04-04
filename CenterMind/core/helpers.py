# -*- coding: utf-8 -*-
"""
Helpers compartidos entre routers:
  - _get_erp_name_map : resuelve nombre Telegram → nombre ERP
  - _enrich_and_store_cc : enriquece y persiste filas de cc_detalle
"""
import logging
import re

from db import sb

logger = logging.getLogger("ShelfyAPI")


def _get_erp_name_map(dist_id: int) -> dict:
    """
    Devuelve dict { nombre_integrante_lower → nombre_erp } para un distribuidor.
    Resuelve: integrantes_grupo.id_vendedor_v2 → vendedores_v2.nombre_erp
    Fallback: si el integrante no tiene id_vendedor_v2, mantiene su nombre Telegram.

    EXCEPCIONAL: Para Distribuidora 3 (Tabaco) y id_vendedor_v2=30 (Ivan Soto),
    NO aplicamos el mapeo ERP para que Monchi y Jorge aparezcan con su propio nombre.
    """
    try:
        ig_res = (
            sb.table("integrantes_grupo")
            .select("nombre_integrante, id_vendedor_v2, vendedores_v2(nombre_erp)")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        name_map: dict = {}
        for ig in ig_res.data or []:
            tg_name = (ig.get("nombre_integrante") or "").strip()
            if not tg_name:
                continue
            if dist_id == 3 and tg_name.lower() == "nacho":
                continue
            id_v_erp = ig.get("id_vendedor_v2")
            if dist_id == 3 and id_v_erp == 30:
                continue
            vend = ig.get("vendedores_v2")
            nombre_erp = None
            if isinstance(vend, dict):
                nombre_erp = vend.get("nombre_erp")
            elif isinstance(vend, list) and vend:
                nombre_erp = vend[0].get("nombre_erp")
            if nombre_erp:
                name_map[tg_name.lower()] = nombre_erp
        return name_map
    except Exception as e:
        logger.warning(f"_get_erp_name_map dist={dist_id} falló: {e}")
        return {}


def _enrich_and_store_cc(dist_id: int, fecha_snapshot: str, rows: list) -> int:
    """
    Enriquece filas de cuentas corrientes con id_vendedor/id_sucursal desde
    vendedores_v2 e inserta en cc_detalle (previa eliminación del snapshot del
    mismo día para garantizar idempotencia).
    Devuelve la cantidad de registros guardados.
    """
    vend_res = (
        sb.table("vendedores_v2")
        .select("id_vendedor, nombre_erp, id_sucursal")
        .eq("id_distribuidor", int(dist_id))
        .execute()
    )
    suc_res = (
        sb.table("sucursales_v2")
        .select("id_sucursal, id_sucursal_erp, nombre_erp")
        .eq("id_distribuidor", int(dist_id))
        .execute()
    )

    suc_map = {s["id_sucursal"]: s["nombre_erp"] for s in (suc_res.data or [])}
    suc_erp_map = {
        str(s["id_sucursal_erp"]): s["nombre_erp"]
        for s in (suc_res.data or [])
        if s.get("id_sucursal_erp") is not None
    }

    vend_map: dict = {}
    for v in vend_res.data or []:
        nombre = (v.get("nombre_erp") or "").strip().lower()
        if not nombre:
            continue
        info = {
            "id_vendedor": v["id_vendedor"],
            "id_sucursal": v["id_sucursal"],
            "sucursal_nombre": suc_map.get(v["id_sucursal"], ""),
        }
        vend_map[nombre] = info
        name_only = re.sub(r"^\d+\s*-\s*", "", nombre).strip()
        if name_only and name_only != nombre:
            vend_map.setdefault(name_only, info)

    records = []
    for row in rows:
        v_nombre_raw = (row.get("vendedor") or "Sin Vendedor").strip()
        v_lower = v_nombre_raw.lower()
        enrichment = vend_map.get(v_lower)
        if not enrichment:
            stripped = re.sub(r"^\d+[\s\d]*-\s*", "", v_nombre_raw, flags=re.IGNORECASE).strip().lower()
            if stripped and stripped != v_lower:
                enrichment = vend_map.get(stripped)

        deuda_raw = row.get("deuda_total")
        if deuda_raw is None:
            deuda_raw = row.get("saldo_total")
        deuda_total = float(deuda_raw) if deuda_raw is not None else 0.0

        records.append({
            "id_distribuidor":       int(dist_id),
            "id_vendedor":           enrichment["id_vendedor"] if enrichment else None,
            "id_sucursal":           enrichment["id_sucursal"] if enrichment else None,
            "vendedor_nombre":       v_nombre_raw,
            "sucursal_nombre":       enrichment["sucursal_nombre"] if enrichment else (
                suc_erp_map.get(str(row.get("sucursal") or "")) or row.get("sucursal") or ""
            ),
            "cliente_nombre":        (row.get("cliente") or "Sin Cliente").strip(),
            "deuda_total":           deuda_total,
            "rango_antiguedad":      row.get("rango_antiguedad"),
            "antiguedad_dias":       int(row.get("antiguedad") or 0),
            "cantidad_comprobantes": int(row.get("cantidad_comprobantes") or row.get("cant_cbte") or 0),
            "alerta_credito":        row.get("alerta_credito") or row.get("Alerta de Crédito") or "",
            "fecha_snapshot":        fecha_snapshot,
            "id_cliente_erp":        str(row["cod_cliente"]) if row.get("cod_cliente") else None,
        })

    # Deduplicar por (vendedor_nombre, cliente_nombre)
    dedup: dict = {}
    for r in records:
        key = (r["vendedor_nombre"], r["cliente_nombre"])
        if key not in dedup:
            dedup[key] = r.copy()
        else:
            existing = dedup[key]
            existing["deuda_total"] += r["deuda_total"]
            existing["cantidad_comprobantes"] += r["cantidad_comprobantes"]
            if r["antiguedad_dias"] > existing["antiguedad_dias"]:
                existing["antiguedad_dias"] = r["antiguedad_dias"]
                existing["rango_antiguedad"] = r["rango_antiguedad"]
    records = list(dedup.values())

    if records:
        sb.table("cc_detalle").delete().eq("id_distribuidor", int(dist_id)).eq("fecha_snapshot", fecha_snapshot).execute()
        sb.table("cc_detalle").insert(records).execute()

    logger.info(
        f"_enrich_and_store_cc dist={dist_id}: {len(records)} registros guardados "
        f"en cc_detalle (snapshot {fecha_snapshot})"
    )
    return len(records)
