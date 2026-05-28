#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/test_bot_cartera_validacion.py
=======================================
CLI de diagnóstico para validación de cartera del bot (sin Telegram).

Uso:
  python scripts/test_bot_cartera_validacion.py --dist-id 3 --erp 12345 --vendedor-id 42 --check-cartera
  python scripts/test_bot_cartera_validacion.py --dist-id 3 --run-avisos
  python scripts/test_bot_cartera_validacion.py --dist-id 3 --erp 12345 --pdv-info
"""
import sys
import os
import argparse
import json

# Agregar carpeta padre al path para importar módulos de CenterMind
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def cmd_check_cartera(dist_id: int, erp: str, vendedor_id: int) -> None:
    from core.bot_cliente_cartera import normalize_erp, cliente_en_cartera_vendedor
    from core.tenant_tables import tenant_table_name
    from db import sb

    erp_norm = normalize_erp(erp)
    print(f"\n[cartera] dist={dist_id}  vendedor_v2={vendedor_id}  erp='{erp}'  normalizado='{erp_norm}'")

    # Mostrar rutas del vendedor
    t_rutas = tenant_table_name("rutas_v2", dist_id)
    rutas_res = (
        sb.table(t_rutas)
        .select("id_ruta, dia_semana")
        .eq("id_vendedor", vendedor_id)
        .execute()
    )
    rutas = rutas_res.data or []
    print(f"[cartera] rutas del vendedor: {len(rutas)} → {[r['id_ruta'] for r in rutas]}")

    # Verificar si el cliente está en alguna de esas rutas
    if rutas:
        t_clientes = tenant_table_name("clientes_pdv_v2", dist_id)
        ruta_ids = [r["id_ruta"] for r in rutas]
        cli_res = (
            sb.table(t_clientes)
            .select("id_cliente, nombre_fantasia, id_ruta")
            .eq("id_distribuidor", dist_id)
            .eq("id_cliente_erp", erp_norm)
            .in_("id_ruta", ruta_ids)
            .limit(1)
            .execute()
        )
        if cli_res.data:
            print(f"[cartera] cliente encontrado en ruta: {cli_res.data[0]}")
        else:
            print(f"[cartera] cliente NO encontrado en las rutas del vendedor")

    # Llamada final a la función
    result = cliente_en_cartera_vendedor(dist_id, vendedor_id, erp, sb)
    print(f"\n[resultado] cliente_en_cartera_vendedor → {result}")


def cmd_pdv_info(dist_id: int, erp: str) -> None:
    from core.bot_cliente_cartera import get_pdv_display_row
    from db import sb

    row = get_pdv_display_row(dist_id, erp, sb)
    if row:
        print(f"\n[pdv_info] PDV encontrado:")
        print(json.dumps(row, indent=2, default=str))
    else:
        print(f"\n[pdv_info] PDV '{erp}' NO encontrado en dist={dist_id}")


def cmd_run_avisos(dist_id: int) -> None:
    from services.bot_pdv_aviso_service import procesar_pendientes

    print(f"\n[avisos] Procesando pendientes para dist={dist_id}...")
    stats = procesar_pendientes(dist_id)
    print(f"[avisos] Resultado: {json.dumps(stats, indent=2, default=str)}")


def cmd_list_pendientes(dist_id: int) -> None:
    from db import sb

    res = (
        sb.table("bot_pdv_pendiente_aviso")
        .select("*")
        .eq("id_distribuidor", dist_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    rows = res.data or []
    if not rows:
        print(f"\n[pendientes] Sin pendientes para dist={dist_id}")
        return
    print(f"\n[pendientes] {len(rows)} registros más recientes (dist={dist_id}):")
    for r in rows:
        estado = "✅ enviado" if r.get("aviso_enviado_at") else ("❌ error" if r.get("aviso_error") else "⏳ pendiente")
        print(f"  id={r['id']} erp={r['id_cliente_erp']} exhib={r['id_exhibicion']} {estado}")


def main():
    parser = argparse.ArgumentParser(description="Diagnóstico de validación de cartera bot Shelfy")
    parser.add_argument("--dist-id", type=int, required=True, help="ID del distribuidor")
    parser.add_argument("--erp", type=str, help="NRO de cliente ERP a verificar")
    parser.add_argument("--vendedor-id", type=int, help="id_vendedor_v2 para check-cartera")
    parser.add_argument("--check-cartera", action="store_true", help="Verifica si el ERP está en la cartera del vendedor")
    parser.add_argument("--pdv-info", action="store_true", help="Muestra datos del PDV en el padrón")
    parser.add_argument("--run-avisos", action="store_true", help="Procesa y envía avisos pendientes")
    parser.add_argument("--list-pendientes", action="store_true", help="Lista pendientes de aviso")

    args = parser.parse_args()

    if args.check_cartera:
        if not args.erp or not args.vendedor_id:
            parser.error("--check-cartera requiere --erp y --vendedor-id")
        cmd_check_cartera(args.dist_id, args.erp, args.vendedor_id)

    elif args.pdv_info:
        if not args.erp:
            parser.error("--pdv-info requiere --erp")
        cmd_pdv_info(args.dist_id, args.erp)

    elif args.run_avisos:
        cmd_run_avisos(args.dist_id)

    elif args.list_pendientes:
        cmd_list_pendientes(args.dist_id)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
