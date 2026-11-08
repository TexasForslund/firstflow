"""Mål från läroplanen (idé 10, Texas 2026-10-30). Se `app/models/goal.py`.

- Skolans mål: lärare och skoladmin ser och lägger till mål på sin skola.
- Klassens mål från läroplanen skapas under klassens läroplan (`syllabus.py`). Frågorna kan
  använda skolans mål och klassens.
- Projektets taggar är mål. En ny tagg blir ett nytt mål på skolan.
- Underlag: svar som läraren har kopplat till ett mål i frågorna (t.ex. Ja → Kundkontakt).
  Läraren ser underlaget per elev och per projekt.
"""

from collections import defaultdict
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select, true
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_roles, require_same_school
from app.api.routes.classes import get_accessible_class
from app.api.routes.students import get_student_for
from app.db.session import DbSession
from app.models.goal import Goal
from app.models.report import ClassForm, FormVersion, Report, ReportStatus
from app.models.school_class import class_students, class_teachers
from app.models.user import User, UserRole
from app.services.goal_evidence import evidence

router = APIRouter(prefix="/goals", tags=["goals"])
student_router = APIRouter(prefix="/students/{student_id}/goals", tags=["goals"])

Staff = Annotated[User, Depends(require_roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN))]
Teacher = Annotated[User, Depends(require_roles(UserRole.TEACHER))]

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class GoalRead(BaseModel):
    id: UUID
    name: str
    curriculum: str | None = Field(description="Vilken del av läroplanen målet gäller")
    group: str | None = Field(
        default=None, description='Klassens mål: ämnet och nivån, t.ex. "Elteknik, nivå 1"'
    )
    class_id: UUID | None = Field(default=None, description="Saknas för skolans mål")


class GoalCreate(BaseModel):
    name: Name
    curriculum: str | None = Field(default=None, max_length=2000)


class GoalUpdate(BaseModel):
    curriculum: str | None = Field(default=None, max_length=2000)


class FollowUpRead(BaseModel):
    question: str
    text: str


class EvidenceRead(BaseModel):
    """En redovisning som visar målet, med följdfrågans svar om det finns."""

    report_id: UUID
    date: date
    question: str = Field(description="Frågan som visar målet")
    answer: str = Field(description="Svaret som visar målet, t.ex. Ja")
    follow_up: FollowUpRead | None


class GoalCount(BaseModel):
    goal: GoalRead
    count: int = Field(description="Antal redovisningar som visar målet")
    evidence: list[EvidenceRead] = Field(description="Redovisningarna, senaste först")


def level_label(subject_name: str, level_name: str) -> str:
    """ "Elteknik, nivå 1" (Gy25) eller "Elektroteknik: Elektromekanik" (Gy11)."""
    if level_name.startswith("Nivå "):
        return f"{subject_name}, {level_name.lower()}"
    return f"{subject_name}: {level_name}"


def read_goal(goal: Goal) -> GoalRead:
    if goal.class_id is None:
        return GoalRead(id=goal.id, name=goal.name, curriculum=goal.curriculum)
    return GoalRead(
        id=goal.id,
        name=goal.name,
        curriculum=goal.content,
        group=level_label(goal.subject_name or "", goal.level_name or ""),
        class_id=goal.class_id,
    )


def class_goals(db: Session, class_id: UUID) -> list[Goal]:
    """Klassens mål från läroplanen, ordnade efter ämne och nivå."""
    return list(
        db.scalars(
            select(Goal)
            .where(Goal.class_id == class_id)
            .order_by(Goal.subject_name, Goal.level_code, Goal.created_at)
        )
    )


def goal_ids_in_questions(db: Session, class_id: UUID) -> set[UUID]:
    """Målen som klassens frågor använder eller har använt: i utkastet och i alla publicerade
    versioner. De är underlag för eleverna och får inte tas bort."""
    lists = [*db.scalars(select(FormVersion.questions).where(FormVersion.class_id == class_id))]
    draft = db.get(ClassForm, class_id)
    if draft is not None:
        lists.append(draft.draft)
    return {
        UUID(str(rule["goal_id"]))
        for questions in lists
        for question in questions
        for rule in question.get("goals", [])
    }


def goals_named(db: Session, school_id: UUID, names: list[str]) -> list[Goal]:
    """Skolans mål med namnen, i samma ordning. Mål som inte finns skapas."""
    goals: list[Goal] = []
    for name in names:
        goal = db.scalar(
            select(Goal).where(
                Goal.school_id == school_id,
                Goal.class_id.is_(None),
                func.lower(Goal.name) == name.lower(),
            )
        )
        if goal is None:
            goal = Goal(school_id=school_id, name=name)
            db.add(goal)
            db.flush()
        if goal not in goals:
            goals.append(goal)
    return goals


def school_goal_ids(db: Session, school_id: UUID) -> set[UUID]:
    return set(db.scalars(select(Goal.id).where(Goal.school_id == school_id)))


def goal_counts(
    db: Session, reports: list[Report], goal_ids: set[UUID] | None = None
) -> dict[tuple[UUID, UUID], list[EvidenceRead]]:
    """Underlag per mål och elev: {(goal_id, student_id): [underlag, senaste först]}."""
    found: dict[tuple[UUID, UUID], list[tuple[Report, EvidenceRead]]] = defaultdict(list)
    for item in evidence(reports):
        if goal_ids is None or item.goal_id in goal_ids:
            read = EvidenceRead(
                report_id=item.report.id,
                date=item.report.due_date,
                question=item.question,
                answer=item.answer,
                follow_up=FollowUpRead(question=item.follow_up.question, text=item.follow_up.text)
                if item.follow_up
                else None,
            )
            found[(item.goal_id, item.report.student_id)].append((item.report, read))
    return {
        key: [read for _, read in sorted(items, key=lambda x: x[0].submitted_at, reverse=True)]
        for key, items in found.items()
    }


def _submitted(query):
    return query.where(Report.status == ReportStatus.SUBMITTED).options(
        selectinload(Report.form_version), selectinload(Report.answers)
    )


@router.get("", response_model=list[GoalRead])
def list_goals(db: DbSession, user: Staff, class_id: UUID | None = None) -> list[GoalRead]:
    """Skolans mål i bokstavsordning. Med `class_id` först klassens mål från läroplanen."""
    if user.school_id is None:
        return []
    found = class_goals(db, get_accessible_class(db, user, class_id).id) if class_id else []
    found += db.scalars(
        select(Goal)
        .where(Goal.school_id == user.school_id, Goal.class_id.is_(None))
        .order_by(func.lower(Goal.name))
    )
    return [read_goal(g) for g in found]


@router.get("/for-students", response_model=list[GoalRead])
def goals_for_students(
    db: DbSession,
    user: Teacher,
    student_id: Annotated[list[UUID], Query()] = [],  # noqa: B006
) -> list[GoalRead]:
    """Klassens mål från läroplanen för klasserna som eleverna går i. Används för förslagen när
    läraren väljer projektets mål (idé 13, steg 4)."""
    students = [get_student_for(db, user, i).id for i in dict.fromkeys(student_id)]
    if not students:
        return []
    classes = select(class_students.c.class_id).where(class_students.c.student_id.in_(students))
    goals = db.scalars(
        select(Goal)
        .where(Goal.class_id.in_(classes))
        .order_by(Goal.subject_name, Goal.level_code, Goal.created_at)
    )
    return [read_goal(g) for g in goals]


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
def create_goal(body: GoalCreate, db: DbSession, user: Staff) -> GoalRead:
    """Lägger till ett mål på skolan. Finns det redan ett med samma namn svarar det med det."""
    if user.school_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    (goal,) = goals_named(db, user.school_id, [body.name])
    if body.curriculum is not None:
        goal.curriculum = body.curriculum.strip() or None
    db.commit()
    return read_goal(goal)


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal(goal_id: UUID, body: GoalUpdate, db: DbSession, user: Staff) -> GoalRead:
    """Ändrar vilken del av läroplanen målet gäller."""
    goal = db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Hittades inte")
    require_same_school(user, goal.school_id)
    if goal.class_id is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Målet kommer från läroplanen"
        )
    goal.curriculum = (body.curriculum or "").strip() or None
    db.commit()
    return read_goal(goal)


@student_router.get("", response_model=list[GoalCount])
def student_goals(student_id: UUID, db: DbSession, user: Teacher) -> list[GoalCount]:
    """Elevens underlag per mål, flest först. Samma redovisningar som elevsidan visar."""
    # Undviker cirkulär import: reports importerar inte goals.
    from app.api.routes.reports import _teaches_student_now

    student = get_student_for(db, user, student_id)
    taught = select(class_teachers.c.class_id).where(class_teachers.c.teacher_id == user.id)
    in_class = true() if _teaches_student_now(db, user, student.id) else Report.class_id.in_(taught)
    reports = list(
        db.scalars(_submitted(select(Report).where(Report.student_id == student.id, in_class)))
    )
    found = goal_counts(db, reports, school_goal_ids(db, student.school_id))
    goals = {g.id: g for g in db.scalars(select(Goal).where(Goal.id.in_([g for g, _ in found])))}
    result = [
        GoalCount(goal=read_goal(goals[goal_id]), count=len(items), evidence=items)
        for (goal_id, _), items in found.items()
    ]
    return sorted(result, key=lambda c: (-c.count, c.goal.name.lower()))
