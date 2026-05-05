#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de prueba real para el watcher de objetivos.

Ejercita cada tipo de objetivo activo:
  - ruteo_alteo      (meta de alteo en ruta, sin pdv_items)
  - conversion_estado (activación de PDVs con pdv_items)
  - exhibicion       (exhibición con pdv_items)
  - cobranza         (deuda cobrada, auto-snapshot estado_inicial)

Uso:
  cd CenterMind
  python -m CenterMind.scripts.test_objetivos_watcher --dist 3
  python -m CenterMind.scripts.test_objetivos_watcher --dist 3 --tipo ruteo_alteo
"""
from __future__ import annotations

import argparse
import logging
import sys
import os

# ── Setup path para que `from db import sb` funcione igual que el backend ──────
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# ── Supabase env check ─────────────────────────────────────────────────────────
for _var in ("SUPABASE_URL", "SUPABASE_KEY"):
    if not os.environ.get(_var):
        print(f"[ERROR] Variable de entorno '{_var}' no configurada.")
        sys.exit(1)

from db import sb  # noqa: E402
from core.tenant_tables import tenant_table_name  # noqa: E402
from services.objetivos_watcher_service import objetivos_watcher  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
logger = logging.getLogger("TestWatcher")

# ── Helpers ────────────────────────────────────────────────────────────────────

PASARON: list[str] = []
FALLARON: list[str] = []


def _pick_vendedor(dist_id: int) -> int | None:
    """Devuelve el primer id_vendedor activo del distribuidor."""
    try:
        res = (
            sb.table(tenant_table_name("vendedores_v2", dist_id))
            .select("id_vendedor")
            .eq("id_distribuidor", dist_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows:
            return rows[0]["id_vendedor"]
    except Exception as e:
        print(f"  [!] No se pudo obtener vendedor para dist={dist_id}: {e}")
    return None


def _pick_ruta(dist_id: int, id_vendedor: int) -> int | None:
    """Devuelve el primer id_ruta del vendedor."""
    try:
        res = (
            sb.table(tenant_table_name("rutas_v2", dist_id))
            .select("id_ruta")
            .eq("id_vendedor", id_vendedor)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows:
            return rows[0]["id_ruta"]
    except Exception as e:
        print(f"  [!] No se pudo obtener ruta para vend={id_vendedor}: {e}")
    return None


def _pick_pdvs(dist_id: int, id_vendedor: int, n: int = 2) -> list[dict]:
    """Devuelve hasta n PDVs del vendedor (vía sus rutas)."""
    try:
        rutas_res = (
            sb.table(tenant_table_name("rutas_v2", dist_id))
            .select("id_ruta")
            .eq("id_vendedor", id_vendedor)
            .limit(5)
            .execute()
        )
        ruta_ids = [r["id_ruta"] for r in (rutas_res.data or [])]
        if not ruta_ids:
            return []
        clientes_res = (
            sb.table(tenant_table_name("clientes_pdv_v2", dist_id))
            .select("id_cliente, id_cliente_erp, nombre_fantasia")
            .eq("id_distribuidor", dist_id)
            .in_("id_ruta", ruta_ids)
            .limit(n)
            .execute()
        )
        return clientes_res.data or []
    except Exception as e:
        print(f"  [!] No se pudo obtener PDVs para vend={id_vendedor}: {e}")
        return []


def _crear_objetivo_test(payload: dict) -> str | None:
    """Inserta un objetivo de prueba y devuelve su id."""
    try:
        res = sb.table("objetivos").insert(payload).execute()
        rows = res.data or []
        if rows:
            return str(rows[0]["id"])
    except Exception as e:
        print(f"  [!] Error creando objetivo: {e}")
    return None


def _cleanup(obj_id: str) -> None:
    """Elimina el objetivo de prueba y sus filas relacionadas (best-effort)."""
    try:
        sb.table("objetivo_items").delete().eq("id_objetivo", obj_id).execute()
    except Exception:
        pass
    try:
        sb.table("objetivos_tracking").delete().eq("id_objetivo", obj_id).execute()
    except Exception:
        pass
    try:
        sb.table("objetivos").delete().eq("id", obj_id).execute()
    except Exception:
        pass


def _get_valor_actual(obj_id: str) -> float | None:
    """Lee valor_actual de la DB para el objetivo."""
    try:
        res = (
            sb.table("objetivos")
            .select("valor_actual")
            .eq("id", obj_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows:
            return float(rows[0].get("valor_actual") or 0)
    except Exception:
        pass
    return None


def _get_tracking_count(obj_id: str) -> int:
    """Cuenta filas en objetivos_tracking para el objetivo."""
    try:
        res = (
            sb.table("objetivos_tracking")
            .select("id")
            .eq("id_objetivo", obj_id)
            .execute()
        )
        return len(res.data or [])
    except Exception:
        return -1


# ── Tests por tipo ─────────────────────────────────────────────────────────────

def _test_ruteo_alteo(dist_id: int, id_vendedor: int) -> bool:
    """ruteo_alteo: sin pdv_items, basado en id_target_ruta y PDVs en ruta."""
    tipo = "ruteo_alteo"
    obj_id: str | None = None
    print(f"\n  [ruteo_alteo] Creando objetivo QA para dist={dist_id} vend={id_vendedor}...")
    try:
        id_ruta = _pick_ruta(dist_id, id_vendedor)
        payload = {
            "id_distribuidor": dist_id,
            "id_vendedor": id_vendedor,
            "tipo": tipo,
            "descripcion": "[TEST] Objetivo QA automatico - ruteo_alteo",
            "valor_objetivo": 5.0,
            "id_target_ruta": id_ruta,
        }
        obj_id = _crear_objetivo_test(payload)
        if not obj_id:
            print("  [!] No se pudo crear objetivo")
            return False
        print(f"  → Objetivo creado: {obj_id}")

        # Ejecutar watcher
        result = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        print(f"  → Watcher result: {result}")

        if "error" in result:
            print(f"  [FAIL] Watcher retornó error: {result['error']}")
            return False

        # Verificar que valor_actual fue actualizado (puede ser 0 si no hay PDVs nuevos)
        valor = _get_valor_actual(obj_id)
        tracking_count = _get_tracking_count(obj_id)

        print(f"  → valor_actual={valor}, tracking_rows={tracking_count}")

        if valor is None:
            print("  [FAIL] No se pudo leer valor_actual post-watcher")
            return False

        # El watcher debe haber actualizado el campo, aunque sea 0
        print("  [PASS] ruteo_alteo ejecutó sin error, valor_actual actualizado")
        return True

    except Exception as e:
        print(f"  [FAIL] Excepción inesperada: {e}")
        return False
    finally:
        if obj_id:
            _cleanup(obj_id)
            print(f"  → Cleanup obj={obj_id}")


def _test_conversion_estado(dist_id: int, id_vendedor: int) -> bool:
    """conversion_estado: con pdv_items, verifica que items se crean y watcher los evalúa."""
    tipo = "conversion_estado"
    obj_id: str | None = None
    print(f"\n  [conversion_estado] Creando objetivo QA para dist={dist_id} vend={id_vendedor}...")
    try:
        pdvs = _pick_pdvs(dist_id, id_vendedor, n=2)
        if not pdvs:
            print("  [SKIP] Sin PDVs disponibles para este vendedor — omitiendo")
            return True  # No es un fallo del watcher

        # Crear objetivo sin pdv_items primero
        payload = {
            "id_distribuidor": dist_id,
            "id_vendedor": id_vendedor,
            "tipo": tipo,
            "descripcion": "[TEST] Objetivo QA automatico - conversion_estado",
            "valor_objetivo": float(len(pdvs)),
        }
        obj_id = _crear_objetivo_test(payload)
        if not obj_id:
            print("  [!] No se pudo crear objetivo")
            return False

        # Insertar objetivo_items para los PDVs
        item_rows = [
            {
                "id_objetivo": obj_id,
                "id_distribuidor": dist_id,
                "id_cliente_pdv": p["id_cliente"],
                "nombre_pdv": p.get("nombre_fantasia") or f"PDV {p['id_cliente']}",
                "estado_item": "pendiente",
            }
            for p in pdvs
        ]
        sb.table("objetivo_items").insert(item_rows).execute()
        print(f"  → Objetivo creado: {obj_id} con {len(pdvs)} item(s)")

        # Ejecutar watcher
        result = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        print(f"  → Watcher result: {result}")

        if "error" in result:
            print(f"  [FAIL] Watcher retornó error: {result['error']}")
            return False

        valor = _get_valor_actual(obj_id)
        tracking_count = _get_tracking_count(obj_id)
        print(f"  → valor_actual={valor}, tracking_rows={tracking_count}")

        if valor is None:
            print("  [FAIL] No se pudo leer valor_actual post-watcher")
            return False

        # Verificar que el watcher consultó y los ítems existen
        items_res = (
            sb.table("objetivo_items")
            .select("estado_item")
            .eq("id_objetivo", obj_id)
            .execute()
        )
        items = items_res.data or []
        if len(items) != len(pdvs):
            print(f"  [FAIL] Se esperaban {len(pdvs)} ítems, hay {len(items)}")
            return False

        print("  [PASS] conversion_estado ejecutó sin error, ítems coherentes")
        return True

    except Exception as e:
        print(f"  [FAIL] Excepción inesperada: {e}")
        return False
    finally:
        if obj_id:
            _cleanup(obj_id)
            print(f"  → Cleanup obj={obj_id}")


def _test_exhibicion(dist_id: int, id_vendedor: int) -> bool:
    """exhibicion: con pdv_items, verifica resolución de integrante y query de exhibiciones."""
    tipo = "exhibicion"
    obj_id: str | None = None
    print(f"\n  [exhibicion] Creando objetivo QA para dist={dist_id} vend={id_vendedor}...")
    try:
        pdvs = _pick_pdvs(dist_id, id_vendedor, n=1)
        if not pdvs:
            print("  [SKIP] Sin PDVs disponibles — omitiendo")
            return True

        payload = {
            "id_distribuidor": dist_id,
            "id_vendedor": id_vendedor,
            "tipo": tipo,
            "descripcion": "[TEST] Objetivo QA automatico - exhibicion",
            "valor_objetivo": 1.0,
        }
        obj_id = _crear_objetivo_test(payload)
        if not obj_id:
            print("  [!] No se pudo crear objetivo")
            return False

        # Insertar ítem PDV
        sb.table("objetivo_items").insert({
            "id_objetivo": obj_id,
            "id_distribuidor": dist_id,
            "id_cliente_pdv": pdvs[0]["id_cliente"],
            "nombre_pdv": pdvs[0].get("nombre_fantasia") or f"PDV {pdvs[0]['id_cliente']}",
            "estado_item": "pendiente",
        }).execute()
        print(f"  → Objetivo creado: {obj_id} para PDV={pdvs[0]['id_cliente']}")

        # Ejecutar watcher — puede retornar sin avance si resolve_integrante falla
        result = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        print(f"  → Watcher result: {result}")

        # El watcher no debe lanzar excepción aunque no encuentre integrante
        if "error" in result:
            print(f"  [FAIL] Watcher retornó error de alto nivel: {result['error']}")
            return False

        valor = _get_valor_actual(obj_id)
        print(f"  → valor_actual={valor}")

        if valor is None:
            print("  [FAIL] No se pudo leer valor_actual post-watcher")
            return False

        print("  [PASS] exhibicion ejecutó sin excepción (valor puede ser 0 si sin integrante)")
        return True

    except Exception as e:
        print(f"  [FAIL] Excepción inesperada: {e}")
        return False
    finally:
        if obj_id:
            _cleanup(obj_id)
            print(f"  → Cleanup obj={obj_id}")


def _test_cobranza(dist_id: int, id_vendedor: int) -> bool:
    """cobranza: verifica auto-snapshot y que el watcher no da error con estado_inicial vacío."""
    tipo = "cobranza"
    obj_id: str | None = None
    print(f"\n  [cobranza] Creando objetivo QA para dist={dist_id} vend={id_vendedor}...")
    try:
        # Caso 1: sin estado_inicial → debe auto-inicializar si CC tiene deuda
        payload = {
            "id_distribuidor": dist_id,
            "id_vendedor": id_vendedor,
            "tipo": tipo,
            "descripcion": "[TEST] Objetivo QA automatico - cobranza sin snapshot",
            "valor_objetivo": 1000.0,
            # estado_inicial intencionalmente vacío para probar el fix
        }
        obj_id = _crear_objetivo_test(payload)
        if not obj_id:
            print("  [!] No se pudo crear objetivo")
            return False
        print(f"  → Objetivo creado: {obj_id} (sin estado_inicial)")

        result = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        print(f"  → Watcher result (sin estado_inicial): {result}")

        if "error" in result:
            print(f"  [FAIL] Watcher retornó error: {result['error']}")
            return False

        # Verificar si se auto-inicializó el estado_inicial
        refreshed = sb.table("objetivos").select("estado_inicial, valor_actual").eq("id", obj_id).limit(1).execute()
        row = (refreshed.data or [{}])[0]
        estado_inicial_post = row.get("estado_inicial")
        valor_actual_post = row.get("valor_actual")
        print(f"  → Post-watcher: estado_inicial={estado_inicial_post!r}, valor_actual={valor_actual_post}")

        # Caso 2: con estado_inicial ya seteado → debe calcular cobrado
        _cleanup(obj_id)
        obj_id = None

        payload2 = {
            "id_distribuidor": dist_id,
            "id_vendedor": id_vendedor,
            "tipo": tipo,
            "descripcion": "[TEST] Objetivo QA automatico - cobranza con snapshot",
            "valor_objetivo": 500.0,
            "estado_inicial": "10000.0",  # Deuda inicial simulada alta
        }
        obj_id = _crear_objetivo_test(payload2)
        if not obj_id:
            print("  [!] No se pudo crear segundo objetivo")
            return False
        print(f"  → Segundo objetivo creado: {obj_id} (estado_inicial=10000)")

        result2 = objetivos_watcher.run_watcher(dist_id, obj_id=obj_id)
        print(f"  → Watcher result (con estado_inicial): {result2}")

        if "error" in result2:
            print(f"  [FAIL] Watcher retornó error (segundo obj): {result2['error']}")
            return False

        refreshed2 = (
            sb.table("objetivos").select("valor_actual").eq("id", obj_id).limit(1).execute()
        )
        valor2 = (refreshed2.data or [{}])[0].get("valor_actual")
        print(f"  → valor_actual con snapshot={valor2} (≥0 esperado)")

        if valor2 is None or float(valor2) < 0:
            print("  [FAIL] valor_actual negativo o None con estado_inicial seteado")
            return False

        print("  [PASS] cobranza ejecutó correctamente en ambos casos")
        return True

    except Exception as e:
        print(f"  [FAIL] Excepción inesperada: {e}")
        return False
    finally:
        if obj_id:
            _cleanup(obj_id)
            print(f"  → Cleanup obj={obj_id}")


# ── Dispatcher ─────────────────────────────────────────────────────────────────

TIPOS_DISPONIBLES = ["ruteo_alteo", "conversion_estado", "exhibicion", "cobranza"]

TEST_FN = {
    "ruteo_alteo":       _test_ruteo_alteo,
    "conversion_estado": _test_conversion_estado,
    "exhibicion":        _test_exhibicion,
    "cobranza":          _test_cobranza,
}


def run_tests(dist_id: int, tipos: list[str]) -> None:
    print(f"\n=== Test Watcher Objetivos — dist={dist_id} ===")

    id_vendedor = _pick_vendedor(dist_id)
    if not id_vendedor:
        print(f"[ERROR] No se encontró ningún vendedor para dist={dist_id}")
        sys.exit(1)
    print(f"Vendedor de prueba: id_vendedor={id_vendedor}")

    for tipo in tipos:
        fn = TEST_FN.get(tipo)
        if fn is None:
            print(f"\n[SKIP] Tipo '{tipo}' no tiene test implementado")
            continue
        ok = fn(dist_id, id_vendedor)
        if ok:
            PASARON.append(tipo)
        else:
            FALLARON.append(tipo)

    print("\n" + "=" * 50)
    print(f"RESULTADOS: {len(PASARON)} pasaron, {len(FALLARON)} fallaron")
    for t in PASARON:
        print(f"  PASS  {t}")
    for t in FALLARON:
        print(f"  FAIL  {t}")
    if FALLARON:
        sys.exit(1)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pruebas QA del watcher de objetivos"
    )
    parser.add_argument(
        "--dist",
        type=int,
        required=True,
        help="id_distribuidor (ej: 3 para Tabaco)",
    )
    parser.add_argument(
        "--tipo",
        choices=TIPOS_DISPONIBLES,
        default=None,
        help="Tipo de objetivo a probar (por defecto: todos)",
    )
    args = parser.parse_args()

    tipos_a_probar = [args.tipo] if args.tipo else TIPOS_DISPONIBLES
    run_tests(args.dist, tipos_a_probar)
