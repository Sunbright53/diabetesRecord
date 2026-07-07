from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional
import re

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    goal_type: str = "monitor"

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,30}$", v):
            raise ValueError("username: 3-30 chars, letters/numbers/underscore only")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v

    @field_validator("goal_type")
    @classmethod
    def goal_valid(cls, v: str) -> str:
        if v not in ("keto", "exercise", "fasting", "monitor"):
            raise ValueError("goal_type must be keto|exercise|fasting|monitor")
        return v

class LoginRequest(BaseModel):
    username: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class ProfileOut(BaseModel):
    display_name: str
    avatar_url: Optional[str]
    goal_type: str
    onboarded_at: Optional[datetime]

class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    created_at: datetime
    profile: Optional[ProfileOut] = None
    is_admin: bool = False
