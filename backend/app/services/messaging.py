"""Vem som får skriva till vem i Meddelanden, och gruppen för en praktikplats (B11).

Regler (Texas, 2026-11-02):
- Läraren skriver till sina elever och deras handledare.
- Handledaren skriver till sina elever och deras lärare.
- Eleven skriver till sina lärare, sina handledare och skolans SYV.
- SYV skriver till skolans elever.
Den som är med i ett samtal kan alltid svara i det.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.message import Conversation, ConversationMember
from app.models.placement import Placement, Workplace, workplace_supervisors
from app.models.school_class import SchoolClass, class_students, class_teachers, teacher_students
from app.models.user import User, UserRole


@dataclass
class Contact:
    user: User
    # T.ex. "Elev · EL23" eller "Handledare · Kramfors El & Data".
    description: str


def first_name(user: User) -> str:
    return user.name.split(" ")[0]


def teachers_of(db: Session, student_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, set[uuid.UUID]]:
    """Elevernas lärare: lärare i elevens klasser och lärare som är kopplade till eleven."""
    ids = list(student_ids)
    result: dict[uuid.UUID, set[uuid.UUID]] = {i: set() for i in ids}
    if not ids:
        return result
    for student_id, teacher_id in db.execute(
        select(class_students.c.student_id, class_teachers.c.teacher_id)
        .join(class_teachers, class_teachers.c.class_id == class_students.c.class_id)
        .where(class_students.c.student_id.in_(ids))
    ):
        result[student_id].add(teacher_id)
    for student_id, teacher_id in db.execute(
        select(teacher_students.c.student_id, teacher_students.c.teacher_id).where(
            teacher_students.c.student_id.in_(ids)
        )
    ):
        result[student_id].add(teacher_id)
    return result


def _students_of_teacher(db: Session, teacher: User) -> set[uuid.UUID]:
    in_classes = (
        select(class_students.c.student_id)
        .join(class_teachers, class_teachers.c.class_id == class_students.c.class_id)
        .where(class_teachers.c.teacher_id == teacher.id)
    )
    linked = select(teacher_students.c.student_id).where(
        teacher_students.c.teacher_id == teacher.id
    )
    return set(db.scalars(in_classes)) | set(db.scalars(linked))


def contact_ids(db: Session, user: User) -> set[uuid.UUID]:
    """Id:n för dem användaren får starta ett samtal med."""
    ids: set[uuid.UUID] = set()
    if user.role == UserRole.TEACHER:
        students = _students_of_teacher(db, user)
        ids |= students
        if students:
            ids |= set(
                db.scalars(
                    select(Placement.supervisor_id).where(Placement.student_id.in_(students))
                )
            )
    elif user.role == UserRole.SUPERVISOR:
        students = set(
            db.scalars(select(Placement.student_id).where(Placement.supervisor_id == user.id))
        )
        ids |= students
        for teachers in teachers_of(db, students).values():
            ids |= teachers
    elif user.role == UserRole.STUDENT:
        ids |= teachers_of(db, [user.id])[user.id]
        ids |= set(
            db.scalars(select(Placement.supervisor_id).where(Placement.student_id == user.id))
        )
        ids |= set(
            db.scalars(
                select(User.id).where(User.role == UserRole.SYV, User.school_id == user.school_id)
            )
        )
    elif user.role == UserRole.SYV:
        ids |= set(
            db.scalars(
                select(User.id).where(
                    User.role == UserRole.STUDENT, User.school_id == user.school_id
                )
            )
        )
    ids.discard(user.id)
    return ids


def describe(db: Session, users: list[User]) -> dict[uuid.UUID, str]:
    """En kort beskrivning per person: roll och klass eller företag."""
    ids = [u.id for u in users]
    classes: dict[uuid.UUID, list[str]] = {}
    for student_id, name in db.execute(
        select(class_students.c.student_id, SchoolClass.name)
        .join(SchoolClass, SchoolClass.id == class_students.c.class_id)
        .where(class_students.c.student_id.in_(ids))
        .order_by(SchoolClass.name)
    ):
        classes.setdefault(student_id, []).append(name)
    companies: dict[uuid.UUID, str] = {}
    for supervisor_id, name in db.execute(
        select(workplace_supervisors.c.supervisor_id, Workplace.name)
        .join(Workplace, Workplace.id == workplace_supervisors.c.workplace_id)
        .where(workplace_supervisors.c.supervisor_id.in_(ids))
    ):
        companies[supervisor_id] = name
    labels = {
        UserRole.STUDENT: "Elev",
        UserRole.TEACHER: "Lärare",
        UserRole.SUPERVISOR: "Handledare",
        UserRole.SYV: "SYV",
        UserRole.PRINCIPAL: "Rektor",
        UserRole.SCHOOL_ADMIN: "Skoladministratör",
        UserRole.SUPERADMIN: "Superadmin",
    }
    result: dict[uuid.UUID, str] = {}
    for u in users:
        extra = (
            ", ".join(classes.get(u.id, []))
            if u.role == UserRole.STUDENT
            else companies.get(u.id, "")
        )
        result[u.id] = f"{labels[u.role]} · {extra}" if extra else labels[u.role]
    return result


def contacts(db: Session, user: User) -> list[Contact]:
    ids = contact_ids(db, user)
    if not ids:
        return []
    query = select(User).where(User.id.in_(ids), User.is_active).order_by(User.name)
    if user.school_id is not None:
        # Personer med skola ska gå på användarens skola. Handledare har ingen skola och når
        # bara sina egna elever och deras lärare.
        query = query.where(or_(User.school_id.is_(None), User.school_id == user.school_id))
    people = list(db.scalars(query))
    descriptions = describe(db, people)
    return [Contact(p, descriptions[p.id]) for p in people]


def ensure_placement_group(db: Session, placement: Placement) -> Conversation:
    """Gruppen för praktikplatsen: eleven, handledaren och elevens lärare.

    Skapas när eleven får en praktikplats (Texas, 2026-11-02). Saknas någon i gruppen, t.ex. en
    ny lärare, läggs hen till.
    """
    conversation = db.scalar(select(Conversation).where(Conversation.placement_id == placement.id))
    if conversation is None:
        conversation = Conversation(
            name=f"{first_name(placement.student)} på {placement.workplace.name}"[:120],
            is_group=True,
            placement_id=placement.id,
        )
        db.add(conversation)
    wanted = {placement.student_id, placement.supervisor_id}
    wanted |= teachers_of(db, [placement.student_id])[placement.student_id]
    present = {m.user_id for m in conversation.members}
    for user_id in wanted - present:
        conversation.members.append(ConversationMember(user_id=user_id))
    return conversation
