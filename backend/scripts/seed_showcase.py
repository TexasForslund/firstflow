"""Demodata som ser ut som en riktig termin, för att visa Firstflow och se hur det blir live.

Kör från backend/ efter seed_demo (skriptet kör seed_demo först om något saknas):
    uv run python -m scripts.seed_showcase

Kramforsskolans demoklasser ersätts med en klass, EL23, med sex elever och läraren Ingrid
Svensson (larare.kramfors@demo.firstflow.se). Eleverna har APL sedan tre månader på två
företag, med:
- närvaro varje vardag, där några elever har missat dagar
- veckoredovisningar tisdag och fredag, med svar, några sena och några som saknas
- kommentarer från läraren och svar från eleverna, och olästa redovisningar från de senaste dagarna
- fyra projekt som eleverna är med i, och redovisningarna kopplade till projekten
- Hugo Karlsson har inte checkat in i dag och har sin senaste redovisning kvar, för en levande demo

Skriptet tar bort Kramforsskolans klasser, redovisningar, närvaro, placeringar och projekt innan
det skapar de nya. Det rör bara demoskolan och körs bara när ENVIRONMENT är development eller
test. Det går att köra flera gånger. Samma slumpfrö ger samma data.
"""

import random
import sys
import uuid
from datetime import date, datetime, timedelta
from datetime import time as dt_time
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import time
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.attendance import Attendance, AttendanceReview, AttendanceStatus
from app.models.contract import Contract, ContractSignature, SignerRole
from app.models.note import NoteTag, StudentNote
from app.models.placement import Placement, Workplace
from app.models.project import Project
from app.models.report import (
    FormVersion,
    Report,
    ReportAnswer,
    ReportComment,
    ReportRead,
    ReportStatus,
)
from app.models.school import School
from app.models.school_class import SchoolClass, class_students, teacher_students
from app.models.user import User
from app.services.report_forms import FormContent, dump_questions
from scripts.demo_pdf import make_pdf
from scripts.seed_demo import ALLOWED_ENVIRONMENTS, DEMO_PASSWORD, DOMAIN, _slug, seed

SCHOOL = "Kramforsskolan"
CLASS_NAME = "EL23"
TEACHER = f"larare.kramfors@{DOMAIN}"
APL_WEEKS = 13  # ungefär tre månader bakåt
WEEKS_LEFT = 4

# Eleverna och hur de sköter sig: andel dagar de checkar in, andel redovisningar de lämnar,
# andel som är sena, och om de har slutat checka in de senaste dagarna.
STUDENTS = [
    ("Hugo Karlsson", 0.97, 0.96, 0.05, False),
    ("Elsa Lindqvist", 1.0, 1.0, 0.0, False),
    ("Omar Haddad", 0.82, 0.78, 0.15, True),
    ("Maja Nordström", 0.93, 0.92, 0.1, False),
    ("Liam Berg", 0.88, 0.85, 0.2, False),
    ("Alva Holm", 0.95, 0.96, 0.05, False),
]

# Företag och handledare finns redan i seed_demo. De tre första eleverna på det första.
# Eleven som används live under demon: hen har inte checkat in i dag och har den senaste
# redovisningen kvar, så att det går att visa hur det syns hos läraren direkt.
LIVE_STUDENT = "Hugo Karlsson"
# Eleven som glömde att checka in i måndags, och eleven vars incheckning i går inte stämmer
# med handledarens svar.
FORGOT_STUDENT = "Hugo Karlsson"
CONFLICT_STUDENT = "Elsa Lindqvist"

WORKPLACES = [("Kramfors El & Data", "handledare"), ("Höga Kusten Elinstallation", "handledare.hk")]

PROJECTS = [
    (
        "Elinstallation i villa",
        "Dra ny el i en villa under renovering: ritning, kabeldragning, uttag och belysning.",
        ["Elinstallation", "Ritningsläsning"],
        ["Hugo Karlsson", "Elsa Lindqvist", "Liam Berg"],
        0,
    ),
    (
        "Felsökning och mätning",
        "Felsöka jordfel och kortslutning, och mäta isolationsresistans och kontinuitet.",
        ["Felsökning", "Mätning"],
        ["Omar Haddad", "Maja Nordström"],
        1,
    ),
    (
        "Laddbox för elbil",
        "Installera laddboxar hos privatkunder och en bostadsrättsförening, med lastbalansering.",
        ["Laddinfrastruktur", "Kundkontakt"],
        ["Alva Holm", "Hugo Karlsson"],
        1,
    ),
    (
        "Dokumentation och egenkontroll",
        "Fylla i egenkontroller och relationsritningar efter avslutade jobb.",
        ["Dokumentation"],
        ["Maja Nordström", "Omar Haddad", "Alva Holm"],
        None,
    ),
]
# Index i WORKPLACES för projektets företag, eller None. Företagets handledare är inbjuden.

# Ett avslutat projekt från APL:ens första veckor, utan redovisningar.
DONE_PROJECT = (
    "Säkerhet på arbetsplatsen",
    "Gå igenom elsäkerhet, skyddsutrustning och riskbedömning med handledaren första veckorna.",
    ["Elsäkerhet"],
)

# Kontrakt per elev (Texas, 2026-10-29). Värdet är vilka som har signerat, eller None för ett
# utkast. "sent" är hur många dagar sedan kontraktet skickades. Hugo får ett kontrakt som väntar
# på honom, så att demon kan visa hur eleven signerar.
CONTRACTS: dict[str, tuple[set[str] | None, int]] = {
    "Hugo Karlsson": ({"teacher"}, 2),
    "Elsa Lindqvist": ({"teacher"}, 0),
    "Omar Haddad": ({"teacher", "supervisor"}, 7),
    "Alva Holm": ({"teacher", "supervisor", "student"}, 95),
    "Liam Berg": ({"teacher", "supervisor", "student"}, 95),
    "Maja Nordström": (None, 0),
}

CONTRACT_TEXT = [
    "Detta utbildningskontrakt gäller arbetsplatsförlagt lärande (APL) inom Elprogrammet. "
    "Kontraktet är ett exempel i Firstflows demodata.",
    "Eleven deltar i verksamheten på arbetsplatsen under APL-perioden och följer arbetsplatsens "
    "regler för arbetsmiljö och säkerhet.",
    "Handledaren introducerar eleven, planerar arbetsuppgifterna tillsammans med skolan och "
    "bekräftar elevens närvaro.",
    "Skolan ansvarar för att APL:en är kvalitetssäkrad, att eleven har en handledare och att "
    "läraren följer upp elevens lärande.",
    "Parterna signerar kontraktet digitalt i Firstflow.",
]

WORK = {
    "Elinstallation i villa": [
        "Drog kabel i väggarna på övervåningen och satte dosor för uttag och strömbrytare.",
        "Monterade spotlights i köket och kopplade in dem på en dimmer.",
        "Läste ritningen med handledaren och märkte ut var alla uttag ska sitta i vardagsrummet.",
        "Drog rör i bjälklaget och fick lära mig hur man undviker att borra i bärande delar.",
        "Kopplade in uttag i badrummet och vi gick igenom vad som gäller i våtrum.",
        "Satte upp en ny gruppcentral tillsammans med handledaren och märkte alla säkringar.",
        "Byggde om belysningen i hallen till trappkoppling med två strömbrytare.",
    ],
    "Felsökning och mätning": [
        "Letade efter ett jordfel som löste ut hela tiden. Det var en fuktig utomhusdosa.",
        "Mätte isolationsresistans på en gammal anläggning och skrev protokoll.",
        "Följde med på ett servicejobb där en spis inte fungerade. Det var en trasig fas.",
        "Övade på att mäta kontinuitet på skyddsledare i ett nytt hus.",
        "Felsökte en belysning som blinkade. Vi bytte drivdon i armaturerna.",
        "Mätte spänningsfall i en lång kabel till ett garage och räknade på det.",
    ],
    "Laddbox för elbil": [
        "Installerade en laddbox i ett garage och drog en ny kabel från centralen.",
        "Var med på ett kundmöte i en bostadsrättsförening om laddplatser.",
        "Konfigurerade lastbalansering så att huvudsäkringen inte löser ut.",
        "Monterade två laddboxar på en parkering och grävde för kabel med handledaren.",
        "Testade laddboxen med kunden och visade hur appen fungerar.",
    ],
    "Dokumentation och egenkontroll": [
        "Fyllde i egenkontroll efter ett jobb och fotade centralen innan vi stängde.",
        "Ritade en relationsritning för ett kök där vi flyttat uttag.",
        "Gick igenom gamla protokoll med handledaren och såg vad som brukar saknas.",
        "Skrev en kort rapport till kunden om vad vi hade gjort och vad som återstår.",
    ],
}

LEARNED = [
    "Att alltid kontrollera att det är spänningslöst innan man börjar, även om någon har sagt det.",
    "Hur man läser en elritning och vilka symboler som betyder vad.",
    "Varför man använder jordfelsbrytare och hur man testar den.",
    "Att det är viktigt att planera kabelvägen innan man börjar borra.",
    "Hur man räknar ut vilken kabelarea som behövs.",
    "Att prata med kunden och förklara vad man gör, utan att krångla till det.",
    "Hur man mäter isolationsresistans och vad värdena betyder.",
    "Att märka allt i centralen så att nästa elektriker förstår.",
    "Att ta pauser och dricka vatten, det blir varmt på vinden.",
    "Hur lastbalansering fungerar och varför den behövs.",
]

TEACHER_COMMENTS = [
    "Bra beskrivet! Kan du berätta mer om hur ni planerade kabelvägen?",
    "Fint att du frågade handledaren när du var osäker. Fortsätt så.",
    "Kom ihåg att skriva vilka mätvärden ni fick, det är bra underlag till betyget.",
    "Det här kopplar fint till det vi läste om elsäkerhet i ettan.",
    "Snyggt jobbat! Ta gärna med en bild nästa gång.",
    "Hur kändes det att prata med kunden? Skriv gärna lite om det.",
    "Bra reflektion. Vad skulle du göra annorlunda nästa gång?",
    "Du har kommit långt sedan första veckan, det syns i redovisningarna.",
]

STUDENT_REPLIES = [
    "Tack! Vi gick efter ritningen och tog kortaste vägen genom bjälklaget.",
    "Ja, vi fick 250 megaohm på alla grupper.",
    "Det kändes nervöst först men gick bra.",
    "Jag ska ta bild nästa gång!",
    "Jag skulle ha planerat bättre innan jag började borra.",
]


def _questions(rng: random.Random) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Klassens frågor. Returnerar frågorna och id:n för de som svaren fylls i på."""
    ids = {
        k: str(uuid.UUID(int=rng.getrandbits(128)))
        for k in ("did", "tasks", "new", "learned", "hard", "end")
    }
    choices = [
        {"id": str(uuid.UUID(int=rng.getrandbits(128))), "label": label}
        for label in ("Installation", "Felsökning", "Kundkontakt", "Dokumentation")
    ]
    questions = [
        {"id": ids["did"], "type": "long_text", "title": "Vad har du gjort den här veckan?",
         "description": "Beskriv arbetsuppgifterna med egna ord."},
        {"id": ids["tasks"], "type": "choice", "title": "Vilka arbetsuppgifter har du haft?",
         "multiple": True, "allow_other": False, "choices": choices},
        {"id": ids["new"], "type": "yes_no", "title": "Har du lärt dig något nytt?",
         "logic": [{"when": "no", "goto": ids["hard"]}]},
        {"id": ids["learned"], "type": "long_text", "title": "Vad lärde du dig?"},
        {"id": ids["hard"], "type": "rating", "title": "Hur svårt var det?",
         "description": "1 = lätt, 5 = mycket svårt"},
        {"id": ids["end"], "type": "statement", "title": "Tack! Kom ihåg skyddsutrustningen."},
    ]  # fmt: skip
    dumped = dump_questions(FormContent.model_validate({"questions": questions}).questions)
    # Svaren sparar id:n som UUID.
    as_uuid = {k: uuid.UUID(v) for k, v in ids.items()}
    return dumped, {**as_uuid, "choices": [uuid.UUID(c["id"]) for c in choices]}


def _clear(db: Session, school: School, teacher: User, keep: set[uuid.UUID]) -> None:
    """Tar bort skolans demoklasser och allt som hänger på dem."""
    classes = list(db.scalars(select(SchoolClass).where(SchoolClass.school_id == school.id)))
    class_ids = [c.id for c in classes]
    report_ids = list(db.scalars(select(Report.id).where(Report.class_id.in_(class_ids))))
    db.execute(delete(StudentNote).where(StudentNote.student_id.in_(keep)))
    db.execute(delete(ReportComment).where(ReportComment.report_id.in_(report_ids)))
    db.execute(delete(ReportRead).where(ReportRead.report_id.in_(report_ids)))
    db.execute(delete(ReportAnswer).where(ReportAnswer.report_id.in_(report_ids)))
    db.execute(delete(Report).where(Report.id.in_(report_ids)))
    db.execute(delete(FormVersion).where(FormVersion.class_id.in_(class_ids)))
    db.execute(delete(Project).where(Project.school_id == school.id))
    db.execute(delete(Contract).where(Contract.school_id == school.id))
    workplace_ids = list(db.scalars(select(Workplace.id).where(Workplace.school_id == school.id)))
    placement_ids = list(
        db.scalars(select(Placement.id).where(Placement.workplace_id.in_(workplace_ids)))
    )
    db.execute(delete(Attendance).where(Attendance.placement_id.in_(placement_ids)))
    db.execute(delete(Placement).where(Placement.id.in_(placement_ids)))
    for school_class in classes:
        db.delete(school_class)
    # Läraren ska bara ha klassens elever, så att Elevhistorik visar samma sak som klassen.
    db.execute(
        delete(teacher_students).where(
            teacher_students.c.teacher_id == teacher.id, teacher_students.c.student_id.not_in(keep)
        )
    )
    db.flush()


def _weekdays(start: date, end: date) -> list[date]:
    days = [start + timedelta(days=n) for n in range((end - start).days + 1)]
    return [d for d in days if d.weekday() < 5]


def _at(day: date, hour: int, minute: int) -> datetime:
    return datetime.combine(day, dt_time(hour, minute), time.SCHOOL_TZ)


def showcase(db: Session) -> dict[str, int]:
    rng = random.Random(2026)
    names = {f"{_slug(name)}.kramfors@{DOMAIN}" for name, *_ in STUDENTS}

    def clear() -> None:
        school = db.scalar(select(School).where(School.name == SCHOOL))
        teacher = db.scalar(select(User).where(User.email == TEACHER))
        if school and teacher:
            keep = set(db.scalars(select(User.id).where(User.email.in_(names))))
            _clear(db, school, teacher, keep)

    # Rensa först, annars försöker seed_demo lägga eleverna i EE21 och EE22 igen. Rensa sedan
    # en gång till för det seed_demo skapade (första gången finns inget att rensa).
    clear()
    seed(db)
    clear()
    school = db.scalar(select(School).where(School.name == SCHOOL))
    teacher = db.scalar(select(User).where(User.email == TEACHER))
    assert school is not None and teacher is not None
    students = {
        name: db.scalar(select(User).where(User.email == f"{_slug(name)}.kramfors@{DOMAIN}"))
        for name, *_ in STUDENTS
    }
    assert all(students.values())

    today = time.today()
    monday = today - timedelta(days=today.weekday())
    previous_weekday = today - timedelta(days=3 if today.weekday() == 0 else 1)
    start = monday - timedelta(weeks=APL_WEEKS)
    end = monday + timedelta(weeks=WEEKS_LEFT, days=4)

    school_class = SchoolClass(
        school_id=school.id,
        name=CLASS_NAME,
        apl_days_per_week=5,
        check_in_required=True,
        report_due_weekdays=[1, 4],  # tisdag och fredag
    )
    school_class.teachers = [teacher]
    school_class.students = [s for s in students.values() if s]
    db.add(school_class)
    for student in school_class.students:
        db.execute(
            insert(teacher_students)
            .values(teacher_id=teacher.id, student_id=student.id)
            .on_conflict_do_nothing()
        )
    db.flush()

    # Eleverna har gått i klassen sedan före APL, annars räknas inga redovisningar som saknade.
    db.execute(
        update(class_students)
        .where(class_students.c.class_id == school_class.id)
        .values(created_at=_at(start - timedelta(days=14), 8, 0))
    )

    questions, q = _questions(rng)
    version = FormVersion(
        class_id=school_class.id,
        version=1,
        questions=questions,
        published_at=_at(start - timedelta(days=7), 10, 0),
    )
    db.add(version)

    workplaces = []
    for name, prefix in WORKPLACES:
        workplace = db.scalar(
            select(Workplace).where(Workplace.school_id == school.id, Workplace.name == name)
        )
        supervisor = db.scalar(select(User).where(User.email == f"{prefix}@{DOMAIN}"))
        assert workplace is not None and supervisor is not None
        workplaces.append((workplace, supervisor))

    projects: dict[str, Project] = {}
    for name, description, tags, members, company in PROJECTS:
        project = Project(
            school_id=school.id,
            owner_id=teacher.id,
            name=name,
            description=description,
            deadline=end,
            tags=tags,
            created_at=_at(start, 8, 0),
        )
        project.students = [s for m in members if (s := students[m])]
        if company is not None:
            workplace, supervisor = workplaces[company]
            project.workplace_id = workplace.id
            project.supervisors = [supervisor]
        db.add(project)
        projects[name] = project
    name, description, tags = DONE_PROJECT
    db.add(
        Project(
            school_id=school.id,
            owner_id=teacher.id,
            name=name,
            description=description,
            deadline=start + timedelta(days=18),
            tags=tags,
            created_at=_at(start, 8, 0),
            completed_at=_at(start + timedelta(days=18), 15, 0),
            students=[s for s in students.values() if s is not None],
        )
    )
    db.flush()

    counts = {"närvarodagar": 0, "redovisningar": 0, "kommentarer": 0, "saknas": 0}
    for i, (name, attend, deliver, late, stopped) in enumerate(STUDENTS):
        student = students[name]
        assert student is not None
        workplace, supervisor = workplaces[0] if i < 3 else workplaces[1]
        placement = Placement(
            student_id=student.id,
            workplace_id=workplace.id,
            supervisor_id=supervisor.id,
            start_date=start,
            end_date=end,
        )
        db.add(placement)
        db.flush()

        # Närvaro: varje vardag fram till i dag. I dag har bara några hunnit checka in.
        # Handledarna har bekräftat tidigare veckor. Den här veckan har Sofia bekräftat allt
        # och Gustav ingenting, så att läraren ser incheckningar som väntar (Texas, 2026-10-29).
        gustav = i < 3
        for day in _weekdays(start, today):
            missed = rng.random() > attend
            if stopped and (today - day).days < 5:
                missed = True
            if day == today and (i in (2, 4) or name == LIVE_STUDENT):
                missed = True
            this_week = day >= monday
            review = None if this_week and gustav else AttendanceReview.CONFIRMED
            if name == FORGOT_STUDENT and day == monday and day < today:
                # Eleven glömde att checka in och handledaren lade till dagen.
                db.add(
                    Attendance(
                        placement_id=placement.id,
                        date=day,
                        status=AttendanceStatus.PRESENT,
                        review=AttendanceReview.CONFIRMED,
                        reviewed_at=_at(day, 16, 0),
                        reviewed_by_id=supervisor.id,
                    )
                )
                counts["närvarodagar"] += 1
                continue
            if missed:
                continue
            if name == CONFLICT_STUDENT and day == previous_weekday:
                # Eleven checkade in, men handledaren säger att eleven inte var på plats.
                review = AttendanceReview.NOT_PRESENT
            if day == today and not gustav:
                review = AttendanceReview.CONFIRMED
            db.add(
                Attendance(
                    placement_id=placement.id,
                    date=day,
                    status=AttendanceStatus.PRESENT,
                    checked_in_at=_at(day, 7, rng.randint(5, 55)),
                    review=review,
                    reviewed_at=_at(day, 16, 0) if review else None,
                    reviewed_by_id=supervisor.id if review else None,
                )
            )
            counts["närvarodagar"] += 1

        # Redovisningar tisdag och fredag, fram till i går.
        mine = [p for p in projects.values() if student in p.students]
        due = [d for d in _weekdays(start, today - timedelta(days=1)) if d.weekday() in (1, 4)]
        for n, day in enumerate(due):
            recent = (today - day).days
            if rng.random() > deliver or (stopped and recent < 8):
                counts["saknas"] += 1
                continue
            if name == LIVE_STUDENT and day == due[-1]:
                continue  # lämnas live under demon
            project = mine[(n // 4) % len(mine)]
            is_late = rng.random() < late
            submitted = (
                _at(day + timedelta(days=1), 8, rng.randint(0, 50))
                if is_late
                else _at(day, rng.randint(14, 17), rng.randint(0, 59))
            )
            report = Report(
                class_id=school_class.id,
                student_id=student.id,
                form_version_id=version.id,
                due_date=day,
                status=ReportStatus.SUBMITTED,
                started_at=submitted - timedelta(minutes=12),
                submitted_at=submitted,
                project_id=project.id,
            )
            db.add(report)
            db.flush()
            learned_something = rng.random() < 0.8
            tasks = rng.sample(q["choices"], rng.randint(1, 2))
            answers = [
                ReportAnswer(question_id=q["did"], text=rng.choice(WORK[project.name])),
                ReportAnswer(question_id=q["tasks"], choice_ids=tasks),
                ReportAnswer(question_id=q["new"], boolean=learned_something),
                ReportAnswer(question_id=q["hard"], rating=rng.choice([2, 2, 3, 3, 3, 4])),
            ]  # fmt: skip
            if learned_something:
                answers.append(ReportAnswer(question_id=q["learned"], text=rng.choice(LEARNED)))
            for answer in answers:
                answer.report_id = report.id
                db.add(answer)
            counts["redovisningar"] += 1

            # Handledaren har läst allt utom den senaste veckan, så att några nya syns.
            if recent > 7:
                db.add(
                    ReportRead(
                        report_id=report.id,
                        user_id=supervisor.id,
                        read_at=submitted + timedelta(hours=26),
                    )
                )
            # Läraren har läst allt utom de senaste dagarnas redovisningar.
            if recent > 4:
                db.add(
                    ReportRead(
                        report_id=report.id,
                        user_id=teacher.id,
                        read_at=submitted + timedelta(hours=20),
                    )
                )
            if recent > 4 and rng.random() < 0.3:
                comment_at = submitted + timedelta(hours=rng.randint(18, 40))
                db.add(
                    ReportComment(
                        report_id=report.id,
                        author_id=teacher.id,
                        body=rng.choice(TEACHER_COMMENTS),
                        created_at=comment_at,
                    )
                )
                counts["kommentarer"] += 1
                if rng.random() < 0.5:
                    db.add(
                        ReportComment(
                            report_id=report.id,
                            author_id=student.id,
                            body=rng.choice(STUDENT_REPLIES),
                            created_at=comment_at + timedelta(hours=3),
                        )
                    )
                    counts["kommentarer"] += 1  # fmt: skip

    _contracts(db, school, teacher, students, workplaces, start, end, today)

    # Handledarna har också elever från seed_demo. Deras dagar före den här veckan räknas som
    # bekräftade, så att listan "Bekräfta närvaro" bara visar veckan.
    supervisor_ids = [s.id for _, s in workplaces]
    placement_ids = select(Placement.id).where(Placement.supervisor_id.in_(supervisor_ids))
    for row in db.scalars(
        select(Attendance).where(
            Attendance.placement_id.in_(placement_ids),
            Attendance.date < monday,
            Attendance.review.is_(None),
            Attendance.status == AttendanceStatus.PRESENT,
        )
    ):
        row.review = AttendanceReview.CONFIRMED
        row.reviewed_by_id = db.get(Placement, row.placement_id).supervisor_id

    # Gustavs anteckningar om Hugo (B18), så att läraren ser kortet Från handledaren.
    hugo = students[LIVE_STUDENT]
    gustav = workplaces[0][1]
    assert hugo is not None
    for days_ago, tag, body in [
        (2, NoteTag.PRAISE, "Mycket bra på kundkontakt. Förklarade laddboxen lugnt och tydligt."),
        (9, NoteTag.CONCERN, "Blev irriterad och höjde rösten mot en kollega när han fick ändra en "
         "dragning. Vi pratade om det efteråt och det kändes bra."),
        (16, NoteTag.OTHER, "Har börjat ta egna initiativ på morgonen."),
    ]:  # fmt: skip
        db.add(
            StudentNote(
                student_id=hugo.id,
                author_id=gustav.id,
                tag=tag,
                body=body,
                created_at=_at(today - timedelta(days=days_ago), 15, 30),
            )
        )
    db.flush()
    return counts


def _contracts(  # noqa: PLR0913
    db: Session,
    school: School,
    teacher: User,
    students: dict[str, User | None],
    workplaces: list[tuple[Workplace, User]],
    start: date,
    end: date,
    today: date,
) -> None:
    for i, (name, *_) in enumerate(STUDENTS):
        student = students[name]
        assert student is not None
        workplace, supervisor = workplaces[0] if i < 3 else workplaces[1]
        signed, days_ago = CONTRACTS[name]
        title = f"Utbildningskontrakt APL – {name}"
        pdf = make_pdf(
            "Utbildningskontrakt APL",
            [
                f"Elev: {name}, klass {CLASS_NAME}",
                f"Arbetsplats: {workplace.name}, handledare {supervisor.name}",
                f"Period: {start.isoformat()} till {end.isoformat()}",
                *CONTRACT_TEXT,
            ],
        )
        sent_at = _at(today - timedelta(days=days_ago), 15, 20) if signed is not None else None
        signatures = []
        for role, user, delay in (
            (SignerRole.STUDENT, student, 18),
            (SignerRole.SUPERVISOR, supervisor, 26),
            (SignerRole.TEACHER, teacher, 0),
        ):
            done = signed is not None and role.value in signed
            at = sent_at + timedelta(hours=delay) if sent_at and done else None
            signatures.append(
                ContractSignature(
                    role=role,
                    user=user,
                    opened_at=at,
                    signed_at=at,
                    method="test" if at else None,
                )
            )
        db.add(
            Contract(
                school_id=school.id,
                created_by=teacher,
                student=student,
                workplace=workplace,
                title=title,
                start_date=start,
                end_date=end,
                file_name=f"Utbildningskontrakt APL {name}.pdf",
                pdf=pdf,
                pdf_size=len(pdf),
                created_at=sent_at or _at(today, 8, 30),
                sent_at=sent_at,
                signatures=signatures,
            )
        )


def main() -> None:
    if settings.environment not in ALLOWED_ENVIRONMENTS:
        sys.exit(f"seed_showcase körs bara i {', '.join(sorted(ALLOWED_ENVIRONMENTS))}.")
    with SessionLocal() as db:
        counts = showcase(db)
        db.commit()
    print(
        f"Klassen {CLASS_NAME} på {SCHOOL} har sex elever med APL sedan {APL_WEEKS} veckor:"
        f" {counts['närvarodagar']} incheckningar, {counts['redovisningar']} redovisningar"
        f" ({counts['saknas']} saknas), {counts['kommentarer']} kommentarer och"
        f" {len(PROJECTS) + 1} projekt och {len(CONTRACTS)} kontrakt."
    )
    print(f"Logga in som {TEACHER} med lösenordet {DEMO_PASSWORD}.")


if __name__ == "__main__":
    main()
