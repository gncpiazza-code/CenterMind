# -*- coding: utf-8 -*-
"""
Snapshot service for dashboard bundle.

Clave de optimización: KPIs + ranking comparten UN SOLO fetch de exhibiciones
en lugar de dos como hace el router legacy.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from db import sb
from services.snapshot_common import (
    apply_meta_flags,
    is_fresh,
    is_invalidated,
    is_serveable_stale,
    trigger_background_refresh,
)

logger = logging.getLogger("snapshot_dashboard_service")

DASHBOARD_MAX_STALE_SECONDS = 300  # 5 min fresh TTL
DASHBOARD_SERVE_STALE_SECONDS = 86400  # 24 h — SWR serve window

# Períodos cortos: computo síncrono en cache miss (el partial dejaba 0 + sin imágenes).
_SYNC_COMPUTE_PERIODOS = frozenset({"hoy", "semana"})


# ── Public API ────────────────────────────────────────────────────────────────

def _refresh_dashboard_background(
    dist_id: int,
    periodo: str,
    sucursal_id: str | None,
    hide_qa: bool,
) -> None:
    payload = _compute_dashboard(dist_id, periodo, sucursal_id, hide_qa)
    apply_meta_flags(
        payload.setdefault("meta", {}),
        cache_hit=False,
        stale=False,
        revalidating=False,
    )
    if payload.get("meta", {}).get("compute_error"):
        logger.warning(
            "[snap_dashboard] skip persist dist=%s periodo=%s (compute_error)",
            dist_id,
            periodo,
        )
        return
    _upsert_dashboard_snapshot(dist_id, periodo, sucursal_id, payload)


def get_or_refresh_dashboard(
    dist_id: int,
    periodo: str,
    sucursal_id: str | None,
    hide_qa: bool = False,
) -> dict:
    snap = _read_dashboard_snapshot(dist_id, periodo, sucursal_id)
    if snap is not None:
        gen = snap["generated_at"]
        if is_invalidated(gen):
            payload = _normalize_dashboard_payload(snap["payload"], dist_id)
            apply_meta_flags(
                payload.setdefault("meta", {}),
                cache_hit=False,
                stale=True,
                revalidating=True,
                generated_at=gen,
            )
            key = f"dashboard:{dist_id}:{periodo}:{sucursal_id}:{hide_qa}"
            trigger_background_refresh(
                key,
                lambda: _refresh_dashboard_background(dist_id, periodo, sucursal_id, hide_qa),
            )
            return payload
        if is_fresh(gen, DASHBOARD_MAX_STALE_SECONDS):
            payload = _normalize_dashboard_payload(snap["payload"], dist_id)
            apply_meta_flags(
                payload.setdefault("meta", {}),
                cache_hit=True,
                stale=False,
                revalidating=False,
                generated_at=gen,
            )
            return payload
        if is_serveable_stale(gen, DASHBOARD_SERVE_STALE_SECONDS):
            payload = _normalize_dashboard_payload(snap["payload"], dist_id)
            apply_meta_flags(
                payload.setdefault("meta", {}),
                cache_hit=False,
                stale=True,
                revalidating=True,
                generated_at=gen,
            )
            key = f"dashboard:{dist_id}:{periodo}:{sucursal_id}:{hide_qa}"
            trigger_background_refresh(
                key,
                lambda: _refresh_dashboard_background(dist_id, periodo, sucursal_id, hide_qa),
            )
            return payload

    p = (periodo or "mes").strip()

    # Hoy / semana: ventana chica → computo síncrono (evita KPIs en 0 y hero sin fotos).
    if p in _SYNC_COMPUTE_PERIODOS:
        return _cold_compute_dashboard(dist_id, p, sucursal_id, hide_qa)

    # Mes / mes histórico: SWR con últimas evaluadas mientras recomputa en background.
    key = f"dashboard:{dist_id}:{p}:{sucursal_id}:{hide_qa}"
    trigger_background_refresh(
        key,
        lambda: _refresh_dashboard_background(dist_id, p, sucursal_id, hide_qa),
    )
    partial = _partial_dashboard_payload(
        dist_id, p, sucursal_id, hide_qa, fast_rpcs=False
    )
    apply_meta_flags(
        partial.setdefault("meta", {}),
        cache_hit=False,
        stale=False,
        revalidating=True,
    )
    return partial


def force_persist_dashboard(
    dist_id: int,
    periodo: str = "mes",
    sucursal_id: str | None = None,
    hide_qa: bool = False,
) -> None:
    """Recompute + upsert directo (warm/cron), sin path SWR."""
    _refresh_dashboard_background(dist_id, periodo, sucursal_id, hide_qa)


def _cold_compute_dashboard(
    dist_id: int,
    periodo: str,
    sucursal_id: str | None,
    hide_qa: bool,
) -> dict:
    payload = _compute_dashboard(dist_id, periodo, sucursal_id, hide_qa)
    apply_meta_flags(
        payload.setdefault("meta", {}),
        cache_hit=False,
        stale=False,
        revalidating=False,
    )
    if not payload.get("meta", {}).get("compute_error"):
        _upsert_dashboard_snapshot(dist_id, periodo, sucursal_id, payload)
    return payload


def _normalize_dashboard_payload(payload: dict, dist_id: int) -> dict:
    """Snapshots viejos guardaban ranking como dict crudo de aggregate_ranking_by_vendor."""
    out = dict(payload)
    out["ranking"] = _normalize_ranking_field(out.get("ranking"), dist_id)
    if not isinstance(out.get("ultimas"), list):
        out["ultimas"] = []
    if not isinstance(out.get("sucursales"), list):
        out["sucursales"] = []
    if not isinstance(out.get("evolucion"), list):
        out["evolucion"] = []
    return out


def _normalize_ranking_field(ranking: Any, dist_id: int) -> list[dict]:
    if ranking is None:
        return []
    if isinstance(ranking, list):
        return ranking
    if isinstance(ranking, dict) and ranking:
        sample = next(iter(ranking.values()))
        if isinstance(sample, dict) and "puntos" in sample and "vendedor" not in sample:
            from routers.reportes import _dashboard_ranking_rows
            return _dashboard_ranking_rows(dist_id, ranking)
        if isinstance(sample, dict) and "vendedor" in sample:
            return sorted(
                ranking.values(),
                key=lambda x: (x or {}).get("puntos") or 0,
                reverse=True,
            )
    logger.warning("[snap_dashboard] ranking shape desconocido dist=%s", dist_id)
    return []


def mark_dashboard_stale(dist_id: int, periodo: str | None = None) -> None:
    """Invalida snapshots del distribuidor (o todos los períodos si periodo es None)."""
    try:
        epoch = "1970-01-01T00:00:00+00:00"
        q = (
            sb.table("portal_snapshot_dashboard")
            .update({"generated_at": epoch})
            .eq("id_distribuidor", dist_id)
        )
        if periodo:
            q = q.eq("periodo", periodo)
        q.execute()
    except Exception as e:
        logger.warning(f"[snap_dashboard] mark_stale dist={dist_id}: {e}")


# ── Compute ───────────────────────────────────────────────────────────────────

def _compute_dashboard(
    dist_id: int,
    periodo: str,
    sucursal_id: str | None,
    hide_qa: bool,
) -> dict:
    from routers.reportes import (
        _resolve_period_bounds,
        _fetch_exhibiciones_periodo,
        _allowed_integrantes_for_sucursal,
        _resolve_sucursal_pk,
        _enrich_por_sucursal_rows,
    )
    from core.exhibicion_aggregate import (
        aggregate_kpi_totals,
        aggregate_ranking_by_vendor,
        count_active_vendors,
    )
    from core.helpers import build_integrante_to_erp_name, is_exhibicion_qa_display_for_dist

    start_iso, end_iso = _resolve_period_bounds(periodo)
    suc_pk = _resolve_sucursal_pk(dist_id, sucursal_id)
    allowed_integrantes = _allowed_integrantes_for_sucursal(dist_id, suc_pk)

    # SINGLE fetch — clave del bundle: kpis y ranking usan los mismos datos
    compute_error: str | None = None
    try:
        ex_rows = _fetch_exhibiciones_periodo(dist_id, start_iso, end_iso)
    except Exception as e:
        logger.warning(
            "[snap_dashboard] exhibiciones fetch failed dist=%s periodo=%s: %s",
            dist_id,
            periodo,
            e,
        )
        ex_rows = []
        compute_error = str(e)[:240]

    iid_to_erp = build_integrante_to_erp_name(dist_id)

    filtered: list[dict] = []
    for ex in ex_rows:
        iid_raw = ex.get("id_integrante")
        if iid_raw is None:
            continue
        try:
            iid_i = int(iid_raw)
        except (TypeError, ValueError):
            continue
        if allowed_integrantes is not None and iid_i not in allowed_integrantes:
            continue
        if hide_qa:
            vendedor = iid_to_erp.get(iid_i, "")
            if is_exhibicion_qa_display_for_dist(dist_id, vendedor):
                continue
        filtered.append(ex)

    # KPIs + ranking desde el mismo conjunto filtrado
    kpi_totals = aggregate_kpi_totals(filtered)
    vendedores_activos = count_active_vendors(filtered, iid_to_erp)
    total_logicas = kpi_totals.get("total", 0)
    exhibiciones_por_vendedor = (
        round(total_logicas / vendedores_activos, 1) if vendedores_activos > 0 else 0.0
    )
    kpis = {
        **kpi_totals,
        "vendedores_activos": vendedores_activos,
        "exhibiciones_por_vendedor": exhibiciones_por_vendedor,
    }

    stats = aggregate_ranking_by_vendor(filtered, iid_to_erp)
    from routers.reportes import _dashboard_ranking_rows
    ranking = _dashboard_ranking_rows(dist_id, stats)

    # Ultimas: query simple (top 8 más recientes no rechazadas)
    ultimas = _fetch_ultimas_simple(dist_id, suc_pk)

    # Sucursales + evolución via RPC
    sucursales = _fetch_sucursales(dist_id, periodo, _enrich_por_sucursal_rows)
    evolucion = _fetch_evolucion(dist_id, periodo, suc_pk)

    meta: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "periodo": periodo,
        "sucursal_id": sucursal_id,
        "dist_id": dist_id,
    }
    if compute_error:
        meta["compute_error"] = compute_error

    return {
        "meta": meta,
        "kpis": kpis,
        "ranking": ranking,
        "ultimas": ultimas,
        "sucursales": sucursales,
        "evolucion": evolucion,
    }


def _partial_dashboard_payload(
    dist_id: int,
    periodo: str,
    sucursal_id: str | None,
    _hide_qa: bool,
    *,
    error: str | None = None,
    instant: bool = True,
    fast_rpcs: bool = False,
) -> dict:
    """Respuesta degradada. `fast_rpcs`: solo evolución/sucursales (RPC, <1s)."""
    kpis = {
        "total": 0,
        "pendientes": 0,
        "aprobadas": 0,
        "rechazadas": 0,
        "destacadas": 0,
        "vendedores_activos": 0,
        "exhibiciones_por_vendedor": 0.0,
    }
    meta: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "periodo": periodo,
        "sucursal_id": sucursal_id,
        "dist_id": dist_id,
        "cache_hit": False,
        "stale": False,
        "revalidating": False,
    }
    if error:
        meta["compute_error"] = error

    if instant and not fast_rpcs:
        return {
            "meta": meta,
            "kpis": kpis,
            "ranking": [],
            "ultimas": [],
            "sucursales": [],
            "evolucion": [],
        }

    from routers.reportes import _resolve_sucursal_pk, _enrich_por_sucursal_rows

    suc_pk = _resolve_sucursal_pk(dist_id, sucursal_id)
    ultimas: list[dict] = []
    if not fast_rpcs:
        ultimas = _fetch_ultimas_simple(dist_id, suc_pk)
    return {
        "meta": meta,
        "kpis": kpis,
        "ranking": [],
        "ultimas": ultimas,
        "sucursales": _fetch_sucursales(dist_id, periodo, _enrich_por_sucursal_rows),
        "evolucion": _fetch_evolucion(dist_id, periodo, suc_pk),
    }


def _fetch_ultimas_simple(dist_id: int, suc_pk: int | None, n: int = 8) -> list[dict]:
    """Obtiene las últimas evaluadas con enrich legacy (paridad con dashboard_ultimas endpoint)."""
    try:
        from routers.reportes import (
            _fetch_ultimas_evaluadas_rows,
            _enrich_ultimas_dashboard_rows,
            _filter_ultimas_by_sucursal,
        )
        allowed_integrantes: set[int] | None = None
        if suc_pk is not None:
            from routers.reportes import _allowed_integrantes_for_sucursal
            allowed_integrantes = _allowed_integrantes_for_sucursal(dist_id, suc_pk)

        rows = _fetch_ultimas_evaluadas_rows(dist_id, n)
        rows = _filter_ultimas_by_sucursal(rows, allowed_integrantes)
        if n > 0:
            rows = rows[:n]
        if rows:
            return _enrich_ultimas_dashboard_rows(rows, dist_id)
        return []
    except Exception as e:
        logger.warning(f"[snap_dashboard] ultimas enrich dist={dist_id}: {e}")
        # Fallback simple si el enrich falla
        try:
            q = (
                sb.table("exhibiciones")
                .select(
                    "id_exhibicion,id_integrante,estado,url_foto_drive,timestamp_subida,"
                    "id_cliente_pdv,id_cliente,cliente_sombra_codigo,telegram_chat_id"
                )
                .eq("id_distribuidor", dist_id)
                .neq("estado", "Rechazado")
                .order("timestamp_subida", desc=True)
                .limit(n if n > 0 else 8)
            )
            return q.execute().data or []
        except Exception:
            return []


def _fetch_sucursales(dist_id: int, periodo: str, enrich_fn) -> list[dict]:
    try:
        res = sb.rpc(
            "fn_dashboard_por_sucursal",
            {"p_dist_id": dist_id, "p_periodo": periodo},
        ).execute()
        rows = res.data or []
        return enrich_fn(rows, dist_id)
    except Exception as e:
        logger.warning(f"[snap_dashboard] sucursales dist={dist_id}: {e}")
        return []


def _fetch_evolucion(dist_id: int, periodo: str, suc_pk: int | None) -> list[dict]:
    try:
        res = sb.rpc(
            "fn_dashboard_evolucion_tiempo",
            {"p_dist_id": dist_id, "p_periodo": periodo, "p_sucursal_id": suc_pk},
        ).execute()
        return res.data or []
    except Exception as e:
        logger.warning(f"[snap_dashboard] evolucion dist={dist_id}: {e}")
        return []


# ── Snapshot read/write ───────────────────────────────────────────────────────

def _read_dashboard_snapshot(
    dist_id: int, periodo: str, sucursal_id: str | None
) -> dict | None:
    try:
        q = (
            sb.table("portal_snapshot_dashboard")
            .select("payload, generated_at")
            .eq("id_distribuidor", dist_id)
            .eq("periodo", periodo)
        )
        if sucursal_id is None:
            q = q.is_("sucursal_id", "null")
        else:
            try:
                q = q.eq("sucursal_id", int(sucursal_id))
            except (TypeError, ValueError):
                q = q.is_("sucursal_id", "null")
        res = q.limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"[snap_dashboard] read dist={dist_id}: {e}")
        return None


def _upsert_dashboard_snapshot(
    dist_id: int, periodo: str, sucursal_id: str | None, payload: dict
) -> None:
    """
    Delete-then-insert para evitar el problema de que PostgREST no puede usar
    índices únicos con expresiones (COALESCE) en ON CONFLICT.
    """
    try:
        suc_id_int: int | None = None
        if sucursal_id is not None:
            try:
                suc_id_int = int(sucursal_id)
            except (TypeError, ValueError):
                pass
        now_iso = datetime.now(timezone.utc).isoformat()
        # Borrar snapshot existente con los mismos parámetros
        dq = (
            sb.table("portal_snapshot_dashboard")
            .delete()
            .eq("id_distribuidor", dist_id)
            .eq("periodo", periodo)
        )
        if suc_id_int is None:
            dq = dq.is_("sucursal_id", "null")
        else:
            dq = dq.eq("sucursal_id", suc_id_int)
        dq.execute()
        # Insertar nuevo
        sb.table("portal_snapshot_dashboard").insert(
            {
                "id_distribuidor": dist_id,
                "periodo": periodo,
                "sucursal_id": suc_id_int,
                "payload": payload,
                "generated_at": now_iso,
            }
        ).execute()
    except Exception as e:
        logger.warning(f"[snap_dashboard] upsert dist={dist_id}: {e}")


