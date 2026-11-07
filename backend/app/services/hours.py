"""Vilka tider som gäller för en elev (idé 12, Texas 2026-11-07).

Har praktikplatsen egna tider gäller de, annars företagets. Eleven kan checka in från
`EARLY_CHECK_IN` innan dagen börjar.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import SCHOOL_TZ
from app.models.hours import PlacementHours, WorkplaceHours
from app.models.placement import Placement

EARLY_CHECK_IN = timedelta(minutes=10)


def hours_for_placement(
    db: Session, placement: Placement
) -> tuple[list[PlacementHours] | list[WorkplaceHours], bool]:
    """Tiderna som gäller och om de är elevens egna."""
    own = list(
        db.scalars(select(PlacementHours).where(PlacementHours.placement_id == placement.id))
    )
    if own:
        return own, True
    company = list(
        db.scalars(
            select(WorkplaceHours).where(WorkplaceHours.workplace_id == placement.workplace_id)
        )
    )
    return company, False


def day_start(db: Session, placement: Placement, day: date) -> datetime | None:
    """När dagen börjar för eleven, i svensk tid, eller None om det inte finns någon tid."""
    rows, _ = hours_for_placement(db, placement)
    row = next((r for r in rows if r.weekday == day.weekday()), None)
    if row is None:
        return None
    return datetime.combine(day, row.start_time, tzinfo=SCHOOL_TZ)
