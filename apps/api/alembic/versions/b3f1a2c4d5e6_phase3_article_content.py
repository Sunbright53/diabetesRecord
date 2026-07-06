"""phase3: add articles.content column

Revision ID: b3f1a2c4d5e6
Revises: ea0d46cf1085
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa

revision = "b3f1a2c4d5e6"
down_revision = "ea0d46cf1085"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("articles", sa.Column("content", sa.Text(), nullable=True))
    # mdx_path was NOT NULL in the original model — make it nullable/defaulted
    op.alter_column("articles", "mdx_path", server_default="", nullable=True)

def downgrade():
    op.drop_column("articles", "content")
    op.alter_column("articles", "mdx_path", server_default=None, nullable=False)
