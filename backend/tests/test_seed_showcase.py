"""Demodatan för visning: en klass med sex elever och tre månaders APL."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.contract import Contract
from app.models.placement import Placement, Workplace
from app.models.project import Project
from app.models.report import Report, ReportComment
from app.models.school import School
from app.models.school_class import SchoolClass
from scripts.seed_showcase import CLASS_NAME, SCHOOL, showcase


def test_showcase_replaces_classes_and_can_run_twice(db: Session) -> None:
    first = showcase(db)
    second = showcase(db)
    assert first == second
    school = db.scalar(select(School).where(School.name == SCHOOL))
    assert school is not None
    classes = db.scalars(select(SchoolClass).where(SchoolClass.school_id == school.id)).all()
    assert [c.name for c in classes] == [CLASS_NAME]
    assert len(classes[0].students) == 6
    in_class = Report.class_id == classes[0].id
    assert db.scalar(select(func.count(Report.id)).where(in_class)) == first["redovisningar"]
    assert first["redovisningar"] > 100
    attendance = (
        select(func.count(Attendance.id))
        .join(Placement, Placement.id == Attendance.placement_id)
        .join(Workplace, Workplace.id == Placement.workplace_id)
        .where(Workplace.school_id == school.id)
    )
    assert db.scalar(attendance) == first["närvarodagar"]
    comments = select(func.count(ReportComment.id)).join(Report).where(in_class)
    assert db.scalar(comments) == first["kommentarer"]
    # Fyra pågående projekt och ett avslutat. Tre av dem görs på ett företag med handledaren
    # inbjuden.
    projects = db.scalars(select(Project).where(Project.school_id == school.id)).all()
    assert len(projects) == 5
    assert sum(p.completed_at is not None for p in projects) == 1
    assert sum(len(p.supervisors) == 1 for p in projects) == 3
    # Ett kontrakt per elev: två klara, tre väntar och ett utkast. Hugos väntar på honom.
    contracts = db.scalars(select(Contract).where(Contract.school_id == school.id)).all()
    assert len(contracts) == 6
    assert sum(c.sent_at is None for c in contracts) == 1
    hugo = next(c for c in contracts if c.student.name == "Hugo Karlsson")
    assert {s.role: s.signed_at is not None for s in hugo.signatures}["student"] is False
    assert hugo.pdf.startswith(b"%PDF-")
    # Alla redovisningar hör till ett projekt.
    no_project = select(func.count(Report.id)).where(in_class, Report.project_id.is_(None))
    assert db.scalar(no_project) == 0
