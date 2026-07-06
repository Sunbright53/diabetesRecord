from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional

class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    ua: Optional[str] = None

class ReminderCreate(BaseModel):
    kind: str
    schedule: str  # cron e.g. "0 9 * * *"
    message: Optional[str] = None

class ReminderOut(BaseModel):
    id: UUID
    kind: str
    schedule: str
    message: Optional[str]
    next_fire_at: Optional[datetime]
    enabled: bool
    created_at: datetime
