"""simplify apl terms

Texas 2026-10-20: APL-period och lägsta närvaro tas bort från klassens villkor.
Veckoredovisning kan ha flera veckodagar i stället för en.

Revision ID: d303806447cd
Revises: 1db4bdee634a
Create Date: 2026-10-20 21:35:13.559450

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d303806447cd"
down_revision: str | Sequence[str] | None = "1db4bdee634a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "school_classes",
        sa.Column(
            "report_due_weekdays",
            postgresql.ARRAY(sa.SmallInteger()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )
    # Behåll en redan vald veckodag.
    op.execute(
        "UPDATE school_classes SET report_due_weekdays = ARRAY[report_due_weekday] "
        "WHERE report_due_weekday IS NOT NULL"
    )
    # Villkoren på kolumnerna försvinner med kolumnerna.
    op.drop_column("school_classes", "apl_start_date")
    op.drop_column("school_classes", "apl_end_date")
    op.drop_column("school_classes", "attendance_min_percent")
    op.drop_column("school_classes", "report_due_weekday")
    op.create_check_constraint(
        "report_due_weekdays_range",
        "school_classes",
        "report_due_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_school_classes_report_due_weekdays_range"), "school_classes", type_="check"
    )
    op.add_column("school_classes", sa.Column("report_due_weekday", sa.SmallInteger()))
    op.add_column("school_classes", sa.Column("attendance_min_percent", sa.SmallInteger()))
    op.add_column("school_classes", sa.Column("apl_end_date", sa.Date()))
    op.add_column("school_classes", sa.Column("apl_start_date", sa.Date()))
    op.execute("UPDATE school_classes SET report_due_weekday = report_due_weekdays[1]")
    op.drop_column("school_classes", "report_due_weekdays")
    for name, condition in {
        "apl_period_order": "apl_end_date >= apl_start_date",
        "attendance_min_percent_range": "attendance_min_percent BETWEEN 0 AND 100",
        "report_due_weekday_range": "report_due_weekday BETWEEN 0 AND 6",
    }.items():
        op.create_check_constraint(name, "school_classes", condition)
