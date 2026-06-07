# -*- coding: utf-8 -*-
from core.bot_message_catalog import (
    BOT_MESSAGES,
    build_flows_payload,
    get_default_message,
    merge_messages_for_api,
    normalize_message_key,
)


def test_normalize_aliases():
    assert normalize_message_key("bienvenida") == "start"
    assert normalize_message_key("ayuda") == "help"


def test_catalog_has_upload_flow():
    keys = {m.key for m in BOT_MESSAGES if m.flow_id == "carga_exhibicion"}
    assert "foto_recibida" in keys
    assert "upload_success" in keys


def test_merge_messages_includes_all_catalog():
    merged = merge_messages_for_api([])
    assert len(merged) == len(BOT_MESSAGES)
    assert merged[0]["message_key"] == "start"
    assert merged[0]["body_html"] == get_default_message("start")


def test_build_flows_payload_structure():
    flows = build_flows_payload({})
    assert len(flows) >= 6
    upload = next(f for f in flows if f["flow_id"] == "carga_exhibicion")
    assert len(upload["nodes"]) >= 10
    assert upload["nodes"][0]["message_key"] == "foto_recibida"
