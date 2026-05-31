# -*- coding: utf-8 -*-
"""
Utilidades de período para el módulo Repaso Comercial.

Períodos:
  YYYY-MM-Q1  → días 1–15 del mes
  YYYY-MM-Q2  → día 16 – último día del mes
  YYYY-MM-C   → día 1 – último día del mes (cierre mensual)

Zona horaria: America/Argentina/Buenos_Aires (UTC-3, sin DST).
"""
from __future__ import annotations

import calendar
from datetime import date
from zoneinfo import ZoneInfo

_TZ_AR = ZoneInfo("America/Argentina/Buenos_Aires")


# ── Helpers internos ──────────────────────────────────────────────────────────

def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _parse_periodo_key(periodo_key: str) -> tuple[int, int, str]:
    """Devuelve (year, month, tipo) a partir de 'YYYY-MM-Q1' / 'YYYY-MM-Q2' / 'YYYY-MM-C'."""
    parts = periodo_key.rsplit("-", 1)
    if len(parts) != 2:
        raise ValueError(f"periodo_key inválido: {periodo_key!r}")
    mes_str, tipo = parts
    tipo = tipo.upper()
    if tipo not in ("Q1", "Q2", "C"):
        raise ValueError(f"tipo de período inválido: {tipo!r}")
    try:
        year, month = int(mes_str[:4]), int(mes_str[5:7])
    except (ValueError, IndexError):
        raise ValueError(f"periodo_key inválido (mes): {periodo_key!r}")
    return year, month, tipo


# ── API pública ───────────────────────────────────────────────────────────────

def resolve_period_bounds(periodo_key: str) -> tuple[str, str]:
    """
    Retorna (fecha_desde_iso, fecha_hasta_iso) para el período dado.

    Q1  → 1 al 15 del mes
    Q2  → 16 al último día del mes
    C   → 1 al último día del mes
    """
    year, month, tipo = _parse_periodo_key(periodo_key)
    last = _last_day_of_month(year, month)

    if tipo == "Q1":
        return (
            f"{year}-{month:02d}-01",
            f"{year}-{month:02d}-15",
        )
    elif tipo == "Q2":
        return (
            f"{year}-{month:02d}-16",
            f"{year}-{month:02d}-{last:02d}",
        )
    else:  # C
        return (
            f"{year}-{month:02d}-01",
            f"{year}-{month:02d}-{last:02d}",
        )


def periodo_key_for(dt: date, tipo: str) -> str:
    """
    Construye una clave de período para la fecha y tipo dados.

    tipo: "Q1" | "Q2" | "C"
    """
    tipo = tipo.upper()
    if tipo not in ("Q1", "Q2", "C"):
        raise ValueError(f"tipo inválido: {tipo!r}")
    return f"{dt.year}-{dt.month:02d}-{tipo}"


def _today_ar() -> date:
    from datetime import datetime
    return datetime.now(_TZ_AR).date()


def current_q1_key() -> str:
    """Clave Q1 del mes actual (AR)."""
    dt = _today_ar()
    return periodo_key_for(dt, "Q1")


def current_q2_key() -> str:
    """Clave Q2 del mes actual (AR)."""
    dt = _today_ar()
    return periodo_key_for(dt, "Q2")


def current_close_key() -> str:
    """Clave C (cierre) del mes actual (AR)."""
    dt = _today_ar()
    return periodo_key_for(dt, "C")


def resolve_recap_comparisons(periodo_key: str) -> dict:
    """
    Retorna comparaciones relativas para el período dado.

    Q1  → {"quincena_anterior": "<mes-anterior>-Q2", "cierre_anterior": None}
    Q2  → {"quincena_anterior": "<mismo-mes>-Q1",    "cierre_anterior": None}
    C   → {"quincena_anterior": "<mismo-mes>-Q2",    "cierre_anterior": "<mes-anterior>-C"}
    """
    year, month, tipo = _parse_periodo_key(periodo_key)

    # Mes anterior
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1

    mes_actual = f"{year}-{month:02d}"
    mes_anterior = f"{prev_year}-{prev_month:02d}"

    if tipo == "Q1":
        return {
            "quincena_anterior": f"{mes_anterior}-Q2",
            "cierre_anterior": None,
        }
    elif tipo == "Q2":
        return {
            "quincena_anterior": f"{mes_actual}-Q1",
            "cierre_anterior": None,
        }
    else:  # C
        return {
            "quincena_anterior": f"{mes_actual}-Q2",
            "cierre_anterior": f"{mes_anterior}-C",
        }


def is_last_day_of_month(dt: date) -> bool:
    """True si `dt` es el último día de su mes."""
    return dt.day == _last_day_of_month(dt.year, dt.month)


def get_mes_str(periodo_key: str) -> str:
    """Retorna 'YYYY-MM' del período dado."""
    year, month, _ = _parse_periodo_key(periodo_key)
    return f"{year}-{month:02d}"
