"""Delad företagsprofil: ett företag kan ha elever från flera skolor

Texas, 2026-11-02: en handledare har en enda företagsprofil, som alla skolor med elever där
ser. Varje skola ser bara sina egna elever.

- Ny tabell `workplace_schools` (företag, skola, ägande lärare) ersätter
  `workplaces.school_id` och `workplaces.owner_teacher_id`.
- Företag som delar en handledare slås ihop. Det äldsta blir kvar, och placeringar,
  projekt, kontrakt, inbjudningar, handledare och skolor flyttas dit. Tomma fält fylls i
  från de andra.
- En handledare kan bara finnas på ett företag (unik `supervisor_id`).

Revision ID: 5c1e7d2a9b34
Revises: a6f1cf4f833a
Create Date: 2026-11-02 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "5c1e7d2a9b34"
down_revision: str | None = "a6f1cf4f833a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _merge_shared_workplaces(conn: sa.Connection) -> None:
    """Slår ihop företag som hänger ihop via en gemensam handledare."""
    links = conn.execute(
        sa.text("SELECT workplace_id, supervisor_id FROM workplace_supervisors")
    ).all()
    created = dict(conn.execute(sa.text("SELECT id, created_at FROM workplaces")).all())

    # Union–find: företag i samma grupp delar handledare, direkt eller via ett annat företag.
    parent = {w: w for w in created}

    def find(w):  # noqa: ANN001, ANN202
        while parent[w] != w:
            parent[w] = parent[parent[w]]
            w = parent[w]
        return w

    by_supervisor: dict = {}
    for workplace_id, supervisor_id in links:
        by_supervisor.setdefault(supervisor_id, []).append(workplace_id)
    for workplaces in by_supervisor.values():
        for other in workplaces[1:]:
            a, b = find(workplaces[0]), find(other)
            if a != b:
                parent[b] = a

    groups: dict = {}
    for w in created:
        groups.setdefault(find(w), []).append(w)

    for members in groups.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda w: (created[w], str(w)))
        keep, *rest = members
        for old in rest:
            params = {"keep": keep, "old": old}
            for table in ("placements", "projects", "contracts", "invitations"):
                conn.execute(
                    sa.text(f"UPDATE {table} SET workplace_id = :keep WHERE workplace_id = :old"),
                    params,
                )
            conn.execute(
                sa.text(
                    "INSERT INTO workplace_supervisors (workplace_id, supervisor_id) "
                    "SELECT :keep, supervisor_id FROM workplace_supervisors "
                    "WHERE workplace_id = :old ON CONFLICT DO NOTHING"
                ),
                params,
            )
            conn.execute(
                sa.text(
                    "INSERT INTO workplace_schools (workplace_id, school_id, owner_teacher_id) "
                    "SELECT :keep, school_id, owner_teacher_id FROM workplace_schools "
                    "WHERE workplace_id = :old ON CONFLICT DO NOTHING"
                ),
                params,
            )
            conn.execute(
                sa.text(
                    "UPDATE workplaces k SET "
                    "address = COALESCE(k.address, o.address), "
                    "industry = COALESCE(k.industry, o.industry), "
                    "description = COALESCE(k.description, o.description) "
                    "FROM workplaces o WHERE k.id = :keep AND o.id = :old"
                ),
                params,
            )
            conn.execute(sa.text("DELETE FROM workplaces WHERE id = :old"), params)


def upgrade() -> None:
    op.create_table(
        "workplace_schools",
        sa.Column("workplace_id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("owner_teacher_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_teacher_id"],
            ["users.id"],
            name=op.f("fk_workplace_schools_owner_teacher_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["school_id"],
            ["schools.id"],
            name=op.f("fk_workplace_schools_school_id_schools"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workplace_id"],
            ["workplaces.id"],
            name=op.f("fk_workplace_schools_workplace_id_workplaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("workplace_id", "school_id", name=op.f("pk_workplace_schools")),
    )
    op.create_index(
        op.f("ix_workplace_schools_school_id"), "workplace_schools", ["school_id"], unique=False
    )
    op.create_index(
        op.f("ix_workplace_schools_owner_teacher_id"),
        "workplace_schools",
        ["owner_teacher_id"],
        unique=False,
    )
    op.execute(
        "INSERT INTO workplace_schools (workplace_id, school_id, owner_teacher_id, created_at) "
        "SELECT id, school_id, owner_teacher_id, created_at FROM workplaces"
    )

    _merge_shared_workplaces(op.get_bind())

    op.drop_index(op.f("ix_workplaces_school_id"), table_name="workplaces")
    op.drop_column("workplaces", "school_id")
    op.drop_column("workplaces", "owner_teacher_id")

    op.drop_index(
        op.f("ix_workplace_supervisors_supervisor_id"), table_name="workplace_supervisors"
    )
    op.create_unique_constraint(
        op.f("uq_workplace_supervisors_supervisor_id"), "workplace_supervisors", ["supervisor_id"]
    )


def downgrade() -> None:
    # Sammanslagna företag delas inte upp igen. Varje företag får sin första skola tillbaka.
    op.drop_constraint(
        op.f("uq_workplace_supervisors_supervisor_id"), "workplace_supervisors", type_="unique"
    )
    op.create_index(
        op.f("ix_workplace_supervisors_supervisor_id"),
        "workplace_supervisors",
        ["supervisor_id"],
        unique=False,
    )
    op.add_column("workplaces", sa.Column("owner_teacher_id", sa.Uuid(), nullable=True))
    op.add_column("workplaces", sa.Column("school_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE workplaces w SET school_id = s.school_id, owner_teacher_id = s.owner_teacher_id "
        "FROM (SELECT DISTINCT ON (workplace_id) workplace_id, school_id, owner_teacher_id "
        "FROM workplace_schools ORDER BY workplace_id, created_at) s WHERE s.workplace_id = w.id"
    )
    op.alter_column("workplaces", "school_id", nullable=False)
    op.create_foreign_key(
        op.f("fk_workplaces_school_id_schools"),
        "workplaces",
        "schools",
        ["school_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_workplaces_owner_teacher_id_users"),
        "workplaces",
        "users",
        ["owner_teacher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_workplaces_school_id"), "workplaces", ["school_id"], unique=False)
    op.create_index(
        op.f("ix_workplaces_owner_teacher_id"), "workplaces", ["owner_teacher_id"], unique=False
    )
    op.drop_index(op.f("ix_workplace_schools_owner_teacher_id"), table_name="workplace_schools")
    op.drop_index(op.f("ix_workplace_schools_school_id"), table_name="workplace_schools")
    op.drop_table("workplace_schools")
