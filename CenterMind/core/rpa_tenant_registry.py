# -*- coding: utf-8 -*-
"""
Registro canónico de tenants RPA ↔ id_distribuidor Shelfy.

- Consolido (padrón, informe ventas enriched): tabla `rpa_consolido_tenants` + fallback TENANTS_LEGACY en padron.py
- CHESS (cuentas corrientes, comprobantes ventas): `CHESS_TENANTS` en ShelfMind-RPA/lib/chess_tenants_config.py

Mantener alineado: al agregar un distribuidor, actualizar aquí, ejecutar
  python scripts/sync_rpa_tenant_registry.py
y crear tablas *_d{N} en Supabase.
"""
from __future__ import annotations

from typing import Any

# ── Consolido / Nextbyn (motores/padron.py, informe_ventas.py) ─────────────────
# id_empresa = checkbox «Empresas» en Reporteador Genérico Consolido
CONSOLIDO_TENANTS: list[dict[str, Any]] = [
    {
        "tenant_id": "tabaco",
        "nombre_consolido": "Tabaco & Hnos S.R.L.",
        "id_empresa": "3154",
        "id_distribuidor": 3,
        "orden": 10,
        "activo": True,
    },
    {
        "tenant_id": "real",
        "nombre_consolido": "Real Tabacalera de Santiago S.A.",
        "id_empresa": "5597",
        "id_distribuidor": 2,
        "orden": 20,
        "activo": True,
    },
    {
        "tenant_id": "aloma",
        "nombre_consolido": "Aloma Distribuidores Oficiales",
        "id_empresa": "3442",
        "id_distribuidor": 4,
        "orden": 30,
        "activo": True,
    },
    {
        "tenant_id": "liver",
        "nombre_consolido": "Liver SRL",
        "id_empresa": "3534",
        "id_distribuidor": 5,
        "orden": 40,
        "activo": True,
    },
    {
        "tenant_id": "extra",
        "nombre_consolido": "GyG (Gomez Marcos Ariel)",
        "id_empresa": "3562",
        "id_distribuidor": 6,
        "orden": 50,
        "activo": True,
    },
    {
        "tenant_id": "beltrocco",
        "nombre_consolido": "SILVINA RIBERO",
        "id_empresa": "3559",
        "id_distribuidor": 11,
        "orden": 60,
        "activo": True,
    },
    {
        "tenant_id": "hugo_cena",
        "nombre_consolido": "CENA HUGO MARIO",
        "id_empresa": "3561",
        "id_distribuidor": 12,
        "orden": 70,
        "activo": True,
    },
    {
        "tenant_id": "ippolibaz",
        "nombre_consolido": "Ippolibaz SAS",
        "id_empresa": "3536",
        "id_distribuidor": 13,
        "orden": 75,
        "activo": True,
    },
]

# Mapeo tenant_id → id_distribuidor (ingesta API ventas / enriched / detalle)
TENANT_DIST_MAP: dict[str, int] = {
    row["tenant_id"]: int(row["id_distribuidor"])
    for row in CONSOLIDO_TENANTS
    if row.get("activo", True)
}


def consolido_tenants_legacy_format() -> list[dict[str, Any]]:
    """Formato esperado por motores/padron.py TENANTS_LEGACY."""
    return [
        {
            "id": row["tenant_id"],
            "nombre": row["nombre_consolido"],
            "id_empresa": row["id_empresa"],
            "id_dist": int(row["id_distribuidor"]),
        }
        for row in CONSOLIDO_TENANTS
        if row.get("activo", True)
    ]


def consolido_rows_for_db() -> list[dict[str, Any]]:
    """Filas para upsert en rpa_consolido_tenants."""
    return [
        {
            "tenant_id": row["tenant_id"],
            "nombre": row["nombre_consolido"],
            "id_empresa": row["id_empresa"],
            "id_distribuidor": int(row["id_distribuidor"]),
            "activo": bool(row.get("activo", True)),
            "orden": int(row.get("orden", 100)),
        }
        for row in CONSOLIDO_TENANTS
    ]
