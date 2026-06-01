"""T3 — Regresión: bundle supervisión debe exponer vendedores como lista con cache_hit bool."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from services.snapshot_supervision_service import get_or_refresh_supervision


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fresh_generated_at():
    return datetime.now(timezone.utc).isoformat()


def _make_supervision_payload(vendedores=None):
    return {
        "meta": {
            "generated_at": _fresh_generated_at(),
            "fecha_snapshot_cc": "2026-05-30",
        },
        "cuentas": {
            "fecha": "2026-05-30",
            "metadatos": {
                "total_deuda": 1000.0,
                "clientes_deudores": 2,
                "promedio_dias_retraso": 15.5,
            },
            "vendedores": vendedores if vendedores is not None else [],
        },
    }


def _make_vendedor(nombre="Vendedor Test", n_clientes=2):
    return {
        "id_vendedor": 1,
        "vendedor": nombre,
        "sucursal": "CENTRO",
        "deuda_total": 500.0,
        "cantidad_clientes": n_clientes,
        "clientes": [
            {
                "cliente": f"Cliente {i}",
                "id_cliente_erp": f"ERP-{i:03d}",
                "id_cliente": i,
                "sucursal": "CENTRO",
                "deuda_total": 250.0,
                "deuda_7_dias": 0.0,
                "deuda_15_dias": 250.0,
                "deuda_30_dias": 0.0,
                "deuda_60_dias": 0.0,
                "deuda_mas_60_dias": 0.0,
                "antiguedad": 15,
                "antiguedad_cc": 15,
                "antiguedad_desde_padron": False,
                "rango_antiguedad": "15-30d",
                "cantidad_comprobantes": 1,
                "fecha_ultima_compra": "2026-05-15",
                "dias_desde_ultima_compra": 15,
                "padron_cc_alerta": False,
            }
            for i in range(1, n_clientes + 1)
        ],
    }


def _make_sb_hit(payload: dict):
    """Supabase mock que simula cache hit con el payload dado."""
    sb = MagicMock()
    chain = MagicMock()
    chain.execute.return_value.data = [
        {"payload": payload, "generated_at": _fresh_generated_at()}
    ]
    # Soportar cadena .eq().is_().is_().limit() y .eq().eq().is_().limit(), etc.
    sb.table.return_value.select.return_value.eq.return_value.is_.return_value.is_.return_value.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.is_.return_value.eq.return_value.limit.return_value = chain
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value = chain
    return sb


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_cuentas_vendedores_is_list():
    """bundle['cuentas']['vendedores'] debe ser list."""
    vendedores = [_make_vendedor("Vendedor A", 2), _make_vendedor("Vendedor B", 1)]
    payload = _make_supervision_payload(vendedores)
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_supervision_service.sb", sb_mock):
        bundle = get_or_refresh_supervision(1, None, None)
    assert "cuentas" in bundle
    assert "vendedores" in bundle["cuentas"]
    assert isinstance(bundle["cuentas"]["vendedores"], list)


def test_meta_cache_hit_field():
    """bundle['meta']['cache_hit'] debe existir y ser bool."""
    payload = _make_supervision_payload()
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_supervision_service.sb", sb_mock):
        bundle = get_or_refresh_supervision(1, None, None)
    assert "meta" in bundle
    assert "cache_hit" in bundle["meta"]
    assert isinstance(bundle["meta"]["cache_hit"], bool)


def test_meta_cache_hit_true_on_hit():
    """Cuando el snapshot es fresco, cache_hit debe ser True."""
    payload = _make_supervision_payload()
    sb_mock = _make_sb_hit(payload)
    with patch("services.snapshot_supervision_service.sb", sb_mock):
        bundle = get_or_refresh_supervision(1, None, None)
    assert bundle["meta"]["cache_hit"] is True


def test_paridad_vendedores_count():
    """Tras background refresh, el snapshot persistido conserva la cantidad de vendedores."""
    vendedores = [_make_vendedor("A"), _make_vendedor("B"), _make_vendedor("C")]
    fresh_payload = _make_supervision_payload(vendedores)

    sb_miss = MagicMock()
    miss_chain = MagicMock()
    miss_chain.execute.return_value.data = []
    sb_miss.table.return_value.select.return_value.eq.return_value.is_.return_value.is_.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.select.return_value.eq.return_value.is_.return_value.eq.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.delete.return_value.eq.return_value.is_.return_value.is_.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.delete.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.delete.return_value.eq.return_value.is_.return_value.eq.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.delete.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.insert.return_value.execute.return_value = MagicMock()

    def _run_bg(_key, fn):
        fn()

    with patch("services.snapshot_supervision_service.sb", sb_miss):
        with patch(
            "services.snapshot_supervision_service.trigger_background_refresh",
            side_effect=_run_bg,
        ):
            with patch(
                "services.snapshot_supervision_service._compute_supervision",
                return_value=fresh_payload,
            ):
                bundle = get_or_refresh_supervision(1, None, None)

    assert len(bundle["cuentas"]["vendedores"]) == 0
    sb_miss.table.return_value.insert.assert_called()


def test_cache_miss_returns_cache_hit_false():
    """En cache miss, respuesta inmediata parcial con revalidating."""
    sb_miss = MagicMock()
    miss_chain = MagicMock()
    miss_chain.execute.return_value.data = []
    sb_miss.table.return_value.select.return_value.eq.return_value.is_.return_value.is_.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value.limit.return_value = miss_chain
    sb_miss.table.return_value.delete.return_value.eq.return_value.is_.return_value.is_.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.delete.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock()
    sb_miss.table.return_value.insert.return_value.execute.return_value = MagicMock()

    with patch("services.snapshot_supervision_service.sb", sb_miss):
        with patch("services.snapshot_supervision_service.trigger_background_refresh") as mock_bg:
            bundle = get_or_refresh_supervision(1, None, None)

    assert bundle["meta"]["cache_hit"] is False
    assert bundle["meta"]["revalidating"] is True
    mock_bg.assert_called_once()
