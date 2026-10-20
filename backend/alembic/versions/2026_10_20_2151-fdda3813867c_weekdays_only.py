"""weekdays only

Veckoredovisning bara på vardagar (Texas, 2026-10-20): elever har inte APL på helger.
Lördag och söndag tas bort ur befintliga val.

Revision ID: fdda3813867c
Revises: d303806447cd
Create Date: 2026-10-20 21:51:21.177985

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fdda3813867c"
down_revision: str | Sequence[str] | None = "d303806447cd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE school_classes SET report_due_weekdays = "
        "array(SELECT d FROM unnest(report_due_weekdays) d WHERE d BETWEEN 0 AND 4 ORDER BY d)"
    )
    op.drop_constraint(
        op.f("ck_school_classes_report_due_weekdays_range"), "school_classes", type_="check"
    )
    op.create_check_constraint(
        "report_due_weekdays_range",
        "school_classes",
        "report_due_weekdays <@ ARRAY[0, 1, 2, 3, 4]::smallint[]",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_school_classes_report_due_weekdays_range"), "school_classes", type_="check"
    )
    op.create_check_constraint(
        "report_due_weekdays_range",
        "school_classes",
        "report_due_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]",
    )
