# -*- coding: utf-8 -*-
"""
Tests unitarios para core/bot_cliente_cartera.py

Correr con:
  cd CenterMind && python -m pytest test_bot_cliente_cartera.py -v
"""
import unittest
from unittest.mock import MagicMock, patch


def _make_sb(rutas_data=None, clientes_data=None, excepciones_data=None):
    """Fábrica de mock de Supabase con cadena de métodos."""
    sb = MagicMock()

    def table_side_effect(name):
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select

        def make_chain(final_data):
            chain = MagicMock()
            chain.eq.return_value = chain
            chain.in_.return_value = chain
            chain.limit.return_value = chain
            chain.execute.return_value = MagicMock(data=final_data)
            return chain

        if "rutas_v2" in name:
            mock_select.return_value = make_chain(rutas_data if rutas_data is not None else [])
            mock_select.eq = make_chain(rutas_data if rutas_data is not None else []).eq
            chain = make_chain(rutas_data if rutas_data is not None else [])
            mock_table.select.return_value = chain

        elif "clientes_pdv_v2" in name:
            chain = make_chain(clientes_data if clientes_data is not None else [])
            mock_table.select.return_value = chain

        elif "matcheo_rutas_excepciones" in name:
            chain = make_chain(excepciones_data if excepciones_data is not None else [])
            mock_table.select.return_value = chain

        return mock_table

    sb.table.side_effect = table_side_effect
    return sb


class TestNormalizeErp(unittest.TestCase):

    def test_normalize_erp_con_ceros(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp("00194"), "194")

    def test_normalize_erp_sin_ceros(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp("194"), "194")

    def test_normalize_erp_solo_cero(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp("0"), "0")
        self.assertEqual(normalize_erp("000"), "0")

    def test_normalize_erp_float(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp("194.0"), "194")

    def test_normalize_erp_none(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp(None), "0")

    def test_normalize_erp_empty(self):
        from core.bot_cliente_cartera import normalize_erp
        self.assertEqual(normalize_erp(""), "0")


class TestClienteEnCarteraVendedor(unittest.TestCase):

    @patch("core.bot_cliente_cartera.tenant_table_name", side_effect=lambda base, dist: f"{base}_d{dist}")
    def test_en_cartera_true(self, _mock_tn):
        from core.bot_cliente_cartera import cliente_en_cartera_vendedor

        sb = MagicMock()
        # rutas → devuelve una ruta
        rutas_chain = MagicMock()
        rutas_chain.eq.return_value = rutas_chain
        rutas_chain.execute.return_value = MagicMock(data=[{"id_ruta": 1}])
        # clientes → devuelve el cliente
        clientes_chain = MagicMock()
        clientes_chain.eq.return_value = clientes_chain
        clientes_chain.in_.return_value = clientes_chain
        clientes_chain.limit.return_value = clientes_chain
        clientes_chain.execute.return_value = MagicMock(data=[{"id_cliente": 10}])

        def table_se(name):
            m = MagicMock()
            if "rutas_v2" in name:
                m.select.return_value = rutas_chain
            elif "clientes_pdv_v2" in name:
                m.select.return_value = clientes_chain
            return m

        sb.table.side_effect = table_se

        result = cliente_en_cartera_vendedor(1, 42, "00194", sb)
        self.assertTrue(result)

    @patch("core.bot_cliente_cartera.tenant_table_name", side_effect=lambda base, dist: f"{base}_d{dist}")
    def test_en_cartera_false_sin_rutas(self, _mock_tn):
        from core.bot_cliente_cartera import cliente_en_cartera_vendedor

        sb = MagicMock()
        rutas_chain = MagicMock()
        rutas_chain.eq.return_value = rutas_chain
        rutas_chain.execute.return_value = MagicMock(data=[])

        def table_se(name):
            m = MagicMock()
            m.select.return_value = rutas_chain
            return m

        sb.table.side_effect = table_se
        result = cliente_en_cartera_vendedor(1, 42, "194", sb)
        self.assertFalse(result)

    @patch("core.bot_cliente_cartera.tenant_table_name", side_effect=lambda base, dist: f"{base}_d{dist}")
    def test_en_cartera_false_cliente_no_en_ruta(self, _mock_tn):
        from core.bot_cliente_cartera import cliente_en_cartera_vendedor

        sb = MagicMock()
        rutas_chain = MagicMock()
        rutas_chain.eq.return_value = rutas_chain
        rutas_chain.execute.return_value = MagicMock(data=[{"id_ruta": 1}])

        clientes_chain = MagicMock()
        clientes_chain.eq.return_value = clientes_chain
        clientes_chain.in_.return_value = clientes_chain
        clientes_chain.limit.return_value = clientes_chain
        clientes_chain.execute.return_value = MagicMock(data=[])  # no encontrado

        exc_chain = MagicMock()
        exc_chain.select.return_value = exc_chain
        exc_chain.eq.return_value = exc_chain
        exc_chain.limit.return_value = exc_chain
        exc_chain.execute.return_value = MagicMock(data=[])

        def table_se(name):
            m = MagicMock()
            if "rutas_v2" in name:
                m.select.return_value = rutas_chain
            elif "clientes_pdv_v2" in name:
                m.select.return_value = clientes_chain
            elif "matcheo_rutas_excepciones" in name:
                return exc_chain
            return m

        sb.table.side_effect = table_se
        result = cliente_en_cartera_vendedor(1, 42, "194", sb)
        self.assertFalse(result)

    @patch("core.bot_cliente_cartera.tenant_table_name", side_effect=lambda base, dist: f"{base}_d{dist}")
    def test_en_cartera_excepcion_matcheo(self, _mock_tn):
        from core.bot_cliente_cartera import cliente_en_cartera_vendedor

        sb = MagicMock()
        rutas_chain = MagicMock()
        rutas_chain.eq.return_value = rutas_chain
        rutas_chain.execute.return_value = MagicMock(data=[])  # sin rutas

        exc_chain = MagicMock()
        exc_chain.eq.return_value = exc_chain
        exc_chain.limit.return_value = exc_chain
        exc_chain.execute.return_value = MagicMock(data=[{"id": 1}])  # tiene excepción

        def table_se(name):
            m = MagicMock()
            if "rutas_v2" in name:
                m.select.return_value = rutas_chain
            elif "matcheo_rutas_excepciones" in name:
                m.select.return_value = exc_chain
            return m

        sb.table.side_effect = table_se
        # Sin rutas el código retorna False antes de llegar a excepciones en la impl actual.
        # El test documenta el comportamiento: sin rutas → False (excepción no alcanzada).
        # Para franquiciados con excepción, el vendedor SÍ tiene rutas asignadas.
        result = cliente_en_cartera_vendedor(1, 42, "194", sb)
        self.assertFalse(result)  # correcto: sin rutas no llega a matcheo


if __name__ == "__main__":
    unittest.main()
