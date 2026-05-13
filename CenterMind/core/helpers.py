# -*- coding: utf-8 -*-
"""
Helpers compartidos entre routers:
  - resolve_vendedor_v2_for_integrante : binding + grupo Telegram + fila
  - _get_erp_name_map : resuelve nombre Telegram → nombre ERP
  - _enrich_and_store_cc : enriquece y persiste filas de cc_detalle
  - Exhibiciones QA (Tabaco): ocultar ranking / visor salvo superadmin
"""
import logging
import re
import unicodedata
from typing import Any

from core.tenant_tables import tenant_table_name
from db import sb

logger = logging.getLogger("ShelfyAPI")

# ── Guardrails CC ingesta ──────────────────────────────────────────────────────
# Mínimo de filas esperadas por distribuidor. Si el nuevo snapshot trae menos,
# se aborta el sync para evitar pisar una cartera válida con datos basura.
_CC_MIN_ROWS: dict[int, int] = {
    3: 50,   # Tabaco (~4 500 rows normales)
    4: 15,   # Aloma
    5: 10,   # Liver
    2: 10,   # Real
    11: 10,  # Beltrocco
}
_CC_MIN_ROWS_DEFAULT = 5
# Abort si el nuevo snapshot < este % respecto al último snapshot conocido.
_CC_DROP_PCT_ABORT = 30


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


def resolve_vendedor_v2_for_integrante(
    ig: dict[str, Any],
    binding_rows: list[dict[str, Any]] | None,
    *,
    ignore_direct: bool = False,
) -> int | None:
    """
    id_vendedor_v2 efectivo para una fila integrantes_grupo + bindings Supabase.

    Precedencia (ignore_direct=False):
      1) id_vendedor_v2 propio en la fila (incluye supervisores por grupo Telegram)
      2) Binding con mismo telegram_user_id Y telegram_group_id (cuando ambos existen)
      3) Un solo id_vendedor entre todos los bindings de ese usuario Telegram

    Con ignore_direct=True se omite sólo la fila (paso 1), útil en diagnósticos de binding.
    """
    if not ignore_direct:
        v_own = ig.get("id_vendedor_v2")
        if v_own is not None:
            try:
                return int(v_own)
            except (TypeError, ValueError):
                pass

    rows = binding_rows or []
    tg_raw = ig.get("telegram_user_id")
    if tg_raw is None:
        return None
    try:
        tg_i = int(tg_raw)
    except (TypeError, ValueError):
        return None

    rel: list[dict[str, Any]] = []
    for r in rows:
        if r.get("telegram_user_id") is None:
            continue
        try:
            if int(r["telegram_user_id"]) != tg_i:
                continue
        except (TypeError, ValueError):
            continue
        if r.get("id_vendedor_v2") is None:
            continue
        rel.append(r)
    if not rel:
        return None

    gid_raw = ig.get("telegram_group_id")
    gid: int | None
    try:
        gid = int(gid_raw) if gid_raw is not None else None
    except (TypeError, ValueError):
        gid = None

    if gid is not None:
        for r in rel:
            bg = r.get("telegram_group_id")
            if bg is None:
                continue
            try:
                if int(bg) == gid:
                    return int(r["id_vendedor_v2"])
            except (TypeError, ValueError):
                continue

    vids = set()
    for r in rel:
        try:
            vids.add(int(r["id_vendedor_v2"]))
        except (TypeError, ValueError):
            continue
    if len(vids) == 1:
        return next(iter(vids))
    return None


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

        bindings_rows: list = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id, id_vendedor_v2, telegram_group_id")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data
            or []
        )

        ig_res = (
            sb.table("integrantes_grupo")
            .select(
                "nombre_integrante, id_vendedor_v2, id_vendedor_erp, telegram_user_id, telegram_group_id"
            )
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        name_map: dict = dict(erp_identity_map)
        for ig in ig_res.data or []:
            tg_name = (ig.get("nombre_integrante") or "").strip()
            if not tg_name:
                continue
            tg_uid = ig.get("telegram_user_id")
            id_v_erp = resolve_vendedor_v2_for_integrante(ig, bindings_rows)
            has_binding_override = False
            if tg_uid is not None:
                has_binding_override = (
                    resolve_vendedor_v2_for_integrante(
                        {
                            "telegram_user_id": tg_uid,
                            "telegram_group_id": ig.get("telegram_group_id"),
                            "id_vendedor_v2": None,
                        },
                        bindings_rows,
                    )
                    is not None
                )
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
                # Regla de seguridad: solo mapear por nombre cuando hay nombre+apellido
                # o id_vendedor_v2 explícito. Sin binding ni v2 directo, exigir nombre completo
                # para evitar cruces por alias ambiguos ("Romina", "Ricardo", "Luciano").
                has_direct_v2 = ig.get("id_vendedor_v2") is not None
                if not has_binding_override and not has_direct_v2 and not _looks_like_full_name(tg_name):
                    continue
                if current and current != nombre_erp and not has_binding_override and not has_direct_v2:
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
        # Unificación operativa: eventos/motores pueden llegar con "Matias Wutrich"
        # pero tablero/ranking deben consolidar bajo "Ivan Wutrich".
        # Se aplica solo cuando Ivan exista en el mapa ERP del tenant.
        ivan_canon = None
        for k, v in erp_identity_map.items():
            if "ivan" in k and "wutrich" in k:
                ivan_canon = v
                break
        if ivan_canon:
            name_map["matias wutrich"] = ivan_canon
            name_map["matias wutrich."] = ivan_canon
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
            "deuda_7_dias":          float(row.get("deuda_7_dias") or 0.0),
            "deuda_15_dias":         float(row.get("deuda_15_dias") or 0.0),
            "deuda_30_dias":         float(row.get("deuda_30_dias") or 0.0),
            "deuda_60_dias":         float(row.get("deuda_60_dias") or 0.0),
            "deuda_mas_60_dias":     float(row.get("deuda_mas_60_dias") or 0.0),
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
            existing["deuda_7_dias"] += r["deuda_7_dias"]
            existing["deuda_15_dias"] += r["deuda_15_dias"]
            existing["deuda_30_dias"] += r["deuda_30_dias"]
            existing["deuda_60_dias"] += r["deuda_60_dias"]
            existing["deuda_mas_60_dias"] += r["deuda_mas_60_dias"]
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
        # ── Guardrail: evitar pisar cartera con snapshot inválido ─────────────
        min_rows = _CC_MIN_ROWS.get(int(dist_id), _CC_MIN_ROWS_DEFAULT)
        if len(records) < min_rows:
            raise ValueError(
                f"CC GUARDRAIL dist={dist_id}: snapshot tiene solo {len(records)} filas "
                f"(mínimo esperado: {min_rows}). Sync abortado para proteger datos existentes."
            )
        try:
            last_count_res = (
                sb.table("cc_detalle")
                .select("id_distribuidor", count="exact")
                .eq("id_distribuidor", int(dist_id))
                .limit(1)
                .execute()
            )
            last_count: int = last_count_res.count or 0
            if last_count > min_rows and len(records) < last_count * (_CC_DROP_PCT_ABORT / 100):
                raise ValueError(
                    f"CC GUARDRAIL dist={dist_id}: nuevo snapshot tiene {len(records)} filas vs "
                    f"{last_count} actuales ({100 * len(records) // last_count}%). "
                    f"Caída >70%% — sync abortado."
                )
        except ValueError:
            raise
        except Exception as e:
            logger.warning(f"_enrich_and_store_cc: no se pudo verificar count anterior dist={dist_id}: {e}")
        # ─────────────────────────────────────────────────────────────────────
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
    1. integrantes_grupo.id_vendedor_v2 cuando está definido (incluye supervisores por grupo)
    2. vendedores_telegram_binding acotado por telegram_group_id o único vendor por tg uid
    3. nombre_integrante (nombre Telegram crudo, último recurso)

    Excepción Tabaco (dist=3, id_vendedor_v2=30 = Ivan Soto): los helpers de Ivan
    (Monchi, Jorge) conservan su nombre Telegram para no atribuirle exhibiciones ajenas.

    Safety net para usuarios de 1 solo grupo: si nombre_integrante coincide exactamente
    con un vendedor ERP distinto al resuelto por id_vendedor_v2, el dato en BD está
    cruzado — se usa el vendedor que corresponde al nombre para evitar mezclas.
    Este check NO aplica a usuarios multi-grupo (supervisores) porque su id_vendedor_v2
    intencional puede diferir de su propio nombre.
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
        # Reverse map: nombre_erp normalizado → id_vendedor (para el safety net)
        erp_name_to_vid: dict[str, int] = {
            name.lower(): vid for vid, name in vend_id_to_name.items()
        }

        bindings_rows_b: list = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id, id_vendedor_v2, telegram_group_id")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data
            or []
        )

        ig_res = (
            sb.table("integrantes_grupo")
            .select(
                "id_integrante, telegram_user_id, telegram_group_id, nombre_integrante, id_vendedor_v2"
            )
            .eq("id_distribuidor", dist_id)
            .execute()
        )

        # UIDs que aparecen en más de 1 fila = posibles supervisores/multi-grupo.
        # Para ellos NO aplicamos el safety net: su id_vendedor_v2 cruzado es intencional.
        from collections import Counter as _Counter
        tg_uid_row_count: _Counter[int] = _Counter(
            int(ig["telegram_user_id"])
            for ig in (ig_res.data or [])
            if ig.get("telegram_user_id") is not None
        )
        multi_group_uids: set[int] = {uid for uid, cnt in tg_uid_row_count.items() if cnt > 1}

        result: dict[int, str] = {}
        for ig in (ig_res.data or []):
            iid = ig.get("id_integrante")
            if iid is None:
                continue
            iid = int(iid)
            tg_name = (ig.get("nombre_integrante") or "").strip()

            vid = resolve_vendedor_v2_for_integrante(ig, bindings_rows_b)

            if vid is not None:
                # Tabaco: helpers de Ivan Soto conservan nombre Telegram propio
                if dist_id == 3 and vid == 30:
                    if tg_name:
                        result[iid] = tg_name
                    continue
                nombre_erp = vend_id_to_name.get(vid)
                if nombre_erp:
                    # Safety net: usuarios de 1 solo grupo con nombre completo que
                    # coincide exactamente con otro vendedor ERP → el id_vendedor_v2
                    # está cruzado en BD. Usamos el vendedor del nombre.
                    tg_uid_raw = ig.get("telegram_user_id")
                    is_single_group = (
                        tg_uid_raw is None
                        or int(tg_uid_raw) not in multi_group_uids
                    )
                    if is_single_group and tg_name and _looks_like_full_name(tg_name):
                        matched_vid = erp_name_to_vid.get(tg_name.lower())
                        if matched_vid is not None and matched_vid != vid:
                            corrected = vend_id_to_name.get(matched_vid)
                            if corrected:
                                logger.warning(
                                    f"build_integrante_to_erp_name dist={dist_id}: "
                                    f"id_integrante={iid} nombre='{tg_name}' → id_vendedor_v2={vid} "
                                    f"({nombre_erp}) CRUZADO, corrigiendo a {matched_vid} ({corrected})"
                                )
                                result[iid] = corrected
                                continue
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
