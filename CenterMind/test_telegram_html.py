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
