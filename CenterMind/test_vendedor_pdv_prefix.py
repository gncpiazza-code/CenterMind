# -*- coding: utf-8 -*-
"""
Tests para pdv_buscar_texto — verifica que la búsqueda de nombre use prefijo
estricto (ilike '{q}%') y NO contains (ilike '%{q}%').

Caso reportado: HERNN BENETTI veía PDVs fuera de su cartera porque la búsqueda
por nombre usaba contains, retornando PDVs de otros vendedores cuando el query
era un dígito o substring de nombre.
"""
from unittest.mock import MagicMock, call
import pytest

from CenterMind.core.pdv_proximity import pdv_buscar_texto


def _make_simple_sb(rutas_data=None, hits_data=None):
    """
    Mock mínimo para supabase: auto-chain, retorna datos configurados en execute().
    """
    sb = MagicMock()

    rutas = rutas_data if rutas_data is not None else [{"id_ruta": 1}]
    hits = hits_data if hits_data is not None else []

    # Todos los execute() retornan los mismos datos (simplificado para tests)
    sb.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value = MagicMock(data=rutas)
    sb.table.return_value.select.return_value.in_.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(data=hits)
    sb.table.return_value.select.return_value.in_.return_value.or_.return_value.limit.return_value.execute.return_value = MagicMock(data=hits)

    return sb


def test_query_vacio_retorna_vacio():
    sb = MagicMock()
    result = pdv_buscar_texto(sb, dist_id=3, id_vendedor=10, query="")
    assert result == []
    assert not sb.table.called


def test_sin_rutas_retorna_vacio():
    sb = _make_simple_sb(rutas_data=[], hits_data=[])
    result = pdv_buscar_texto(sb, dist_id=3, id_vendedor=10, query="43")
    assert result == []


def test_resultados_tienen_en_cartera_true():
    """Todos los resultados deben tener en_cartera: True."""
    hits = [
        {"id_cliente_erp": "43001", "nombre_fantasia": "KIOSCO 43", "nombre_razon_social": ""},
    ]
    sb = _make_simple_sb(hits_data=hits)
    result = pdv_buscar_texto(sb, dist_id=3, id_vendedor=10, query="43")
    assert all(r["en_cartera"] is True for r in result), "Todos deben ser en_cartera=True"


def test_nombre_prefix_no_contains():
    """
    Verifica directamente la cadena de consulta enviada a or_().
    Debe contener '43%' y NO '%43%'.
    """
    or_arg_captured = []

    sb = MagicMock()

    # rutas
    rutas_chain = MagicMock()
    rutas_chain.select.return_value.eq.return_value.range.return_value.execute.return_value = MagicMock(data=[{"id_ruta": 1}])

    clientes_chain = MagicMock()

    def or_capture(q_str, **k):
        or_arg_captured.append(q_str)
        r = MagicMock()
        r.limit.return_value.execute.return_value = MagicMock(data=[])
        return r

    inner = MagicMock()
    inner.ilike.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    inner.or_.side_effect = or_capture

    clientes_chain.select.return_value.in_.return_value = inner

    def table_side(name):
        return rutas_chain if "rutas" in name else clientes_chain

    sb.table.side_effect = table_side

    pdv_buscar_texto(sb, dist_id=3, id_vendedor=10, query="43")

    assert len(or_arg_captured) >= 1, "or_() no fue llamado para búsqueda de nombre"
    q_str = or_arg_captured[0]
    assert "43%" in q_str, f"Se esperaba prefijo '43%' en: {q_str}"
    assert "%43%" not in q_str, f"No debe usar contains '%43%' en: {q_str}"


def test_nro_prefix_check():
    """
    Verifica que ilike de NRO use prefijo '43%'.
    """
    ilike_calls = []

    sb = MagicMock()

    # rutas
    rutas_chain = MagicMock()
    rutas_chain.select.return_value.eq.return_value.range.return_value.execute.return_value = MagicMock(data=[{"id_ruta": 1}])

    clientes_chain = MagicMock()

    def ilike_capture(field, pattern, **k):
        ilike_calls.append((field, pattern))
        r = MagicMock()
        r.limit.return_value.execute.return_value = MagicMock(data=[])
        return r

    inner = MagicMock()
    inner.ilike.side_effect = ilike_capture
    inner.or_.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

    clientes_chain.select.return_value.in_.return_value = inner

    def table_side(name):
        return rutas_chain if "rutas" in name else clientes_chain

    sb.table.side_effect = table_side

    pdv_buscar_texto(sb, dist_id=3, id_vendedor=10, query="43")

    assert len(ilike_calls) >= 1, "ilike() no fue llamado para NRO"
    field, pattern = ilike_calls[0]
    assert field == "id_cliente_erp", f"ilike debe ser sobre id_cliente_erp, no '{field}'"
    assert pattern == "43%", f"Pattern debe ser '43%', no '{pattern}'"
