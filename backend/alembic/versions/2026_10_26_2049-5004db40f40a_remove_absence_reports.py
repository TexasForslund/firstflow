"""remove absence reports

Frånvaroanmälan är borttagen (Texas, 2026-10-26). Anmälda frånvaro- och sjukdagar tas bort,
så att bara incheckningar finns kvar. Tabellen ändras inte.

Revision ID: 5004db40f40a
Revises: 2f1ca496276a
Create Date: 2026-10-26 20:49:37.337266

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5004db40f40a"
down_revision: str | Sequence[str] | None = "2f1ca496276a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM attendance WHERE status <> 'present'")


def downgrade() -> None:
    # De borttagna dagarna går inte att återskapa.
    pass
