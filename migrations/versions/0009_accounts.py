"""Account details: display name, email verification and token versions.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("display_name", sa.String(60), nullable=True))
        # Existing accounts were created before verification existed: treat them as verified.
        batch.add_column(sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("token_version")
        batch.drop_column("email_verified")
        batch.drop_column("display_name")
