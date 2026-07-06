from fastapi import APIRouter, Depends, Query
from sqlmodel import select
from datetime import datetime, timedelta
from typing import List

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import KetoneLog, WeightLog, MealLog, ActivityLog
from app.schemas.logs import (
    KetoneLogCreate, KetoneLogOut,
    WeightLogCreate, WeightLogOut,
    MealLogCreate, MealLogOut,
    ActivityLogCreate, ActivityLogOut,
)

router = APIRouter(prefix="/logs", tags=["logs"])

def since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)

# ─── Ketone ──────────────────────────────────────────
@router.get("/ketone", response_model=List[KetoneLogOut])
async def list_ketone(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.exec(
        select(KetoneLog)
        .where(KetoneLog.user_id == user.id, KetoneLog.ts >= since(days))
        .order_by(KetoneLog.ts)
    )
    return result.all()

@router.post("/ketone", response_model=KetoneLogOut, status_code=201)
async def create_ketone(
    body: KetoneLogCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    log = KetoneLog(user_id=user.id, **body.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log

# ─── Weight ──────────────────────────────────────────
@router.get("/weight", response_model=List[WeightLogOut])
async def list_weight(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.exec(
        select(WeightLog)
        .where(WeightLog.user_id == user.id, WeightLog.ts >= since(days))
        .order_by(WeightLog.ts)
    )
    return result.all()

@router.post("/weight", response_model=WeightLogOut, status_code=201)
async def create_weight(
    body: WeightLogCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    log = WeightLog(user_id=user.id, **body.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log

# ─── Meal ────────────────────────────────────────────
@router.get("/meal", response_model=List[MealLogOut])
async def list_meal(
    days: int = Query(default=7, ge=1, le=365),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.exec(
        select(MealLog)
        .where(MealLog.user_id == user.id, MealLog.ts >= since(days))
        .order_by(MealLog.ts)
    )
    return result.all()

@router.post("/meal", response_model=MealLogOut, status_code=201)
async def create_meal(
    body: MealLogCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    log = MealLog(user_id=user.id, **body.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log

# ─── Activity ────────────────────────────────────────
@router.get("/activity", response_model=List[ActivityLogOut])
async def list_activity(
    days: int = Query(default=7, ge=1, le=365),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.exec(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id, ActivityLog.ts >= since(days))
        .order_by(ActivityLog.ts)
    )
    return result.all()

@router.post("/activity", response_model=ActivityLogOut, status_code=201)
async def create_activity(
    body: ActivityLogCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    log = ActivityLog(user_id=user.id, **body.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log
