#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/recalcular_objetivos_activos.py
========================================
Batch post-deploy: recalcula valor_actual + desglose_cache para objetivos
activos de compañía con reglas nuevas (importe > 0, FUC gated).

RUNBOOK:
    # 1. Dry-run (listar IDs afectados)
    python CenterMind/scripts/recalcular_objetivos_activos.py \
        --dist-id <id> --mes 2026-06 --dry-run

    # 2. Ejecución real (un tenant)
    python CenterMind/scripts/recalcular_objetivos_activos.py \
        --dist-id <id> --mes 2026-06

    # 3. Todos los tenants (cuidado con rate limits)
    python CenterMind/scripts/recalcular_objetivos_activos.py --mes 2026-06 --all-dists

Criterio de selección:
    - lanzado_at IS NOT NULL
    - fecha_objetivo >= hoy (activos)
    - origen = 'compania'
    - mes_referencia LIKE '2026-06%' (o argumento --mes)
    - tipo IN (compradores, exhibicion, ruteo_alteo) — los que tienen prorrateo

IMPORTANTE: No recalcula objetivos cerrados históricos.
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from db import sb
from core.tenant_tables import load_dist_ids

PAGE = 1000
TIPOS_RECALCULAR = {"compradores", "exhibicion", "ruteo_alteo", "alteo", "activacion"}


def _find_objetivos_activos(dist_id: int, mes: str) -> list[dict]:
    """Objetivos compañía activos del mes dado."""
    hoy = date.today().isoformat()
    mes_prefix = mes[:7]  # YYYY-MM
    res = (
        sb.table("objetivos")
        .select("id,tipo,origen,nombre_vendedor,mes_referencia,fecha_objetivo,valor_actual,id_distribuidor")
        .eq("id_distribuidor", dist_id)
        .eq("origen", "compania")
        .not_.is_("lanzado_at", "null")
        .gte("fecha_objetivo", hoy)
        .like("mes_referencia", f"{mes_prefix}%")
        .execute()
    )
    rows = res.data or []
    return [r for r in rows if (r.get("tipo") or "").lower() in TIPOS_RECALCULAR]


def _recalcular_objetivo(dist_id: int, obj_id: str, dry_run: bool) -> str:
    """
    Recalcula un objetivo via watcher retro.
    Retorna mensaje de resultado.
    """
    if dry_run:
        return "DRY-RUN (no ejecutado)"

    try:
        from services.objetivos_watcher_service import ObjetivosWatcherService
        watcher = ObjetivosWatcherService()
        result = watcher.run_watcher(dist_id, obj_id=obj_id)
        return f"OK actualizados={result.get('actualizados', 0)}"
    except Exception as e:
        return f"ERROR: {e}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch recalcular objetivos activos post-deploy"
    )
    parser.add_argument("--dist-id", type=int, help="id_distribuidor específico")
    parser.add_argument("--mes", type=str, required=True, help="Mes YYYY-MM (ej. 2026-06)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo listar objetivos afectados sin ejecutar watcher",
    )
    parser.add_argument(
        "--all-dists",
        action="store_true",
        help="Procesar todos los tenants (requiere credenciales Supabase globales)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Segundos entre objetivos para evitar rate limits (default 0.5)",
    )
    args = parser.parse_args()

    mes = args.mes.strip()
    if len(mes) < 7 or mes[4] != "-":
        print(f"Formato de mes inválido: {mes!r}. Usar YYYY-MM", file=sys.stderr)
        sys.exit(1)

    dist_ids: list[int] = []
    if args.all_dists:
        dist_ids = load_dist_ids()
        print(f"Procesando {len(dist_ids)} distribuidoras...")
    elif args.dist_id:
        dist_ids = [args.dist_id]
    else:
        print("Debe especificar --dist-id o --all-dists", file=sys.stderr)
        sys.exit(1)

    mode = "DRY-RUN" if args.dry_run else "EJECUCION"
    print(f"\n{'='*60}")
    print(f"RECALCULAR OBJETIVOS ACTIVOS — {mode}")
    print(f"Mes: {mes}  |  Tipos: {sorted(TIPOS_RECALCULAR)}")
    print(f"{'='*60}")

    total_procesados = 0
    total_ok = 0
    total_errors = 0

    for dist_id in dist_ids:
        objetivos = _find_objetivos_activos(dist_id, mes)
        if not objetivos:
            print(f"\nDist {dist_id}: sin objetivos activos compañía en {mes}")
            continue

        print(f"\nDist {dist_id}: {len(objetivos)} objetivo(s) a recalcular")
        for obj in objetivos:
            obj_id = obj["id"]
            tipo = obj.get("tipo", "?")
            nombre = obj.get("nombre_vendedor", "?")
            valor_pre = obj.get("valor_actual", "?")
            print(f"  [{tipo}] {nombre} — id={obj_id} valor_actual_pre={valor_pre}")

            result = _recalcular_objetivo(dist_id, obj_id, args.dry_run)
            print(f"    → {result}")

            if "ERROR" in result:
                total_errors += 1
            else:
                total_ok += 1
            total_procesados += 1

            if not args.dry_run and args.delay > 0:
                time.sleep(args.delay)

    print(f"\n{'='*60}")
    print(f"Total procesados: {total_procesados}  OK: {total_ok}  Errors: {total_errors}")
    if args.dry_run:
        print("(Dry-run: ningún objetivo fue modificado)")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
