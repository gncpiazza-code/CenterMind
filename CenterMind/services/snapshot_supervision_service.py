# -*- coding: utf-8 -*-
"""
Snapshot service for supervision CC bundle.

Replica la lógica de supervision_cuentas del router pero con cache Postgres.
TTL: 15 minutos (los datos de CC se actualizan 2 veces al día).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import sb
from services.snapshot_common import (
    apply_meta_flags,
    is_fresh,
    is_serveable_stale,
    trigger_background_refresh,
)

logger = logging.getLogger("snapshot_supervision_service")

SUPERVISION_MAX_STALE_SECONDS = 900  # 15 min
SUPERVISION_SERVE_STALE_SECONDS = 86400  # 24 h


# ── Public API ────────────────────────────────────────────────────────────────

def _refresh_supervision_background(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
) -> None:
    payload = _compute_supervision(dist_id, sucursal, id_vendedor)
    apply_meta_flags(
        payload.setdefault("meta", {}),
        cache_hit=False,
        stale=False,
        revalidating=False,
    )
    _upsert_supervision_snapshot(dist_id, sucursal, id_vendedor, payload)


def get_or_refresh_supervision(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
) -> dict:
    snap = _read_supervision_snapshot(dist_id, sucursal, id_vendedor)
    if snap is not None:
        gen = snap["generated_at"]
        if is_fresh(gen, SUPERVISION_MAX_STALE_SECONDS):
            payload = snap["payload"]
            apply_meta_flags(
                payload.setdefault("meta", {}),
                cache_hit=True,
                stale=False,
                revalidating=False,
                generated_at=gen,
            )
            return payload
        if is_serveable_stale(gen, SUPERVISION_SERVE_STALE_SECONDS):
            payload = snap["payload"]
            apply_meta_flags(
                payload.setdefault("meta", {}),
                cache_hit=False,
                stale=True,
                revalidating=True,
                generated_at=gen,
            )
            key = f"supervision:{dist_id}:{sucursal}:{id_vendedor}"
            trigger_background_refresh(
                key,
                lambda: _refresh_supervision_background(dist_id, sucursal, id_vendedor),
            )
            return payload
    key = f"supervision:{dist_id}:{sucursal}:{id_vendedor}"
    trigger_background_refresh(
        key,
        lambda: _refresh_supervision_background(dist_id, sucursal, id_vendedor),
    )
    generated_at = datetime.now(timezone.utc).isoformat()
    partial = {
        "meta": {
            "generated_at": generated_at,
            "fecha_snapshot_cc": None,
        },
        "cuentas": {"fecha": None, "metadatos": {}, "vendedores": []},
    }
    apply_meta_flags(
        partial["meta"],
        cache_hit=False,
        stale=False,
        revalidating=True,
    )
    return partial


def force_persist_supervision(
    dist_id: int,
    sucursal: str | None = None,
    id_vendedor: int | None = None,
) -> None:
    _refresh_supervision_background(dist_id, sucursal, id_vendedor)


def _cold_compute_supervision(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
) -> dict:
    payload = _compute_supervision(dist_id, sucursal, id_vendedor)
    apply_meta_flags(
        payload.setdefault("meta", {}),
        cache_hit=False,
        stale=False,
        revalidating=False,
    )
    _upsert_supervision_snapshot(dist_id, sucursal, id_vendedor, payload)
    return payload


def mark_supervision_stale(dist_id: int) -> None:
    try:
        epoch = "1970-01-01T00:00:00+00:00"
        (
            sb.table("portal_snapshot_supervision_cc")
            .update({"generated_at": epoch})
            .eq("id_distribuidor", dist_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"[snap_supervision] mark_stale dist={dist_id}: {e}")


# ── Compute ───────────────────────────────────────────────────────────────────

def _compute_supervision(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
) -> dict:
    from routers.supervision import (
        _fetch_cc_detalle_rows,
        _resolve_sucursal_vendedor_ids,
        _build_pdv_metadata_maps,
        _enrich_clientes_contact,
        _norm_name,
        _parse_cc_cliente_label,
        _norm_erp_cliente_id,
        _resolve_cc_fecha_ultima_compra,
        _today_ar,
        _dias_desde_fecha,
        _antiguedad_supervision_display,
        _cc_padron_incoherente,
    )

    generated_at = datetime.now(timezone.utc).isoformat()

    # Buscar fecha_snapshot más reciente
    snap_res = (
        sb.table("cc_detalle")
        .select("fecha_snapshot")
        .eq("id_distribuidor", dist_id)
        .order("fecha_snapshot", desc=True)
        .limit(1)
        .execute()
    )
    if not snap_res.data:
        logger.warning(f"[snap_supervision] No fecha_snapshot en cc_detalle para dist={dist_id}")
        return {
            "meta": {
                "generated_at": generated_at,
                "fecha_snapshot_cc": None,
            },
            "cuentas": {"fecha": None, "metadatos": {}, "vendedores": []},
        }

    fecha_snapshot = snap_res.data[0]["fecha_snapshot"]

    valid_vend_ids: set[int] | None = None
    sucursal_upper: str | None = None
    if sucursal:
        valid_vend_ids, sucursal_upper = _resolve_sucursal_vendedor_ids(dist_id, sucursal)

    vid_filtro: int | None = None
    if id_vendedor is not None:
        try:
            vid_filtro = int(id_vendedor)
        except (TypeError, ValueError):
            vid_filtro = None

    rows = _fetch_cc_detalle_rows(
        dist_id,
        fecha_snapshot,
        id_vendedor=vid_filtro,
        valid_vend_ids=valid_vend_ids if sucursal and not vid_filtro else None,
        sucursal_norm_upper=sucursal_upper if sucursal and not vid_filtro else None,
    )

    try:
        (
            fecha_uc_map,
            erp_fuc_map,
            erp_id_map,
            id_cliente_map,
            erp_to_id_cliente,
            id_cliente_fuc_map,
        ) = _build_pdv_metadata_maps(dist_id, rows)
    except Exception as e:
        logger.warning(f"[snap_supervision] PDV metadata error dist={dist_id}: {e}")
        fecha_uc_map = erp_fuc_map = erp_id_map = id_cliente_map = erp_to_id_cliente = id_cliente_fuc_map = {}

    # Overlay de última compra desde ventas (best-effort)
    comprobante_by_erp: dict = {}
    try:
        from core.ultima_compra import overlay_padron_fuc_maps_from_ventas

        erp_raw_cc = [
            str(r.get("id_cliente_erp") or "").strip()
            for r in rows
            if r.get("id_cliente_erp")
        ]
        comprobante_by_erp = overlay_padron_fuc_maps_from_ventas(
            dist_id,
            erp_fuc_map,
            id_cliente_fuc_map,
            erp_to_id_cliente,
            erp_raw_cc,
        )
    except Exception as e_v:
        logger.warning(f"[snap_supervision] ventas FUC overlay dist={dist_id}: {e_v}")

    # Agrupar filas de CC por vendedor
    vendedores_grouped = _agrupar_cc_rows(
        rows,
        fecha_uc_map=fecha_uc_map,
        erp_fuc_map=erp_fuc_map,
        erp_id_map=erp_id_map,
        id_cliente_map=id_cliente_map,
        erp_to_id_cliente=erp_to_id_cliente,
        id_cliente_fuc_map=id_cliente_fuc_map,
        comprobante_by_erp=comprobante_by_erp,
        norm_name_fn=_norm_name,
        parse_cc_fn=_parse_cc_cliente_label,
        norm_erp_fn=_norm_erp_cliente_id,
        resolve_fuc_fn=_resolve_cc_fecha_ultima_compra,
        today_ar_fn=_today_ar,
        dias_desde_fn=_dias_desde_fecha,
        antig_display_fn=_antiguedad_supervision_display,
        cc_incoherente_fn=_cc_padron_incoherente,
    )

    # Enriquecer con contacto (best-effort)
    try:
        _enrich_clientes_contact(dist_id, vendedores_grouped)
    except Exception as ce:
        logger.warning(f"[snap_supervision] contact enrich error dist={dist_id}: {ce}")

    all_clientes = [c for v in vendedores_grouped for c in v["clientes"]]
    total_deuda = sum(v["deuda_total"] for v in vendedores_grouped)
    total_cli = sum(v["cantidad_clientes"] for v in vendedores_grouped)
    avg_dias = (
        sum(c["antiguedad"] or 0 for c in all_clientes) / len(all_clientes)
        if all_clientes
        else 0
    )

    return {
        "meta": {
            "generated_at": generated_at,
            "fecha_snapshot_cc": fecha_snapshot,
        },
        "cuentas": {
            "fecha": fecha_snapshot,
            "metadatos": {
                "total_deuda": round(total_deuda, 2),
                "clientes_deudores": total_cli,
                "promedio_dias_retraso": round(avg_dias, 1),
            },
            "vendedores": vendedores_grouped,
        },
    }


def _agrupar_cc_rows(
    rows: list[dict],
    *,
    fecha_uc_map: dict,
    erp_fuc_map: dict,
    erp_id_map: dict,
    id_cliente_map: dict,
    erp_to_id_cliente: dict,
    id_cliente_fuc_map: dict,
    comprobante_by_erp: dict,
    norm_name_fn,
    parse_cc_fn,
    norm_erp_fn,
    resolve_fuc_fn,
    today_ar_fn,
    dias_desde_fn,
    antig_display_fn,
    cc_incoherente_fn,
) -> list[dict]:
    """
    Agrupa filas de cc_detalle por vendedor y construye la estructura de clientes.
    Replica la lógica de supervision_cuentas en routers/supervision.py líneas 2173-2259.
    """
    vendors: dict = {}
    hoy_ar = today_ar_fn()

    for item in rows:
        raw_v_name = (item.get("vendedor_nombre") or "Sin Vendedor").strip()
        v_key = str(item.get("id_vendedor") or raw_v_name.upper())

        if v_key not in vendors:
            vendors[v_key] = {
                "id_vendedor": item.get("id_vendedor"),
                "vendedor": raw_v_name,
                "sucursal": item.get("sucursal_nombre") or "",
                "deuda_total": 0.0,
                "cantidad_clientes": 0,
                "clientes": [],
            }

        vd = vendors[v_key]
        deuda = float(item.get("deuda_total") or 0)
        vd["deuda_total"] += deuda
        vd["cantidad_clientes"] += 1

        nombre_norm = norm_name_fn(item.get("cliente_nombre"))
        nombre_raw_upper = (item.get("cliente_nombre") or "").strip().upper()
        erp_label, name_label = parse_cc_fn(item.get("cliente_nombre"))
        erp_resolved = (
            item.get("id_cliente_erp")
            or (erp_label if erp_label else None)
            or erp_id_map.get(name_label or "")
            or erp_id_map.get(nombre_norm)
            or erp_id_map.get(nombre_raw_upper)
        )
        erp_norm_resolved = norm_erp_fn(erp_resolved)
        id_cliente_pk = item.get("id_cliente")
        if not id_cliente_pk:
            id_cliente_pk = (
                (erp_to_id_cliente.get(erp_label) if erp_label else None)
                or (id_cliente_map.get(name_label) if name_label else None)
                or id_cliente_map.get(nombre_norm)
                or id_cliente_map.get(nombre_raw_upper)
                or (erp_to_id_cliente.get(erp_norm_resolved) if erp_norm_resolved else None)
            )

        fuc = resolve_fuc_fn(
            item,
            id_cliente_pk=id_cliente_pk,
            erp_label=erp_label,
            erp_norm_resolved=erp_norm_resolved,
            name_label=name_label,
            nombre_norm=nombre_norm,
            nombre_raw_upper=nombre_raw_upper,
            id_cliente_fuc_map=id_cliente_fuc_map,
            erp_fuc_map=erp_fuc_map,
            fecha_uc_map=fecha_uc_map,
        )
        dias_uc = dias_desde_fn(fuc, hoy_ar) if fuc else None
        antig_cc = int(item.get("antiguedad_dias") or 0)
        antig_show, rango_show, desde_padron = antig_display_fn(antig_cc, dias_uc, deuda)
        erp_cc = (
            norm_erp_fn(item.get("id_cliente_erp"))
            or erp_norm_resolved
            or (norm_erp_fn(erp_label) if erp_label else None)
        )
        incoherente = cc_incoherente_fn(deuda, antig_cc, dias_uc) and not erp_cc

        cli_out = {
            "cliente": item.get("cliente_nombre"),
            "id_cliente_erp": erp_resolved,
            "id_cliente": id_cliente_pk,
            "sucursal": item.get("sucursal_nombre"),
            "deuda_total": deuda,
            "deuda_7_dias": float(item.get("deuda_7_dias") or 0),
            "deuda_15_dias": float(item.get("deuda_15_dias") or 0),
            "deuda_30_dias": float(item.get("deuda_30_dias") or 0),
            "deuda_60_dias": float(item.get("deuda_60_dias") or 0),
            "deuda_mas_60_dias": float(item.get("deuda_mas_60_dias") or 0),
            "antiguedad": antig_show,
            "antiguedad_cc": antig_cc,
            "antiguedad_desde_padron": desde_padron,
            "rango_antiguedad": rango_show,
            "cantidad_comprobantes": item.get("cantidad_comprobantes"),
            "fecha_ultima_compra": fuc,
            "dias_desde_ultima_compra": dias_uc,
            "padron_cc_alerta": incoherente,
        }
        if erp_cc and erp_cc in comprobante_by_erp:
            cli_out["ultimo_comprobante"] = comprobante_by_erp[erp_cc]
        vd["clientes"].append(cli_out)

    for vd in vendors.values():
        vd["clientes"].sort(key=lambda x: x["antiguedad"] or 0, reverse=True)

    return sorted(vendors.values(), key=lambda x: x["deuda_total"], reverse=True)


# ── Snapshot read/write ───────────────────────────────────────────────────────

def _read_supervision_snapshot(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
) -> dict | None:
    try:
        suc_val = sucursal or ""
        vid_val = id_vendedor if id_vendedor is not None else -1
        q = (
            sb.table("portal_snapshot_supervision_cc")
            .select("payload, generated_at")
            .eq("id_distribuidor", dist_id)
        )
        if sucursal is None:
            q = q.is_("sucursal", "null")
        else:
            q = q.eq("sucursal", sucursal)
        if id_vendedor is None:
            q = q.is_("id_vendedor", "null")
        else:
            q = q.eq("id_vendedor", id_vendedor)
        res = q.limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"[snap_supervision] read dist={dist_id}: {e}")
        return None


def _upsert_supervision_snapshot(
    dist_id: int,
    sucursal: str | None,
    id_vendedor: int | None,
    payload: dict,
) -> None:
    """
    Delete-then-insert para evitar el problema de que PostgREST no puede usar
    índices únicos con expresiones (COALESCE) en ON CONFLICT.
    """
    try:
        fecha_snap_cc = None
        try:
            fecha_snap_cc = (
                payload.get("meta", {}).get("fecha_snapshot_cc")
                or payload.get("cuentas", {}).get("fecha")
            )
        except Exception:
            pass
        now_iso = datetime.now(timezone.utc).isoformat()
        # Borrar snapshot existente
        dq = (
            sb.table("portal_snapshot_supervision_cc")
            .delete()
            .eq("id_distribuidor", dist_id)
        )
        if sucursal is None:
            dq = dq.is_("sucursal", "null")
        else:
            dq = dq.eq("sucursal", sucursal)
        if id_vendedor is None:
            dq = dq.is_("id_vendedor", "null")
        else:
            dq = dq.eq("id_vendedor", id_vendedor)
        dq.execute()
        # Insertar nuevo
        sb.table("portal_snapshot_supervision_cc").insert(
            {
                "id_distribuidor": dist_id,
                "sucursal": sucursal,
                "id_vendedor": id_vendedor,
                "payload": payload,
                "fecha_snapshot_cc": fecha_snap_cc,
                "generated_at": now_iso,
            }
        ).execute()
    except Exception as e:
        logger.warning(f"[snap_supervision] upsert dist={dist_id}: {e}")


