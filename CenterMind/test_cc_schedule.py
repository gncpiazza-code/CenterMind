"""Tests horario próxima corrida CC (AR)."""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from core.cc_schedule import AR_TZ, next_cc_run_ar


def test_next_cc_run_after_morning_slot():
    now = datetime(2026, 5, 30, 10, 0, tzinfo=AR_TZ)
    nxt = next_cc_run_ar(now)
    assert nxt.hour == 14 and nxt.minute == 30


def test_next_cc_run_before_morning():
    now = datetime(2026, 5, 30, 6, 0, tzinfo=AR_TZ)
    nxt = next_cc_run_ar(now)
    assert nxt.hour == 7 and nxt.minute == 0
