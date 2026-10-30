"""mål från läroplanen

Skolans mål (idé 10, Texas 2026-10-30). Projektens fritexttaggar blir mål: varje tagg blir ett
mål på skolan (samma namn oavsett stora och små bokstäver blir ett mål) och kopplas till projektet.

Revision ID: a6f1cf4f833a
Revises: 1fb063b0006e
Create Date: 2026-10-30 12:26:01.183933

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6f1cf4f833a"
down_revision: str | Sequence[str] | None = "1fb063b0006e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "goals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("curriculum", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["school_id"],
            ["schools.id"],
            name=op.f("fk_goals_school_id_schools"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_goals")),
    )
    op.create_index(op.f("ix_goals_school_id"), "goals", ["school_id"], unique=False)
    op.create_index(
        "uq_goals_school_id_name", "goals", ["school_id", sa.text("lower(name)")], unique=True
    )
    op.create_table(
        "project_goals",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("goal_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["goal_id"],
            ["goals.id"],
            name=op.f("fk_project_goals_goal_id_goals"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_goals_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("project_id", "goal_id", name=op.f("pk_project_goals")),
    )
    op.create_index(op.f("ix_project_goals_goal_id"), "project_goals", ["goal_id"], unique=False)
    # Taggarna blir mål. Första stavningen av ett namn på skolan vinner.
    op.execute(
        """
        INSERT INTO goals (id, school_id, name)
        SELECT gen_random_uuid(), school_id, min(tag)
        FROM projects, unnest(tags) AS tag
        GROUP BY school_id, lower(tag)
        """
    )
    op.execute(
        """
        INSERT INTO project_goals (project_id, goal_id)
        SELECT DISTINCT p.id, g.id
        FROM projects p
        CROSS JOIN LATERAL unnest(p.tags) AS tag
        JOIN goals g ON g.school_id = p.school_id AND lower(g.name) = lower(tag)
        """
    )
    op.drop_column("projects", "tags")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "projects",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(length=40)),
            server_default=sa.text("'{}'::character varying[]"),
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE projects p SET tags = ARRAY(
          SELECT g.name FROM project_goals pg JOIN goals g ON g.id = pg.goal_id
          WHERE pg.project_id = p.id ORDER BY g.name)
        """
    )
    op.drop_index(op.f("ix_project_goals_goal_id"), table_name="project_goals")
    op.drop_table("project_goals")
    op.drop_index("uq_goals_school_id_name", table_name="goals")
    op.drop_index(op.f("ix_goals_school_id"), table_name="goals")
    op.drop_table("goals")
