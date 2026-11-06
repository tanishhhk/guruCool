"""Google and phone sign-in: optional email and password, phone and Firebase id.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column("email", existing_type=sa.String(), nullable=True)
        batch.alter_column("hashed_password", existing_type=sa.String(), nullable=True)
        batch.add_column(sa.Column("phone", sa.String(20), nullable=True))
        batch.add_column(sa.Column("firebase_uid", sa.String(128), nullable=True))
        batch.create_unique_constraint("uq_users_phone", ["phone"])
        batch.create_unique_constraint("uq_users_firebase_uid", ["firebase_uid"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_firebase_uid", type_="unique")
        batch.drop_constraint("uq_users_phone", type_="unique")
        batch.drop_column("firebase_uid")
        batch.drop_column("phone")
        batch.alter_column("hashed_password", existing_type=sa.String(), nullable=False)
        batch.alter_column("email", existing_type=sa.String(), nullable=False)
