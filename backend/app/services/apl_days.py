"""Klassens APL-dagar (Texas, 2026-10-30): veckodagarna eleverna är på APL och checkar in.

Veckodagar räknas som i Python: 0 = måndag … 6 = söndag. En elev utan klass har måndag–fredag.
Går eleven i flera klasser gäller alla klassernas APL-dagar.
"""

from collections.abc import Iterable
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.school_class import SchoolClass, class_students

DEFAULT_APL_WEEKDAYS = frozenset({0, 1, 2, 3, 4})


def class_apl_weekdays(school_class: SchoolClass | None) -> frozenset[int]:
    if school_class is None:
        return DEFAULT_APL_WEEKDAYS
    return frozenset(school_class.apl_weekdays)


def student_apl_weekdays(db: Session, student_ids: Iterable[UUID]) -> dict[UUID, frozenset[int]]:
    """APL-dagarna per elev, från elevernas klasser."""
    ids = list(student_ids)
    days: dict[UUID, set[int]] = {}
    for student_id, weekdays in db.execute(
        select(class_students.c.student_id, SchoolClass.apl_weekdays)
        .join(SchoolClass, SchoolClass.id == class_students.c.class_id)
        .where(class_students.c.student_id.in_(ids))
    ):
        days.setdefault(student_id, set()).update(weekdays)
    return {i: frozenset(days[i]) if i in days else DEFAULT_APL_WEEKDAYS for i in ids}


def count_apl_days(start: date, end: date, weekdays: frozenset[int]) -> int:
    """Antal APL-dagar från och med start till och med end."""
    if end < start or not weekdays:
        return 0
    days = (end - start).days + 1
    full_weeks, rest = divmod(days, 7)
    count = full_weeks * len(weekdays)
    for i in range(rest):
        if (start + timedelta(days=full_weeks * 7 + i)).weekday() in weekdays:
            count += 1
    return count
