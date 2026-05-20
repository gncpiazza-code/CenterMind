#!/usr/bin/env python3
"""
Auditoría silenciosa: stats Telegram (RPC fn_bot_stats_vendedor) vs dedup lógico vs ranking.
Todas las distribuidoras activas. Solo stdout/archivo local; sin notificaciones externas.

  cd CenterMind && PYTHONPATH=. python scripts/audit_stats_ranking_all_dist_silent.py
  cd CenterMind && PYTHONPATH=. python scripts/audit_stats_ranking_all_dist_silent.py --json /tmp/audit_silent.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from core.exhibicion_aggregate import (
    aggregate_exhibicion_counts_vendor_scope,
    aggregate_ranking_by_vendor,
)
from core.helpers import build_integrante_to_erp_name, build_qa_exhibicion_integrante_ids, is_exhibicion_qa_display_for_dist
from db import sb

AR_TZ = timezone(timedelta(hours=-3))
PAGE = 1000
EXH_COLS = (
    "id_exhibicion,id_integrante,estado,timestamp_subida,"
    "id_cliente_pdv,id_cliente,cliente_sombra_codigo,"
    "url_foto_drive,telegram_msg_id,telegram_chat_id"
)


def _norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower().strip())


def _period_bounds() -> tuple[datetime, datetime, datetime]:
    now = datetime.now(AR_TZ)
    start_actual = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 1:
        prev_y, prev_m = now.year - 1, 12
    else:
        prev_y, prev_m = now.year, now.month - 1
    start_prev = now.replace(year=prev_y, month=prev_m, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now, start_actual, start_prev


def _fetch_dists() -> list[dict]:
    rows = (
        sb.table("distribuidores")
        .select("id_distribuidor,nombre_empresa,estado")
        .order("id_distribuidor")
        .execute()
        .data
        or []
    )
    return [r for r in rows if (r.get("estado") or "").lower() not in ("inactivo", "inactive", "baja")]


def _fetch_integrantes(dist_id: int) -> list[dict]:
    try:
        return (
            sb.table("integrantes_grupo")
            .select("id_integrante,telegram_user_id,nombre_integrante,id_vendedor_erp")
            .eq("id_distribuidor", dist_id)
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def _fetch_exhibiciones_mes(dist_id: int, since_iso: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("exhibiciones")
            .select(EXH_COLS)
            .eq("id_distribuidor", dist_id)
            .gte("timestamp_subida", since_iso)
            .order("timestamp_subida")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def _parse_ts(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts)
    except Exception:
        return datetime.min.replace(tzinfo=AR_TZ)


def _filter_exhibiciones_mes(
    ex_actual: list[dict],
    dist_id: int,
    iid_to_erp: dict[int, str],
    qa_ids: frozenset[int],
) -> list[dict]:
    filtered: list[dict] = []
    for e in ex_actual:
        iid_raw = e.get("id_integrante")
        if iid_raw is None:
            continue
        try:
            iid = int(iid_raw)
        except (TypeError, ValueError):
            continue
        if iid in qa_ids:
            continue
        vendedor = iid_to_erp.get(iid, "Desconocido")
        if is_exhibicion_qa_display_for_dist(dist_id, vendedor):
            continue
        filtered.append(e)
    return filtered


def _vendor_scope_logical(
    ex_actual: list[dict],
    iids: list[int],
) -> dict[str, int]:
    iid_set = set(iids)
    rows = [e for e in ex_actual if int(e.get("id_integrante") or 0) in iid_set]
    return aggregate_exhibicion_counts_vendor_scope(rows)


def _rpc_stats_mes_actual(dist_id: int, iid: int) -> dict | None:
    try:
        res = sb.rpc(
            "fn_bot_stats_vendedor",
            {"p_distribuidor_id": dist_id, "p_vendedor_id": iid},
        ).execute()
    except Exception:
        return None
    for row in res.data or []:
        if row.get("rango") == "mes_actual":
            return row
    return None


def audit_dist(dist_id: int, dist_name: str, start_prev: datetime, start_actual: datetime) -> dict:
    since_iso = start_prev.isoformat()
    all_ex = _fetch_exhibiciones_mes(dist_id, since_iso)
    ex_actual = [e for e in all_ex if _parse_ts(e.get("timestamp_subida", "")) >= start_actual]

    integrantes = _fetch_integrantes(dist_id)
    iid_to_erp = build_integrante_to_erp_name(dist_id)
    qa_ids = build_qa_exhibicion_integrante_ids(dist_id)
    filtered_ex = _filter_exhibiciones_mes(ex_actual, dist_id, iid_to_erp, qa_ids)
    ranking_by_erp = aggregate_ranking_by_vendor(filtered_ex, iid_to_erp)

    # Agrupar integrantes por ERP name (puede haber varios TUID → mismo vendedor ERP)
    erp_to_iids: dict[str, list[int]] = defaultdict(list)
    for ig in integrantes:
        iid = ig.get("id_integrante")
        if iid is None:
            continue
        iid = int(iid)
        erp = iid_to_erp.get(iid) or (ig.get("nombre_integrante") or f"iid_{iid}")
        erp_to_iids[erp].append(iid)

    # Multi-foto: filas extra por dist
    multi_keys = 0
    extra_photos = 0
    by_logic: dict[tuple, list] = defaultdict(list)
    for e in ex_actual:
        iid_raw = e.get("id_integrante")
        if iid_raw is None:
            continue
        iid = int(iid_raw)
        day = (_parse_ts(e.get("timestamp_subida", "")).date().isoformat())
        ck_raw = e.get("id_cliente_pdv") or e.get("id_cliente") or e.get("cliente_sombra_codigo")
        ck = str(ck_raw).strip() if ck_raw is not None else ""
        if ck and day:
            by_logic[(iid, ck, day)].append(e)
    for rows in by_logic.values():
        if len(rows) > 1:
            multi_keys += 1
            extra_photos += len(rows) - 1

    vendor_mismatches: list[dict] = []
    rpc_errors = 0
    for erp_name, iids in erp_to_iids.items():
        if is_exhibicion_qa_display_for_dist(dist_id, erp_name):
            continue
        logical_sum = _vendor_scope_logical(filtered_ex, iids)
        rpc_row = _rpc_stats_mes_actual(dist_id, iids[0])
        if rpc_row is None:
            rpc_errors += 1
            rpc_sum_aprob = 0
            rpc_sum_puntos = 0
            rpc_sum_total = 0
        else:
            rpc_sum_aprob = int(rpc_row.get("aprobadas") or 0)
            rpc_sum_puntos = int(rpc_row.get("puntos") or 0)
            rpc_sum_total = int(rpc_row.get("total") or 0)

        rank_entry = ranking_by_erp.get(erp_name, {})
        rank_pts = int(rank_entry.get("puntos") or 0)
        rank_aprob = int(rank_entry.get("aprobadas") or 0)

        delta_rpc_vs_logical = rpc_sum_puntos - logical_sum["puntos"]
        delta_rank_vs_logical = rank_pts - logical_sum["puntos"]

        if delta_rpc_vs_logical != 0 or delta_rank_vs_logical != 0:
            vendor_mismatches.append(
                {
                    "vendedor": erp_name,
                    "integrantes": iids,
                    "rpc_aprobadas": rpc_sum_aprob,
                    "rpc_puntos": rpc_sum_puntos,
                    "rpc_total": rpc_sum_total,
                    "logical_aprobadas": logical_sum["aprobadas"],
                    "logical_puntos": logical_sum["puntos"],
                    "logical_total": logical_sum["total_logicas"],
                    "ranking_aprobadas": rank_aprob,
                    "ranking_puntos": rank_pts,
                    "delta_rpc_minus_logical": delta_rpc_vs_logical,
                    "delta_ranking_minus_logical": delta_rank_vs_logical,
                }
            )

    return {
        "dist_id": dist_id,
        "dist_name": dist_name,
        "filas_mes_actual": len(ex_actual),
        "integrantes": len(integrantes),
        "claves_multi_foto": multi_keys,
        "fotos_extra": extra_photos,
        "vendedores_con_delta": len(vendor_mismatches),
        "rpc_call_errors": rpc_errors,
        "mismatches": vendor_mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=str, default="", help="Ruta JSON salida (opcional)")
    parser.add_argument("--only-deltas", action="store_true", help="Solo imprimir dists con diferencias")
    args = parser.parse_args()

    _, start_actual, start_prev = _period_bounds()
    dists = _fetch_dists()
    report = {
        "generated_at": datetime.now(AR_TZ).isoformat(),
        "periodo": "mes_actual",
        "desde": start_actual.isoformat(),
        "distribuidoras": len(dists),
        "results": [],
    }

    total_mismatch_vendors = 0
    for d in dists:
        dist_id = int(d["id_distribuidor"])
        name = d.get("nombre_empresa") or f"dist_{dist_id}"
        try:
            r = audit_dist(dist_id, name, start_prev, start_actual)
        except Exception as exc:
            r = {
                "dist_id": dist_id,
                "dist_name": name,
                "error": f"{type(exc).__name__}: {exc}",
            }
        report["results"].append(r)
        n = r.get("vendedores_con_delta", 0) if "error" not in r else -1
        if "error" not in r:
            total_mismatch_vendors += n

        if args.only_deltas and "error" not in r and n == 0:
            continue
        if "error" in r:
            print(f"[{dist_id}] {name} ERROR interno audit")
        else:
            print(
                f"[{dist_id}] {name}: filas={r['filas_mes_actual']} "
                f"multi_foto={r['claves_multi_foto']} extra_fotos={r['fotos_extra']} "
                f"vendedores_delta={r['vendedores_con_delta']}"
            )
            for m in r.get("mismatches", [])[:15]:
                print(
                    f"    {m['vendedor']}: RPC={m['rpc_aprobadas']} "
                    f"LOGICAL={m['logical_aprobadas']} RANK={m['ranking_puntos']} "
                    f"(Δrpc {m['delta_rpc_minus_logical']:+d})"
                )
            if len(r.get("mismatches", [])) > 15:
                print(f"    ... +{len(r['mismatches']) - 15} vendedores más")

    report["total_vendedores_con_delta"] = total_mismatch_vendors
    if args.json:
        Path(args.json).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n--- resumen: {len(dists)} dists, {total_mismatch_vendors} vendedores con Δ RPC≠lógico o ranking≠lógico")
    return 0


if __name__ == "__main__":
    sys.exit(main())
