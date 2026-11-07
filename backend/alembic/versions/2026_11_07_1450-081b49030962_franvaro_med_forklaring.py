"""Frånvaro med förklaring: handledarens orsak och kommentar

Revision ID: 081b49030962
Revises: 0877a878778b
Create Date: 2026-11-07 14:50:57.486863

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "081b49030962"
down_revision: str | Sequence[str] | None = "0877a878778b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("attendance", sa.Column("absence_reason", sa.String(length=20), nullable=True))
    op.add_column("attendance", sa.Column("absence_note", sa.String(length=300), nullable=True))
    op.create_check_constraint(
        op.f("ck_attendance_absence_reason_valid"),
        "attendance",
        "absence_reason IS NULL OR absence_reason IN ('sick', 'leave', 'other')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_attendance_absence_reason_valid"), "attendance", type_="check")
    op.drop_column("attendance", "absence_note")
    op.drop_column("attendance", "absence_reason")
