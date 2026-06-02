#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auditoría CRR — Ivan Soto (Tabaco d3, vendedor 30)."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.crr_cartera import ref_cartera_viva  # noqa: E402
from services.estadisticas_service import build_detalle_vendedor  # noqa: E402

DIST_ID = 3
VENDEDOR_ID = "30"
MESES = ["2026-06"]


def main() -> None:
    today = date.today().isoformat()
    ref = ref_cartera_viva(f"{MESES[0]}-30")
    print(f"Hoy AR: {today}")
    print(f"ref_cartera_viva (junio): {ref}")
    print(f"Meses: {MESES}\n")

    det = build_detalle_vendedor(DIST_ID, VENDEDOR_ID, MESES)
    crr = det.get("cartera", {}).get("crr", {})
    proximos = crr.get("clientes", {}).get("proximos_caer", [])

    print("=== Resumen CRR Ivan Soto ===")
    for k in ("activos", "inactivos", "proximos_caer", "perdidos", "reactivados", "nuevos"):
        print(f"  {k}: {crr.get(k)}")

    print(f"\n=== Próximos a caer (muestra {min(15, len(proximos))} de {len(proximos)}) ===")
    for c in proximos[:15]:
        print(
            f"  {c.get('razon_social', '')[:40]:40} | "
            f"fuc={c.get('fecha_ultima_compra')} | "
            f"hace={c.get('dias_sin_compra')}d | "
            f"cae_en={c.get('dias_para_caer')}d | "
            f"compro_per={c.get('compro_en_periodo')}"
        )

    needles = ("GONZALITO", "MAIDANA", "JOSEFINA")
    print("\n=== Casos del screenshot ===")
    for c in proximos:
        name = (c.get("razon_social") or "").upper()
        if any(n in name for n in needles):
            print(json.dumps(c, ensure_ascii=False, indent=2))

    # Compras muy recientes mal clasificadas
    mal = [
        c
        for c in proximos
        if (c.get("dias_sin_compra") or 99) < 23
    ]
    if mal:
        print(f"\n⚠️ {len(mal)} en proximos_caer con <23 días sin compra (no deberían estar):")
        for c in mal[:10]:
            print(f"  {c.get('razon_social')} dias_sin={c.get('dias_sin_compra')}")
    else:
        print("\n✓ Ningún proximo_caer con dias_sin_compra < 23")


if __name__ == "__main__":
    main()
