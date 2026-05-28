#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Preflight antes de probar validación de cartera en Telegram.
No toca Railway/prod: solo verifica DB, env local y datos de prueba.

  cd CenterMind
  python scripts/preflight_validacion_cartera.py
  python scripts/preflight_validacion_cartera.py --dist-id 1 --chat-id -1001234567890
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _ok(msg: str) -> None:
    print(f"  ✅ {msg}")


def _fail(msg: str) -> None:
    print(f"  ❌ {msg}")


def _warn(msg: str) -> None:
    print(f"  ⚠️  {msg}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight validación cartera bot")
    parser.add_argument("--dist-id", type=int, default=1, help="Distribuidor de prueba (default: 1 Test)")
    parser.add_argument("--chat-id", type=int, help="telegram_chat_id del grupo de prueba (opcional)")
    args = parser.parse_args()
    dist_id = args.dist_id
    errors = 0

    print("\n=== Preflight validación cartera (solo local / QA) ===\n")

    # 1) Env
    print("1) Variables de entorno (local)")
    flag = os.getenv("BOT_VALIDACION_CARTERA", "0").strip()
    if flag in ("1", "true", "yes", "on"):
        _ok("BOT_VALIDACION_CARTERA=1")
    else:
        _fail("BOT_VALIDACION_CARTERA no está en 1 — agregá en CenterMind/.env y reiniciá uvicorn")
        errors += 1

    webhook = (os.getenv("WEBHOOK_URL") or "").strip()
    if webhook:
        if "localhost" in webhook or "127.0.0.1" in webhook:
            _ok(f"WEBHOOK_URL apunta a local: {webhook[:60]}...")
        elif "railway" in webhook.lower() or "vercel" in webhook.lower():
            _warn(
                f"WEBHOOK_URL parece PRODUCCIÓN ({webhook[:50]}...). "
                "Si levantás uvicorn local, puede robar el webhook del bot. "
                "Usá ngrok + WEBHOOK_URL local o probá sin reiniciar el server de prod."
            )
        else:
            _ok(f"WEBHOOK_URL={webhook[:60]}...")
    else:
        _warn("WEBHOOK_URL vacía — al arrancar api local los bots no reciben updates de Telegram")

    railway_flag = os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID")
    if railway_flag:
        _warn("Parece que corrés dentro de Railway — NO habilites el flag ahí hasta terminar QA")

    # 2) DB
    print("\n2) Supabase")
    try:
        from db import sb
    except Exception as e:
        _fail(f"No se pudo importar db: {e}")
        return 1

    try:
        sb.table("bot_pdv_pendiente_aviso").select("id").limit(1).execute()
        _ok("Tabla bot_pdv_pendiente_aviso existe")
    except Exception as e:
        _fail(f"Falta tabla bot_pdv_pendiente_aviso — ejecutá sql/2026-05-28_bot_pdv_pendiente_aviso.sql en Supabase")
        print(f"     ({str(e)[:120]})")
        errors += 1

    try:
        res = sb.rpc("fn_reconcile_exhibiciones", {"p_dist_id": dist_id}).execute()
        data = res.data
        if isinstance(data, dict) and "updated" in data:
            _ok(f"fn_reconcile_exhibiciones OK (updated={data.get('updated')})")
        elif isinstance(data, (int, float)):
            _ok(f"fn_reconcile_exhibiciones OK (updated={int(data)})")
        else:
            _warn(f"fn_reconcile_exhibiciones respondió formato raro: {data!r}")
    except Exception as e:
        _fail("fn_reconcile_exhibiciones falló — ejecutá sql/2026-05-28_fn_reconcile_exhibiciones_sombra.sql")
        print(f"     ({str(e)[:200]})")
        errors += 1

    # 3) Vendedor + NROs de ejemplo
    print(f"\n3) Datos de prueba (dist_id={dist_id})")
    try:
        from core.tenant_tables import tenant_table_name

        dist = (
            sb.table("distribuidores")
            .select("id_distribuidor, nombre_empresa")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        if dist.data:
            _ok(f"Distribuidor: {dist.data[0].get('nombre_empresa')}")
        else:
            _fail(f"dist_id={dist_id} no existe")
            errors += 1

        id_vendedor = None
        if args.chat_id:
            ig = (
                sb.table("integrantes_grupo")
                .select("id_vendedor_v2, nombre_integrante")
                .eq("id_distribuidor", dist_id)
                .eq("telegram_group_id", args.chat_id)
                .not_.is_("id_vendedor_v2", "null")
                .limit(1)
                .execute()
            )
            if ig.data:
                id_vendedor = ig.data[0]["id_vendedor_v2"]
                _ok(f"Grupo {args.chat_id} → vendedor_v2={id_vendedor} ({ig.data[0].get('nombre_integrante')})")
            else:
                _warn(f"Grupo {args.chat_id} sin id_vendedor_v2 — revisá Fuerza de Ventas")

        if id_vendedor:
            t_rutas = tenant_table_name("rutas_v2", dist_id)
            t_cli = tenant_table_name("clientes_pdv_v2", dist_id)
            rutas = (
                sb.table(t_rutas)
                .select("id_ruta")
                .eq("id_vendedor", id_vendedor)
                .limit(200)
                .execute()
            ).data or []
            ruta_ids = [r["id_ruta"] for r in rutas if r.get("id_ruta")]
            if ruta_ids:
                cli = (
                    sb.table(t_cli)
                    .select("id_cliente_erp, nombre_fantasia")
                    .eq("id_distribuidor", dist_id)
                    .in_("id_ruta", ruta_ids[:50])
                    .limit(5)
                    .execute()
                ).data or []
                if cli:
                    print("\n  NROs válidos para Escenario 1 (copiá uno):")
                    for c in cli:
                        print(f"    • {c.get('id_cliente_erp')} — {c.get('nombre_fantasia') or 'sin nombre'}")
                    print("  NRO inválido sugerido: 99999999")
                else:
                    _warn("Sin clientes en rutas del vendedor")
            else:
                _warn("Vendedor sin rutas")

        token_row = (
            sb.table("distribuidores")
            .select("token_bot")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        if token_row.data and token_row.data[0].get("token_bot"):
            _ok("token_bot del dist configurado")
        else:
            _warn("token_bot vacío — avisos post-padrón no se enviarán")

    except Exception as e:
        _fail(f"Error leyendo datos: {e}")
        errors += 1

    # 4) Unit tests
    print("\n4) Tests unitarios")
    import subprocess
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "test_bot_cliente_cartera.py", "-q"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
    )
    if r.returncode == 0:
        _ok("test_bot_cliente_cartera.py pasó")
    else:
        _fail("tests fallaron")
        print(r.stdout or r.stderr)
        errors += 1

    print("\n=== Resumen ===")
    if errors:
        print(f"Corregí {errors} ítem(s) antes de abrir Telegram.\n")
        return 1
    print("Listo para chat: levantá api LOCAL con BOT_VALIDACION_CARTERA=1 y seguí la sección CHAT del testing doc.\n")
    print("⚠️  NO subas BOT_VALIDACION_CARTERA=1 a Railway/Vercel hasta cerrar QA.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
