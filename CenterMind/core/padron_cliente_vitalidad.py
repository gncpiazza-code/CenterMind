# -*- coding: utf-8 -*-
"""
Vitalidad del PDV: separar anulado en Consolido vs activo comercial (compras).

- padron_anulado: marcado anulado en padrón (`motivo_inactivo` padron_anulado / padron_absent).
- activo_comercial: compra en últimos 30 días (fecha última compra operativa).

Regla de negocio: si hay compra registrada en ventas_enriched, NO puede figurar anulado
(el ERP permitió la venta → el cliente está operativo).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

MOTIVOS_ANULADO_PADRON = frozenset({"padron_anulado", "padron_absent"})
DIAS_ACTIVO_COMERCIAL = 30


def _parse_fuc_iso(fuc: str | None) -> date | None:
    if not fuc:
        return None
    try:
        return date.fromisoformat(str(fuc)[:10])
    except ValueError:
        return None


def es_anulado_en_padron(motivo_inactivo: str | None) -> bool:
    """True si Consolido marcó el cliente como anulado en el padrón."""
    return (motivo_inactivo or "").strip().lower() in MOTIVOS_ANULADO_PADRON


def activo_comercial_por_fecha(
    fecha_ultima_compra: str | None,
    *,
    dias_umbral: int = DIAS_ACTIVO_COMERCIAL,
    ref_iso: str | None = None,
) -> bool:
    """Activo comercial = compra en los últimos N días calendario respecto a `ref_iso` (default: hoy)."""
    fuc = _parse_fuc_iso(fecha_ultima_compra)
    if fuc is None:
        return False
    ref = _parse_fuc_iso(ref_iso) if ref_iso else None
    if ref is None:
        ref = datetime.now(timezone.utc).date()
    umbral = ref - timedelta(days=max(1, dias_umbral))
    return fuc >= umbral


def apply_vitalidad_padron_row(
    row: dict[str, Any],
    *,
    compra_desde_ventas: bool = False,
) -> None:
    """
    In-place: `padron_anulado`, `activo_comercial`.
    Opcional: normaliza `estado` legacy a etiqueta UI (no usar `inactivo` para anulado).
    """
    motivo = row.get("motivo_inactivo")
    anulado_db = es_anulado_en_padron(motivo)
    fuc = str(row.get("fecha_ultima_compra") or "")[:10] or None
    tiene_compra = compra_desde_ventas or bool(fuc)

    padron_anulado = anulado_db and not tiene_compra
    activo_comercial = activo_comercial_por_fecha(fuc)

    row["padron_anulado"] = padron_anulado
    row["activo_comercial"] = activo_comercial
