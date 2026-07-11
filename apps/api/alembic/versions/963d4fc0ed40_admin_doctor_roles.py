"""admin/doctor roles: role column on users, assigned_doctor_id on profiles, seed admin account

Revision ID: 963d4fc0ed40
Revises: e5f7c9a3b2d8
Create Date: 2026-07-11

Adds:
- users.role (patient|doctor|admin, default patient)
- profiles.assigned_doctor_id (nullable FK -> users.id, the patient's assigned doctor)
- seeds a single admin account (username=admin, password=admin1234) so there is a
  real role-based admin login independent of the legacy ADMIN_EMAIL/ADMIN_PASSWORD
  env-var gate. Idempotent: skipped if a user named "admin" already exists.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from uuid import uuid4
from datetime import datetime

revision = "963d4fc0ed40"
down_revision = "e5f7c9a3b2d8"
branch_labels = None
depends_on = None

# Precomputed via passlib.context.CryptContext(schemes=["bcrypt"]).hash("admin1234")
# (same bcrypt scheme app/core/security.py uses, so normal login verifies it as-is).
ADMIN_PASSWORD_HASH = "$2b$12$qPiIupqCaNkgNutADuMnNO8a8/nQNDd1eQc4U2KKar4twhYenOGYO"


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("role", sa.String(20), server_default="patient", nullable=False))

    with op.batch_alter_table("profiles") as batch:
        batch.add_column(sa.Column("assigned_doctor_id", PG_UUID(as_uuid=True), nullable=True))
        batch.create_foreign_key(
            "fk_profiles_assigned_doctor",
            "users",
            ["assigned_doctor_id"],
            ["id"],
            ondelete="SET NULL",
        )

    conn = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", PG_UUID(as_uuid=True)),
        sa.column("email", sa.String),
        sa.column("username", sa.String),
        sa.column("hashed_password", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("role", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    profiles = sa.table(
        "profiles",
        sa.column("user_id", PG_UUID(as_uuid=True)),
        sa.column("display_name", sa.String),
        sa.column("goal_type", sa.String),
    )

    existing = conn.execute(sa.select(users.c.id).where(users.c.username == "admin")).first()
    if existing is None:
        admin_id = uuid4()
        conn.execute(
            users.insert().values(
                id=admin_id,
                email="admin@internal.local",
                username="admin",
                hashed_password=ADMIN_PASSWORD_HASH,
                is_active=True,
                role="admin",
                created_at=datetime.utcnow(),
            )
        )
        conn.execute(
            profiles.insert().values(
                user_id=admin_id,
                display_name="Admin",
                goal_type="monitor",
            )
        )


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE username = 'admin')"))
    conn.execute(sa.text("DELETE FROM users WHERE username = 'admin'"))

    with op.batch_alter_table("profiles") as batch:
        batch.drop_constraint("fk_profiles_assigned_doctor", type_="foreignkey")
        batch.drop_column("assigned_doctor_id")

    with op.batch_alter_table("users") as batch:
        batch.drop_column("role")
