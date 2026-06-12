# -*- coding: utf-8 -*-
"""
Aislamiento IdEmpresa para ventas_enriched (Informe Consolido multi-empresa).

Usado por ingesta, lectura post-filtro, auditoría y cleanup histórico.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from core.rpa_tenant_registry import (
    CONSOLIDO_TENANTS,
    expected_id_empresa_for_dist,
    expected_id_empresa_for_tenant,
)

_NOMBRE_TO_ID_EMPRESA: dict[str, str] = {}
_OWN_NOMBRE_BY_DIST: dict[int, str] = {}
_OTHER_NOMBRES_BY_DIST: dict[int, set[str]] = {}

for _row in CONSOLIDO_TENANTS:
    if not _row.get("activo", True):
        continue
    _dist = int(_row["id_distribuidor"])
    _ie = str(_row["id_empresa"]).strip()
    _nom = str(_row["nombre_consolido"] or "").strip()
    _OWN_NOMBRE_BY_DIST[_dist] = _nom
    if _nom:
        _NOMBRE_TO_ID_EMPRESA[_nom.upper()] = _ie

for _row in CONSOLIDO_TENANTS:
    if not _row.get("activo", True):
        continue
    _dist = int(_row["id_distribuidor"])
    _own = (_OWN_NOMBRE_BY_DIST.get(_dist) or "").upper()
    _OTHER_NOMBRES_BY_DIST[_dist] = {
        n.upper()
        for d, n in _OWN_NOMBRE_BY_DIST.items()
        if d != _dist and n
    }
    if _own:
        _OTHER_NOMBRES_BY_DIST[_dist].discard(_own)


def extract_id_empresa(row: dict[str, Any]) -> str:
    """IdEmpresa desde fila parseada o fila DB (raw_json anidado)."""
    raw = row.get("raw_json")
    if isinstance(raw, dict):
        return str(raw.get("id_empresa") or "").strip()
    return str(row.get("id_empresa") or "").strip()


def extract_nombre_empresa(row: dict[str, Any]) -> str:
    raw = row.get("raw_json")
    if isinstance(raw, dict):
        return str(raw.get("nombre_empresa") or "").strip()
    return str(row.get("nombre_empresa") or "").strip()


def is_contaminated_ventas_row(
    row: dict[str, Any],
    *,
    dist_id: int,
    expected_id_empresa: str | None = None,
) -> bool:
    """
    True si la fila no pertenece al tenant del dist (Consolido multi-empresa).

    - IdEmpresa presente y distinto al esperado → contaminada.
    - Sin IdEmpresa pero nombre_empresa de otro tenant → contaminada.
    - Sin IdEmpresa y sin señal clara → se conserva (legacy ambiguo).
    """
    expected = (expected_id_empresa or expected_id_empresa_for_dist(dist_id) or "").strip()
    if not expected:
        return False

    row_ie = extract_id_empresa(row)
    if row_ie:
        return row_ie != expected

    nombre = extract_nombre_empresa(row).upper()
    if not nombre:
        return False

    own = (_OWN_NOMBRE_BY_DIST.get(int(dist_id)) or "").upper()
    if own and nombre == own:
        return False

    other_ie = _NOMBRE_TO_ID_EMPRESA.get(nombre)
    if other_ie:
        return other_ie != expected

    if nombre in _OTHER_NOMBRES_BY_DIST.get(int(dist_id), set()):
        return True

    return False


def filter_parsed_rows_for_tenant(
    rows: list[dict[str, Any]],
    tenant_id: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Filtra filas parseadas del Excel; devuelve (kept, stats)."""
    expected = expected_id_empresa_for_tenant(tenant_id)
    dist_id = None
    for row in CONSOLIDO_TENANTS:
        if row.get("tenant_id") == (tenant_id or "").strip().lower():
            dist_id = int(row["id_distribuidor"])
            break

    if not expected or dist_id is None:
        return rows, {"total": len(rows), "kept": len(rows), "dropped": 0}

    kept: list[dict[str, Any]] = []
    dropped = 0
    dropped_empresas: Counter[str] = Counter()
    for r in rows:
        if is_contaminated_ventas_row(r, dist_id=dist_id, expected_id_empresa=expected):
            dropped += 1
            ne = extract_nombre_empresa(r) or extract_id_empresa(r) or "?"
            dropped_empresas[ne] += 1
        else:
            kept.append(r)

    return kept, {
        "total": len(rows),
        "kept": len(kept),
        "dropped": dropped,
        "expected_id_empresa": expected,
        "dist_id": dist_id,
        "dropped_empresas_top": dropped_empresas.most_common(5),
    }


def contamination_summary_message(stats: dict[str, Any]) -> str:
    """Mensaje legible para logs / errores HTTP."""
    top = stats.get("dropped_empresas_top") or []
    empresas = ", ".join(f"{n} ({c})" for n, c in top[:3])
    return (
        f"{stats.get('dropped', 0)}/{stats.get('total', 0)} filas descartadas "
        f"(IdEmpresa esperado {stats.get('expected_id_empresa')}"
        + (f"; empresas ajenas: {empresas}" if empresas else "")
        + ")"
    )
