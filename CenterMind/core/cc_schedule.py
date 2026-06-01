"""Horarios RPA de cuentas corrientes (AR) — scheduler 07:00, 14:30 y 20:00."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
CC_RUN_SLOTS_AR = ((7, 0), (14, 30), (20, 0))


def next_cc_run_ar(now: datetime | None = None) -> datetime:
    """Próxima corrida programada de CC en hora Argentina."""
    now = now or datetime.now(AR_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=AR_TZ)
    else:
        now = now.astimezone(AR_TZ)

    for hour, minute in CC_RUN_SLOTS_AR:
        slot = datetime.combine(now.date(), time(hour, minute), AR_TZ)
        if slot > now:
            return slot

    tomorrow: date = now.date() + timedelta(days=1)
    return datetime.combine(tomorrow, time(*CC_RUN_SLOTS_AR[0]), AR_TZ)
