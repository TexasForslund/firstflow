"""Arbetstider för företag och egna tider per praktikplats

Revision ID: e93361fd017a
Revises: b60c0f1eebed
Create Date: 2026-11-07 15:22:14.334555

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e93361fd017a"
down_revision: str | Sequence[str] | None = "b60c0f1eebed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workplace_hours",
        sa.Column("workplace_id", sa.Uuid(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint(
            "start_time < end_time", name=op.f("ck_workplace_hours_start_before_end")
        ),
        sa.CheckConstraint(
            "weekday BETWEEN 0 AND 6", name=op.f("ck_workplace_hours_weekday_valid")
        ),
        sa.ForeignKeyConstraint(
            ["workplace_id"],
            ["workplaces.id"],
            name=op.f("fk_workplace_hours_workplace_id_workplaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("workplace_id", "weekday", name=op.f("pk_workplace_hours")),
    )
    op.create_table(
        "placement_hours",
        sa.Column("placement_id", sa.Uuid(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint(
            "start_time < end_time", name=op.f("ck_placement_hours_start_before_end")
        ),
        sa.CheckConstraint(
            "weekday BETWEEN 0 AND 6", name=op.f("ck_placement_hours_weekday_valid")
        ),
        sa.ForeignKeyConstraint(
            ["placement_id"],
            ["placements.id"],
            name=op.f("fk_placement_hours_placement_id_placements"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("placement_id", "weekday", name=op.f("pk_placement_hours")),
    )


def downgrade() -> None:
    op.drop_table("placement_hours")
    op.drop_table("workplace_hours")
