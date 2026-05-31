"""T4a — Regresión: bundle visor debe exponer pendientes como lista y stats como dict."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from services.snapshot_visor_service import get_or_refresh_visor


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fresh_generated_at():
    return datetime.now(timezone.utc).isoformat()


def _make_visor_payload(pendientes=None, stats=None):
    return {
        "meta": {
            "generated_at": _fresh_generated_at(),
            "dist_id": 1,
        },
        "pendientes": pendientes if pendientes is not None else [],
        "stats": stats if stats is not None else {
            "pendientes": 3,
            "aprobados": 10,
            "destacados": 2,
            "total": 15,
        },
    }


def _make_sb_hit(payload: dict):
    """Supabase mock que simula cache hit con el payload dado."""
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [
        {"payload": payload, "generated_at": _fresh_generated_at()}
    ]
    sb.table.return_value.select.return_value.eq.return_value.limit.return_value = chain
    return sb


def _make_sb_miss():
    """Supabase mock que simula cache miss."""
    sb = MagicMock()
    miss_chain = MagicMock()
    miss_chain.execute.return_value.data = []
    sb.table.return_value.select.return_value.eq.return_value.limit.return_value = miss_chain
    sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    return sb


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_pendientes_is_list():
    """bundle['pendientes'] debe ser una list de grupos con fotos[]."""
    pendientes = [
        {
            "vendedor": "V1",
            "nro_cliente": "123",
            "tipo_pdv": "S/D",
            "fecha_hora": "2026-05-30T10:00:00",
            "fotos": [{"id_exhibicion": 1, "drive_link": "x", "estado": "Pendiente"}],
        },
    ]
    payload = _make_visor_payload(pendientes=pendientes)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        bundle = get_or_refresh_visor(1)
    assert "pendientes" in bundle
    assert isinstance(bundle["pendientes"], list)


def test_pendientes_empty_list_on_no_data():
    """Sin pendientes en snapshot → recompute (no servir cache vacío)."""
    payload = _make_visor_payload(pendientes=[])
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        with patch(
            "services.snapshot_visor_service._compute_visor",
            return_value=payload,
        ) as compute_mock:
            bundle = get_or_refresh_visor(1)
    compute_mock.assert_called_once()
    assert bundle["pendientes"] == []


def test_stats_shape():
    """bundle['stats'] debe ser un dict con las keys esperadas."""
    stats = {
        "pendientes": 3,
        "aprobados": 10,
        "destacados": 2,
        "total": 15,
    }
    payload = _make_visor_payload(stats=stats)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        bundle = get_or_refresh_visor(1)
    assert "stats" in bundle
    assert isinstance(bundle["stats"], dict)
    expected_keys = {"pendientes", "aprobados", "destacados", "total"}
    assert expected_keys <= bundle["stats"].keys()


def test_meta_present():
    """bundle['meta']['cache_hit'] debe existir y ser bool."""
    payload = _make_visor_payload()
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        bundle = get_or_refresh_visor(1)
    assert "meta" in bundle
    assert "cache_hit" in bundle["meta"]
    assert isinstance(bundle["meta"]["cache_hit"], bool)


def test_meta_cache_hit_true_on_hit():
    """Cache hit → meta.cache_hit es True (solo con pendientes reales)."""
    pendientes = [
        {
            "vendedor": "V1",
            "nro_cliente": "123",
            "tipo_pdv": "S/D",
            "fecha_hora": "2026-05-30T10:00:00",
            "fotos": [{"id_exhibicion": 1, "drive_link": "x", "estado": "Pendiente"}],
        },
    ]
    payload = _make_visor_payload(pendientes=pendientes)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        bundle = get_or_refresh_visor(1)
    assert bundle["meta"]["cache_hit"] is True


def test_meta_cache_hit_false_on_miss():
    """Cache miss → meta.cache_hit es False."""
    payload = _make_visor_payload()
    sb_miss = _make_sb_miss()
    with patch("services.snapshot_visor_service.sb", sb_miss):
        with patch(
            "services.snapshot_visor_service._compute_visor",
            return_value=payload,
        ):
            bundle = get_or_refresh_visor(1)
    assert bundle["meta"]["cache_hit"] is False


def test_pendientes_count_matches_payload():
    """La cantidad de pendientes en bundle coincide con el payload computado."""
    pendientes = [
        {
            "vendedor": "V1",
            "nro_cliente": "123",
            "tipo_pdv": "S/D",
            "fecha_hora": "2026-05-30T10:00:00",
            "fotos": [{"id_exhibicion": i, "drive_link": "x"} for i in range(5)],
        }
    ]
    payload = _make_visor_payload(pendientes=pendientes)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        bundle = get_or_refresh_visor(1)
    assert len(bundle["pendientes"]) == 1
    assert len(bundle["pendientes"][0]["fotos"]) == 5


def test_legacy_flat_pendientes_cache_is_recomputed():
    """Snapshots legacy (filas planas sin fotos[]) deben recomputarse."""
    legacy = [{"id_exhibicion": 1, "vendedor": "V1", "estado": "Pendiente"}]
    payload = _make_visor_payload(pendientes=legacy)
    grouped = [
        {
            "vendedor": "V1",
            "nro_cliente": "123",
            "tipo_pdv": "S/D",
            "fecha_hora": "2026-05-30T10:00:00",
            "fotos": [{"id_exhibicion": 1, "drive_link": "x"}],
        }
    ]
    fresh_payload = _make_visor_payload(pendientes=grouped)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_visor_service.sb", sb_mock):
        with patch(
            "services.snapshot_visor_service._compute_visor",
            return_value=fresh_payload,
        ) as compute_mock:
            bundle = get_or_refresh_visor(1)
    compute_mock.assert_called_once()
    assert isinstance(bundle["pendientes"][0].get("fotos"), list)
