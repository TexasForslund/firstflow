"""Mål från läroplanen: klassens mål (idé 13, steg 2)

Revision ID: 32eb63317703
Revises: 8dfbe37975af
Create Date: 2026-11-08 14:45:32.639254

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "32eb63317703"
down_revision: str | Sequence[str] | None = "8dfbe37975af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("goals", sa.Column("class_id", sa.Uuid(), nullable=True))
    op.add_column("goals", sa.Column("subject_name", sa.String(length=200), nullable=True))
    op.add_column("goals", sa.Column("level_code", sa.String(length=20), nullable=True))
    op.add_column("goals", sa.Column("level_name", sa.String(length=200), nullable=True))
    op.add_column("goals", sa.Column("content", sa.Text(), nullable=True))
    op.drop_index(op.f("uq_goals_school_id_name"), table_name="goals")
    op.create_index(op.f("ix_goals_class_id"), "goals", ["class_id"], unique=False)
    op.create_index(
        "uq_goals_school_id_class_id_name",
        "goals",
        ["school_id", "class_id", sa.text("lower(name)")],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )
    op.create_foreign_key(
        op.f("fk_goals_class_id_school_classes"),
        "goals",
        "school_classes",
        ["class_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Klassens mål kan ha samma namn som skolans. De tas bort innan det gamla indexet kommer
    # tillbaka.
    op.execute("DELETE FROM goals WHERE class_id IS NOT NULL")
    op.drop_constraint(op.f("fk_goals_class_id_school_classes"), "goals", type_="foreignkey")
    op.drop_index(
        "uq_goals_school_id_class_id_name", table_name="goals", postgresql_nulls_not_distinct=True
    )
    op.drop_index(op.f("ix_goals_class_id"), table_name="goals")
    op.create_index(
        op.f("uq_goals_school_id_name"),
        "goals",
        ["school_id", sa.literal_column("lower(name::text)")],
        unique=True,
    )
    op.drop_column("goals", "content")
    op.drop_column("goals", "level_name")
    op.drop_column("goals", "level_code")
    op.drop_column("goals", "subject_name")
    op.drop_column("goals", "class_id")
