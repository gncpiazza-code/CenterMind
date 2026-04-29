#!/usr/bin/env python3
"""
Wizard de saneamiento Telegram -> Vendedor ERP.

Criterio de auto-match estricto:
  - mismo id_distribuidor
  - nombre+apellido (>=2 tokens) normalizado
  - misma sucursal (deducida por id_vendedor_v2 actual, binding actual o location_id de exhibiciones)
  - candidato único

No modifica cuentas test definidas en TEST_TELEGRAM_USER_IDS.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from core.tenant_tables import load_dist_ids, tenant_table_name
from db import sb

TEST_TELEGRAM_USER_IDS = {2037005531}


def _norm_text(value: str | None) -> str:
    if not value:
        return ""
    t = str(value).strip().lower()
    t = "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    )
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _is_full_name(value: str | None) -> bool:
    t = _norm_text(value)
    return len([p for p in t.split(" ") if p]) >= 2


def _first_name_last_name(value: str | None) -> tuple[str, str] | None:
    t = _norm_text(value)
    parts = [p for p in t.split(" ") if p]
    if len(parts) < 2:
        return None
    return parts[0], parts[-1]


@dataclass
class VendorRef:
    id_vendedor: int
    nombre_erp: str
    id_sucursal: int | None
    sucursal_nombre: str
    norm_full: str
    first_last: tuple[str, str] | None


def _get_location_hint(dist_id: int, telegram_user_id: int, days: int = 120) -> int | None:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    try:
        rows = (
            sb.table("exhibiciones")
            .select("location_id")
            .eq("id_distribuidor", dist_id)
            .eq("telegram_user_id", telegram_user_id)
            .gte("timestamp_subida", since)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    locs = [int(r["location_id"]) for r in rows if r.get("location_id") is not None]
    if not locs:
        return None
    return Counter(locs).most_common(1)[0][0]


def _load_dist_name(dist_id: int) -> str:
    for id_col in ("id_distribuidor", "id"):
        for name_col in ("nombre_empresa", "nombre", "razon_social"):
            try:
                row = (
                    sb.table("distribuidores")
                    .select(f"{id_col},{name_col}")
                    .eq(id_col, dist_id)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if row:
                    return row[0].get(name_col) or f"Dist {dist_id}"
            except Exception:
                continue
    return f"Dist {dist_id}"


def _vendor_text(v: VendorRef) -> str:
    return (
        f"v2={v.id_vendedor} | ERP='{v.nombre_erp}' | "
        f"Sucursal='{v.sucursal_nombre}' ({v.id_sucursal})"
    )


def _resolve_for_integrante(
    dist_id: int,
    ig_row: dict[str, Any],
    bind_by_tg: dict[int, int],
    vend_by_id: dict[int, VendorRef],
    vend_by_first_last_and_suc: dict[tuple[str, str, int], list[VendorRef]],
) -> tuple[str, VendorRef | None, dict[str, Any]]:
    tg = ig_row.get("telegram_user_id")
    if tg is None:
        return "skip_no_telegram", None, {}
    tg = int(tg)
    if tg in TEST_TELEGRAM_USER_IDS:
        return "skip_test_user", None, {}

    if tg in bind_by_tg:
        v = vend_by_id.get(bind_by_tg[tg])
        if v:
            return "keep_binding", v, {}

    name = ig_row.get("nombre_integrante") or ""
    if not _is_full_name(name):
        return "needs_review_short_name", None, {"nombre_integrante": name}
    fl = _first_name_last_name(name)
    if not fl:
        return "needs_review_no_full_name", None, {"nombre_integrante": name}

    suc_hint = None
    cur_v2 = ig_row.get("id_vendedor_v2")
    if cur_v2 is not None:
        vcur = vend_by_id.get(int(cur_v2))
        if vcur and vcur.id_sucursal is not None:
            suc_hint = vcur.id_sucursal

    if suc_hint is None and tg in bind_by_tg:
        vb = vend_by_id.get(bind_by_tg[tg])
        if vb and vb.id_sucursal is not None:
            suc_hint = vb.id_sucursal

    if suc_hint is None:
        suc_hint = _get_location_hint(dist_id, tg)

    if suc_hint is None:
        return "needs_review_no_sucursal_hint", None, {"nombre_integrante": name}

    candidates = vend_by_first_last_and_suc.get((fl[0], fl[1], int(suc_hint)), [])
    if len(candidates) == 1:
        return (
            "auto_exact_name_sucursal",
            candidates[0],
            {"nombre_integrante": name, "sucursal_hint": suc_hint},
        )
    if len(candidates) == 0:
        return (
            "needs_review_no_exact_candidate",
            None,
            {"nombre_integrante": name, "sucursal_hint": suc_hint},
        )
    return (
        "needs_review_multiple_candidates",
        None,
        {
            "nombre_integrante": name,
            "sucursal_hint": suc_hint,
            "candidatos": [_vendor_text(v) for v in candidates],
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Wizard de matching Telegram->Vendedor")
    parser.add_argument("--dist", type=int, default=None, help="ID distribuidor (opcional)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica cambios en integrantes_grupo.id_vendedor_v2",
    )
    args = parser.parse_args()

    dist_ids = [args.dist] if args.dist else load_dist_ids(sb)
    summary: list[dict[str, Any]] = []

    for dist_id in dist_ids:
        if dist_id is None:
            continue
        dist_name = _load_dist_name(int(dist_id))
        t_vend = tenant_table_name("vendedores_v2", int(dist_id))
        t_suc = tenant_table_name("sucursales_v2", int(dist_id))
        try:
            vendedores = (
                sb.table(t_vend)
                .select("id_vendedor,nombre_erp,id_sucursal,id_distribuidor")
                .eq("id_distribuidor", int(dist_id))
                .execute()
                .data
                or []
            )
        except Exception:
            continue
        if not vendedores:
            continue

        sucursales = []
        try:
            sucursales = (
                sb.table(t_suc)
                .select("id_sucursal,nombre_erp,id_distribuidor")
                .eq("id_distribuidor", int(dist_id))
                .execute()
                .data
                or []
            )
        except Exception:
            pass
        suc_name_by_id = {
            int(s["id_sucursal"]): (s.get("nombre_erp") or "Sin sucursal")
            for s in sucursales
            if s.get("id_sucursal") is not None
        }

        vend_by_id: dict[int, VendorRef] = {}
        vend_by_first_last_and_suc: dict[tuple[str, str, int], list[VendorRef]] = defaultdict(list)
        for v in vendedores:
            if v.get("id_vendedor") is None:
                continue
            vid = int(v["id_vendedor"])
            n_erp = (v.get("nombre_erp") or "").strip()
            sid = int(v["id_sucursal"]) if v.get("id_sucursal") is not None else None
            sname = suc_name_by_id.get(sid, "Sin sucursal")
            ref = VendorRef(
                id_vendedor=vid,
                nombre_erp=n_erp,
                id_sucursal=sid,
                sucursal_nombre=sname,
                norm_full=_norm_text(n_erp),
                first_last=_first_name_last_name(n_erp),
            )
            vend_by_id[vid] = ref
            if ref.first_last and sid is not None:
                vend_by_first_last_and_suc[(ref.first_last[0], ref.first_last[1], sid)].append(ref)

        integrantes = (
            sb.table("integrantes_grupo")
            .select(
                "id_integrante,id_distribuidor,nombre_integrante,telegram_user_id,id_vendedor_v2,id_vendedor_erp"
            )
            .eq("id_distribuidor", int(dist_id))
            .execute()
            .data
            or []
        )
        bindings = (
            sb.table("vendedores_telegram_binding")
            .select("telegram_user_id,id_vendedor_v2,id_distribuidor")
            .eq("id_distribuidor", int(dist_id))
            .execute()
            .data
            or []
        )

        bind_by_tg: dict[int, int] = {}
        for b in bindings:
            if b.get("telegram_user_id") is None or b.get("id_vendedor_v2") is None:
                continue
            bind_by_tg[int(b["telegram_user_id"])] = int(b["id_vendedor_v2"])

        actions: list[dict[str, Any]] = []
        review: list[dict[str, Any]] = []
        kept_binding = 0
        skipped_test = 0
        for ig in integrantes:
            status, vendor, extra = _resolve_for_integrante(
                int(dist_id), ig, bind_by_tg, vend_by_id, vend_by_first_last_and_suc
            )
            if status == "skip_test_user":
                skipped_test += 1
                continue
            if status == "keep_binding" and vendor:
                kept_binding += 1
                current_v2 = ig.get("id_vendedor_v2")
                if current_v2 is None or int(current_v2) != vendor.id_vendedor:
                    actions.append(
                        {
                            "id_integrante": ig.get("id_integrante"),
                            "telegram_user_id": ig.get("telegram_user_id"),
                            "nombre_integrante": ig.get("nombre_integrante"),
                            "old_id_vendedor_v2": current_v2,
                            "new_id_vendedor_v2": vendor.id_vendedor,
                            "new_vendor_text": _vendor_text(vendor),
                            "reason": "align_with_binding",
                        }
                    )
                continue
            if status == "auto_exact_name_sucursal" and vendor:
                current_v2 = ig.get("id_vendedor_v2")
                if current_v2 is None or int(current_v2) != vendor.id_vendedor:
                    actions.append(
                        {
                            "id_integrante": ig.get("id_integrante"),
                            "telegram_user_id": ig.get("telegram_user_id"),
                            "nombre_integrante": ig.get("nombre_integrante"),
                            "old_id_vendedor_v2": current_v2,
                            "new_id_vendedor_v2": vendor.id_vendedor,
                            "new_vendor_text": _vendor_text(vendor),
                            "reason": status,
                            **extra,
                        }
                    )
                continue
            review.append(
                {
                    "id_integrante": ig.get("id_integrante"),
                    "telegram_user_id": ig.get("telegram_user_id"),
                    "nombre_integrante": ig.get("nombre_integrante"),
                    "id_vendedor_v2": ig.get("id_vendedor_v2"),
                    "id_vendedor_erp": ig.get("id_vendedor_erp"),
                    "reason": status,
                    **extra,
                }
            )

        applied = 0
        if args.apply and actions:
            for a in actions:
                try:
                    sb.table("integrantes_grupo").update(
                        {"id_vendedor_v2": int(a["new_id_vendedor_v2"])}
                    ).eq("id_integrante", int(a["id_integrante"])).eq(
                        "id_distribuidor", int(dist_id)
                    ).execute()
                    applied += 1
                except Exception as exc:
                    a["apply_error"] = str(exc)

        payload = {
            "dist_id": int(dist_id),
            "dist_name": dist_name,
            "kept_binding": kept_binding,
            "skipped_test_users": skipped_test,
            "auto_actions_count": len(actions),
            "applied_count": applied,
            "review_count": len(review),
            "auto_actions": actions,
            "review": review,
        }
        summary.append(payload)

        print(
            f"[dist={dist_id} {dist_name}] kept_binding={kept_binding} "
            f"skip_test={skipped_test} auto={len(actions)} applied={applied} review={len(review)}"
        )

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode_apply": bool(args.apply),
        "test_telegram_user_ids": sorted(list(TEST_TELEGRAM_USER_IDS)),
        "summary": summary,
    }
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = f"vendor_match_wizard_report_{ts}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"REPORT_FILE={out_path}")


if __name__ == "__main__":
    main()

