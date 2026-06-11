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
# Empaque tabaco: "20S BOX", "20S SOFT" — ruido ERP, no parte del nombre comercial.
_PACK_SIZE_RE = re.compile(
    r"\b\d+\s*s\s*(?:box|soft|hw|ks|cup|ltr|un)?\b",
    re.IGNORECASE,
)
# Consolido ventas: "BOX 20X250", "20x250" — bulto×unidades, no nombre comercial.
_BULTOS_PACK_RE = re.compile(r"\b\d+\s*x\s*\d+\b", re.IGNORECASE)
# CHESS legacy vs Consolido: "SPECIAL" ≈ "SP" en línea Liverpool.
_SPECIAL_TO_SP_RE = re.compile(r"\bspecial\b", re.IGNORECASE)
_TRAILING_BOX_RE = re.compile(r"\bbox\b", re.IGNORECASE)


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
    folded = _SPECIAL_TO_SP_RE.sub(" sp ", folded)
    folded = _PACK_SIZE_RE.sub("", folded).strip()
    folded = _BULTOS_PACK_RE.sub("", folded).strip()
    folded = _TRAILING_BOX_RE.sub("", folded).strip()
    return re.sub(r"\s+", " ", folded).strip()


class SkuKeyResolver:
    """
    Une aliases n:descripcion y c:codigo del mismo artículo.
    Evita filas fantasma «sin venta» cuando CHESS manda cod sin desc en ventas
    y otra variante cod+desc en catálogo.
    """

    def __init__(self) -> None:
        self._alias: dict[str, str] = {}

    @staticmethod
    def _rank(key: str) -> tuple[int, int]:
        if key.startswith("n:"):
            return (0, -len(key))
        if key.startswith("c:"):
            return (1, -len(key))
        return (2, -len(key))

    def canonical(self, key: str) -> str:
        seen: set[str] = set()
        while key in self._alias:
            if key in seen:
                break
            seen.add(key)
            key = self._alias[key]
        return key

    def _prefer(self, a: str, b: str) -> str:
        ca, cb = self.canonical(a), self.canonical(b)
        if ca == cb:
            return ca
        winner = ca if self._rank(ca) <= self._rank(cb) else cb
        loser = cb if winner == ca else ca
        if loser != winner:
            self._alias[loser] = winner
            for alias, target in list(self._alias.items()):
                if self.canonical(target) == loser:
                    self._alias[alias] = winner
        return winner

    def candidate_keys(self, cod: str, desc: str, agrupacion: str = "") -> list[str]:
        cod = (cod or "").strip().upper()
        norm_desc = normalize_sku_description(desc)
        keys: list[str] = []
        if len(norm_desc) >= 3:
            keys.append(f"n:{norm_desc}")
        if cod:
            keys.append(f"c:{cod}")
        if not keys:
            agr = _fold_text(agrupacion)
            keys.append(f"a:{agr}:sin-id" if agr else "sin-codigo")
        return keys

    def resolve(self, cod: str, desc: str, agrupacion: str = "") -> str:
        keys = self.candidate_keys(cod, desc, agrupacion)
        canon: str | None = None
        for key in keys:
            linked = self.canonical(key)
            canon = linked if canon is None else self._prefer(canon, linked)
        assert canon is not None
        for key in keys:
            self._alias[key] = canon
        return canon

    def is_same_product(self, cod_a: str, desc_a: str, agr_a: str, cod_b: str, desc_b: str, agr_b: str) -> bool:
        return self.canonical(self.resolve(cod_a, desc_a, agr_a)) == self.canonical(
            self.resolve(cod_b, desc_b, agr_b)
        )


def seed_sku_resolver(
    resolver: SkuKeyResolver,
    entries: list[dict],
    *,
    hints: dict[str, str] | None = None,
) -> None:
    """Registra identidades conocidas (catálogo / líneas) para unificar aliases n:/c:."""
    for raw in entries or []:
        cod, desc = enrich_sku_identity(
            raw.get("cod_articulo") or "",
            raw.get("articulo") or raw.get("descripcion_articulo") or "",
            hints=hints,
        )
        agr = (raw.get("agrupacion") or raw.get("agrupacion_art_2") or "").strip()
        resolver.resolve(cod, desc, agr)


def is_weak_sku_articulo(cod: str, articulo: str) -> bool:
    """True si el nombre no aporta identidad comercial (solo código ERP o muy corto)."""
    cod = (cod or "").strip()
    art = clean_sku_description(articulo)
    if not cod:
        return True
    if not art or art.upper() == cod.upper():
        return True
    nd = normalize_sku_description(art)
    cod_nd = normalize_sku_description(cod)
    return len(nd) < 3 or nd == cod_nd


_COD_ALPHA_PREFIX_RE = re.compile(r"^([A-Za-z]{3,})\d")


def _cod_alpha_prefix(cod: str) -> str:
    m = _COD_ALPHA_PREFIX_RE.match((cod or "").strip())
    return m.group(1).upper() if m else ""


def _cod_articulo_related(a: str, b: str) -> bool:
    """Códigos ERP del mismo artículo (p. ej. LIVBP / LIVBP2, COR01 / COR02)."""
    a = (a or "").strip()
    b = (b or "").strip()
    if not a or not b or a == b:
        return False
    if a.startswith(b) or b.startswith(a):
        return True
    if len(a) >= 4 and a in b:
        return True
    if len(b) >= 4 and b in a:
        return True
    pa, pb = _cod_alpha_prefix(a), _cod_alpha_prefix(b)
    return bool(pa and pa == pb)


def link_weak_catalog_hints(
    catalogo: list[dict] | None,
    hints: dict[str, str],
) -> None:
    """
    Códigos de catálogo con articulo=cod heredan el nombre del código fuerte
    relacionado en la misma agrupación (variantes ERP del mismo SKU).
    """
    strong: list[tuple[str, str, str]] = []
    weak: list[tuple[str, str]] = []
    for item in catalogo or []:
        cod = (item.get("cod_articulo") or "").strip()
        art = item.get("articulo") or item.get("descripcion_articulo") or ""
        agr = (item.get("agrupacion") or item.get("agrupacion_art_2") or "").strip()
        if not cod:
            continue
        if is_weak_sku_articulo(cod, art):
            weak.append((cod, agr))
            continue
        nd = normalize_sku_description(art)
        if len(nd) >= 3:
            strong.append((cod, agr, clean_sku_description(art)))

    for cod_w, agr_w in weak:
        related = [
            (cod_s, art_s)
            for cod_s, agr_s, art_s in strong
            if agr_s == agr_w and _cod_articulo_related(cod_w, cod_s)
        ]
        if len(related) != 1:
            continue
        _, art_s = related[0]
        hints[cod_w] = pick_canonical_articulo(hints.get(cod_w, ""), art_s)


def build_cod_articulo_hints(
    lines: list[dict],
    catalogo: list[dict] | None = None,
) -> dict[str, str]:
    """
    Mapa cod_articulo → mejor descripción conocida (líneas del período + catálogo 12m).
    Permite unificar ventas que solo traen código ERP.
    """
    hints: dict[str, str] = {}
    norm_to_art: dict[str, str] = {}

    def _register(cod: str, desc: str) -> None:
        cod = (cod or "").strip()
        desc_clean = clean_sku_description(desc)
        if not cod or not desc_clean:
            return
        if is_weak_sku_articulo(cod, desc_clean):
            return
        hints[cod] = pick_canonical_articulo(hints.get(cod, ""), desc_clean)
        nd = normalize_sku_description(desc_clean)
        if len(nd) >= 3:
            norm_to_art[nd] = pick_canonical_articulo(norm_to_art.get(nd, ""), desc_clean)

    for row in lines or []:
        _register(row.get("cod_articulo") or "", row.get("descripcion_articulo") or "")

    for item in catalogo or []:
        cod = (item.get("cod_articulo") or "").strip()
        art = item.get("articulo") or item.get("descripcion_articulo") or ""
        if is_weak_sku_articulo(cod, art):
            continue
        _register(cod, art)

    link_weak_catalog_hints(catalogo, hints)

    # Mismo nombre comercial con distintos códigos en catálogo → misma descripción para todos.
    by_norm: dict[str, list[str]] = {}
    for item in catalogo or []:
        cod = (item.get("cod_articulo") or "").strip()
        art = clean_sku_description(item.get("articulo") or item.get("descripcion_articulo") or "")
        if is_weak_sku_articulo(cod, art):
            art = hints.get(cod) or art
        nd = normalize_sku_description(art)
        if cod and nd:
            by_norm.setdefault(nd, []).append(cod)
    for nd, cods in by_norm.items():
        best = norm_to_art.get(nd) or ""
        for cod in cods:
            hints[cod] = pick_canonical_articulo(hints.get(cod, ""), best)

    # Segunda pasada: si el catálogo tiene nombre pero otro cod comparte fingerprint
    for cod, art in list(hints.items()):
        nd = normalize_sku_description(art)
        if nd in norm_to_art:
            hints[cod] = pick_canonical_articulo(art, norm_to_art[nd])

    link_weak_catalog_hints(catalogo, hints)

    return hints


def enrich_sku_identity(
    cod_articulo: str,
    descripcion: str,
    *,
    hints: dict[str, str] | None = None,
) -> tuple[str, str]:
    """Completa descripción vacía desde hints del período/catálogo."""
    cod = (cod_articulo or "").strip()
    desc = clean_sku_description(descripcion)
    if cod and not desc and hints and cod in hints:
        desc = hints[cod]
    if not desc and cod:
        desc = cod
    return cod, desc


def sku_unify_key(
    cod_articulo: str,
    descripcion: str,
    agrupacion: str = "",
    *,
    hints: dict[str, str] | None = None,
) -> str:
    """
    Clave de agregación canónica (nombre comercial normalizado vía SkuKeyResolver).
    Prioriza descripción; si no hay, código ERP.
    """
    resolver = SkuKeyResolver()
    cod, desc = enrich_sku_identity(cod_articulo, descripcion, hints=hints)
    return resolver.resolve(cod, desc, agrupacion)


def sku_unify_key_from_row(row: dict) -> str:
    return sku_unify_key(
        row.get("cod_articulo") or "",
        row.get("descripcion_articulo") or "",
        row.get("agrupacion_art_2") or "",
    )


_PLACEHOLDER_ARTICULO_NORMS = frozenset(
    {
        "articulo sin descripcion",
        "sin descripcion",
        "sin nombre",
    }
)


def pick_canonical_articulo(*candidates: str) -> str:
    """Nombre display: el más informativo (más largo tras limpiar prefijos)."""
    cleaned = [clean_sku_description(c) for c in candidates if clean_sku_description(c)]
    informative = [
        c
        for c in cleaned
        if normalize_sku_description(c) not in _PLACEHOLDER_ARTICULO_NORMS
    ]
    pool = informative or cleaned
    if not pool:
        return "Artículo sin descripción"

    def _score(name: str) -> tuple[int, int, str]:
        norm = normalize_sku_description(name)
        return (len(norm), len(name), name)

    return max(pool, key=_score)


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


def unify_catalog_entries(
    entries: list[dict],
    *,
    hints: dict[str, str] | None = None,
) -> list[dict]:
    """
    Fusiona catálogo 12m por nombre comercial (mismo resolver que ventas del período).
    Ej.: «CIGARRILLO DOLCHESTER GOLDEN» + «DOLCHESTER GOLDEN» → una fila.
    """
    if not entries:
        return []

    hints = hints or build_cod_articulo_hints([], entries)
    resolver = SkuKeyResolver()
    seed_sku_resolver(resolver, entries, hints=hints)

    merged: dict[str, dict] = {}
    cod_counts: dict[str, Counter[str]] = {}

    for raw in entries:
        cod_raw = (raw.get("cod_articulo") or "").strip()
        cod, articulo = enrich_sku_identity(
            cod_raw,
            raw.get("articulo") or raw.get("descripcion_articulo") or "",
            hints=hints,
        )
        agr = (raw.get("agrupacion") or raw.get("agrupacion_art_2") or "").strip() or "Sin agrupación"
        key = resolver.canonical(resolver.resolve(cod, articulo, agr))

        if key not in merged:
            merged[key] = {
                "sku_key": key,
                "cod_articulo": cod_raw,
                "articulo": articulo or cod or "Artículo sin descripción",
                "agrupacion": agr,
            }
            cod_counts[key] = Counter()
        else:
            m = merged[key]
            m["articulo"] = pick_canonical_articulo(m["articulo"], articulo, cod)
            m["agrupacion"] = agr or m["agrupacion"]

        if cod_raw:
            cod_counts[key][cod_raw] += 1

    out: list[dict] = []
    for key, m in merged.items():
        m["cod_articulo"] = pick_canonical_cod(m.get("cod_articulo") or "", counts=cod_counts.get(key))
        if not m["cod_articulo"]:
            m["cod_articulo"] = f"~{key[2:48]}" if key.startswith(("n:", "c:")) else key
        out.append(m)

    out.sort(key=lambda r: (r["articulo"].lower(), r["cod_articulo"]))
    return out


def resolve_unify_key_from_ref(
    lines: list[dict],
    cod_ref: str,
    desc_ref: str = "",
    *,
    hints: dict[str, str] | None = None,
) -> str:
    """
    Resuelve la clave unificada para drill/API a partir de cod (y opcional desc).
    Soporta ids sintéticos `~fingerprint` del catálogo sin código ERP.
    """
    resolver = SkuKeyResolver()
    cod_ref = (cod_ref or "").strip()
    desc_ref = (desc_ref or "").strip()
    if cod_ref.startswith("~"):
        return f"n:{cod_ref[1:]}"
    if hints is None:
        hints = build_cod_articulo_hints(lines)
    cod, desc = enrich_sku_identity(cod_ref, desc_ref or "", hints=hints)
    for row in lines:
        rc, rd = enrich_sku_identity(
            row.get("cod_articulo") or "",
            row.get("descripcion_articulo") or "",
            hints=hints,
        )
        if rc == cod_ref or (cod and rc == cod):
            return resolver.resolve(rc, rd, row.get("agrupacion_art_2") or "")
    return resolver.resolve(cod, desc, "")


def row_matches_sku_ref(row: dict, cod_ref: str, desc_ref: str = "") -> bool:
    """True si la línea pertenece al mismo SKU unificado que la referencia."""
    ref_key = sku_unify_key(cod_ref, desc_ref or cod_ref, "")
    return sku_unify_key_from_row(row) == ref_key


def row_matches_unify_key(
    row: dict,
    unify_key: str,
    *,
    hints: dict[str, str] | None = None,
) -> bool:
    resolver = SkuKeyResolver()
    cod, desc = enrich_sku_identity(
        row.get("cod_articulo") or "",
        row.get("descripcion_articulo") or "",
        hints=hints,
    )
    row_key = resolver.canonical(
        resolver.resolve(cod, desc, row.get("agrupacion_art_2") or "")
    )
    return row_key == resolver.canonical(unify_key)
