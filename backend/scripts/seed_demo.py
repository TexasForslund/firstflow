"""Fyller databasen med demodata: två skolor med alla roller.

Kör från backend/ (eller i Docker: docker compose exec backend uv run python -m scripts.seed_demo):
    uv run python -m scripts.seed_demo

Alla demokonton har lösenordet demo-firstflow. Skriptet kan köras flera gånger:
konton och skolor som redan finns hoppas över. Det körs bara när ENVIRONMENT är
development eller test.
Varje skola får två klasser med fem elever var. Varje klass får ett publicerat formulär för
veckoredovisning, med redovisning tisdag och fredag. Varje skola får två arbetsplatser med
var sin handledare, och eleverna i EE22 är placerade där under en pågående period. Eleverna i
EE21 har ingen placering, så att det syns hur det ser ut innan läraren har placerat dem.
Eleverna i EE22 har närvaro sedan placeringen började, med en sjukdag och en elev som
slutat checka in.
"""

import sys
import uuid
from datetime import datetime, timedelta
from datetime import time as dt_time
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import time
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.attendance import Attendance, AttendanceStatus
from app.models.placement import Placement, Workplace
from app.models.report import FormVersion
from app.models.school import School
from app.models.school_class import SchoolClass, teacher_students
from app.models.user import User, UserRole
from app.services.accounts import create_account
from app.services.report_forms import FormContent, dump_questions

DEMO_PASSWORD = "demo-firstflow"
ALLOWED_ENVIRONMENTS = {"development", "test"}
DOMAIN = "demo.firstflow.se"

SCHOOLS = {
    "kramfors": "Kramforsskolan",
    "umea": "Umeåskolan",
}

STAFF = {
    "kramfors": [
        (UserRole.SCHOOL_ADMIN, "Lena Holmberg"),
        (UserRole.PRINCIPAL, "Per Sjölander"),
        (UserRole.SYV, "Karin Ek"),
        (UserRole.TEACHER, "Ingrid Svensson"),
    ],
    "umea": [
        (UserRole.SCHOOL_ADMIN, "Johan Westin"),
        (UserRole.PRINCIPAL, "Maria Lindgren"),
        (UserRole.SYV, "Sara Nyberg"),
        (UserRole.TEACHER, "Anders Bergström"),
    ],
}

STUDENTS = {
    "kramfors": [
        "Hugo Karlsson", "Elsa Lindqvist", "Omar Haddad", "Maja Nordström", "Liam Berg",
        "Alva Holm", "Noah Sandberg", "Ebba Forsberg", "William Öberg", "Saga Lundgren",
    ],
    "umea": [
        "Ella Nyström", "Oscar Håkansson", "Alice Sjöberg", "Lucas Engström", "Freja Lund",
        "Adam Johansson", "Astrid Hedlund", "Isak Strand", "Selma Lindberg", "Melvin Ek",
    ],
}  # fmt: skip

# Två klasser per skola. Skolans lärare har båda, eleverna delas fem och fem.
CLASSES = ["EE22", "EE21"]

# Arbetsplatser per skola: (namn, adress, handledarens e-postprefix, handledarens namn).
# Gustav Lindahl (handledare@) har elever från båda skolorna.
WORKPLACES = {
    "kramfors": [
        ("Kramfors El & Data", "Storgatan 12, Kramfors", "handledare", "Gustav Lindahl"),
        ("Höga Kusten Elinstallation", "Industrivägen 4, Kramfors", "handledare.hk", "Sofia Åberg"),
    ],
    "umea": [
        ("Umeå Energi Service", "Kungsgatan 40, Umeå", "handledare.ues", "Mikael Rask"),
        ("Norrlands Elteknik", None, "handledare", "Gustav Lindahl"),
    ],
}  # fmt: skip

ROLE_PREFIX = {
    UserRole.SCHOOL_ADMIN: "admin",
    UserRole.PRINCIPAL: "rektor",
    UserRole.SYV: "syv",
    UserRole.TEACHER: "larare",
}


def _slug(name: str) -> str:
    table = str.maketrans("åäöé", "aaoe")
    return name.lower().translate(table).replace(" ", ".")


def _ensure_user(db: Session, email: str, name: str, role: UserRole, school: School | None) -> bool:
    if db.scalar(select(User.id).where(User.email == email)):
        return False
    create_account(
        db,
        email=email,
        name=name,
        role=role,
        school_id=school.id if school else None,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    return True


def _ensure_classes(db: Session, school: School, key: str) -> list[str]:
    """Skapar skolans demoklasser som saknas. Returnerar namnen på de nya."""
    created: list[str] = []
    teacher = db.scalar(select(User).where(User.email == f"larare.{key}@{DOMAIN}"))
    students = [
        db.scalar(select(User).where(User.email == f"{_slug(n)}.{key}@{DOMAIN}"))
        for n in STUDENTS[key]
    ]
    # Skolans lärare ansvarar för alla demoelever (kopplingen sätts annars av skoladmin).
    if teacher:
        for student in students:
            if student:
                db.execute(
                    insert(teacher_students)
                    .values(teacher_id=teacher.id, student_id=student.id)
                    .on_conflict_do_nothing()
                )
    for i, class_name in enumerate(CLASSES):
        exists = db.scalar(
            select(SchoolClass.id).where(
                SchoolClass.school_id == school.id, SchoolClass.name == class_name
            )
        )
        if exists:
            continue
        school_class = SchoolClass(school_id=school.id, name=class_name)
        school_class.teachers = [teacher] if teacher else []
        school_class.students = [s for s in students[i * 5 : i * 5 + 5] if s]
        db.add(school_class)
        created.append(class_name)
    db.flush()
    return created


def _demo_questions() -> list[dict[str, Any]]:
    """Ett formulär som visar alla frågetyper och en logikregel."""
    ids = [str(uuid.uuid4()) for _ in range(6)]
    choice = lambda label: {"id": str(uuid.uuid4()), "label": label}  # noqa: E731
    questions = [
        {"id": ids[0], "type": "long_text", "title": "Vad har du gjort i dag?",
         "description": "Beskriv arbetsuppgifterna med egna ord."},
        {"id": ids[1], "type": "choice", "title": "Vilka arbetsuppgifter har du haft?",
         "multiple": True, "allow_other": True,
         "choices": [choice("Installation"), choice("Felsökning"), choice("Kundkontakt"),
                     choice("Dokumentation")]},
        {"id": ids[2], "type": "yes_no", "title": "Har du lärt dig något nytt?",
         "logic": [{"when": "no", "goto": ids[4]}]},
        {"id": ids[3], "type": "long_text", "title": "Vad lärde du dig?"},
        {"id": ids[4], "type": "rating", "title": "Hur svårt var det?",
         "description": "1 = lätt, 5 = mycket svårt"},
        {"id": ids[5], "type": "statement", "title": "Tack! Kom ihåg skyddsutrustningen.",
         "description": "Fråga din handledare om något känns osäkert."},
    ]  # fmt: skip
    return dump_questions(FormContent.model_validate({"questions": questions}).questions)


def _ensure_forms(db: Session, school: School) -> list[str]:
    """Ger skolans klasser ett publicerat formulär om de saknar ett."""
    created: list[str] = []
    for school_class in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school.id)):
        if db.scalar(select(FormVersion.id).where(FormVersion.class_id == school_class.id)):
            continue
        if not school_class.report_due_weekdays:
            school_class.report_due_weekdays = [1, 4]  # tisdag och fredag
        db.add(FormVersion(class_id=school_class.id, version=1, questions=_demo_questions()))
        created.append(school_class.name)
    db.flush()
    return created


def _ensure_placements(db: Session, school: School, key: str) -> list[str]:
    """Skapar skolans arbetsplatser och placerar eleverna i EE22 där. Returnerar nya platser."""
    created: list[str] = []
    workplaces: list[tuple[Workplace, User]] = []
    for name, address, prefix, _ in WORKPLACES[key]:
        supervisor = db.scalar(select(User).where(User.email == f"{prefix}@{DOMAIN}"))
        workplace = db.scalar(
            select(Workplace).where(Workplace.school_id == school.id, Workplace.name == name)
        )
        if workplace is None:
            workplace = Workplace(school_id=school.id, name=name, address=address)
            workplace.supervisors = [supervisor] if supervisor else []
            db.add(workplace)
            created.append(name)
        if supervisor:
            workplaces.append((workplace, supervisor))
    db.flush()

    school_class = db.scalar(
        select(SchoolClass).where(SchoolClass.school_id == school.id, SchoolClass.name == "EE22")
    )
    if school_class is None or not workplaces:
        return created
    # En pågående period: började för två veckor sedan och håller på i sex veckor till.
    start = time.today() - timedelta(days=14)
    for i, student in enumerate(school_class.students):
        if db.scalar(select(Placement.id).where(Placement.student_id == student.id)):
            continue
        workplace, supervisor = workplaces[0] if i < 3 else workplaces[-1]
        db.add(
            Placement(
                student_id=student.id,
                workplace_id=workplace.id,
                supervisor_id=supervisor.id,
                start_date=start,
                end_date=start + timedelta(days=55),
            )
        )
    db.flush()
    return created


def _ensure_attendance(db: Session, school: School) -> int:
    """Ger placeringarna i EE22 närvaro fram till i går, och några incheckningar i dag.

    Mönstret visar det läraren behöver se: de flesta checkar in, en elev har varit sjuk en
    dag och en elev har slutat checka in de senaste dagarna. Returnerar antal nya dagar.
    """
    school_class = db.scalar(
        select(SchoolClass).where(SchoolClass.school_id == school.id, SchoolClass.name == "EE22")
    )
    if school_class is None:
        return 0
    today = time.today()
    created = 0
    for i, student in enumerate(school_class.students):
        placement = db.scalar(select(Placement).where(Placement.student_id == student.id))
        if placement is None or db.scalar(
            select(Attendance.id).where(Attendance.placement_id == placement.id).limit(1)
        ):
            continue
        weekdays = [
            placement.start_date + timedelta(days=d)
            for d in range((min(today, placement.end_date) - placement.start_date).days + 1)
            if (placement.start_date + timedelta(days=d)).weekday() < 5
        ]
        for n, day in enumerate(weekdays):
            is_today = day == today
            if i == len(school_class.students) - 1 and n >= len(weekdays) - 3:
                continue  # sista eleven har inte checkat in de senaste dagarna
            if is_today and i >= 2:
                continue  # i dag har bara de två första checkat in än
            if i == 1 and n == 3:
                db.add(
                    Attendance(placement_id=placement.id, date=day, status=AttendanceStatus.SICK)
                )
            else:
                at = datetime.combine(day, dt_time(7, 30 + (i * 7 + n * 3) % 25), time.SCHOOL_TZ)
                db.add(
                    Attendance(
                        placement_id=placement.id,
                        date=day,
                        status=AttendanceStatus.PRESENT,
                        checked_in_at=at,
                    )
                )
            created += 1
    db.flush()
    return created


def seed(db: Session) -> list[tuple[str, str, str]]:
    """Skapar demodatan. Returnerar (e-post eller klass, roll, skola) för allt som skapades."""
    created: list[tuple[str, str, str]] = []

    def add(email: str, name: str, role: UserRole, school: School | None) -> None:
        if _ensure_user(db, email, name, role, school):
            created.append((email, role.value, school.name if school else "–"))

    add(f"superadmin@{DOMAIN}", "Firstflow Admin", UserRole.SUPERADMIN, None)

    for key, school_name in SCHOOLS.items():
        school = db.scalar(select(School).where(School.name == school_name))
        if school is None:
            school = School(name=school_name)
            db.add(school)
            db.flush()
        for role, name in STAFF[key]:
            add(f"{ROLE_PREFIX[role]}.{key}@{DOMAIN}", name, role, school)
        for name in STUDENTS[key]:
            add(f"{_slug(name)}.{key}@{DOMAIN}", name, UserRole.STUDENT, school)
        for class_name in _ensure_classes(db, school, key):
            created.append((f"klass {class_name}", "–", school.name))
        for class_name in _ensure_forms(db, school):
            created.append((f"formulär {class_name}", "–", school.name))
        # Handledare hör inte till någon skola. De kopplas till skolan via arbetsplatsen.
        for _, _, prefix, name in WORKPLACES[key]:
            add(f"{prefix}@{DOMAIN}", name, UserRole.SUPERVISOR, None)
        for name in _ensure_placements(db, school, key):
            created.append((f"arbetsplats {name}", "–", school.name))
        if days := _ensure_attendance(db, school):
            created.append((f"närvaro {days} dagar", "–", school.name))
    return created


def main() -> None:
    if settings.environment not in ALLOWED_ENVIRONMENTS:
        sys.exit(f"seed_demo körs bara i {', '.join(sorted(ALLOWED_ENVIRONMENTS))}.")
    with SessionLocal() as db:
        created = seed(db)
        db.commit()
    if not created:
        print("Demodatan finns redan. Inget nytt skapades.")
        return
    classes = sum(1 for item in created if item[0].startswith("klass "))
    forms = sum(1 for item in created if item[0].startswith("formulär "))
    workplaces = sum(1 for item in created if item[0].startswith("arbetsplats "))
    attendance = sum(1 for item in created if item[0].startswith("närvaro "))
    accounts = len(created) - classes - forms - workplaces - attendance
    print(
        f"Skapade {accounts} demokonton, {classes} klasser, {forms} formulär"
        f" och {workplaces} arbetsplatser."
        + (" Närvaro för eleverna i EE22." if attendance else "")
    )
    print(f"Lösenord för alla konton: {DEMO_PASSWORD}\n")
    for email, role, school in created:
        print(f"  {role:<13} {school:<15} {email}")


if __name__ == "__main__":
    main()
