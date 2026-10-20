"""Frågor i veckoredovisningar: frågetyper, logik och kontroll av svar (B5).

Ett formulär är en lista med frågor. Läraren redigerar ett utkast och publicerar det som en
ny version. Varje version sparas oförändrad, så att ett svar alltid går att tolka mot frågan
som eleven faktiskt såg. Frågor och alternativ har fasta id:n som följer med mellan versioner.

Logik: en regel på en fråga säger "om svaret är X, gå till fråga Y" (eller till slutet).
Regler får bara peka framåt, så det kan aldrig bli en slinga. Utan matchande regel kommer
nästa fråga i ordningen.

Se docs/design/fragor-typeform.md.
"""

from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

RATING_MAX = 5
SHORT_TEXT_MAX = 500
LONG_TEXT_MAX = 5000
OTHER_TEXT_MAX = 500
MAX_QUESTIONS = 50
MAX_CHOICES = 20
MAX_RULES = 20

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class QuestionType(StrEnum):
    SHORT_TEXT = "short_text"
    LONG_TEXT = "long_text"
    CHOICE = "choice"
    YES_NO = "yes_no"
    RATING = "rating"
    STATEMENT = "statement"  # text utan svar


YES = "yes"
NO = "no"


class LogicRule(BaseModel):
    """Om svaret är `when`, gå till frågan `goto`. `goto` null betyder att gå till slutet."""

    # I API-svaren är alla fält med standardvärde obligatoriska, så att frontend slipper gissa.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    when: str = Field(
        min_length=1,
        max_length=64,
        description="Ett alternativs id, 'yes' eller 'no', eller ett betyg '1'–'5'",
    )
    goto: UUID | None = Field(description="Frågan att gå till. null = gå till slutet")


class Choice(BaseModel):
    # I API-svaren är alla fält med standardvärde obligatoriska, så att frontend slipper gissa.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    id: UUID
    label: Label


class _Question(BaseModel):
    # I API-svaren är alla fält med standardvärde obligatoriska, så att frontend slipper gissa.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    id: UUID
    title: Title
    description: Description = ""


class ShortTextQuestion(_Question):
    type: Literal[QuestionType.SHORT_TEXT]
    required: bool = True


class LongTextQuestion(_Question):
    type: Literal[QuestionType.LONG_TEXT]
    required: bool = True


class ChoiceQuestion(_Question):
    type: Literal[QuestionType.CHOICE]
    required: bool = True
    choices: list[Choice] = Field(min_length=2, max_length=MAX_CHOICES)
    multiple: bool = Field(default=False, description="Eleven får välja flera alternativ")
    allow_other: bool = Field(default=False, description="Alternativet 'Annat' med fritext")
    logic: list[LogicRule] = Field(default_factory=list, max_length=MAX_RULES)


class YesNoQuestion(_Question):
    type: Literal[QuestionType.YES_NO]
    required: bool = True
    logic: list[LogicRule] = Field(default_factory=list, max_length=MAX_RULES)


class RatingQuestion(_Question):
    type: Literal[QuestionType.RATING]
    required: bool = True
    logic: list[LogicRule] = Field(default_factory=list, max_length=MAX_RULES)


class StatementQuestion(_Question):
    """Ett meddelande till eleven, t.ex. en påminnelse om säkerhet. Har inget svar."""

    type: Literal[QuestionType.STATEMENT]


Question = Annotated[
    ShortTextQuestion
    | LongTextQuestion
    | ChoiceQuestion
    | YesNoQuestion
    | RatingQuestion
    | StatementQuestion,
    Field(discriminator="type"),
]
QuestionList = TypeAdapter(list[Question])


def _allowed_when(question: Any) -> set[str]:
    match question.type:
        case QuestionType.CHOICE:
            return {str(c.id) for c in question.choices}
        case QuestionType.YES_NO:
            return {YES, NO}
        case QuestionType.RATING:
            return {str(n) for n in range(1, RATING_MAX + 1)}
    return set()


class FormContent(BaseModel):
    """Formulärets frågor i ordning."""

    # I API-svaren är alla fält med standardvärde obligatoriska, så att frontend slipper gissa.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    questions: list[Question] = Field(default_factory=list, max_length=MAX_QUESTIONS)

    @model_validator(mode="after")
    def check_ids_and_logic(self) -> "FormContent":
        position: dict[UUID, int] = {}
        for i, question in enumerate(self.questions):
            if question.id in position:
                raise ValueError("Två frågor har samma id")
            position[question.id] = i

        for i, question in enumerate(self.questions):
            if question.type == QuestionType.CHOICE:
                ids = [c.id for c in question.choices]
                if len(set(ids)) != len(ids):
                    raise ValueError(f'Två alternativ i frågan "{question.title}" har samma id')
            allowed = _allowed_when(question)
            for rule in getattr(question, "logic", []):
                if rule.when not in allowed:
                    raise ValueError(
                        f'En regel i frågan "{question.title}" gäller ett svar som inte finns'
                    )
                if rule.goto is not None and position.get(rule.goto, -1) <= i:
                    raise ValueError(
                        f'En regel i frågan "{question.title}" måste peka på en senare fråga'
                    )
        return self


def parse_questions(raw: list[dict[str, Any]]) -> list[Any]:
    """Läser frågor som sparats som JSON i databasen."""
    return QuestionList.validate_python(raw)


def dump_questions(questions: list[Any]) -> list[dict[str, Any]]:
    return QuestionList.dump_python(questions, mode="json")


# --- Svar ---------------------------------------------------------------------------------


class AnswerError(ValueError):
    """Svaret passar inte frågan. Meddelandet visas för eleven."""


class AnswerValue(BaseModel):
    """Ett svar. Fyll bara i fältet som passar frågetypen.

    - Kort text och fritext: `text`
    - Flerval: `choice_ids` och, om "Annat" är tillåtet, `other_text`
    - Ja/Nej: `boolean`
    - Betyg: `rating` (1–5)
    Ett tomt svar (t.ex. bara mellanslag) räknas som obesvarat.
    """

    model_config = ConfigDict(
        extra="forbid", from_attributes=True, json_schema_serialization_defaults_required=True
    )

    text: str | None = Field(default=None, max_length=LONG_TEXT_MAX)
    choice_ids: list[UUID] | None = Field(default=None, max_length=MAX_CHOICES)
    other_text: str | None = Field(default=None, max_length=OTHER_TEXT_MAX)
    boolean: bool | None = None
    rating: int | None = Field(default=None, ge=1, le=RATING_MAX)


_ALLOWED_FIELDS = {
    QuestionType.SHORT_TEXT: {"text"},
    QuestionType.LONG_TEXT: {"text"},
    QuestionType.CHOICE: {"choice_ids", "other_text"},
    QuestionType.YES_NO: {"boolean"},
    QuestionType.RATING: {"rating"},
    QuestionType.STATEMENT: set(),
}


def normalize_answer(question: Any, answer: AnswerValue) -> AnswerValue | None:
    """Kontrollerar svaret mot frågan. Ger None om svaret är tomt."""
    if question.type == QuestionType.STATEMENT:
        raise AnswerError("Ett meddelande har inget svar")
    given = {name for name, value in answer if value is not None}
    if given - _ALLOWED_FIELDS[question.type]:
        raise AnswerError("Svaret passar inte frågetypen")

    match question.type:
        case QuestionType.SHORT_TEXT | QuestionType.LONG_TEXT:
            text = (answer.text or "").strip()
            if not text:
                return None
            if question.type == QuestionType.SHORT_TEXT and len(text) > SHORT_TEXT_MAX:
                raise AnswerError(f"Svaret får vara högst {SHORT_TEXT_MAX} tecken")
            return AnswerValue(text=text)

        case QuestionType.CHOICE:
            valid = {c.id for c in question.choices}
            ids = list(dict.fromkeys(answer.choice_ids or []))  # utan dubbletter, i ordning
            if any(i not in valid for i in ids):
                raise AnswerError("Alternativet finns inte")
            other = (answer.other_text or "").strip() or None
            if other and not question.allow_other:
                raise AnswerError("Frågan har inget alternativ Annat")
            if not ids and not other:
                return None
            if not question.multiple and len(ids) + (1 if other else 0) > 1:
                raise AnswerError("Välj bara ett alternativ")
            return AnswerValue(choice_ids=ids or None, other_text=other)

        case QuestionType.YES_NO:
            return None if answer.boolean is None else AnswerValue(boolean=answer.boolean)

        case QuestionType.RATING:
            return None if answer.rating is None else AnswerValue(rating=answer.rating)

    raise AnswerError("Okänd frågetyp")  # pragma: no cover


def _answer_keys(question: Any, answer: AnswerValue) -> set[str]:
    """Värdena som logikens `when` jämförs med."""
    match question.type:
        case QuestionType.CHOICE:
            return {str(i) for i in answer.choice_ids or []}
        case QuestionType.YES_NO if answer.boolean is not None:
            return {YES if answer.boolean else NO}
        case QuestionType.RATING if answer.rating is not None:
            return {str(answer.rating)}
    return set()


def visible_path(questions: list[Any], answers: dict[UUID, AnswerValue]) -> list[UUID]:
    """Frågorna eleven får, i ordning, med hänsyn till logiken och svaren hittills.

    En fråga utan svar följer ordningen. Första regeln som matchar gäller.
    """
    position = {q.id: i for i, q in enumerate(questions)}
    path: list[UUID] = []
    i = 0
    while i < len(questions):
        question = questions[i]
        path.append(question.id)
        following = i + 1
        answer = answers.get(question.id)
        if answer is not None:
            keys = _answer_keys(question, answer)
            for rule in getattr(question, "logic", []):
                if rule.when in keys:
                    following = len(questions) if rule.goto is None else position[rule.goto]
                    break
        # Reglerna pekar alltid framåt (FormContent), men skydda mot slingor ändå.
        i = max(following, i + 1)
    return path


def is_answerable(question: Any) -> bool:
    return question.type != QuestionType.STATEMENT


def is_required(question: Any) -> bool:
    return is_answerable(question) and question.required
