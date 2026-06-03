"""Retroactividad compañía: alteo (ruteo_alteo) cuenta desde día 1 del mes_referencia."""
from services.objetivos_watcher_service import _compania_retro_since


def test_alteo_compania_desde_primer_dia_mes():
    obj = {
        "id": 1,
        "origen": "compania",
        "mes_referencia": "2026-06-15",
        "created_at": "2026-06-02T12:00:00+00:00",
        "fecha_objetivo": "2026-06-30",
    }
    since = _compania_retro_since(obj, "2026-06-02", as_timestamp=False)
    assert since == "2026-06-01"


def test_alteo_distribuidora_sin_retroactivo():
    obj = {
        "id": 2,
        "origen": "distribuidora",
        "created_at": "2026-06-02T12:00:00+00:00",
    }
    since = _compania_retro_since(obj, "2026-06-02", as_timestamp=False)
    assert since == "2026-06-02"


def test_exhibicion_compania_timestamp():
    obj = {
        "id": 3,
        "origen": "compania",
        "mes_referencia": "2026-06-01",
        "created_at": "2026-06-05T08:00:00+00:00",
    }
    since = _compania_retro_since(
        obj,
        "2026-06-05T08:00:00+00:00",
        as_timestamp=True,
    )
    assert since == "2026-06-01T00:00:00"
