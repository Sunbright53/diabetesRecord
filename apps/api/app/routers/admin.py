"""
Admin router — manual sensor reading entry + user data overview.
Double-gated: JWT must belong to ADMIN_EMAIL + X-Admin-Password header must match ADMIN_PASSWORD.
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4
import secrets as _secrets

from app.core.config import settings
from app.core.deps import get_admin_user, get_db
from app.models.user import User, Profile
from app.models.health import Device, SensorReading, DeviceCalibration
from app.services import signal_processing as sp

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdminVerifyRequest(BaseModel):
    password: str


class AdminDeviceOut(BaseModel):
    id: str
    kind: str
    sensor_model: Optional[str]
    active: bool
    needs_recalibration: bool
    last_calibrated_at: Optional[datetime]


class AdminReadingSummary(BaseModel):
    total_readings: int
    last_reading_at: Optional[datetime]
    last_label: Optional[str]
    last_acetone_delta: Optional[float]
    last_quality_score: Optional[float]


class AdminUserOut(BaseModel):
    id: str
    email: str
    username: str
    display_name: Optional[str]
    created_at: datetime
    devices: List[AdminDeviceOut]
    reading_summary: AdminReadingSummary


class AdminReadingCreate(BaseModel):
    device_id: str
    time: Optional[datetime] = None

    ambient_voc: Optional[float] = None
    breath_voc: Optional[float] = None
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    note: Optional[str] = None


class AdminReadingOut(BaseModel):
    time: datetime
    device_id: str
    ambient_voc: Optional[float]
    breath_voc: Optional[float]
    acetone_delta: Optional[float]
    quality_score: Optional[float]
    reliability_score: Optional[float]
    environment_penalty: Optional[float]
    metabolic_risk_index: Optional[int]
    confidence_score: Optional[float]
    label: Optional[str]

    class Config:
        from_attributes = True


# ─── Verify (no JWT needed — just admin password) ─────────────────────────────

@router.post("/verify")
async def verify_admin(body: AdminVerifyRequest):
    """Check if the admin password is correct (used by frontend gate)."""
    if not settings.ADMIN_PASSWORD or body.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    return {"ok": True}


# ─── Users list with reading summary ─────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserOut])
async def list_users(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    users_result = await db.exec(select(User).where(User.is_active == True).order_by(User.created_at))
    users = users_result.all()

    profiles_result = await db.exec(select(Profile))
    profiles = {str(p.user_id): p for p in profiles_result.all()}

    devices_result = await db.exec(select(Device))
    all_devices = devices_result.all()
    devices_by_user: dict[str, list] = {}
    for d in all_devices:
        devices_by_user.setdefault(str(d.user_id), []).append(d)

    out = []
    for u in users:
        uid = str(u.id)
        profile = profiles.get(uid)
        devs = devices_by_user.get(uid, [])

        # Fetch reading summary per user (across all their devices)
        device_ids = [d.id for d in devs]
        summary = AdminReadingSummary(total_readings=0, last_reading_at=None, last_label=None, last_acetone_delta=None, last_quality_score=None)

        if device_ids:
            count_result = await db.exec(
                select(func.count(SensorReading.time))
                .where(SensorReading.device_id.in_(device_ids))
            )
            total = count_result.one() or 0

            latest_result = await db.exec(
                select(SensorReading)
                .where(SensorReading.device_id.in_(device_ids))
                .order_by(SensorReading.time.desc())
            )
            latest = latest_result.first()

            summary = AdminReadingSummary(
                total_readings=total,
                last_reading_at=latest.time if latest else None,
                last_label=latest.label if latest else None,
                last_acetone_delta=latest.acetone_delta if latest else None,
                last_quality_score=latest.quality_score if latest else None,
            )

        out.append(AdminUserOut(
            id=uid,
            email=u.email,
            username=u.username,
            display_name=profile.display_name if profile else None,
            created_at=u.created_at,
            devices=[
                AdminDeviceOut(
                    id=str(d.id),
                    kind=d.kind,
                    sensor_model=d.sensor_model,
                    active=d.active,
                    needs_recalibration=d.needs_recalibration,
                    last_calibrated_at=d.last_calibrated_at,
                )
                for d in devs
            ],
            reading_summary=summary,
        ))
    return out


# ─── Ensure manual device ────────────────────────────────────────────────────

@router.post("/device/ensure/{user_id}", response_model=AdminDeviceOut, status_code=201)
async def ensure_manual_device(
    user_id: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    user_result = await db.exec(select(User).where(User.id == uid, User.is_active == True))
    if not user_result.first():
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.exec(
        select(Device).where(Device.user_id == uid, Device.kind == "manual")
    )
    device = existing.first()
    if device:
        return AdminDeviceOut(
            id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
            active=device.active, needs_recalibration=device.needs_recalibration,
            last_calibrated_at=device.last_calibrated_at,
        )

    device = Device(
        user_id=uid, kind="manual", sensor_model="manual_entry",
        firmware_version="admin", active=True,
        mqtt_topic=f"manual/{str(uuid4())}",
        secret=_secrets.token_hex(8),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)

    return AdminDeviceOut(
        id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
        active=device.active, needs_recalibration=device.needs_recalibration,
        last_calibrated_at=device.last_calibrated_at,
    )


# ─── Submit reading ──────────────────────────────────────────────────────────

@router.post("/reading", response_model=AdminReadingOut, status_code=201)
async def submit_reading(
    body: AdminReadingCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        device_uuid = UUID(body.device_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid device_id")

    device_result = await db.exec(select(Device).where(Device.id == device_uuid))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_uuid)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    calibration = cal_result.first()

    ambient = body.ambient_voc or 0.0
    breath = body.breath_voc or 0.0

    if calibration:
        breath_corrected = sp.baseline_subtract(breath, calibration.baseline_voc, calibration.gain_factor, calibration.offset)
    else:
        breath_corrected = breath - ambient

    breath_compensated = sp.env_compensate(breath_corrected, body.temp_c, body.humidity_pct)
    acetone_delta = sp.pressure_normalize(breath_compensated, body.pressure_mean, body.breath_duration)

    q_score = sp.quality_score(
        ambient_voc=body.ambient_voc, breath_voc=body.breath_voc,
        breath_duration=body.breath_duration, pressure_mean=body.pressure_mean,
        pressure_std=body.pressure_std, temp_c=body.temp_c, humidity_pct=body.humidity_pct,
    )

    cal_age_days = 0.0
    if calibration:
        cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
    r_score = sp.reliability_score(q_score, calibration.drift_score if calibration else 0.0, cal_age_days)

    confidence = r_score / 100.0
    classification = sp.classify_acetone(acetone_delta, confidence)

    reading = SensorReading(
        time=body.time or datetime.utcnow(),
        device_id=device_uuid,
        ambient_voc=body.ambient_voc, breath_voc=body.breath_voc,
        acetone_delta=round(acetone_delta, 4),
        pressure_mean=body.pressure_mean, pressure_std=body.pressure_std,
        breath_duration=body.breath_duration, temp_c=body.temp_c, humidity_pct=body.humidity_pct,
        quality_score=round(q_score, 2), reliability_score=round(r_score, 2),
        environment_penalty=sp.environment_penalty(body.temp_c, body.humidity_pct),
        metabolic_risk_index=classification["metabolic_risk_index"],
        confidence_score=round(confidence, 4),
        label=classification["label"],
        raw={"admin_entry": True, "submitted_by": admin.email, "note": body.note},
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return reading
