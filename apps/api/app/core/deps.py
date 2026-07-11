from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel.ext.asyncio.session import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.core.security import decode_access_token

http_bearer = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import User
    from sqlmodel import select

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.exec(select(User).where(User.id == UUID(user_id)))
    user = result.first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    x_admin_password: str = Header(None, alias="X-Admin-Password"),
    db: AsyncSession = Depends(get_db),
):
    from app.core.config import settings
    from app.models.user import User
    from sqlmodel import select

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.exec(select(User).where(User.id == UUID(user_id)))
    user = result.first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Path 1: role-based admin account (e.g. the seeded "admin" user) — JWT alone is enough.
    if user.role == "admin":
        return user

    # Path 2 (legacy): JWT belongs to ADMIN_EMAIL and X-Admin-Password header matches ADMIN_PASSWORD.
    if (
        settings.ADMIN_EMAIL and user.email.lower() == settings.ADMIN_EMAIL.lower()
        and settings.ADMIN_PASSWORD and x_admin_password == settings.ADMIN_PASSWORD
    ):
        return user

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
