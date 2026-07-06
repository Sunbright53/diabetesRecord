from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from typing import List
from uuid import UUID

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.notification import PushSubscription, Reminder
from app.schemas.push import PushSubscribeIn, ReminderCreate, ReminderOut
from app.core.config import settings

router = APIRouter(tags=["push"])

@router.get("/push/vapid-public")
async def vapid_public():
    return {"public_key": settings.VAPID_PUBLIC}

@router.post("/push/subscribe", status_code=201)
async def subscribe(body: PushSubscribeIn, user: User = Depends(get_current_user), db=Depends(get_db)):
    existing_result = await db.exec(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    if not existing_result.first():
        db.add(PushSubscription(
            user_id=user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
            ua=body.ua,
        ))
        await db.commit()
    return {"ok": True}

@router.get("/reminders", response_model=List[ReminderOut])
async def list_reminders(user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.exec(
        select(Reminder).where(Reminder.user_id == user.id).order_by(Reminder.created_at)
    )
    return result.all()

@router.post("/reminders", response_model=ReminderOut, status_code=201)
async def create_reminder(body: ReminderCreate, user: User = Depends(get_current_user), db=Depends(get_db)):
    reminder = Reminder(user_id=user.id, **body.model_dump())
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder

@router.patch("/reminders/{reminder_id}/toggle", response_model=ReminderOut)
async def toggle_reminder(reminder_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    reminder = await db.get(Reminder, reminder_id)
    if not reminder or reminder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    reminder.enabled = not reminder.enabled
    await db.commit()
    await db.refresh(reminder)
    return reminder

@router.delete("/reminders/{reminder_id}", status_code=204)
async def delete_reminder(reminder_id: UUID, user: User = Depends(get_current_user), db=Depends(get_db)):
    reminder = await db.get(Reminder, reminder_id)
    if not reminder or reminder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(reminder)
    await db.commit()
