# -*- coding: utf-8 -*-
"""
Bundle de evolución Q1 → Q2 → C para todos los vendedores activos del mes.

Patrón alineado a snapshot_estadisticas: single-flight + cache en memoria 15 min.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from services.snapshot_common import apply_meta_flags, run_single_flight
from services.recap_service import build_recap_evolucion_mes

logger = logging.getLogger("snapshot_recap_evolucion")

EVOLUCION_BUNDLE_TTL_SEC = 900
_BUNDLE_CACHE: dict[str, tuple[float, dict]] = {}


def _bundle_cache_key(dist_id: int, mes: str, sucursal: str | None) -> str:
    return f"{dist_id}|{mes}|{(sucursal or '').lower()}"


def _compute_recap_evolucion_bundle(
    dist_id: int,
    mes: str,
    sucursal: str | None,
) -> dict:
    from services.estadisticas_service import build_carta_resumen

    mes = (mes or "").strip()
    cartas = build_carta_resumen(dist_id, [mes], sucursal)
    vendor_ids = [str(c.get("id_vendedor") or "").strip() for c in cartas]
    vendor_ids = [v for v in vendor_ids if v]

    items: list[dict] = []
    if vendor_ids:
        max_workers = min(8, len(vendor_ids))
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(build_recap_evolucion_mes, dist_id, vid, mes): vid
                for vid in vendor_ids
            }
            for fut in as_completed(futures):
                try:
                    items.append(fut.result())
                except Exception as e:
                    vid = futures[fut]
                    logger.warning(
                        "[recap_evolucion_bundle] vendedor=%s dist=%s mes=%s: %s",
                        vid,
                        dist_id,
                        mes,
                        e,
                    )

    items.sort(key=lambda x: str(x.get("nombre") or ""))

    generated_at = datetime.now(timezone.utc).isoformat()
    meta = apply_meta_flags(
        {"mes": mes, "dist_id": dist_id, "sucursal": sucursal, "total": len(items)},
        cache_hit=False,
        stale=False,
        revalidating=False,
        generated_at=generated_at,
    )
    return {"meta": meta, "items": items}


def get_or_refresh_recap_evolucion_bundle(
    dist_id: int,
    mes: str,
    sucursal: str | None = None,
) -> dict:
    mes = (mes or "").strip()
    key = _bundle_cache_key(dist_id, mes, sucursal)
    now = time.time()
    hit = _BUNDLE_CACHE.get(key)
    if hit and now - hit[0] < EVOLUCION_BUNDLE_TTL_SEC:
        out = dict(hit[1])
        meta = dict(out.get("meta") or {})
        meta = apply_meta_flags(
            meta,
            cache_hit=True,
            stale=False,
            revalidating=False,
            generated_at=meta.get("generated_at"),
        )
        out["meta"] = meta
        return out

    def _run() -> dict:
        payload = _compute_recap_evolucion_bundle(dist_id, mes, sucursal)
        _BUNDLE_CACHE[key] = (time.time(), payload)
        return payload

    flight_key = f"recap_evolucion_bundle:{key}"
    return run_single_flight(flight_key, _run)
