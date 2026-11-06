"""Plans, video voices and story preferences.

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
        batch.add_column(sa.Column("story_voice", sa.String(20), nullable=True))
        batch.add_column(sa.Column("story_depth", sa.String(20), nullable=True))
        batch.add_column(sa.Column("story_style", sa.String(20), nullable=True))
    with op.batch_alter_table("video_jobs") as batch:
        batch.add_column(sa.Column("voice", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("video_jobs") as batch:
        batch.drop_column("voice")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("story_style")
        batch.drop_column("story_depth")
        batch.drop_column("story_voice")
        batch.drop_column("plan")
