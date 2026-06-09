# -*- coding: utf-8 -*-
"""
Tests para core/telegram_group_matcher.py y group-first vendor resolution.

Cubre:
- Scoring de candidatos (nombre exacto, parcial, multi-candidato capping)
- Detección de drift (título, vendor inactivo)
- apply_group_binding + propagación a integrantes
- Group-first stats: supervisor que ejecuta /stats ve stats del vendor anclado
"""
from unittest.mock import MagicMock, patch, call
import pytest


# ── Helpers para mocks ────────────────────────────────────────────────────────

def _make_sb_mock():
    """Retorna un mock de Supabase client con tabla/select/eq chainable."""
    sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.not_.is_.return_value = chain
    chain.in_.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.range.return_value = chain
    chain.update.return_value = chain
    chain.insert.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    sb.table.return_value = chain
    return sb, chain


# ── Tests: scoring ────────────────────────────────────────────────────────────

class TestScoreGroupVendorCandidates:
    """Score devuelve candidatos ordenados; capping multi-candidato funciona."""

    def test_erp_exact_match_scores_1(self):
        from core.telegram_group_matcher import _normalize_text, _score_name_overlap
        # Nombre ERP normalizado en título del grupo → score alto
        erp = "JUAN PEREZ"
        grupo_title = "Juan Pérez - Ventas Norte"
        norm_erp = _normalize_text(erp)
        norm_title = _normalize_text(grupo_title)
        score = _score_name_overlap(norm_erp, norm_title)
        assert score >= 0.85, f"Esperado >=0.85, got {score}"

    def test_exact_erp_code_match(self):
        from core.telegram_group_matcher import _normalize_text, _score_name_overlap
        # Cuando el nombre ERP está completamente contenido
        erp = "LUCIANO GONZALEZ"
        titulo = "LUCIANO GONZALEZ"
        score = _score_name_overlap(_normalize_text(erp), _normalize_text(titulo))
        assert score >= 0.95

    def test_multicandidato_caps_at_049(self):
        """Dos candidatos con score > 0.5 deben caparse a 0.49."""
        from core.telegram_group_matcher import _cap_multi_candidates
        candidates = [
            {"id_vendedor": 1, "score": 0.85, "nombre_erp": "JUAN PEREZ", "reasons": []},
            {"id_vendedor": 2, "score": 0.80, "nombre_erp": "JUAN RODRIGUEZ", "reasons": []},
        ]
        capped = _cap_multi_candidates(candidates)
        for c in capped:
            assert c["score"] <= 0.49, f"Score debería estar capeado, got {c['score']}"

    def test_single_candidate_not_capped(self):
        """Un solo candidato no se capea."""
        from core.telegram_group_matcher import _cap_multi_candidates
        candidates = [
            {"id_vendedor": 1, "score": 0.95, "nombre_erp": "MARIA GARCIA", "reasons": []},
        ]
        result = _cap_multi_candidates(candidates)
        assert result[0]["score"] == 0.95


# ── Tests: drift detection ────────────────────────────────────────────────────

class TestDetectGroupDrift:
    """detect_group_drift identifica cambio de título y vendor inactivo."""

    def test_title_unchanged_no_drift(self):
        """Mismo título no genera drift."""
        from core.telegram_group_matcher import _is_title_drift
        assert not _is_title_drift("Grupo Ventas Norte", "Grupo Ventas Norte")

    def test_title_small_change_no_drift(self):
        """Cambio menor (<40%) no genera drift."""
        from core.telegram_group_matcher import _is_title_drift
        # "Grupo Ventas Norte" vs "Grupo Ventas Norte 2" — cambio pequeño
        assert not _is_title_drift("Grupo Ventas Norte", "Grupo Ventas Norte 2")

    def test_title_major_change_is_drift(self):
        """Cambio sustancial (>40%) genera drift."""
        from core.telegram_group_matcher import _is_title_drift
        assert _is_title_drift("Juan Perez Ventas", "Maria Rodriguez Compras")

    def test_empty_prev_title_no_drift(self):
        """Sin título previo no hay drift."""
        from core.telegram_group_matcher import _is_title_drift
        assert not _is_title_drift(None, "Nuevo Titulo")
        assert not _is_title_drift("", "Nuevo Titulo")


# ── Tests: apply_group_binding ────────────────────────────────────────────────

class TestApplyGroupBinding:
    """apply_group_binding actualiza grupos y propaga a integrantes_grupo."""

    def test_updates_grupos_table(self):
        sb_mock, chain = _make_sb_mock()

        # Mock para integrantes (propagación)
        chain.execute.return_value = MagicMock(data=[
            {"id_integrante": 10},
            {"id_integrante": 11},
        ])

        with patch("core.telegram_group_matcher.sb", sb_mock):
            from core.telegram_group_matcher import apply_group_binding
            apply_group_binding(
                dist_id=3,
                telegram_chat_id=111222333,
                id_vendedor_v2=42,
                source="bot_vincular",
                performed_by="user_123"
            )

        # Verificar que se llamó tabla grupos con update
        calls = [str(c) for c in sb_mock.table.call_args_list]
        assert any("grupos" in c for c in calls), "Debería actualizar tabla grupos"

    def test_registers_audit(self):
        sb_mock, chain = _make_sb_mock()
        chain.execute.return_value = MagicMock(data=[])

        with patch("core.telegram_group_matcher.sb", sb_mock):
            from core.telegram_group_matcher import apply_group_binding
            apply_group_binding(3, 111222, 42, "portal", "directorio_user")

        calls = [str(c) for c in sb_mock.table.call_args_list]
        assert any("telegram_binding_audit" in c for c in calls), "Debería insertar en audit"


# ── Tests: group-first stats (vendor scope) ───────────────────────────────────

class TestGroupFirstStats:
    """
    Un supervisor (uid distinto al vendedor) que ejecuta /stats en un grupo vinculado
    debe ver los stats del vendedor anclado, no los suyos ni un error.
    """

    def test_resolve_vendedor_for_group_returns_anchored_vendor(self):
        """resolve_vendedor_for_group devuelve id_vendedor del grupo, no del usuario."""
        sb_mock, chain = _make_sb_mock()

        # Mock get_group_binding (matcher) → vendedor 42
        binding_mock = MagicMock(return_value={
            "id_vendedor_v2": 42,
            "binding_status": "linked",
            "nombre_erp": "JUAN PEREZ",
        })

        # Mock vendedores tabla → activo
        def table_side(name):
            c = MagicMock()
            c.select.return_value = c
            c.eq.return_value = c
            c.limit.return_value = c
            if "vendedores_v2" in str(name):
                c.execute.return_value = MagicMock(data=[{"id_vendedor": 42}])
            elif name == "vendedores_perfil":
                c.execute.return_value = MagicMock(data=[])
            else:
                c.execute.return_value = MagicMock(data=[{"id_vendedor_erp": None}])
            return c

        sb_mock.table.side_effect = table_side

        with patch("core.helpers.sb", sb_mock), \
             patch("core.telegram_group_matcher.get_group_binding", binding_mock):
            from core.helpers import resolve_vendedor_for_group
            result = resolve_vendedor_for_group(dist_id=3, telegram_chat_id=999888)

        assert result == 42, f"Esperado 42, got {result}"

    def test_resolve_returns_none_when_unlinked(self):
        """Sin binding, retorna None y el bot cae al flujo legacy."""
        sb_mock, chain = _make_sb_mock()

        binding_mock = MagicMock(return_value=None)
        chain.execute.return_value = MagicMock(data=[{"id_vendedor_erp": None}])

        with patch("core.helpers.sb", sb_mock), \
             patch("core.telegram_group_matcher.get_group_binding", binding_mock):
            from core.helpers import resolve_vendedor_for_group
            result = resolve_vendedor_for_group(dist_id=3, telegram_chat_id=-100111)

        assert result is None

    def test_resolve_falls_back_to_fuerza_ventas_binding_table(self):
        """Portal FV: vendedores_telegram_binding.telegram_group_id sin grupos.id_vendedor_v2."""
        sb_mock, chain = _make_sb_mock()
        binding_mock = MagicMock(return_value={"id_vendedor_v2": None, "binding_status": "unlinked"})

        def table_side(name):
            c = MagicMock()
            c.select.return_value = c
            c.eq.return_value = c
            c.not_.is_.return_value = c
            c.limit.return_value = c
            if name == "vendedores_telegram_binding":
                c.execute.return_value = MagicMock(data=[{"id_vendedor_v2": 77}])
            elif "vendedores_v2" in str(name):
                c.execute.return_value = MagicMock(data=[{"id_vendedor": 77}])
            elif name == "vendedores_perfil":
                c.execute.return_value = MagicMock(data=[])
            else:
                c.execute.return_value = MagicMock(data=[])
            return c

        sb_mock.table.side_effect = table_side

        with patch("core.helpers.sb", sb_mock), \
             patch("core.telegram_group_matcher.get_group_binding", binding_mock):
            from core.helpers import resolve_vendedor_for_group
            result = resolve_vendedor_for_group(dist_id=3, telegram_chat_id=-100222333)

        assert result == 77

    def test_vendor_inactive_returns_none(self):
        """Si el vendor anclado está inactivo en ERP, no usarlo."""
        sb_mock, chain = _make_sb_mock()

        binding_mock = MagicMock(return_value={"id_vendedor_v2": 42, "binding_status": "linked"})

        def table_side(name):
            c = MagicMock()
            c.select.return_value = c
            c.eq.return_value = c
            c.limit.return_value = c
            if "vendedores_v2" in str(name):
                c.execute.return_value = MagicMock(data=[{"id_vendedor": 42}])
            elif name == "vendedores_perfil":
                c.execute.return_value = MagicMock(data=[{"activo": False}])
            else:
                c.execute.return_value = MagicMock(data=[])
            return c

        sb_mock.table.side_effect = table_side

        with patch("core.helpers.sb", sb_mock), \
             patch("core.telegram_group_matcher.get_group_binding", binding_mock):
            from core.helpers import resolve_vendedor_for_group
            result = resolve_vendedor_for_group(dist_id=3, telegram_chat_id=999)

        assert result is None, "Vendor inactivo no debe usarse"


# ── Tests: regresión exhibicion_aggregate ────────────────────────────────────

class TestExhibicionAggregateRegression:
    """
    Regresión: dos integrantes del mismo vendedor ERP en un grupo
    deben contar como 1 punto, no 2.
    """

    def test_two_integrantes_same_vendor_count_as_one(self):
        """
        Dado dos id_integrante con el mismo id_vendedor_v2,
        la función aggregate debe consolidar bajo un único vendor.
        """
        from core.exhibicion_aggregate import aggregate_exhibicion_counts_vendor_scope

        # Dos exhibiciones del mismo vendedor (mismo cliente, mismo día)
        exhibiciones = [
            {
                "id_exhibicion": 1,
                "id_integrante": 10,
                "id_cliente_pdv": 5,
                "id_cliente": 5,
                "timestamp_subida": "2026-05-01T10:00:00",
                "estado": "aprobado",
                "telegram_group_id": 999,
            },
            {
                "id_exhibicion": 2,
                "id_integrante": 11,  # distinto integrante, mismo vendor
                "id_cliente_pdv": 5,
                "id_cliente": 5,
                "timestamp_subida": "2026-05-01T14:00:00",
                "estado": "aprobado",
                "telegram_group_id": 999,
            },
        ]
        # Mapa: ambos integrantes → mismo vendor 42
        integrante_to_vendor = {10: 42, 11: 42}

        result = aggregate_exhibicion_counts_vendor_scope(exhibiciones, integrante_to_vendor)

        vendor_data = result.get(42, {})
        total = vendor_data.get("total_logicas", 0)
        assert total == 1, (
            f"Dos integrantes del mismo vendor + mismo cliente + mismo día = 1 logica, got {total}"
        )
