"""Datum i skolornas tidszon.

Alla skolor ligger i Sverige. "I dag" och om en redovisning är sen räknas i svensk tid,
inte i serverns tidszon.
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

SCHOOL_TZ = ZoneInfo("Europe/Stockholm")


def now() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    return datetime.now(SCHOOL_TZ).date()


def local_date(moment: datetime) -> date:
    return moment.astimezone(SCHOOL_TZ).date()
