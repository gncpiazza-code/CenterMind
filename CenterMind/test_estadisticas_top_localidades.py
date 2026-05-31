"""Top localidades en carta FIFA por cartera de clientes."""
from collections import defaultdict

from services.estadisticas_service import (
    _normalize_localidad_label,
    _top_localidades_label,
)


def test_normalize_localidad_label():
    assert _normalize_localidad_label("  parana  ") == "PARANA"
    assert _normalize_localidad_label("") == ""
    assert _normalize_localidad_label(None) == ""


def test_top_localidades_label_dedup_clients_and_rank():
    by_loc: dict[str, set[str]] = defaultdict(set)
    by_loc["PARANA"].update({"1", "2", "3"})
    by_loc["DIAMANTE"].update({"4", "5"})
    by_loc["VICTORIA"].update({"6"})
    assert _top_localidades_label(by_loc) == "PARANA - DIAMANTE"


def test_top_localidades_label_single_city():
    by_loc = {"COLON": {"1", "2"}}
    assert _top_localidades_label(by_loc) == "COLON"


def test_top_localidades_label_empty():
    assert _top_localidades_label({}) == ""
    assert _top_localidades_label(None) == ""
