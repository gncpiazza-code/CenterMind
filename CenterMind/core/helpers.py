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


def _extract_cc_vendedor_display_name(vendedor_nombre: str) -> str:
    """'717 0717 - LUCIANO GONZALEZ' → 'LUCIANO GONZALEZ'; '0085 - X' → 'X'."""
    vn = (vendedor_nombre or "").strip()
    if " - " in vn:
        return vn.split(" - ", 1)[1].strip()
    return vn


def _cc_vendor_code_tokens(vendedor_nombre: str) -> list[str]:
    """Tokens numéricos del prefijo CHESS en cc_detalle.vendedor_nombre."""
    head = (vendedor_nombre or "").split(" - ", 1)[0].strip()
    out: list[str] = []
    for m in re.finditer(r"\d+", head):
        raw = m.group(0)
        norm = raw.lstrip("0") or "0"
        for tok in (raw, norm):
            if tok and tok not in out:
                out.append(tok)
    return out


def _erp_codes_match_cc_vendor(cc_vendedor_nombre: str, id_vendedor_erp: str | None) -> bool:
    """
    Relaciona códigos CHESS (p. ej. 0717 en '717 0717 - …') con id_vendedor_erp del padrón (10717).
    """
    if not id_vendedor_erp:
        return False
    erp_s = str(id_vendedor_erp).strip()
    erp_norm = erp_s.lstrip("0") or "0"
    for tok in _cc_vendor_code_tokens(cc_vendedor_nombre):
        if tok == erp_norm or tok == erp_s:
            return True
        if len(tok) >= 2 and (erp_s.endswith(tok) or erp_norm.endswith(tok)):
            return True
    return False


def cc_row_matches_vendedor_erp(
    cc_vendedor_nombre: str,
    cc_id_vendedor: int | None,
    nombre_erp: str,
    id_vendedor: int | None = None,
    id_vendedor_erp: str | None = None,
) -> bool:
    """True si la fila CC pertenece al vendedor del padrón (nombre o código ERP)."""
    vn = (cc_vendedor_nombre or "").strip()
    if not vn or not nombre_erp:
        return False
    if id_vendedor is not None and cc_id_vendedor is not None and int(cc_id_vendedor) == int(id_vendedor):
        return True
    if _norm_name(_extract_cc_vendedor_display_name(vn)) == _norm_name(nombre_erp):
        return True
    return _erp_codes_match_cc_vendor(vn, id_vendedor_erp)


def _looks_like_full_name(s: str | None) -> bool:
    """
    True cuando el label parece 'nombre + apellido' (>=2 tokens).
    Evita matcheos inseguros con alias cortos tipo 'Nacho' o 'Ricardo'.
    """
    n = _norm_name(s)
    if not n:
        return False
    return len([p for p in n.split(" ") if p]) >= 2


def _qa_test_vendor_erp_name(
    dist_id: int, vend_id_to_name: dict[int, str]
) -> str | None:
    """Nombre ERP de la cuenta TEST (p. ej. NACHO PIAZZA) para el tenant."""
    qa_vids = _EXH_QA_VENDEDOR_V2_BY_DIST.get(dist_id, frozenset())
    for vid in qa_vids:
        name = vend_id_to_name.get(vid)
        if name and "piazza" in name.lower():
            return name
    for vid in qa_vids:
        name = vend_id_to_name.get(vid)
        if name:
            return name
    return None


def _vendor_names_match_venta(raw_nom: str, erp_nom: str) -> bool:
    """
    Match ventas Consolido → ERP: exacto, prefijo numérico, o intersección de tokens
    con al menos 2 tokens en el nombre corto (nombre+apellido). Sin alias sueltos.
    """
    if not raw_nom or not erp_nom:
        return False
    a = raw_nom.upper().strip()
    b = erp_nom.upper().strip()
    if a == b:
        return True
    if "-" in a:
        parts = a.split("-", 1)
        if len(parts) == 2 and parts[1].strip():
            a = parts[1].strip()
            if a == b:
                return True
    ta = [t for t in a.split() if t]
    tb = [t for t in b.split() if t]
    if len(ta) < 2 or len(tb) < 2:
        return False
    sa, sb = set(ta), set(tb)
    short, long = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    return len(short) >= 2 and short.issubset(long)


def resolve_exhibicion_vendedor_display(
    dist_id: int,
    id_integrante: int | None,
    nombre_integrante: str | None,
    *,
    integrante_to_erp: dict[int, str] | None = None,
    erp_name_map: dict[str, str] | None = None,
) -> str:
    """
    Etiqueta de vendedor para visor / pendientes.

    Prioridad: id_integrante → build_integrante_to_erp_name; luego mapa ERP solo
    con nombre+apellido. Nunca alias global tipo 'nacho' (cruce LERF ↔ PIAZZA).
    """
    tg = (nombre_integrante or "").strip()
    if id_integrante is not None:
        i2e = integrante_to_erp
        if i2e is None:
            i2e = build_integrante_to_erp_name(dist_id)
        try:
            erp = i2e.get(int(id_integrante))
        except (TypeError, ValueError):
            erp = None
        if erp:
            return erp
    em = erp_name_map if erp_name_map is not None else _get_erp_name_map(dist_id)
    if tg and _looks_like_full_name(tg):
        mapped = em.get(tg.lower())
        if mapped:
            return mapped
    return tg or "S/V"


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
                # Solo nombre+apellido en el mapa global (nunca alias "Nacho" suelto).
                if not _looks_like_full_name(tg_name):
                    continue
                if current and current != nombre_erp:
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
        .select("id_vendedor, id_vendedor_erp, nombre_erp, id_sucursal")
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
    vend_erp_map: dict[str, dict] = {}
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
        erp_raw = str(v.get("id_vendedor_erp") or "").strip()
        if erp_raw:
            erp_norm = erp_raw.lstrip("0") or "0"
            for key in (erp_raw, erp_norm):
                vend_erp_map[key] = info
            if len(erp_raw) > 3:
                vend_erp_map[erp_raw[-3:]] = info

    records = []
    for row in rows:
        v_nombre_raw = (row.get("vendedor") or "Sin Vendedor").strip()
        v_lower = v_nombre_raw.lower()
        enrichment = vend_map.get(v_lower)
        if not enrichment:
            stripped = re.sub(r"^\d+[\s\d]*-\s*", "", v_nombre_raw, flags=re.IGNORECASE).strip().lower()
            if stripped and stripped != v_lower:
                enrichment = vend_map.get(stripped)
        if not enrichment:
            for tok in _cc_vendor_code_tokens(v_nombre_raw):
                enrichment = vend_erp_map.get(tok)
                if enrichment:
                    break

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

        # Upsert KPI snapshot por vendedor (y fila global) para flechas de tendencia.
        try:
            from datetime import date as _date
            snap_date = fecha_snapshot if len(fecha_snapshot) == 10 else str(_date.today())
            _upsert_cc_kpi_snapshot(int(dist_id), records, snap_date)
        except Exception as _e:
            logger.warning(f"_enrich_and_store_cc: fallo al guardar cc_kpi_snapshot dist={dist_id}: {_e}")

    logger.info(
        f"_enrich_and_store_cc dist={dist_id}: {len(records)} registros guardados "
        f"en cc_detalle (snapshot {fecha_snapshot})"
    )
    return len(records)


def _upsert_cc_kpi_snapshot(dist_id: int, records: list[dict], fecha_snapshot: str) -> None:
    """Calcula KPIs agregados por vendedor e inserta una fila por corrida (historial para deltas)."""
    from collections import defaultdict

    by_vendor: dict[int | None, list[dict]] = defaultdict(list)
    for r in records:
        by_vendor[r.get("id_vendedor")].append(r)
    # Fila global (None = toda la distribuidora)
    by_vendor[None] = records

    snapshot_rows = []
    for vid, rows in by_vendor.items():
        total_deuda = sum(float(r.get("deuda_total") or 0) for r in rows)
        clientes_deudores = len(rows)
        pdvs_atraso_15 = sum(1 for r in rows if int(r.get("antiguedad_dias") or 0) > 15)
        dias_vals = [int(r.get("antiguedad_dias") or 0) for r in rows if r.get("antiguedad_dias")]
        dias_prom = round(sum(dias_vals) / len(dias_vals), 1) if dias_vals else 0.0
        snapshot_rows.append({
            "id_distribuidor": dist_id,
            "id_vendedor": vid,
            "fecha_snapshot": fecha_snapshot,
            "total_deuda": round(total_deuda, 2),
            "clientes_deudores": clientes_deudores,
            "pdvs_atraso_15": pdvs_atraso_15,
            "dias_promedio_atraso": dias_prom,
        })

    if snapshot_rows:
        sb.table("cc_kpi_snapshot").insert(snapshot_rows).execute()


def cc_kpi_delta(actual: dict, anterior: dict | None, campo: str) -> dict | None:
    """Delta entre dos filas de cc_kpi_snapshot (última vs corrida anterior)."""
    if not anterior:
        return None
    a = float(actual.get(campo) or 0)
    p = float(anterior.get(campo) or 0)
    diff = round(a - p, 2)
    pct = round(diff / p * 100, 1) if p else None
    dir_ = "up" if diff > 0 else ("down" if diff < 0 else "neutral")
    return {
        "diff": diff,
        "pct": pct,
        "dir": dir_,
        "anterior": p,
        "actual": a,
    }


# ─── Exhibiciones de prueba (Tabaco & Hnos): ranking + evaluación ───────────
# id_vendedor_v2 en vendedores_v2: 157 = NACHO PIAZZA, 76 = JESUS GRIMALDI (supervisor / QA).
_EXH_QA_VENDEDOR_V2_BY_DIST: dict[int, frozenset[int]] = {
    3: frozenset({157, 76}),
}

# Cuentas Center / test: ocultar exhibiciones en todos los distribuidores.
_EXH_QA_TELEGRAM_USER_IDS: frozenset[int] = frozenset({
    2037005531,  # Nacho Piazza (test)
    9001156,
    9000166,
    6823099488,
    9000005,
    9000202,
})

# Solo identidades QA explícitas — NO el alias Telegram suelto "Nacho" (p. ej. IGNACIO LERF).
_EXH_QA_INTEGRANTE_NAMES: frozenset[str] = frozenset({
    "nacho piazza",
    "test nacho",
    "jesus grimaldi",
})

_EXH_QA_DISPLAY_NAMES: frozenset[str] = _EXH_QA_INTEGRANTE_NAMES


def _norm_exhib_vendor_label(s: str | None) -> str:
    if not s:
        return ""
    t = str(s).strip().lower()
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    return " ".join(t.split())


def should_apply_exhibicion_qa_filter(dist_id: int, user_payload: dict | None) -> bool:
    """True si debemos ocultar filas QA (cuentas test / Center; usuario no superadmin)."""
    if not user_payload or user_payload.get("is_superadmin"):
        return False
    return True


def is_exhibicion_qa_integrante_name(nombre_integrante: str | None) -> bool:
    """Nombre Telegram de integrante usado solo para pruebas / QA."""
    n = _norm_exhib_vendor_label(nombre_integrante)
    if not n:
        return False
    if n in _EXH_QA_INTEGRANTE_NAMES:
        return True
    if "grimaldi" in n:
        return True
    return False


def is_exhibicion_qa_display_for_dist(dist_id: int, display_label: str | None) -> bool:
    """
    Etiqueta ERP o nombre completo de cuenta QA (NACHO PIAZZA, JESUS GRIMALDI).
    No oculta alias ambiguos tipo "Nacho" ni vendedores activos (p. ej. IGNACIO LERF).
    """
    n = _norm_exhib_vendor_label(display_label)
    if not n:
        return False
    if n in _EXH_QA_DISPLAY_NAMES:
        return True
    if "grimaldi" in n:
        return True
    return False


def build_qa_exhibicion_integrante_ids(dist_id: int) -> frozenset[int]:
    """
    id_integrante cuyas exhibiciones no deben verse en visor / no evaluables salvo superadmin.
    """
    qa_v = _EXH_QA_VENDEDOR_V2_BY_DIST.get(dist_id, frozenset())
    ids: set[int] = set()
    try:
        res = (
            sb.table("integrantes_grupo")
            .select("id_integrante,nombre_integrante,id_vendedor_v2,telegram_user_id,estado_mapeo")
            .eq("id_distribuidor", dist_id)
            .execute()
        )
        for row in res.data or []:
            iid = row.get("id_integrante")
            if not iid:
                continue
            try:
                iid_i = int(iid)
            except (TypeError, ValueError):
                continue
            v2 = row.get("id_vendedor_v2")
            tg_uid = row.get("telegram_user_id")
            is_qa_vendor_v2 = v2 is not None and v2 in qa_v
            if is_qa_vendor_v2:
                ids.add(iid_i)
                continue
            # Vendedor ERP activo (v2 fuera de QA): no ocultar por alias "Nacho" ni fusionado.
            if v2 is not None and v2 not in qa_v:
                continue
            if is_exhibicion_qa_integrante_name(row.get("nombre_integrante")):
                ids.add(iid_i)
            if tg_uid is not None:
                try:
                    if int(tg_uid) in _EXH_QA_TELEGRAM_USER_IDS:
                        ids.add(iid_i)
                except (TypeError, ValueError):
                    pass
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
            tg_uid_raw = ig.get("telegram_user_id")

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

            qa_erp = _qa_test_vendor_erp_name(dist_id, vend_id_to_name)
            if qa_erp and tg_uid_raw is not None:
                try:
                    if int(tg_uid_raw) in _EXH_QA_TELEGRAM_USER_IDS:
                        result[iid] = qa_erp
                        continue
                except (TypeError, ValueError):
                    pass

            if tg_name:
                result[iid] = tg_name

        return result
    except Exception as e:
        logger.warning(f"build_integrante_to_erp_name dist={dist_id}: {e}")
        return {}


# ── Exclusión de vendedores bucket en objetivos ───────────────────────────────
# Subcadenas que identifican vendedores operativos que no deben recibir objetivos.
_EXCLUIR_VENDEDOR_SUBCADENAS: tuple[str, ...] = (
    "sin vendedor",
    "supervisor",
)


def is_vendedor_excluido_objetivos(nombre_erp: str | None) -> bool:
    """True si el nombre corresponde a un bucket operativo (sin vendedor, supervisor, etc.)."""
    if not nombre_erp:
        return True
    n = nombre_erp.strip().lower()
    return any(sub in n for sub in _EXCLUIR_VENDEDOR_SUBCADENAS)


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


def resolve_vendedor_for_group(dist_id: int, telegram_chat_id: int) -> int | None:
    """
    Fuente de verdad group-first para comandos de bot.

    Precedencia:
    1. grupos.id_vendedor_v2 (si existe y vendor activo en ERP)
    2. Fallback: grupos.id_vendedor_erp → lookup en vendedores_v2
    3. None → bot invita a /vincular
    """
    try:
        from core.telegram_group_matcher import get_group_binding
        binding = get_group_binding(dist_id, telegram_chat_id)
        if binding and binding.get("id_vendedor_v2"):
            vid = binding["id_vendedor_v2"]
            # Verificar que el vendedor esté activo
            t_vend = tenant_table_name("vendedores_v2", dist_id)
            vres = (
                sb.table(t_vend)
                .select("id_vendedor, activo")
                .eq("id_vendedor", vid)
                .eq("id_distribuidor", dist_id)
                .limit(1)
                .execute()
            )
            if vres.data and vres.data[0].get("activo", True):
                return vid
    except Exception as e:
        logger.warning(f"resolve_vendedor_for_group dist={dist_id} chat={telegram_chat_id}: {e}")

    # Fallback legacy: grupos.id_vendedor_erp
    try:
        g_res = (
            sb.table("grupos")
            .select("id_vendedor_erp")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_chat_id", telegram_chat_id)
            .limit(1)
            .execute()
        )
        if g_res.data:
            legacy_erp = (g_res.data[0].get("id_vendedor_erp") or "").strip()
            if legacy_erp:
                t_vend = tenant_table_name("vendedores_v2", dist_id)
                v_res = (
                    sb.table(t_vend)
                    .select("id_vendedor")
                    .eq("id_distribuidor", dist_id)
                    .eq("id_vendedor_erp", legacy_erp)
                    .eq("activo", True)
                    .limit(1)
                    .execute()
                )
                if v_res.data:
                    return int(v_res.data[0]["id_vendedor"])
    except Exception as e:
        logger.warning(f"resolve_vendedor_for_group legacy dist={dist_id}: {e}")

    return None
