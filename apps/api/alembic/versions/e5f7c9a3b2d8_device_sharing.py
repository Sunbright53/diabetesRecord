"""device sharing: session-based multi-user device access

Revision ID: e5f7c9a3b2d8
Revises: d4e2f6a8b1c9
Create Date: 2026-07-08

Adds:
- devices.is_shared          bool, default false
- sensor_readings.user_id    nullable UUID FK users(id), backfilled from device owner
- device_session table       one active session per device via partial unique index

Bootstraps arty's existing physical device to is_shared=true so any signed-in
user can claim it without re-flashing firmware.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "e5f7c9a3b2d8"
down_revision = "d4e2f6a8b1c9"
branch_labels = None
depends_on = None


def upgrade():
    # 1. devices.is_shared
    op.add_column(
        "devices",
        sa.Column("is_shared", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    # 2. sensor_readings.user_id (nullable; backfill from device owner)
    op.add_column(
        "sensor_readings",
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "sensor_readings_user_id_fkey",
        "sensor_readings",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_sensor_readings_user_time",
        "sensor_readings",
        ["user_id", sa.text("time DESC")],
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    # Backfill: historical readings inherit device.user_id
    op.execute(
        """
        UPDATE sensor_readings sr
        SET user_id = d.user_id
        FROM devices d
        WHERE sr.device_id = d.id AND sr.user_id IS NULL
        """
    )

    # 3. device_session table
    op.create_table(
        "device_session",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", PG_UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_device_session_device", "device_session", ["device_id"])
    op.create_index("ix_device_session_user", "device_session", ["user_id"])
    # One active session per device
    op.create_index(
        "ux_device_session_active_per_device",
        "device_session",
        ["device_id"],
        unique=True,
        postgresql_where=sa.text("active = true"),
    )

    # 4. Bootstrap arty's device as shared (safe no-op if it doesn't exist)
    op.execute(
        """
        UPDATE devices
        SET is_shared = true
        WHERE id = '20afa5d2-54dc-410f-a8ee-ebe692762360'
        """
    )


def downgrade():
    op.drop_index("ux_device_session_active_per_device", table_name="device_session")
    op.drop_index("ix_device_session_user", table_name="device_session")
    op.drop_index("ix_device_session_device", table_name="device_session")
    op.drop_table("device_session")

    op.drop_index("ix_sensor_readings_user_time", table_name="sensor_readings")
    op.drop_constraint("sensor_readings_user_id_fkey", "sensor_readings", type_="foreignkey")
    op.drop_column("sensor_readings", "user_id")

    op.drop_column("devices", "is_shared")
