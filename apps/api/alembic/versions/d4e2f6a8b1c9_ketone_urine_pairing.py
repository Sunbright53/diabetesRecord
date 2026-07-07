"""ketone urine pairing: urine strip fields + breath pairing on ketone_logs

Revision ID: d4e2f6a8b1c9
Revises: c8a9e0f1b2d3
Create Date: 2026-07-07

Adds to ketone_logs:
- ketone_type (blood|urine)
- urine_category / urine_mg_dl (semi-quantitative strip reading)
- paired_reading_time / paired_device_id (link to a breath SensorReading
  for breath↔ground-truth agreement analysis)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "d4e2f6a8b1c9"
down_revision = "c8a9e0f1b2d3"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("ketone_logs") as batch:
        batch.add_column(sa.Column("ketone_type", sa.String(10), server_default="blood", nullable=False))
        batch.add_column(sa.Column("urine_category", sa.String(12), nullable=True))
        batch.add_column(sa.Column("urine_mg_dl", sa.Float(), nullable=True))
        batch.add_column(sa.Column("paired_reading_time", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("paired_device_id", PG_UUID(as_uuid=True), nullable=True))
        batch.create_foreign_key(
            "fk_ketone_logs_paired_device",
            "devices",
            ["paired_device_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("ketone_logs") as batch:
        batch.drop_constraint("fk_ketone_logs_paired_device", type_="foreignkey")
        batch.drop_column("paired_device_id")
        batch.drop_column("paired_reading_time")
        batch.drop_column("urine_mg_dl")
        batch.drop_column("urine_category")
        batch.drop_column("ketone_type")
