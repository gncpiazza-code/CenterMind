# -*- coding: utf-8 -*-
"""Tests para composición de mensajes dinámicos del bot."""
from unittest.mock import MagicMock

from core.bot_dynamic_messages import (
    build_objetivos_message,
    build_ranking_result_message,
    build_stats_message,
    build_upload_rich_message,
)
from core.bot_message_catalog import BOT_MESSAGES


def test_catalog_has_dynamic_parts():
    dynamic = [m for m in BOT_MESSAGES if m.node_type == "dynamic_part"]
    keys = {m.key for m in dynamic}
    assert "stats_header" in keys
    assert "ranking_result_row" in keys
    assert "objetivos_item" in keys
    assert "upload_rich_header" in keys
    assert len(dynamic) >= 20


def test_build_stats_message_composes_header_footer():
    sb = MagicMock()
    msg = build_stats_message(
        sb,
        nombre_dist="Tabaco Test",
        display_name="Juan Pérez",
        mes_actual_nombre="Junio",
        mes_anterior_nombre="Mayo",
        counts_actual={
            "aprobadas": 10,
            "destacadas": 2,
            "rechazadas": 1,
            "pendientes": 3,
            "puntos": 25,
            "total_logicas": 16,
        },
        counts_prev={
            "aprobadas": 8,
            "destacadas": 1,
            "rechazadas": 0,
            "pendientes": 2,
            "puntos": 18,
            "total_logicas": 11,
        },
        ranking_pos=3,
        ranking_total=12,
        ranking_delta=1,
    )
    assert "Tus Estadísticas" in msg
    assert "Tabaco Test" in msg
    assert "Juan Pérez" in msg
    assert "Mes Actual (Junio)" in msg
    assert "Mes Anterior (Mayo)" in msg
    assert "#3 de 12" in msg
    assert "únicas por cliente" in msg.lower() or "Únicas" in msg


def test_build_ranking_result_message_rows():
    sb = MagicMock()
    msg = build_ranking_result_message(
        sb,
        nombre_dist="Aloma",
        mes_nombre="Junio",
        year=2026,
        entries=[
            {
                "vendedor": "Ana",
                "puntos": 40,
                "aprobadas": 10,
                "destacadas": 5,
                "sucursal": "Norte",
                "delta": 1,
            },
            {
                "vendedor": "Luis",
                "puntos": 30,
                "aprobadas": 8,
                "destacadas": 2,
                "sucursal": "",
                "delta": -1,
            },
        ],
    )
    assert "RANKING JUNIO 2026" in msg
    assert "Ana" in msg
    assert "Luis" in msg
    assert "🥇" in msg
    assert "🥈" in msg


def test_build_objetivos_message_with_overflow():
    sb = MagicMock()
    items = ["\n⏳ <b>Exhibición</b>\n   • Progreso: 5/10 (50%)"] * 3
    msg = build_objetivos_message(
        sb,
        vendedor_nombre="Vendedor X",
        item_lines=items,
        total_count=10,
        shown_count=3,
    )
    assert "Objetivos de Vendedor X" in msg
    assert "Mostrando 3 de 10" in msg


def test_build_upload_rich_message_minimal():
    sb = MagicMock()
    msg = build_upload_rich_message(
        sb,
        uploader_name="María",
        nro_cliente="12345",
        cliente_nombre="Kiosco Central",
        tipo_pdv="Kiosco",
        estado_label="⏳ Pendiente",
    )
    assert "Exhibición registrada" in msg
    assert "María" in msg
    assert "12345" in msg
    assert "Kiosco Central" in msg
