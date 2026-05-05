# -*- coding: utf-8 -*-
"""Benchmark Excel vs red (mismo tenant). Ejecutar desde ShelfMind-RPA:

  cd ShelfMind-RPA && python -m motores.chess_cuentas_v2.compare_bench --tenant tabaco
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

_RPA = Path(__file__).resolve().parents[2]
if str(_RPA) not in sys.path:
    sys.path.insert(0, str(_RPA))


def _norm_loose(s: str) -> str:
    import re
    import unicodedata

    t = "".join(
        c for c in unicodedata.normalize("NFKD", str(s or "")) if not unicodedata.combining(c)
    )
    t = t.lower().strip()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\b0+(\d+)\b", r"\1", t)
    return t


def _cliente_key(c: str) -> str:
    import re

    s = str(c or "").strip().lower()
    m = re.match(r"^(\d+)\s*-\s*(.+)$", s)
    if m:
        return f"{int(m.group(1))}|{_norm_loose(m.group(2))}"
    return _norm_loose(s)


def _vendor_key(v: str) -> str:
    s = _norm_loose(str(v or ""))
    if " - " in s:
        return s.split(" - ", 1)[-1].strip()
    return s


def _rows_keyset(datos: dict[str, Any], *, loose: bool) -> set[tuple[Any, ...]]:
    rows = datos.get("detalle_cuentas") or []
    out: set[tuple[Any, ...]] = set()
    for r in rows:
        cli = _cliente_key(str(r.get("cliente") or ""))
        ven = _vendor_key(str(r.get("vendedor") or ""))
        suc = str(r.get("sucursal") or "").strip()
        deu = round(float(r.get("deuda_total") or 0), 2)
        anti = int(r.get("antiguedad") or 0)
        cant = int(r.get("cantidad_comprobantes") or 0)
        if loose:
            out.add((cli, ven, suc, deu, anti, cant))
        else:
            cod = str(r.get("cod_cliente") or "").strip()
            cli_raw = str(r.get("cliente") or "").strip().lower()
            ven_raw = str(r.get("vendedor") or "").strip().lower()
            out.add((cli_raw, ven_raw, suc, cod, deu, anti, cant))
    return out


def _strip_internal(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if not k.startswith("__")}


async def _run_once(
    *,
    tenant_id: str,
    headless: bool,
    dry_run: bool,
    force_excel: bool,
    return_datos: bool,
    sucursal_filter: str | None,
    sniff_dump: bool,
) -> tuple[dict[str, Any], float]:
    from motores.chess_cuentas_v2.motor import run_tenant

    t0 = time.perf_counter()
    r = await run_tenant(
        tenant_id,
        headless=headless,
        dry_run=dry_run,
        force_excel=force_excel,
        return_datos=return_datos,
        sucursal_filter=sucursal_filter,
        sniff_dump=sniff_dump,
    )
    return r, time.perf_counter() - t0


async def main_async(args: argparse.Namespace) -> None:
    tenant = args.tenant
    suc = args.sucursal.strip() if args.sucursal else None
    headless = not args.headed

    print("=== A) Excel (forzar) — dry-run ===", flush=True)
    r_excel, t_excel = await _run_once(
        tenant_id=tenant,
        headless=headless,
        dry_run=True,
        force_excel=True,
        return_datos=True,
        sucursal_filter=suc,
        sniff_dump=False,
    )
    d_excel = r_excel.pop("__datos", None)
    print(json.dumps(_strip_internal(r_excel), indent=2, ensure_ascii=False), flush=True)
    print(f"⏱️  A: {t_excel:.1f}s\n", flush=True)

    print("=== B) Red — dry-run ===", flush=True)
    r_net, t_net = await _run_once(
        tenant_id=tenant,
        headless=headless,
        dry_run=True,
        force_excel=False,
        return_datos=True,
        sucursal_filter=suc,
        sniff_dump=False,
    )
    d_net = r_net.pop("__datos", None)
    print(json.dumps(_strip_internal(r_net), indent=2, ensure_ascii=False), flush=True)
    print(f"⏱️  B: {t_net:.1f}s\n", flush=True)

    print("=== Comparación ===", flush=True)
    if not d_excel or not d_net:
        print("Falta __datos.", flush=True)
        return

    fe = r_excel.get("fingerprint") or {}
    fn = r_net.get("fingerprint") or {}
    same_md5 = fe.get("md5_detalle") == fn.get("md5_detalle")
    print(f"Filas: {fe.get('n_filas')} vs {fn.get('n_filas')} | MD5 estricto igual: {same_md5}", flush=True)
    se_loose = _rows_keyset(d_excel, loose=True)
    sn_loose = _rows_keyset(d_net, loose=True)
    print(f"Firma relajada igual: {se_loose == sn_loose}", flush=True)
    print(f"Δ tiempo A−B: {t_excel - t_net:+.1f}s", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant", default="tabaco")
    ap.add_argument("--sucursal", default="")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
