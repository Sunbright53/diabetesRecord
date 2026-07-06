from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime, date
from typing import Optional

class XPLedger(SQLModel, table=True):
    __tablename__ = "xp_ledger"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    delta: int  # +/- XP
    reason: str = Field(max_length=100)  # quest_complete|streak|article_read|challenge_win|...
    ref_type: Optional[str] = Field(default=None, max_length=50)
    ref_id: Optional[UUID] = None

class Streak(SQLModel, table=True):
    __tablename__ = "streaks"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    current: int = Field(default=0)
    longest: int = Field(default=0)
    last_active_date: Optional[date] = None
    freezes_left: int = Field(default=2)

class Badge(SQLModel, table=True):
    __tablename__ = "badges"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    code: str = Field(unique=True, max_length=50)
    name: str = Field(max_length=100)
    icon: str = Field(max_length=10)  # emoji
    description: str = Field(max_length=300)
    criteria: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

class UserBadge(SQLModel, table=True):
    __tablename__ = "user_badges"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    badge_id: UUID = Field(foreign_key="badges.id", primary_key=True)
    awarded_at: datetime = Field(default_factory=datetime.utcnow)

class Quest(SQLModel, table=True):
    """Quest templates — daily quests are generated from these each day by Celery."""
    __tablename__ = "quests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    code: str = Field(unique=True, max_length=50)
    title: str = Field(max_length=150)
    description: str = Field(max_length=500)
    xp_reward: int = Field(default=20)
    goal_types: Optional[list] = Field(default=None, sa_column=Column(JSONB))  # which goal_type sees this quest
    template: Optional[dict] = Field(default=None, sa_column=Column(JSONB))    # completion criteria

class QuestProgress(SQLModel, table=True):
    __tablename__ = "quest_progress"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    quest_id: UUID = Field(foreign_key="quests.id")
    quest_date: date = Field(index=True)
    progress: int = Field(default=0)
    target: int = Field(default=1)
    completed_at: Optional[datetime] = None

class League(SQLModel, table=True):
    __tablename__ = "leagues"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tier: str = Field(max_length=20)  # bronze|silver|gold|platinum|diamond|legend
    week_start: date = Field(index=True)

class LeagueMember(SQLModel, table=True):
    __tablename__ = "league_members"

    league_id: UUID = Field(foreign_key="leagues.id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    xp_week: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
