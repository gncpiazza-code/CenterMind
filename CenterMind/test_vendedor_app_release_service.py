# -*- coding: utf-8 -*-
"""Tests releases APK SHELFYAPP."""
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(__file__))

from services.vendedor_app_release_service import get_latest_release, publish_release_apk


class _ChainStub:
    def __init__(self, data=None):
        self._data = data or []
        self._updates = []

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self._updates.append(payload)
        return self

    def insert(self, payload):
        self._insert_payload = payload
        return self

    def execute(self):
        if hasattr(self, "_insert_payload"):
            row = dict(self._insert_payload)
            row["id"] = 1
            return type("R", (), {"data": [row]})()
        return type("R", (), {"data": self._data})()


class _StorageBucketStub:
    def __init__(self):
        self.uploads = []
        self.signed = {}

    def upload(self, path, data, file_options=None):
        self.uploads.append((path, data, file_options))

    def create_signed_url(self, path, ttl):
        return {"signedURL": f"https://signed.example/{path}?ttl={ttl}"}


class _StorageStub:
    def __init__(self):
        self.bucket = _StorageBucketStub()

    def from_(self, name):
        assert name == "shelfy-app-releases"
        return self.bucket


class _SbReleaseStub:
    def __init__(self, latest_rows=None):
        self._latest = latest_rows or []
        self.storage = _StorageStub()

    def table(self, name):
        assert name == "vendedor_app_releases"
        return _ChainStub(self._latest)


def test_get_latest_no_update():
    sb = _SbReleaseStub(
        [
            {
                "version_name": "1.0.3",
                "build_number": 7,
                "storage_path": "tabaco/x.apk",
                "changelog": "fix",
                "mandatory": False,
                "min_supported_build": None,
                "published_at": "2026-06-11T00:00:00Z",
            }
        ]
    )
    out = get_latest_release(sb, flavor="tabaco", build_number=7)
    assert out["update_available"] is False
    assert out["latest_build"] == 7


def test_get_latest_update_available():
    sb = _SbReleaseStub(
        [
            {
                "version_name": "1.0.3",
                "build_number": 8,
                "storage_path": "tabaco/shelfy-tabaco-b8.apk",
                "changelog": "patron + OTA",
                "mandatory": False,
                "min_supported_build": None,
                "published_at": "2026-06-11T00:00:00Z",
            }
        ]
    )
    out = get_latest_release(sb, flavor="tabaco", build_number=7)
    assert out["update_available"] is True
    assert out["build_number"] == 8
    assert "signed.example" in out["download_url"]


def test_publish_release_apk():
    sb = _SbReleaseStub()
    out = publish_release_apk(
        sb,
        flavor="tabaco",
        version_name="1.0.3",
        build_number=8,
        apk_bytes=b"PK fake apk",
        changelog="test",
        published_by="agent",
    )
    assert out["ok"] is True
    assert out["build_number"] == 8
    assert sb.storage.bucket.uploads[0][0] == "tabaco/shelfy-tabaco-b8.apk"


def test_invalid_flavor():
    sb = _SbReleaseStub()
    with pytest.raises(HTTPException) as exc:
        get_latest_release(sb, flavor="../evil", build_number=1)
    assert exc.value.status_code == 400
