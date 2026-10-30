"""apl-dagar per klass

Klassen väljer APL-dagar och redovisningsdagar bland alla sju veckodagar, så att t.ex.
vuxenutbildning kan ha helger (Texas, 2026-10-30). "APL-dagar per vecka" försvinner.
Befintliga klasser får måndag–fredag. Redovisningsdagarna måste vara APL-dagar.

Revision ID: 0ea35db52ad0
Revises: 4acdced5779d
Create Date: 2026-10-30 11:55:48.057667

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0ea35db52ad0"
down_revision: str | Sequence[str] | None = "4acdced5779d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "school_classes",
        sa.Column(
            "apl_weekdays",
            postgresql.ARRAY(sa.SmallInteger()),
            server_default=sa.text("'{0,1,2,3,4}'"),
            nullable=False,
        ),
    )
    op.drop_constraint(
        op.f("ck_school_classes_apl_days_per_week_range"), "school_classes", type_="check"
    )
    op.drop_constraint(
        op.f("ck_school_classes_report_due_weekdays_range"), "school_classes", type_="check"
    )
    op.drop_column("school_classes", "apl_days_per_week")
    op.create_check_constraint(
        op.f("ck_school_classes_apl_weekdays_range"),
        "school_classes",
        "apl_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]",
    )
    op.create_check_constraint(
        op.f("ck_school_classes_report_due_on_apl_days"),
        "school_classes",
        "report_due_weekdays <@ apl_weekdays",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("ck_school_classes_report_due_on_apl_days"), "school_classes", type_="check"
    )
    op.drop_constraint(
        op.f("ck_school_classes_apl_weekdays_range"), "school_classes", type_="check"
    )
    op.add_column(
        "school_classes",
        sa.Column("apl_days_per_week", sa.SmallInteger(), autoincrement=False, nullable=True),
    )
    # Antalet vardagar blir "dagar per vecka". Helgdagar går inte att uttrycka och tas bort.
    op.execute(
        """
        UPDATE school_classes SET
          apl_days_per_week = NULLIF(
            (SELECT count(*) FROM unnest(apl_weekdays) AS d WHERE d <= 4), 0),
          report_due_weekdays = ARRAY(
            SELECT d FROM unnest(report_due_weekdays) AS d WHERE d <= 4 ORDER BY d)::smallint[]
        """
    )
    op.drop_column("school_classes", "apl_weekdays")
    op.create_check_constraint(
        op.f("ck_school_classes_report_due_weekdays_range"),
        "school_classes",
        "report_due_weekdays <@ ARRAY[0, 1, 2, 3, 4]::smallint[]",
    )
    op.create_check_constraint(
        op.f("ck_school_classes_apl_days_per_week_range"),
        "school_classes",
        "apl_days_per_week BETWEEN 1 AND 5",
    )
