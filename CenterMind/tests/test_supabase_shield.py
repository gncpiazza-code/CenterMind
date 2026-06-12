# -*- coding: utf-8 -*-
import time

import pytest

from core.supabase_shield import ShieldPriority, ShieldState, SupabaseShield


@pytest.fixture
def fresh_shield():
    return SupabaseShield()


def test_healthy_allows_all(fresh_shield):
    assert not fresh_shield.should_shed(ShieldPriority.CRITICAL)
    assert not fresh_shield.should_shed(ShieldPriority.NORMAL)
    assert not fresh_shield.should_shed(ShieldPriority.BACKGROUND)


def test_degraded_sheds_background_only(fresh_shield):
    for _ in range(3):
        fresh_shield.record_outcome(ok=False, latency_ms=100, error="timeout")
    assert fresh_shield.status()["state"] == ShieldState.DEGRADED.value
    assert not fresh_shield.should_shed(ShieldPriority.CRITICAL)
    assert not fresh_shield.should_shed(ShieldPriority.NORMAL)
    assert fresh_shield.should_shed(ShieldPriority.BACKGROUND)


def test_open_sheds_normal_and_background(fresh_shield):
    for _ in range(6):
        fresh_shield.record_outcome(ok=False, latency_ms=100, error="timeout")
    assert fresh_shield.status()["state"] == ShieldState.OPEN.value
    assert not fresh_shield.should_shed(ShieldPriority.CRITICAL)
    assert fresh_shield.should_shed(ShieldPriority.NORMAL)
    assert fresh_shield.should_shed(ShieldPriority.BACKGROUND)


def test_open_recovers_after_cooldown(fresh_shield):
    for _ in range(6):
        fresh_shield.record_outcome(ok=False, latency_ms=100, error="timeout")
    fresh_shield._open_until = time.monotonic() - 1
    fresh_shield._outcomes.clear()
    fresh_shield.record_outcome(ok=True, latency_ms=50)
    assert fresh_shield.status()["state"] == ShieldState.HEALTHY.value


def test_background_job_guard(fresh_shield):
    for _ in range(6):
        fresh_shield.record_outcome(ok=False, latency_ms=100, error="timeout")
    assert not fresh_shield.allow_background_job("test_job")
    assert fresh_shield.status()["shed_count"] == 1
