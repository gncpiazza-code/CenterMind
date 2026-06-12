# -*- coding: utf-8 -*-
"""
Zonas operativas Ivan Soto (Tabaco dist=3, vendor_v2=30).

Monchi: corredor este/norte desde Tacuarendí hasta Basail (Paraná / RN11).
Jorge Coronel: Villa Ocampo y todo el oeste/sur (Villa Ana, Las Garzas, etc.).
"""
from __future__ import annotations

import unicodedata

from core.estadisticas_tabaco_rollup import IVAN_SOTO_V2_ID, TABACO_DIST_ID

# Tacuarendí → Basail (franja este / río Paraná)
IVAN_SOTO_MONCHI_LOCALIDADES: frozenset[str] = frozenset(
    {
        "TACUARENDI",
        "TACUAREMBO",
        "BASAIL",
        "LAS TOSCAS",
        "SAN ANTONIO DE OBLIGADO",
        "FLORENCIA",
        "VILLA GUILLERMINA",
    }
)

# Villa Ocampo hacia sur y oeste
IVAN_SOTO_JORGE_LOCALIDADES: frozenset[str] = frozenset(
    {
        "VILLA OCAMPO",
        "LAS GARZAS",
        "VILLA ANA",
        "LANTERI",
        "AGUA SUCIA",
        "ARROYO CEIBAL",
        "GUADALUPE NORTE",
        "EL SOMBRERITO",
    }
)


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_localidad_zona(localidad: str | None) -> str:
    raw = (localidad or "").strip().upper()
    if not raw:
        return "SIN_CIUDAD"
    return _strip_accents(raw)


def is_ivan_soto_geographic_partition(dist_id: int, leader_vid: int) -> bool:
    return int(dist_id) == TABACO_DIST_ID and int(leader_vid) == IVAN_SOTO_V2_ID


def resolve_ivan_soto_localidad_cuenta(localidad: str | None) -> str | None:
    """'monchi' | 'jorge_coronel' | None si la localidad no está catalogada."""
    loc = normalize_localidad_zona(localidad)
    if loc in IVAN_SOTO_JORGE_LOCALIDADES:
        return "jorge_coronel"
    if loc in IVAN_SOTO_MONCHI_LOCALIDADES:
        return "monchi"
    return None


def build_ivan_soto_city_owner(
  known_localidades: set[str] | None = None,
) -> dict[str, str]:
    """Mapa localidad → cuenta para todas las ciudades del catálogo (+ conocidas en cartera)."""
    owners: dict[str, str] = {}
    for loc in IVAN_SOTO_MONCHI_LOCALIDADES:
        owners[loc] = "monchi"
    for loc in IVAN_SOTO_JORGE_LOCALIDADES:
        owners[loc] = "jorge_coronel"
    for loc in known_localidades or set():
        norm = normalize_localidad_zona(loc)
        if norm in owners:
            continue
        cuenta = resolve_ivan_soto_localidad_cuenta(norm)
        if cuenta:
            owners[norm] = cuenta
    return owners
