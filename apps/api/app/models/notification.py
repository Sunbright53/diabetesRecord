from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscriptions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    endpoint: str = Field(max_length=1000)
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)
    ua: Optional[str] = Field(default=None, max_length=300)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Reminder(SQLModel, table=True):
    __tablename__ = "reminders"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    kind: str = Field(max_length=30)  # ketone|weight|meal|custom
    schedule: str = Field(max_length=100)  # cron expression e.g. "0 9 * * *"
    message: Optional[str] = Field(default=None, max_length=200)
    next_fire_at: Optional[datetime] = Field(default=None, index=True)
    enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class NotificationLog(SQLModel, table=True):
    __tablename__ = "notification_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)
    kind: str = Field(max_length=50)
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    delivered: bool = Field(default=False)
