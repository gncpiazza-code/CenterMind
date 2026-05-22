#!/usr/bin/env python3
"""Sincroniza id_empresa_erp y erp_empresa_mapping desde rpa_consolido_tenants."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from services.erp_identity_sync_service import sync_from_consolido_tenants


def main() -> None:
    result = sync_from_consolido_tenants()
    print(f"Distribuidores actualizados: {result['distribuidores_updated']}")
    for row in result.get("distribuidores") or []:
        prev = row.get("prev")
        arrow = f" (antes: {prev})" if prev else ""
        print(
            f"  dist {row['id_distribuidor']:>2} {row['nombre_empresa']!r} "
            f"-> id_empresa_erp={row['id_empresa_erp']}{arrow}"
        )
    print(f"Mappings erp_empresa_mapping: {result['erp_empresa_mapping_upserts']} upserts")


if __name__ == "__main__":
    main()
