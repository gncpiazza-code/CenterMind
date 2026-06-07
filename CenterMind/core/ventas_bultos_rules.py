# -*- coding: utf-8 -*-
"""
Reglas de volumen — Informe de Ventas Consolido.

- Encendedores: bultos crudos del Excel (sin conversión por unidades).
- Solo líneas convertidas (cigarrillos / papelillos / mix exhibidores): unidades → bultos.
- Resto: bultos del Excel.
"""
from __future__ import annotations

from typing import Literal

VolumenKind = Literal[
    "encendedor_raw",
    "otro_raw",
    "cig_papelillo",
    "cig_mix_exhib",
    "cig_default",
]


def _blob(agrupacion_art_2: str, descripcion: str, descripcion_comp: str) -> str:
    return f"{agrupacion_art_2 or ''} {descripcion or ''} {descripcion_comp or ''}".upper()


def _contains(value: str, token: str) -> bool:
    return token in (value or "").upper()


def is_encendedor(agrupacion_art_2: str, descripcion: str, descripcion_comp: str) -> bool:
    agr = (agrupacion_art_2 or "").upper()
    blob = _blob(agrupacion_art_2, descripcion, descripcion_comp)
    if _contains(agr, "ENCENDEDOR") or _contains(blob, "ENCENDEDOR"):
        return True
    return _contains(blob, "MK ENCENDEDOR")


def is_papelillo(agrupacion_art_2: str, descripcion: str, descripcion_comp: str) -> bool:
    agr = (agrupacion_art_2 or "").upper()
    blob = _blob(agrupacion_art_2, descripcion, descripcion_comp)
    if _contains(agr, "PAPELILLO"):
        return True
    for token in ("PAPELILLO", "PAPEL DE FUMAR", "PIER AND ROLL", "PIER & ROLL"):
        if token in blob:
            return True
    return False


def is_mix_exhibidores(agrupacion_art_2: str, descripcion: str, descripcion_comp: str) -> bool:
    agr = (agrupacion_art_2 or "").upper()
    blob = _blob(agrupacion_art_2, descripcion, descripcion_comp)
    return _contains(agr, "MIX EXHIBIDORES") or _contains(blob, "MIX EXHIBIDORES")


def is_cigarrillos_agrupacion(agrupacion_art_2: str) -> bool:
    return _contains(agrupacion_art_2 or "", "CIGARRILLOS")


def classify_volumen(
    agrupacion_art_2: str,
    descripcion: str = "",
    descripcion_comp: str = "",
) -> VolumenKind:
    """Clasifica la línea para aplicar conversión o bulto crudo."""
    if is_encendedor(agrupacion_art_2, descripcion, descripcion_comp):
        return "encendedor_raw"
    if is_papelillo(agrupacion_art_2, descripcion, descripcion_comp):
        return "cig_papelillo"
    if is_cigarrillos_agrupacion(agrupacion_art_2):
        if is_mix_exhibidores(agrupacion_art_2, descripcion, descripcion_comp):
            return "cig_mix_exhib"
        return "cig_default"
    if is_mix_exhibidores(agrupacion_art_2, descripcion, descripcion_comp):
        return "cig_mix_exhib"
    return "otro_raw"


def unidades_por_bulto(kind: VolumenKind) -> float | None:
    if kind == "cig_papelillo":
        return 100.0
    if kind == "cig_mix_exhib":
        return 25.0
    if kind == "cig_default":
        return 250.0
    return None


def volumen_es_convertido(kind: VolumenKind) -> bool:
    return kind in ("cig_papelillo", "cig_mix_exhib", "cig_default")


def bultos_efectivos(
    agrupacion_art_2: str,
    descripcion: str,
    descripcion_comp: str,
    unidades_total: float,
    bultos_excel: float,
) -> float:
    """
    Bultos a persistir / sumar en KPIs.
    Encendedores y no-cig: valor del Excel. Cigarrillos: unidades / factor.
    """
    kind = classify_volumen(agrupacion_art_2, descripcion, descripcion_comp)
    if not volumen_es_convertido(kind):
        return float(bultos_excel or 0)
    u = float(unidades_total or 0)
    if u <= 0:
        return float(bultos_excel or 0)
    factor = unidades_por_bulto(kind) or 250.0
    return u / factor


def bultos_display_2dec(value: float) -> float:
    """Dos decimales para UI/API (sin redondear a entero)."""
    return round(float(value or 0), 2)


def bultos_desglose_decimal(
    bultos: float,
    unidades_por_bulto_factor: float,
) -> tuple[int, int]:
    """
    Parte el bulto decimal en entero + unidades restantes (para leer 42,37 → 42 + 92 u).
    Usa el factor de conversión (250 / 100 / 25), no el total histórico de unidades.
    """
    b = float(bultos or 0)
    factor = int(unidades_por_bulto_factor or 250)
    if factor <= 0:
        return int(b), 0
    sign = -1 if b < 0 else 1
    b_abs = abs(b)
    enteros = int(b_abs)
    fraccion = round(b_abs - enteros, 4)
    resto = int(round(fraccion * factor))
    if resto >= factor:
        enteros += resto // factor
        resto = resto % factor
    return sign * enteros, resto


def _fmt_num_es(value: float, *, decimals: int = 2) -> str:
    """Formato numérico es-AR (1.234,56)."""
    v = float(value or 0)
    if decimals == 0:
        s = f"{int(round(v)):,}"
    else:
        s = f"{v:,.{decimals}f}"
    return s.replace(",", "\ufffd").replace(".", ",").replace("\ufffd", ".")


def fmt_bultos_unidades_desglose(bultos_enteros: int, unidades_resto: int) -> str:
    """Compat estadísticas — desglose explícito (42 Bultos · 92 Unidades)."""
    b = _fmt_num_es(abs(int(bultos_enteros)), decimals=0)
    u = _fmt_num_es(unidades_resto, decimals=0)
    if int(unidades_resto) > 0:
        return f"{b} Bultos · {u} Unidades"
    return f"{b} Bultos"


def enrich_bultos_desglose_row(bultos_raw: float, kind: VolumenKind | None) -> dict:
    """Campos de display alineados a estadísticas / VendorCardExpanded."""
    b_raw = float(bultos_raw or 0)
    row: dict = {
        "bultos": bultos_display_2dec(b_raw),
        "bultos_raw": b_raw,
        "kind": kind,
    }
    if kind and volumen_es_convertido(kind):
        factor = unidades_por_bulto(kind) or 250.0
        enteros, resto = bultos_desglose_decimal(b_raw, factor)
        row["bultos_enteros"] = enteros
        row["unidades_resto"] = resto
    return row


def bultos_pdf_html(
    bultos_raw: float,
    kind: VolumenKind | None = None,
    *,
    bultos_enteros: int | None = None,
    unidades_resto: int | None = None,
) -> str:
    """
    Texto HTML para celdas PDF: bultos con 2 dec. + desglose entero/unidades
    en líneas convertidas (cigarrillos / papelillos / mix).
    """
    primary = f"{_fmt_num_es(bultos_display_2dec(bultos_raw))} bultos"
    if bultos_enteros is not None and unidades_resto is not None:
        if int(unidades_resto) > 0:
            secondary = fmt_bultos_unidades_desglose(int(bultos_enteros), int(unidades_resto))
            return f"{primary}<br/><i>{secondary}</i>"
        return primary
    enriched = enrich_bultos_desglose_row(bultos_raw, kind)
    enteros = enriched.get("bultos_enteros")
    resto = enriched.get("unidades_resto")
    if enteros is not None and resto is not None and int(resto) > 0:
        secondary = fmt_bultos_unidades_desglose(int(enteros), int(resto))
        return f"{primary}<br/><i>{secondary}</i>"
    return primary
