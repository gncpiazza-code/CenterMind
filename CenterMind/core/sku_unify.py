# -*- coding: utf-8 -*-
"""
Unificación inteligente de SKUs — ventas Consolido / CHESS.

El ERP a veces repite el mismo artículo con:
- distinto cod_articulo vs descripción vacía,
- prefijos de categoría ("CIGARRILLO …" vs nombre comercial),
- formato "[COD] DESCRIPCION".

Clave canónica: descripción normalizada (sin prefijos ni ruido).
Si no hay descripción usable, cae a cod_articulo.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

# Prefijos frecuentes en descripciones ERP (tabaco / mix) — orden importa (más largo primero).
_DESC_PREFIX_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^cigarrillos?\s+",
        r"^cig\.?\s+",
        r"^tabaco\s+",
        r"^papelillos?\s+",
        r"^papel\s+de\s+fumar\s+",
        r"^mix\s+exhibidores?\s+",
        r"^encendedor(?:es)?\s+",
        r"^mk\s+encendedor\s+",
    )
)

_BRACKET_CODE_RE = re.compile(r"^\[[^\]]+\]\s*")


def _fold_text(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[\W_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_sku_description(desc: str) -> str:
    """Quita [COD] inicial y espacios extra — conserva casing original para display."""
    s = (desc or "").strip()
    if not s:
        return ""
    s = _BRACKET_CODE_RE.sub("", s).strip()
    return re.sub(r"\s+", " ", s)


def normalize_sku_description(desc: str) -> str:
    """Fingerprint estable para agrupar variantes del mismo artículo."""
    s = clean_sku_description(desc)
    if not s:
        return ""
    folded = _fold_text(s)
    for pat in _DESC_PREFIX_PATTERNS:
        folded = pat.sub("", folded).strip()
    return folded


def sku_unify_key(
    cod_articulo: str,
    descripcion: str,
    agrupacion: str = "",
) -> str:
    """
    Clave de agregación canónica.
    Prioriza descripción normalizada; si es muy corta o vacía, usa código ERP.
    """
    norm_desc = normalize_sku_description(descripcion)
    cod = (cod_articulo or "").strip().upper()

    if len(norm_desc) >= 3:
        return f"n:{norm_desc}"

    if cod:
        return f"c:{cod}"

    norm_cod_as_desc = normalize_sku_description(cod_articulo)
    if len(norm_cod_as_desc) >= 3:
        return f"n:{norm_cod_as_desc}"

    agr = _fold_text(agrupacion)
    if agr:
        return f"a:{agr}:sin-id"

    return "sin-codigo"


def sku_unify_key_from_row(row: dict) -> str:
    return sku_unify_key(
        row.get("cod_articulo") or "",
        row.get("descripcion_articulo") or "",
        row.get("agrupacion_art_2") or "",
    )


def pick_canonical_articulo(*candidates: str) -> str:
    """Nombre display: el más informativo (más largo tras limpiar prefijos)."""
    cleaned = [clean_sku_description(c) for c in candidates if clean_sku_description(c)]
    if not cleaned:
        return "Artículo sin descripción"

    def _score(name: str) -> tuple[int, int, str]:
        norm = normalize_sku_description(name)
        return (len(norm), len(name), name)

    return max(cleaned, key=_score)


def pick_canonical_cod(*candidates: str, counts: Counter[str] | None = None) -> str:
    """Código ERP preferido: más frecuente en líneas; empate → más largo."""
    vals = [(c or "").strip() for c in candidates if (c or "").strip()]
    if not vals:
        return ""
    if counts:
        ranked = sorted(
            set(vals),
            key=lambda c: (counts.get(c, 0), len(c)),
            reverse=True,
        )
        return ranked[0]
    return max(set(vals), key=len)


def merge_sku_bucket(bucket: dict, *, cod: str, desc: str, agrupacion: str) -> None:
    """Actualiza identidad canónica al sumar líneas al mismo bucket."""
    cod = (cod or "").strip()
    desc_clean = clean_sku_description(desc)
    agr = (agrupacion or "").strip() or bucket.get("agrupacion") or "Sin agrupación"

    raw_counts = bucket.get("_cod_counts")
    counts = raw_counts if isinstance(raw_counts, Counter) else Counter(raw_counts or {})
    bucket["_cod_counts"] = counts
    if cod:
        counts[cod] += 1

    bucket["agrupacion"] = agr
    bucket["articulo"] = pick_canonical_articulo(bucket.get("articulo") or "", desc_clean, cod)
    bucket["cod_articulo"] = pick_canonical_cod(
        bucket.get("cod_articulo") or "",
        cod,
        counts=counts,
    )


def unify_catalog_entries(entries: list[dict]) -> list[dict]:
    """Fusiona filas de catálogo 12m con la misma clave de unificación."""
    merged: dict[str, dict] = {}
    cod_counts: dict[str, Counter[str]] = {}

    for raw in entries:
        cod = (raw.get("cod_articulo") or "").strip()
        articulo = clean_sku_description(raw.get("articulo") or raw.get("descripcion_articulo") or "")
        agr = (raw.get("agrupacion") or raw.get("agrupacion_art_2") or "").strip() or "Sin agrupación"
        key = sku_unify_key(cod, articulo, agr)

        if key not in merged:
            merged[key] = {
                "cod_articulo": cod,
                "articulo": articulo or cod or "Artículo sin descripción",
                "agrupacion": agr,
            }
            cod_counts[key] = Counter()
        else:
            m = merged[key]
            m["articulo"] = pick_canonical_articulo(m["articulo"], articulo, cod)
            m["agrupacion"] = agr or m["agrupacion"]

        if cod:
            cod_counts[key][cod] += 1

    out: list[dict] = []
    for key, m in merged.items():
        m["cod_articulo"] = pick_canonical_cod(m.get("cod_articulo") or "", counts=cod_counts.get(key))
        if not m["cod_articulo"]:
            # Catálogo sin código: usar fingerprint como id estable para UI/drill.
            m["cod_articulo"] = f"~{key[2:48]}" if key.startswith(("n:", "c:")) else key
        out.append(m)

    out.sort(key=lambda r: (r["articulo"].lower(), r["cod_articulo"]))
    return out


def resolve_unify_key_from_ref(
    lines: list[dict],
    cod_ref: str,
    desc_ref: str = "",
) -> str:
    """
    Resuelve la clave unificada para drill/API a partir de cod (y opcional desc).
    Soporta ids sintéticos `~fingerprint` del catálogo sin código ERP.
    """
    cod_ref = (cod_ref or "").strip()
    desc_ref = (desc_ref or "").strip()
    if cod_ref.startswith("~"):
        return f"n:{cod_ref[1:]}"
    for row in lines:
        if (row.get("cod_articulo") or "").strip() == cod_ref:
            return sku_unify_key_from_row(row)
    return sku_unify_key(cod_ref, desc_ref or cod_ref, "")


def row_matches_sku_ref(row: dict, cod_ref: str, desc_ref: str = "") -> bool:
    """True si la línea pertenece al mismo SKU unificado que la referencia."""
    ref_key = sku_unify_key(cod_ref, desc_ref or cod_ref, "")
    return sku_unify_key_from_row(row) == ref_key


def row_matches_unify_key(row: dict, unify_key: str) -> bool:
    return sku_unify_key_from_row(row) == unify_key
