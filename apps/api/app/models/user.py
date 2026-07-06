from sqlmodel import SQLModel, Field
from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime, date
from typing import Optional

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, max_length=50)
    hashed_password: str
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None

class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    display_name: str = Field(max_length=100)
    avatar_url: Optional[str] = Field(default=None, max_length=512)
    dob: Optional[date] = None
    sex: Optional[str] = Field(default=None, max_length=10)
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    goal_type: str = Field(default="monitor", max_length=20)  # exercise|fasting|monitor
    onboarded_at: Optional[datetime] = None

class Questionnaire(SQLModel, table=True):
    __tablename__ = "questionnaires"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    answers: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    computed_factors: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow)
