from fastapi import APIRouter, Depends
from sqlmodel import select
from datetime import datetime

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User, Profile
from app.schemas.logs import ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])

@router.patch("", status_code=200)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.exec(select(Profile).where(Profile.user_id == user.id))
    profile = result.first()
    if not profile:
        return {}

    data = body.model_dump(exclude_none=True)

    if "onboarded_at" in data:
        try:
            data["onboarded_at"] = datetime.fromisoformat(data["onboarded_at"].replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            data["onboarded_at"] = datetime.utcnow()

    for field, value in data.items():
        if hasattr(profile, field):
            setattr(profile, field, value)

    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return {
        "display_name": profile.display_name,
        "avatar_url":   profile.avatar_url,
        "goal_type":    profile.goal_type,
        "onboarded_at": profile.onboarded_at.isoformat() if profile.onboarded_at else None,
    }
