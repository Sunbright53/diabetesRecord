from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import select
from datetime import datetime, timedelta
from typing import List

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import KetoneLog, WeightLog, MealLog, ActivityLog, Device, SensorReading
from app.services import signal_processing as sp
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

# Auto-pair a ground-truth ketone reading to a breath measurement taken within
# this window (breath is real-time; a strip dipped right after should match up).
_PAIR_WINDOW = timedelta(minutes=15)


@router.post("/ketone", response_model=KetoneLogOut, status_code=201)
async def create_ketone(
    body: KetoneLogCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump()

    # ── Derive urine band → value_mmol / category so blood + urine store uniformly ──
    if data["ketone_type"] == "urine":
        category = data.get("urine_category")
        mg_dl = data.get("urine_mg_dl")
        if not category and mg_dl is not None:
            category = sp.urine_mg_dl_to_category(mg_dl)
            data["urine_category"] = category
        if not category:
            raise HTTPException(422, "urine reading needs urine_category or urine_mg_dl")
        if sp.urine_category_rank(category) is None:
            raise HTTPException(422, f"invalid urine_category: {category}")
        if data.get("value_mmol") is None:
            data["value_mmol"] = (
                sp.urine_category_to_mmol(category)
                if mg_dl is None
                else round(mg_dl / 10.0, 2)  # mg/dL → approx mmol/L for acetoacetate
            )
    else:
        if data.get("value_mmol") is None:
            raise HTTPException(422, "blood ketone reading needs value_mmol")

    # ── Auto-link to the most recent breath reading if the client didn't ──
    if data.get("paired_reading_time") is None:
        dev_result = await db.exec(
            select(Device).where(Device.user_id == user.id, Device.active == True)
        )
        device_ids = [d.id for d in dev_result.all()]
        if device_ids:
            cutoff = datetime.utcnow() - _PAIR_WINDOW
            reading_result = await db.exec(
                select(SensorReading)
                .where(
                    SensorReading.device_id.in_(device_ids),
                    SensorReading.time >= cutoff,
                    SensorReading.acetone_delta.isnot(None),
                )
                .order_by(SensorReading.time.desc())
            )
            latest = reading_result.first()
            if latest:
                data["paired_reading_time"] = latest.time
                data["paired_device_id"] = latest.device_id

    log = KetoneLog(user_id=user.id, **data)
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
