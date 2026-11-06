"""Plans on users.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("plan", sa.String(20), nullable=False, server_default="free"))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("plan")
