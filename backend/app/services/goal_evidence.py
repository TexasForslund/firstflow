"""Underlag för mål (idé 10, Texas 2026-10-30): vilka svar i inskickade redovisningar som visar
vilka mål. Räknas fram ur svaren varje gång, så att en ändrad koppling i frågorna gäller direkt
för nya redovisningar men aldrig skriver om gamla.

Följdfrågan (Texas, 2026-10-30): är nästa fråga på elevens väg en textfråga, t.ex. "Vad gjorde
du?" efter "Har du haft kundkontakt i dag? Ja", följer elevens svar med som underlagets text.
"""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from uuid import UUID

from app.models.report import Report
from app.services.report_forms import (
    AnswerValue,
    QuestionType,
    answer_keys,
    parse_questions,
    visible_path,
)

TEXT_TYPES = (QuestionType.SHORT_TEXT, QuestionType.LONG_TEXT)


@dataclass(frozen=True)
class FollowUp:
    question: str
    text: str


@dataclass(frozen=True)
class Evidence:
    report: Report
    goal_id: UUID
    follow_up: FollowUp | None


def evidence(reports: Iterable[Report]) -> Iterator[Evidence]:
    """Ett underlag per mål och redovisning. `form_version` och `answers` måste vara laddade."""
    for report in reports:
        questions = parse_questions(report.form_version.questions)
        by_id = {q.id: q for q in questions}
        raw = {a.question_id: a for a in report.answers}
        values = {qid: AnswerValue.model_validate(a) for qid, a in raw.items()}
        path = visible_path(questions, values)
        shown: set[UUID] = set()
        for i, question_id in enumerate(path):
            question = by_id[question_id]
            rules = getattr(question, "goals", [])
            answer = values.get(question_id)
            if not rules or answer is None:
                continue
            keys = answer_keys(question, answer)
            for rule in rules:
                if rule.when in keys and rule.goal_id not in shown:
                    shown.add(rule.goal_id)
                    yield Evidence(report, rule.goal_id, _follow_up(path, i, by_id, values))


def _follow_up(path, i, by_id, values) -> FollowUp | None:
    if i + 1 >= len(path):
        return None
    following = by_id[path[i + 1]]
    answer = values.get(following.id)
    if following.type not in TEXT_TYPES or answer is None or not (answer.text or "").strip():
        return None
    return FollowUp(question=following.title, text=answer.text.strip())
