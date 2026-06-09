# -*- coding: utf-8 -*-
from core.telegram_html import message_needs_linebreak_repair, repair_telegram_message_html


def test_br_to_newline():
    assert repair_telegram_message_html("Línea 1<br>Línea 2") == "Línea 1\nLínea 2"


def test_br_self_closing():
    assert repair_telegram_message_html("A<br/>B<br />C") == "A\nB\nC"


def test_strips_zwsp():
    assert repair_telegram_message_html("Hola\u200b mundo") == "Hola mundo"


def test_preserves_allowed_tags():
    out = repair_telegram_message_html("<b>Título</b><br><i>Sub</i>")
    assert out == "<b>Título</b>\n<i>Sub</i>"


def test_needs_repair_detects_br():
    assert message_needs_linebreak_repair("texto<br>más") is True
    assert message_needs_linebreak_repair("texto\nmás") is False


def test_literal_backslash_n_from_bad_sql_seed():
    raw = "Línea 1\\nLínea 2\\n\\nLínea 3"
    assert repair_telegram_message_html(raw) == "Línea 1\nLínea 2\n\nLínea 3"


def test_needs_repair_detects_literal_backslash_n():
    assert message_needs_linebreak_repair("a\\nb") is True


def test_repair_preserves_leading_and_trailing_newlines():
    raw = "\n\n📊 <b>Título</b>\n\n"
    assert repair_telegram_message_html(raw) == raw
    row = "{emoji} <b>{v}</b>\n   ⭐ Puntos: {p}\n\n"
    assert repair_telegram_message_html(row) == row


def test_repair_removes_stray_space_after_newline_not_bullets():
    raw = "Línea 1\n 🧑 emoji\n   • bullet"
    assert repair_telegram_message_html(raw) == "Línea 1\n🧑 emoji\n   • bullet"
