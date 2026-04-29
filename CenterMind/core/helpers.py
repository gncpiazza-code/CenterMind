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

from core.tenant_tables import tenant_table_name
from db import sb

logger = logging.getLogger("ShelfyAPI")


def _norm_name(s) -> str:
    """Normaliza nombres de clientes para matching robusto entre ERPs distintos."""
    if not s:
        return ""
    s = str(s).strip().upper()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _looks_like_full_name(s: str | None) -> bool:
    """
    True cuando el label parece 'nombre + apellido' (>=2 tokens).
    Evita matcheos inseguros con alias cortos tipo 'Nacho' o 'Ricardo'.
    """
    n = _norm_name(s)
    if not n:
        return False
    return len([p for p in n.split(" ") if p]) >= 2


def _get_erp_name_map(dist_id: int) -> dict:
    """
    Devuelve dict { nombre_integrante_lower → nombre_erp } para un distribuidor.
    Resuelve: integrantes_grupo.id_vendedor_v2 → vendedores_v2_d{dist_id}.nombre_erp
    Fallback: si el integrante no tiene id_vendedor_v2, mantiene su nombre Telegram.

    EXCEPCIONAL: Para Distribuidora 3 (Tabaco) y id_vendedor_v2=30 (Ivan Soto),
    NO aplicamos el mapeo ERP para que Monchi y Jorge aparezcan con su propio nombre.
    """
    try:
        t_vendedores = tenant_table_name("vendedores_v2", dist_id)
        vend_res = (
            sb.table(t_vendedores)
            .select("id_vendedor, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        erp_identity_map: dict[str, str] = {}
        vend_id_to_name: dict[int, str] = {}
        for v in vend_res.data or []:
            nombre_erp = (v.get("nombre_erp") or "").strip()
            if nombre_erp:
                erp_identity_map[nombre_erp.lower()] = nombre_erp
                if v.get("id_vendedor") is not None:
                    vend_id_to_name[int(v["id_vendedor"])] = nombre_erp

        bindings_res = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id, id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        binding_map: dict[int, int] = {}
        for b in bindings_res.data or []:
            tg_uid = b.get("telegram_user_id")
            id_v2 = b.get("id_vendedor_v2")
            if tg_uid is None or id_v2 is None:
                continue
            try:
                binding_map[int(tg_uid)] = int(id_v2)
            except Exception:
                continue

        ig_res = (
            sb.table("integrantes_grupo")
            .select("nombre_integrante, id_vendedor_v2, id_vendedor_erp, telegram_user_id")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        name_map: dict = dict(erp_identity_map)
        for ig in ig_res.data or []:
            tg_name = (ig.get("nombre_integrante") or "").strip()
            if not tg_name:
                continue
            tg_uid = ig.get("telegram_user_id")
            id_v_erp = ig.get("id_vendedor_v2")
            try:
                if tg_uid is not None and int(tg_uid) in binding_map:
                    id_v_erp = binding_map[int(tg_uid)]
            except Exception:
                pass
            if dist_id == 3 and id_v_erp == 30:
                continue
            nombre_erp = vend_id_to_name.get(id_v_erp) if id_v_erp is not None else None
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
                current = name_map.get(tg_key)
                has_binding_override = False
                try:
                    has_binding_override = tg_uid is not None and int(tg_uid) in binding_map
                except Exception:
                    has_binding_override = False
                # Regla de seguridad: solo mapear por nombre cuando hay nombre+apellido.
                # Si no, exigir binding explícito para evitar cruces por alias ambiguos.
                if not has_binding_override and not _looks_like_full_name(tg_name):
                    continue
                if current and current != nombre_erp and not has_binding_override:
                    # Evita que nombres ambiguos (ej: "Nacho") pisen un mapping ya resuelto
                    # por una fila más confiable.
                    continue
                name_map[tg_key] = nombre_erp
                legacy_erp_name = (ig.get("id_vendedor_erp") or "").strip()
                if legacy_erp_name and legacy_erp_name.lower() != nombre_erp.lower():
                    legacy_key = legacy_erp_name.lower()
                    legacy_current = name_map.get(legacy_key)
                    if legacy_current and legacy_current != nombre_erp and not has_binding_override:
                        continue
                    name_map[legacy_key] = nombre_erp
        # Tabaco: durante la transición de padrón algunos eventos siguen llegando con
        # etiqueta legacy "RICARDO LAURO." aunque el vendedor activo es ALVAREZ.
        if dist_id == 3 and "ricardo alvarez" in erp_identity_map:
            name_map["ricardo lauro."] = erp_identity_map["ricardo alvarez"]
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
    t_vendedores = tenant_table_name("vendedores_v2", int(dist_id))
    t_sucursales = tenant_table_name("sucursales_v2", int(dist_id))
    vend_res = (
        sb.table(t_vendedores)
        .select("id_vendedor, nombre_erp, id_sucursal")
        .eq("id_distribuidor", int(dist_id))
        .execute()
    )
    suc_res = (
        sb.table(t_sucursales)
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

    # Resolve id_cliente vendor-scoped (ingesta-time matching evita el runtime name-mismatch)
    t_rutas = tenant_table_name("rutas_v2", int(dist_id))
    t_clientes = tenant_table_name("clientes_pdv_v2", int(dist_id))
    vendor_clients_cache: dict[int, list[dict]] = {}
    for record in records:
        iv = record.get("id_vendedor")
        if not iv:
            record["id_cliente"] = None
            continue
        if iv not in vendor_clients_cache:
            rutas_res = (
                sb.table(t_rutas)
                .select("id_ruta")
                .eq("id_vendedor", iv)
                .execute()
            )
            ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
            if ruta_ids:
                cli_res = (
                    sb.table(t_clientes)
                    .select("id_cliente, id_cliente_erp, nombre_fantasia, nombre_razon_social")
                    .eq("id_distribuidor", int(dist_id))
                    .in_("id_ruta", ruta_ids)
                    .execute()
                )
                vendor_clients_cache[iv] = cli_res.data or []
            else:
                vendor_clients_cache[iv] = []
        clientes = vendor_clients_cache[iv]
        cliente_norm = _norm_name(record["cliente_nombre"])
        erp_id = record.get("id_cliente_erp")
        matched_id = None
        if erp_id and not matched_id:
            for c in clientes:
                if str(c.get("id_cliente_erp") or "").strip() == str(erp_id).strip():
                    matched_id = c["id_cliente"]
                    break
        if not matched_id:
            for c in clientes:
                if _norm_name(c.get("nombre_fantasia")) == cliente_norm:
                    matched_id = c["id_cliente"]
                    break
        if not matched_id:
            for c in clientes:
                if _norm_name(c.get("nombre_razon_social")) == cliente_norm:
                    matched_id = c["id_cliente"]
                    break
        record["id_cliente"] = matched_id

    if records:
        # Delete ALL previous snapshots for this distribuidor before inserting the new one.
        # cc_detalle is a current-state table, not a history log — only the latest snapshot is kept.
        sb.table("cc_detalle").delete().eq("id_distribuidor", int(dist_id)).execute()
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


def build_integrante_to_erp_name(dist_id: int) -> dict[int, str]:
    """
    Fuente de verdad absoluta: {id_integrante → nombre_erp} para un distribuidor.

    Orden de prioridad:
    1. vendedores_telegram_binding (telegram_user_id → id_vendedor_v2 → nombre_erp)
    2. integrantes_grupo.id_vendedor_v2 → nombre_erp
    3. nombre_integrante (nombre Telegram crudo, último recurso)

    Excepción Tabaco (dist=3, id_vendedor_v2=30 = Ivan Soto): los helpers de Ivan
    (Monchi, Jorge) conservan su nombre Telegram para no atribuirle exhibiciones ajenas.
    """
    try:
        t_vendedores = tenant_table_name("vendedores_v2", dist_id)
        vend_res = (
            sb.table(t_vendedores)
            .select("id_vendedor, nombre_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        vend_id_to_name: dict[int, str] = {
            int(v["id_vendedor"]): (v.get("nombre_erp") or "").strip()
            for v in (vend_res.data or [])
            if v.get("id_vendedor") is not None and (v.get("nombre_erp") or "").strip()
        }

        bind_res = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id, id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        binding_by_tg: dict[int, int] = {}
        for b in (bind_res.data or []):
            tg_uid = b.get("telegram_user_id")
            v2 = b.get("id_vendedor_v2")
            if tg_uid is not None and v2 is not None:
                try:
                    binding_by_tg[int(tg_uid)] = int(v2)
                except Exception:
                    pass

        ig_res = (
            sb.table("integrantes_grupo")
            .select("id_integrante, telegram_user_id, nombre_integrante, id_vendedor_v2")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        result: dict[int, str] = {}
        for ig in (ig_res.data or []):
            iid = ig.get("id_integrante")
            if iid is None:
                continue
            iid = int(iid)
            tg_name = (ig.get("nombre_integrante") or "").strip()

            vid: int | None = None
            tg_uid = ig.get("telegram_user_id")
            if tg_uid is not None:
                try:
                    vid = binding_by_tg.get(int(tg_uid))
                except Exception:
                    pass

            if vid is None:
                v2 = ig.get("id_vendedor_v2")
                if v2 is not None:
                    try:
                        vid = int(v2)
                    except Exception:
                        pass

            if vid is not None:
                # Tabaco: helpers de Ivan Soto conservan nombre Telegram propio
                if dist_id == 3 and vid == 30:
                    if tg_name:
                        result[iid] = tg_name
                    continue
                nombre_erp = vend_id_to_name.get(vid)
                if nombre_erp:
                    result[iid] = nombre_erp
                    continue

            if tg_name:
                result[iid] = tg_name

        return result
    except Exception as e:
        logger.warning(f"build_integrante_to_erp_name dist={dist_id}: {e}")
        return {}


def load_active_vendedor_ids(dist_id: int) -> set[int]:
    """
    Devuelve el set de id_vendedor_v2 ACTIVOS para un distribuidor.
    Un vendedor sin fila en vendedores_perfil se considera activo (default True).
    Un vendedor con vendedores_perfil.activo = False se excluye.
    """
    try:
        t_vendedores = tenant_table_name("vendedores_v2", dist_id)
        vend_res = (
            sb.table(t_vendedores)
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
