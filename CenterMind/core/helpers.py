# -*- coding: utf-8 -*-
"""
Helpers compartidos entre routers:
  - _get_erp_name_map : resuelve nombre Telegram → nombre ERP
  - _enrich_and_store_cc : enriquece y persiste filas de cc_detalle
  - Exhibiciones QA (Tabaco): ocultar ranking / visor salvo superadmin
"""
import logging
import re
import unicodedata

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
        # Defensive baseline: if Telegram name already matches an ERP vendor name,
        # keep identity mapping and do not override it from integrantes_grupo.
        vend_res = (
            sb.table("vendedores_v2")
            .select("nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        erp_identity_map: dict[str, str] = {}
        for v in vend_res.data or []:
            nombre_erp = (v.get("nombre_erp") or "").strip()
            if nombre_erp:
                erp_identity_map[nombre_erp.lower()] = nombre_erp

        ig_res = (
            sb.table("integrantes_grupo")
            .select("nombre_integrante, id_vendedor_v2, vendedores_v2(nombre_erp)")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        name_map: dict = dict(erp_identity_map)
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
                tg_key = tg_name.lower()
                existing = erp_identity_map.get(tg_key)
                # If tg_name is already an ERP vendor name, never remap it to a different one.
                if existing and existing != nombre_erp:
                    logger.warning(
                        f"_get_erp_name_map dist={dist_id}: conflicto '{tg_name}' -> '{nombre_erp}' "
                        f"(se preserva identidad ERP '{existing}')"
                    )
                    continue
                name_map[tg_key] = nombre_erp
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


# ─── Exhibiciones de prueba (Tabaco & Hnos): ranking + evaluación ───────────
# id_vendedor_v2 en vendedores_v2: 157 = NACHO PIAZZA, 76 = JESUS GRIMALDI (supervisor / QA).
_EXH_QA_VENDEDOR_V2_BY_DIST: dict[int, frozenset[int]] = {
    3: frozenset({157, 76}),
}


def _norm_exhib_vendor_label(s: str | None) -> str:
    if not s:
        return ""
    t = str(s).strip().lower()
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    return " ".join(t.split())


def should_apply_exhibicion_qa_filter(dist_id: int, user_payload: dict | None) -> bool:
    """True si debemos ocultar filas QA (dist con reglas y usuario no superadmin)."""
    if not user_payload or user_payload.get("is_superadmin"):
        return False
    return dist_id in _EXH_QA_VENDEDOR_V2_BY_DIST


def is_exhibicion_qa_display_for_dist(dist_id: int, display_label: str | None) -> bool:
    """
    Etiqueta ya resuelta (Telegram o ERP) que identifica cuentas de QA en Tabaco.
    Incluye 'nacho' suelto por histórico de ranking cuando el mapa no enlaza a NACHO PIAZZA.
    """
    if dist_id not in _EXH_QA_VENDEDOR_V2_BY_DIST:
        return False
    n = _norm_exhib_vendor_label(display_label)
    if not n:
        return False
    if n in ("nacho piazza", "jesus grimaldi", "nacho"):
        return True
    if "grimaldi" in n:
        return True
    return False


def build_qa_exhibicion_integrante_ids(dist_id: int) -> frozenset[int]:
    """
    id_integrante cuyas exhibiciones no deben verse en visor / no evaluables salvo superadmin.
    """
    qa_v = _EXH_QA_VENDEDOR_V2_BY_DIST.get(dist_id)
    if not qa_v:
        return frozenset()
    ids: set[int] = set()
    try:
        res = (
            sb.table("integrantes_grupo")
            .select("id_integrante,nombre_integrante,id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        for row in res.data or []:
            iid = row.get("id_integrante")
            if not iid:
                continue
            v2 = row.get("id_vendedor_v2")
            ni = _norm_exhib_vendor_label(row.get("nombre_integrante"))
            if v2 in qa_v:
                ids.add(iid)
            if ni in ("nacho piazza", "jesus grimaldi") or "grimaldi" in ni:
                ids.add(iid)
    except Exception as e:
        logger.warning(f"build_qa_exhibicion_integrante_ids dist={dist_id}: {e}")
    return frozenset(ids)


def load_active_vendedor_ids(dist_id: int) -> set[int]:
    """
    Devuelve el set de id_vendedor_v2 ACTIVOS para un distribuidor.
    Un vendedor sin fila en vendedores_perfil se considera activo (default True).
    Un vendedor con vendedores_perfil.activo = False se excluye.
    """
    try:
        vend_res = (
            sb.table("vendedores_v2")
            .select("id_vendedor")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        all_ids = {v["id_vendedor"] for v in (vend_res.data or [])}
        if not all_ids:
            return set()
        perfil_res = (
            sb.table("vendedores_perfil")
            .select("id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .eq("activo", False)
            .execute()
        )
        inactive_ids = {p["id_vendedor_v2"] for p in (perfil_res.data or [])}
        return all_ids - inactive_ids
    except Exception as e:
        logger.warning(f"load_active_vendedor_ids dist={dist_id}: {e}")
        return set()
