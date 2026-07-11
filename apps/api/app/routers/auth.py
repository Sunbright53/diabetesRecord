from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_db
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import decode_refresh_token, create_access_token, create_refresh_token
from app.schemas.auth import RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, UserOut, ProfileOut
from app.services.auth import register_user, login_user, get_user_with_profile
from app.models.user import User
from uuid import UUID

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await register_user(body, db)

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(body.username, body.password, db)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest):
    user_id = decode_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")
    uid = UUID(user_id)
    return TokenResponse(
        access_token=create_access_token(uid),
        refresh_token=create_refresh_token(uid),
    )

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user, profile = await get_user_with_profile(current_user.id, db)
    profile_out = ProfileOut(
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        goal_type=profile.goal_type,
        onboarded_at=profile.onboarded_at,
    ) if profile else None
    is_admin = bool(
        user.role == "admin"
        or (settings.ADMIN_EMAIL and user.email.lower() == settings.ADMIN_EMAIL.lower())
    )
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        created_at=user.created_at,
        profile=profile_out,
        is_admin=is_admin,
    )
