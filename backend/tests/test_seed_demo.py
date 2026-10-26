from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement, Workplace
from app.models.report import FormVersion
from app.models.school import School
from app.models.school_class import SchoolClass
from app.models.template import QuestionTemplate
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

    classes = db.scalars(select(SchoolClass).join(School).where(School.name == "Kramforsskolan"))
    assert sorted((c.name, len(c.students), len(c.teachers)) for c in classes) == [
        ("EE21", 5, 1),
        ("EE22", 5, 1),
    ]


def test_seed_gives_every_class_a_published_form(db: Session) -> None:
    seed(db)
    classes = db.scalars(select(SchoolClass).join(School).where(School.name == "Kramforsskolan"))
    for school_class in classes:
        version = db.scalar(select(FormVersion).where(FormVersion.class_id == school_class.id))
        assert version is not None
        assert len(version.questions) == 6
        assert school_class.report_due_weekdays == [1, 4]


def test_seed_places_ee22_students_with_supervisors(db: Session) -> None:
    seed(db)
    ee22 = db.scalar(
        select(SchoolClass)
        .join(School)
        .where(School.name == "Kramforsskolan", SchoolClass.name == "EE22")
    )
    placements = list(
        db.scalars(select(Placement).where(Placement.student_id.in_([s.id for s in ee22.students])))
    )
    assert len(placements) == 5
    for placement in placements:
        assert placement.supervisor in placement.workplace.supervisors
        assert placement.workplace.school_id == ee22.school_id
    # Gustav Lindahl har elever på båda skolorna.
    gustav = db.scalar(select(User).where(User.email == "handledare@demo.firstflow.se"))
    schools = set(
        db.scalars(
            select(Workplace.school_id)
            .join(Placement, Placement.workplace_id == Workplace.id)
            .where(Placement.supervisor_id == gustav.id)
        )
    )
    assert len(schools) == 2


def test_seed_gives_every_school_one_school_template(db: Session) -> None:
    seed(db)
    seed(db)
    for school in db.scalars(select(School)):
        templates = db.scalars(
            select(QuestionTemplate).where(QuestionTemplate.school_id == school.id)
        ).all()
        assert [(t.name, t.owner_id, len(t.questions)) for t in templates] == [
            ("Kort veckoredovisning", None, 4)
        ]


def test_seed_gives_ee22_attendance_once(db: Session) -> None:
    seed(db)
    first = db.scalar(select(func.count(Attendance.id)))
    seed(db)
    assert db.scalar(select(func.count(Attendance.id))) == first
    assert first > 0
    statuses = set(db.scalars(select(Attendance.status)))
    assert statuses == {AttendanceStatus.PRESENT}
