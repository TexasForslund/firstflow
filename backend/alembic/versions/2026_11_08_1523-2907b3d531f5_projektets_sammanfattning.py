"""Projektets sammanfattning: elevens svar, mål, bilder och påminnelse (idé 12:6, steg 2)

Revision ID: 2907b3d531f5
Revises: 32eb63317703
Create Date: 2026-11-08 15:23:21.109452

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2907b3d531f5"
down_revision: str | Sequence[str] | None = "32eb63317703"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "project_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("best", sa.String(length=300), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "rating BETWEEN 1 AND 5", name=op.f("ck_project_summaries_rating_range")
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_summaries_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_project_summaries_student_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_project_summaries")),
        sa.UniqueConstraint(
            "project_id", "student_id", name=op.f("uq_project_summaries_project_id")
        ),
    )
    op.create_index(
        op.f("ix_project_summaries_student_id"), "project_summaries", ["student_id"], unique=False
    )
    op.create_table(
        "project_summary_reminders",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_summary_reminders_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_project_summary_reminders_student_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "project_id", "student_id", name=op.f("pk_project_summary_reminders")
        ),
    )
    op.create_table(
        "project_summary_goals",
        sa.Column("summary_id", sa.Uuid(), nullable=False),
        sa.Column("goal_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["goal_id"],
            ["goals.id"],
            name=op.f("fk_project_summary_goals_goal_id_goals"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["summary_id"],
            ["project_summaries.id"],
            name=op.f("fk_project_summary_goals_summary_id_project_summaries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("summary_id", "goal_id", name=op.f("pk_project_summary_goals")),
    )
    op.create_index(
        op.f("ix_project_summary_goals_goal_id"), "project_summary_goals", ["goal_id"], unique=False
    )
    op.create_table(
        "project_summary_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("summary_id", sa.Uuid(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_summary_images_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_project_summary_images_student_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["summary_id"],
            ["project_summaries.id"],
            name=op.f("fk_project_summary_images_summary_id_project_summaries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_project_summary_images")),
    )
    op.create_index(
        "ix_project_summary_images_project_id_student_id",
        "project_summary_images",
        ["project_id", "student_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_project_summary_images_summary_id"),
        "project_summary_images",
        ["summary_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_project_summary_images_summary_id"), table_name="project_summary_images")
    op.drop_index(
        "ix_project_summary_images_project_id_student_id", table_name="project_summary_images"
    )
    op.drop_table("project_summary_images")
    op.drop_index(op.f("ix_project_summary_goals_goal_id"), table_name="project_summary_goals")
    op.drop_table("project_summary_goals")
    op.drop_table("project_summary_reminders")
    op.drop_index(op.f("ix_project_summaries_student_id"), table_name="project_summaries")
    op.drop_table("project_summaries")
