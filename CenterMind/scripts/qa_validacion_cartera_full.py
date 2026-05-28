#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA integral — validación cartera bot + aviso post-padrón.
Ejecutar desde CenterMind/:

  python scripts/qa_validacion_cartera_full.py
  python scripts/qa_validacion_cartera_full.py --live-aviso   # envía aviso real al grupo Test
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DIST_ID = 1
VENDEDOR_ID = 196
CHAT_ID = -5125535838
ERP_OK = "11111"
ERP_BLOCK = "99999999"
ERP_AVISO_TEST = "88888888"  # solo QA; no debe existir en padrón salvo insert temporal


class QAResult:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.failed: list[str] = []
        self.warnings: list[str] = []

    def ok(self, msg: str) -> None:
        self.passed.append(msg)
        print(f"  ✅ {msg}")

    def fail(self, msg: str) -> None:
        self.failed.append(msg)
        print(f"  ❌ {msg}")

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)
        print(f"  ⚠️  {msg}")

    @property
    def ok_all(self) -> bool:
        return not self.failed


def run_pytest() -> bool:
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "test_bot_cliente_cartera.py", "-q"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
    )
    return r.returncode == 0


def test_cartera(qa: QAResult) -> None:
    from core.bot_cliente_cartera import cliente_en_cartera_vendedor, normalize_erp, get_pdv_display_row
    from db import sb

    if normalize_erp("00111") != "111":
        qa.fail("normalize_erp 00111 → 111")
    else:
        qa.ok("normalize_erp")

    if not cliente_en_cartera_vendedor(DIST_ID, VENDEDOR_ID, ERP_OK, sb):
        qa.fail(f"{ERP_OK} debería estar en cartera vendedor {VENDEDOR_ID}")
    else:
        qa.ok(f"cartera OK: {ERP_OK} → True")

    if cliente_en_cartera_vendedor(DIST_ID, VENDEDOR_ID, ERP_BLOCK, sb):
        qa.fail(f"{ERP_BLOCK} no debería estar en cartera")
    else:
        qa.ok(f"cartera bloqueo: {ERP_BLOCK} → False")

    row = get_pdv_display_row(DIST_ID, ERP_OK, sb)
    if not row.get("nombre_fantasia"):
        qa.fail(f"get_pdv_display_row sin datos para {ERP_OK}")
    else:
        qa.ok(f"get_pdv_display_row: {row.get('nombre_fantasia')}")


def test_build_aviso_message(qa: QAResult) -> None:
    from services.bot_pdv_aviso_service import build_aviso_message

    pdv = {
        "nombre_fantasia": "Kiosco Test",
        "nombre_razon_social": "Kiosco SA",
        "domicilio": "Av. Siempre Viva 742",
        "localidad": "Springfield",
        "fecha_alta": "2026-05-28",
        "dia_semana": "Lunes",
    }
    pend = {"id_cliente_erp": ERP_AVISO_TEST}
    msg = build_aviso_message(pdv, pend)
    for needle in ("ya está en el padrón", ERP_AVISO_TEST, "Kiosco Test", "742", "Lunes", "vinculada"):
        if needle not in msg:
            qa.fail(f"build_aviso_message falta: {needle!r}")
            return
    qa.ok("build_aviso_message HTML completo")


def test_procesar_pendientes_mock(qa: QAResult) -> None:
    """Sin Telegram: mock send_aviso, PDV ya en padrón (11111)."""
    from core.tenant_tables import tenant_table_name
    from db import sb
    from services.bot_pdv_aviso_service import procesar_pendientes

    t_ex = tenant_table_name("exhibiciones", DIST_ID)
    ex = (
        sb.table(t_ex)
        .select("id_exhibicion")
        .eq("id_distribuidor", DIST_ID)
        .order("id_exhibicion", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not ex:
        qa.warn("Sin exhibiciones dist 1 — omitiendo test mock aviso")
        return
    ex_id = ex[0]["id_exhibicion"]

    # Limpiar pendiente previo de QA para este exhib
    sb.table("bot_pdv_pendiente_aviso").delete().eq("id_exhibicion", ex_id).execute()

    ins = sb.table("bot_pdv_pendiente_aviso").insert({
        "id_distribuidor": DIST_ID,
        "id_exhibicion": ex_id,
        "id_cliente_erp": ERP_OK,
        "id_vendedor_v2": VENDEDOR_ID,
        "telegram_chat_id": CHAT_ID,
        "telegram_user_id": 2037005531,
    }).execute()
    pend_id = (ins.data or [{}])[0].get("id")
    if not pend_id:
        qa.fail("No se pudo insertar pendiente QA")
        return

    with patch("services.bot_pdv_aviso_service.send_aviso", return_value=True):
        stats = procesar_pendientes(DIST_ID)

    if stats.get("enviados", 0) < 1:
        qa.fail(f"procesar_pendientes mock enviados={stats.get('enviados')}")
    else:
        qa.ok("procesar_pendientes (mock Telegram) envió 1 aviso")

    row = (
        sb.table("bot_pdv_pendiente_aviso")
        .select("aviso_enviado_at")
        .eq("id", pend_id)
        .limit(1)
        .execute()
        .data
    )
    if not row or not row[0].get("aviso_enviado_at"):
        qa.fail("aviso_enviado_at no marcado tras mock")
    else:
        qa.ok("aviso_enviado_at marcado (idempotencia)")

    with patch("services.bot_pdv_aviso_service.send_aviso", return_value=True) as mock_send:
        stats2 = procesar_pendientes(DIST_ID)
    if stats2.get("enviados", 0) != 0:
        qa.fail(f"segunda corrida debería enviar 0, got {stats2}")
    elif mock_send.called:
        qa.fail("segunda corrida no debería llamar send_aviso")
    else:
        qa.ok("idempotencia: segunda corrida enviados=0")

    sb.table("bot_pdv_pendiente_aviso").delete().eq("id", pend_id).execute()


def test_procesar_pendientes_pdv_ausente(qa: QAResult) -> None:
    """ERP inexistente en padrón → no envía."""
    from core.tenant_tables import tenant_table_name
    from db import sb
    from services.bot_pdv_aviso_service import procesar_pendientes

    t_ex = tenant_table_name("exhibiciones", DIST_ID)
    ex = (
        sb.table(t_ex)
        .select("id_exhibicion")
        .eq("id_distribuidor", DIST_ID)
        .order("id_exhibicion", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not ex:
        qa.warn("Sin exhibiciones — omitiendo test PDV ausente")
        return
    ex_id = ex[0]["id_exhibicion"]
    sb.table("bot_pdv_pendiente_aviso").delete().eq("id_exhibicion", ex_id).execute()

    ins = sb.table("bot_pdv_pendiente_aviso").insert({
        "id_distribuidor": DIST_ID,
        "id_exhibicion": ex_id,
        "id_cliente_erp": ERP_BLOCK,
        "id_vendedor_v2": VENDEDOR_ID,
        "telegram_chat_id": CHAT_ID,
    }).execute()
    pend_id = (ins.data or [{}])[0].get("id")

    with patch("services.bot_pdv_aviso_service.send_aviso", return_value=True) as mock_send:
        stats = procesar_pendientes(DIST_ID)

    if stats.get("enviados", 0) != 0:
        qa.fail("PDV ausente no debería enviar aviso")
    elif mock_send.called:
        qa.fail("send_aviso llamado con PDV ausente")
    else:
        qa.ok("PDV ausente en padrón → sin aviso (correcto)")

    sb.table("bot_pdv_pendiente_aviso").delete().eq("id", pend_id).execute()


def test_live_aviso(qa: QAResult) -> None:
    """Envía aviso real al grupo Test (-5125535838)."""
    from core.tenant_tables import tenant_table_name
    from db import sb
    from services.bot_pdv_aviso_service import procesar_pendientes

    t_ex = tenant_table_name("exhibiciones", DIST_ID)
    ex = (
        sb.table(t_ex)
        .select("id_exhibicion")
        .eq("id_distribuidor", DIST_ID)
        .order("id_exhibicion", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not ex:
        qa.fail("Sin exhibiciones para live aviso")
        return
    ex_id = ex[0]["id_exhibicion"]
    sb.table("bot_pdv_pendiente_aviso").delete().eq("id_exhibicion", ex_id).execute()

    ins = sb.table("bot_pdv_pendiente_aviso").insert({
        "id_distribuidor": DIST_ID,
        "id_exhibicion": ex_id,
        "id_cliente_erp": ERP_OK,
        "id_vendedor_v2": VENDEDOR_ID,
        "telegram_chat_id": CHAT_ID,
        "telegram_user_id": 2037005531,
    }).execute()
    pend_id = (ins.data or [{}])[0].get("id")

    stats = procesar_pendientes(DIST_ID)
    if stats.get("enviados", 0) < 1:
        qa.fail(f"live aviso enviados={stats.get('enviados')} errores={stats.get('errores')}")
    else:
        qa.ok(f"live aviso Telegram enviado al grupo {CHAT_ID}")

    sb.table("bot_pdv_pendiente_aviso").delete().eq("id", pend_id).execute()


def test_bot_worker_imports(qa: QAResult) -> None:
    try:
        import bot_worker  # noqa: F401
        from bot_worker import _reply_to_photo, _send_summary_reply_photo, _NO_LINK_PREVIEW
        rp = _reply_to_photo(CHAT_ID, 12345)
        if rp.message_id != 12345:
            qa.fail("_reply_to_photo message_id")
        else:
            qa.ok("bot_worker imports + helpers OK")
    except Exception as e:
        qa.fail(f"bot_worker import: {e}")


def test_supabase(qa: QAResult) -> None:
    from db import sb
    try:
        sb.table("bot_pdv_pendiente_aviso").select("id").limit(1).execute()
        qa.ok("tabla bot_pdv_pendiente_aviso")
    except Exception as e:
        qa.fail(f"tabla bot_pdv_pendiente_aviso: {e}")
        return
    try:
        res = sb.rpc("fn_reconcile_exhibiciones", {"p_dist_id": DIST_ID}).execute()
        qa.ok(f"fn_reconcile_exhibiciones ({res.data})")
    except Exception as e:
        qa.fail(f"fn_reconcile_exhibiciones: {e}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live-aviso", action="store_true", help="Envía 1 aviso real al grupo Test")
    args = parser.parse_args()

    qa = QAResult()
    print("\n=== QA Validación Cartera Bot ===\n")
    print(f"Fecha: {datetime.now(timezone.utc).isoformat()}")
    print(f"Dist: {DIST_ID} | Vendedor: {VENDEDOR_ID} | Chat: {CHAT_ID}\n")

    print("1) Unit tests")
    if run_pytest():
        qa.ok("pytest test_bot_cliente_cartera.py (10 tests)")
    else:
        qa.fail("pytest test_bot_cliente_cartera.py")

    print("\n2) Supabase")
    test_supabase(qa)

    print("\n3) Cartera")
    test_cartera(qa)

    print("\n4) Aviso post-padrón (unit)")
    test_build_aviso_message(qa)

    print("\n5) Aviso post-padrón (integración mock)")
    test_procesar_pendientes_mock(qa)
    test_procesar_pendientes_pdv_ausente(qa)

    print("\n6) bot_worker")
    test_bot_worker_imports(qa)

    if args.live_aviso:
        print("\n7) Aviso live Telegram (grupo Test)")
        test_live_aviso(qa)

    print("\n=== RESUMEN ===")
    print(f"  Pasaron: {len(qa.passed)}")
    print(f"  Fallaron: {len(qa.failed)}")
    print(f"  Warnings: {len(qa.warnings)}")
    if qa.failed:
        for f in qa.failed:
            print(f"    • {f}")
    print()
    if qa.ok_all:
        print("✅ QA COMPLETO — listo para merge/deploy")
        print("\nPost-merge en Railway:")
        print("  1. Deploy código (BOT_VALIDACION_CARTERA=0 primero)")
        print("  2. Confirmar SQL ya aplicado en Supabase prod")
        print("  3. BOT_VALIDACION_CARTERA=1 en workers bot")
        print("  4. Apagar polling local dist 1")
        return 0
    print("❌ QA FALLÓ — no mergear hasta corregir")
    return 1


if __name__ == "__main__":
    sys.exit(main())
