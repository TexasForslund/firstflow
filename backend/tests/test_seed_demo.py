from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.user import User, UserRole
from scripts.seed_demo import seed


def test_seed_creates_every_role_and_is_repeatable(db: Session) -> None:
    created = seed(db)
    assert created
    assert seed(db) == []  # andra körningen skapar inget

    roles = set(db.scalars(select(User.role).where(User.email.like("%@demo.firstflow.se"))))
    assert roles == set(UserRole)
    schools = set(db.scalars(select(School.name)))
    assert {"Kramforsskolan", "Umeåskolan"} <= schools
    per_school = dict(
        db.execute(
            select(School.name, func.count(User.id))
            .join(User, User.school_id == School.id)
            .where(School.name.in_(["Kramforsskolan", "Umeåskolan"]))
            .group_by(School.name)
        ).all()
    )
    assert per_school == {"Kramforsskolan": 14, "Umeåskolan": 14}
