# -*- coding: utf-8 -*-
"""
test_objetivos_alteo_venta.py
==============================
Tests para core/objetivos_alteo_venta.py

Verifica la lógica de "alteo con venta": solo cuentan los PDVs alteos
que tengan al menos una venta válida (importe > 0) en [fecha_alta, hasta].
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock
from collections import defaultdict


# ── Helpers para tests ────────────────────────────────────────────────────────

def _mk_client(cid: int, erp: str, fecha_alta: str) -> dict:
    return {"id_cliente": cid, "id_cliente_erp": erp, "fecha_alta": fecha_alta}


def _mk_venta(erp: str, fecha: str, importe: float) -> dict:
    return {
        "id_cliente_erp": erp,
        "fecha_factura": fecha,
        "importe_final": importe,
        "anulado": False,
    }


# ── Imports del módulo bajo test ──────────────────────────────────────────────

@pytest.fixture(autouse=True)
def patch_deps():
    """Mockea dependencias de DB para tests unitarios."""
    with (
        patch("core.objetivos_alteo_venta.erp_query_variants", side_effect=lambda erp: [erp, erp.lstrip("0") or "0"]),
        patch("core.objetivos_alteo_venta._norm_erp", side_effect=lambda erp: str(erp).lstrip("0") or "0"),
        patch("core.objetivos_alteo_venta.filter_ventas_rows_for_tenant", side_effect=lambda rows, ctx: rows),
    ):
        yield


def _make_split_fn(ventas_rows: list[dict]):
    """Crea un contexto que mockea split_alteos_con_sin_venta con ventas_rows dados."""
    from unittest.mock import patch

    mock_query_chain = MagicMock()
    # El chain final: .execute().data retorna ventas_rows en la 1ra llamada, [] en las siguientes
    call_count = {"n": 0}
    def side_effect_data():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ventas_rows
        return []

    mock_execute = MagicMock()
    mock_execute.execute.return_value = MagicMock(data=ventas_rows)

    mock_q = MagicMock()
    mock_q.eq.return_value = mock_q
    mock_q.in_.return_value = mock_q
    mock_q.gte.return_value = mock_q
    mock_q.lte.return_value = mock_q
    mock_q.gt.return_value = mock_q
    mock_q.order.return_value = mock_q
    mock_q.range.return_value = mock_q
    mock_q.execute.return_value = MagicMock(data=ventas_rows)

    return mock_q


class TestSplitAlteosConSinVenta:
    def test_con_venta_posterior_al_alta(self):
        """Alta día 1, venta día 5 → cuenta con venta."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        client = _mk_client(1, "1001", "2026-06-01")
        venta = _mk_venta("1001", "2026-06-05", 500.0)

        mock_q = _make_split_fn([venta])

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query") as mock_veba:
            mock_veba.return_value = ({"dist_id": 1}, mock_q)

            con_venta, sin_venta, prog_con, prog_total = split_alteos_con_sin_venta(
                clients=[client],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert len(con_venta) == 1
        assert len(sin_venta) == 0
        assert "2026-06-01" in prog_con
        assert "2026-06-01" in prog_total

    def test_sin_venta_posterior_al_alta(self):
        """Alta día 1, venta día anterior al alta → NO cuenta."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        client = _mk_client(1, "1001", "2026-06-10")
        # Venta ANTES del alta (2026-06-05 < 2026-06-10)
        venta = _mk_venta("1001", "2026-06-05", 500.0)

        mock_q = _make_split_fn([venta])

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query") as mock_veba:
            mock_veba.return_value = ({"dist_id": 1}, mock_q)

            con_venta, sin_venta, _, _ = split_alteos_con_sin_venta(
                clients=[client],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert len(con_venta) == 0, "Venta anterior al alta no debe contar"
        assert len(sin_venta) == 1

    def test_multiple_pdvs_mixtos(self):
        """Dos PDVs: uno con venta, otro sin → split correcto."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        c1 = _mk_client(1, "1001", "2026-06-01")
        c2 = _mk_client(2, "1002", "2026-06-01")
        ventas = [_mk_venta("1001", "2026-06-10", 200.0)]  # solo c1

        mock_q = _make_split_fn(ventas)

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query") as mock_veba:
            mock_veba.return_value = ({"dist_id": 1}, mock_q)

            con_venta, sin_venta, prog_con, prog_total = split_alteos_con_sin_venta(
                clients=[c1, c2],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert len(con_venta) == 1
        assert con_venta[0]["id_cliente"] == 1
        assert len(sin_venta) == 1
        assert sin_venta[0]["id_cliente"] == 2

    def test_venta_importe_cero_no_cuenta(self):
        """Venta con importe $0 → no debe contar (regla importe > 0)."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        client = _mk_client(1, "1001", "2026-06-01")
        # La query filtra importe > 0 via .gt("importe_final", 0), entonces la batch query
        # no retorna ventas con importe 0. Simulamos que la query retorna vacío.
        mock_q = _make_split_fn([])  # sin ventas

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query") as mock_veba:
            mock_veba.return_value = ({"dist_id": 1}, mock_q)

            con_venta, sin_venta, _, _ = split_alteos_con_sin_venta(
                clients=[client],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert len(con_venta) == 0
        assert len(sin_venta) == 1

    def test_sin_clientes(self):
        """Lista vacía → retorna listas vacías."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query"):
            con_venta, sin_venta, prog_con, prog_total = split_alteos_con_sin_venta(
                clients=[],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert con_venta == []
        assert sin_venta == []
        assert prog_con == {}
        assert prog_total == {}

    def test_desglose_visible_via_desglose_cache(self):
        """Verifica que progreso_diario_con refleja solo altas con venta."""
        from core.objetivos_alteo_venta import split_alteos_con_sin_venta

        c1 = _mk_client(1, "1001", "2026-06-01")  # tiene venta
        c2 = _mk_client(2, "1002", "2026-06-03")  # sin venta
        ventas = [_mk_venta("1001", "2026-06-05", 100.0)]

        mock_q = _make_split_fn(ventas)

        with patch("core.objetivos_alteo_venta.ventas_enriched_base_query") as mock_veba:
            mock_veba.return_value = ({"dist_id": 1}, mock_q)

            _, _, prog_con, prog_total = split_alteos_con_sin_venta(
                clients=[c1, c2],
                dist_id=1,
                id_vendedor=10,
                hasta="2026-06-30",
            )

        assert prog_con.get("2026-06-01") == 1     # c1 tiene venta
        assert prog_con.get("2026-06-03") is None  # c2 no tiene venta
        assert prog_total.get("2026-06-01") == 1
        assert prog_total.get("2026-06-03") == 1   # c2 en total aunque sin venta
