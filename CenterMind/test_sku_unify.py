"""Unificación de SKUs — variantes CHESS / Consolido."""
from collections import Counter

from core.sku_unify import (
    SkuKeyResolver,
    build_cod_articulo_hints,
    merge_sku_bucket,
    normalize_sku_description,
    row_matches_sku_ref,
    seed_sku_resolver,
    sku_unify_key,
    sku_unify_key_from_row,
    unify_catalog_entries,
)


def test_normalize_quita_prefijo_cigarrillo():
    a = normalize_sku_description("CIGARRILLO DOLCHESTER GOLDEN EDITION")
    b = normalize_sku_description("DOLCHESTER GOLDEN EDITION")
    assert a == b == "dolchester golden edition"


def test_normalize_liverpool_con_sin_prefijo_y_empaque():
    a = normalize_sku_description("CIGARRILLO LIVERPOOL BLUE POP 20S BOX")
    b = normalize_sku_description("LIVERPOOL BLUE POP")
    assert a == b == "liverpool blue pop"


def test_unify_catalog_liverpool_variantes_nombre():
    cat = unify_catalog_entries(
        [
            {
                "cod_articulo": "LIV01",
                "articulo": "CIGARRILLO LIVERPOOL BLUE POP 20S BOX",
                "agrupacion": "CIGARRILLOS",
            },
            {
                "cod_articulo": "LIV02",
                "articulo": "LIVERPOOL BLUE POP",
                "agrupacion": "CIGARRILLOS",
            },
        ]
    )
    assert len(cat) == 1
    assert "liverpool blue pop" in cat[0]["articulo"].lower()


def test_unify_key_misma_desc_distinto_cod():
    k1 = sku_unify_key("ABC123", "CIGARRILLO DOLCHESTER GOLDEN EDITION", "CIGARRILLOS")
    k2 = sku_unify_key("", "DOLCHESTER GOLDEN EDITION", "CIGARRILLOS")
    assert k1 == k2


def test_bracket_code_en_descripcion():
    norm = normalize_sku_description("[MAR01] MARLBORO BOX")
    assert norm == "marlboro box"


def test_row_matches_sku_ref_por_nombre():
    row = {
        "cod_articulo": "",
        "descripcion_articulo": "DOLCHESTER GOLDEN EDITION",
        "agrupacion_art_2": "CIGARRILLOS",
    }
    assert row_matches_sku_ref(row, "DOL01", "CIGARRILLO DOLCHESTER GOLDEN EDITION")


def test_unify_catalog_fusiona_duplicados():
    cat = unify_catalog_entries(
        [
            {"cod_articulo": "DOL01", "articulo": "CIGARRILLO DOLCHESTER GOLDEN EDITION", "agrupacion": "CIGARRILLOS"},
            {"cod_articulo": "DOL99", "articulo": "DOLCHESTER GOLDEN EDITION", "agrupacion": "CIGARRILLOS"},
        ]
    )
    assert len(cat) == 1
    assert "dolchester" in cat[0]["articulo"].lower()


def test_hints_completa_cod_desde_catalogo():
    lines = [{"cod_articulo": "LIVPOP01", "descripcion_articulo": ""}]
    catalogo = [{"cod_articulo": "LIVPOP01", "articulo": "LIVERPOOL POP"}]
    hints = build_cod_articulo_hints(lines, catalogo)
    assert hints["LIVPOP01"] == "LIVERPOOL POP"


def test_resolver_unifica_cod_y_nombre_catalogo():
    resolver = SkuKeyResolver()
    catalogo = [{"cod_articulo": "LIVPOP01", "articulo": "LIVERPOOL POP", "agrupacion": "CIG"}]
    hints = build_cod_articulo_hints([], catalogo)
    seed_sku_resolver(resolver, catalogo, hints=hints)
    seed_sku_resolver(
        resolver,
        [{"cod_articulo": "LIVPOP01", "articulo": "LIVPOP01", "agrupacion": "CIG"}],
        hints=hints,
    )
    k_cat = resolver.resolve("LIVPOP01", "LIVERPOOL POP", "CIG")
    k_sale = resolver.resolve("LIVPOP01", "LIVERPOOL POP", "CIG")
    assert resolver.canonical(k_cat) == resolver.canonical(k_sale)


def test_merge_bucket_prefiere_cod_frecuente():
    b: dict = {"articulo": "A", "cod_articulo": "", "_cod_counts": Counter()}
    merge_sku_bucket(b, cod="Z1", desc="Producto X", agrupacion="CIG")
    merge_sku_bucket(b, cod="Z1", desc="CIGARRILLO PRODUCTO X", agrupacion="CIG")
    merge_sku_bucket(b, cod="Z2", desc="PRODUCTO X", agrupacion="CIG")
    assert b["cod_articulo"] == "Z1"
