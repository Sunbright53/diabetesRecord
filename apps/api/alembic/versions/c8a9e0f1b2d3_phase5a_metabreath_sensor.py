"""phase5a: MetaBreath sensor fields + device_calibration + pilot_session

Revision ID: c8a9e0f1b2d3
Revises: b3f1a2c4d5e6
Create Date: 2026-07-06

Adds:
- 14 columns to sensor_readings matching MetaBreath demo dataset
- device_calibration table (baseline, drift tracking)
- pilot_session table (NSC pilot study support)
- devices.needs_recalibration flag
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

revision = "c8a9e0f1b2d3"
down_revision = "b3f1a2c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    # ── sensor_readings: extend with MetaBreath feature columns ──
    with op.batch_alter_table("sensor_readings") as batch:
        batch.add_column(sa.Column("ambient_voc",         sa.Float(), nullable=True))
        batch.add_column(sa.Column("breath_voc",          sa.Float(), nullable=True))
        batch.add_column(sa.Column("acetone_delta",       sa.Float(), nullable=True))
        batch.add_column(sa.Column("pressure_mean",       sa.Float(), nullable=True))
        batch.add_column(sa.Column("pressure_std",        sa.Float(), nullable=True))
        batch.add_column(sa.Column("breath_duration",     sa.Float(), nullable=True))
        batch.add_column(sa.Column("quality_score",       sa.Float(), nullable=True))
        batch.add_column(sa.Column("reliability_score",   sa.Float(), nullable=True))
        batch.add_column(sa.Column("environment_penalty", sa.Float(), nullable=True))
        batch.add_column(sa.Column("slope",               sa.Float(), nullable=True))
        batch.add_column(sa.Column("time_to_peak",        sa.Float(), nullable=True))
        batch.add_column(sa.Column("recovery_rate",       sa.Float(), nullable=True))
        batch.add_column(sa.Column("metabolic_risk_index", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("confidence_score",    sa.Float(), nullable=True))
        batch.add_column(sa.Column("label",               sa.String(30), nullable=True))

    # ── devices: recalibration flag ──
    with op.batch_alter_table("devices") as batch:
        batch.add_column(sa.Column("needs_recalibration", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch.add_column(sa.Column("last_calibrated_at",  sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("firmware_version",    sa.String(50), nullable=True))
        batch.add_column(sa.Column("sensor_model",        sa.String(50), server_default="TGS1820", nullable=True))

    # ── device_calibration table ──
    op.create_table(
        "device_calibration",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", PG_UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("calibrated_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("baseline_voc",       sa.Float(), nullable=False),
        sa.Column("baseline_temp",      sa.Float(), nullable=True),
        sa.Column("baseline_humidity",  sa.Float(), nullable=True),
        sa.Column("baseline_pressure",  sa.Float(), nullable=True),
        sa.Column("gain_factor", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("offset",      sa.Float(), server_default="0.0", nullable=False),
        sa.Column("drift_score", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("method", sa.String(30), nullable=True),  # zero|span|drift_check
        sa.Column("reference_device", sa.String(100), nullable=True),  # ketone_meter|GC-MS|null
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # ── pilot_session table ──
    op.create_table(
        "pilot_session",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cohort", sa.String(30), nullable=False),  # 5day_20p|14day_10p
        sa.Column("day_number", sa.Integer(), nullable=False),
        sa.Column("timepoint", sa.String(30), nullable=False),  # fasting|post_meal_60|post_meal_120
        sa.Column("recorded_at", sa.DateTime(), nullable=False, index=True),
        # day-1 demographics
        sa.Column("bmi", sa.Float(), nullable=True),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("sex", sa.String(10), nullable=True),
        # daily adjuncts
        sa.Column("fasting_hours", sa.Float(), nullable=True),
        sa.Column("food_type", sa.String(30), nullable=True),  # low_carb|high_carb|keto|mixed
        sa.Column("activity_min", sa.Integer(), nullable=True),
        sa.Column("sleep_hours", sa.Float(), nullable=True),
        # gold-standard reference (if available)
        sa.Column("homa_ir", sa.Float(), nullable=True),
        sa.Column("blood_glucose", sa.Float(), nullable=True),
        sa.Column("blood_ketone_mmol", sa.Float(), nullable=True),
        # linked sensor reading (composite FK omitted for time-series compatibility)
        sa.Column("sensor_reading_time", sa.DateTime(), nullable=True),
        sa.Column("sensor_device_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_index("ix_pilot_session_cohort_day", "pilot_session", ["cohort", "day_number"])
    op.create_index("ix_device_calibration_device_time", "device_calibration", ["device_id", "calibrated_at"])


def downgrade():
    op.drop_index("ix_device_calibration_device_time", table_name="device_calibration")
    op.drop_index("ix_pilot_session_cohort_day", table_name="pilot_session")
    op.drop_table("pilot_session")
    op.drop_table("device_calibration")

    with op.batch_alter_table("devices") as batch:
        batch.drop_column("sensor_model")
        batch.drop_column("firmware_version")
        batch.drop_column("last_calibrated_at")
        batch.drop_column("needs_recalibration")

    with op.batch_alter_table("sensor_readings") as batch:
        for col in [
            "label", "confidence_score", "metabolic_risk_index",
            "recovery_rate", "time_to_peak", "slope",
            "environment_penalty", "reliability_score", "quality_score",
            "breath_duration", "pressure_std", "pressure_mean",
            "acetone_delta", "breath_voc", "ambient_voc",
        ]:
            batch.drop_column(col)
