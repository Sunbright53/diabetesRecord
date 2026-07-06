from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

class Friendship(SQLModel, table=True):
    __tablename__ = "friendships"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_a: UUID = Field(foreign_key="users.id", index=True)
    user_b: UUID = Field(foreign_key="users.id")
    status: str = Field(default="pending", max_length=20)  # pending|accepted|blocked
    since: datetime = Field(default_factory=datetime.utcnow)

class FriendCode(SQLModel, table=True):
    __tablename__ = "friend_codes"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    code: str = Field(unique=True, index=True, max_length=12)
    expires_at: datetime

class Challenge(SQLModel, table=True):
    __tablename__ = "challenges"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    kind: str = Field(max_length=30)  # 7day-ketone|streak|xp
    creator_id: UUID = Field(foreign_key="users.id", index=True)
    invitee_id: UUID = Field(foreign_key="users.id")
    start_at: datetime
    end_at: datetime
    rules: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    status: str = Field(default="pending", max_length=20)  # pending|active|completed|declined
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChallengeScore(SQLModel, table=True):
    __tablename__ = "challenge_scores"

    challenge_id: UUID = Field(foreign_key="challenges.id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    score: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
