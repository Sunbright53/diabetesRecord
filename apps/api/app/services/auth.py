from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import HTTPException, status
from uuid import UUID
from datetime import datetime
import secrets

from app.models.user import User, Profile
from app.models.health import Device
from app.models.gamification import Streak
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.schemas.auth import RegisterRequest, TokenResponse

async def register_user(body: RegisterRequest, db: AsyncSession) -> TokenResponse:
    # Check duplicates
    existing = await db.exec(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already taken")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # get user.id before Profile FK

    profile = Profile(
        user_id=user.id,
        display_name=body.display_name or body.username,
        goal_type=body.goal_type,
    )
    streak = Streak(user_id=user.id)
    db.add(profile)
    db.add(streak)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )

async def login_user(username: str, password: str, db: AsyncSession) -> TokenResponse:
    result = await db.exec(select(User).where(User.username == username))
    user = result.first()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    user.last_login_at = datetime.utcnow()
    db.add(user)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )

async def deactivate_user(user: User, db: AsyncSession) -> None:
    """
    Admin-triggered account deletion. A soft delete, not a row delete — related
    tables (devices, profiles, meal logs, friendships, etc.) have no ON DELETE
    CASCADE, so hard-deleting the user row would violate FK constraints across
    most of the schema. Any active devices the user owns are deactivated first
    (force-unlink) rather than blocking the deletion.
    """
    devices_result = await db.exec(
        select(Device).where(Device.user_id == user.id, Device.active == True)
    )
    for device in devices_result.all():
        device.active = False
        db.add(device)

    suffix = secrets.token_hex(8)
    user.is_active = False
    user.email = f"deleted-{suffix}@deleted.local"
    user.username = f"deleted-{suffix}"
    user.hashed_password = secrets.token_hex(32)
    db.add(user)
    await db.commit()


async def get_user_with_profile(user_id: UUID, db: AsyncSession):
    result = await db.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.exec(select(Profile).where(Profile.user_id == user_id))
    profile = result.first()
    return user, profile
