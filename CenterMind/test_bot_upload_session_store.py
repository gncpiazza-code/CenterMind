"""Persistencia de sesiones de carga del bot."""
from core.bot_upload_session_store import _is_expired


def test_is_expired_past():
    assert _is_expired("2020-01-01T00:00:00+00:00")


def test_is_expired_future():
    assert not _is_expired("2099-01-01T00:00:00+00:00")
