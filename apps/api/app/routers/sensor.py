from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import Device, SensorReading, DeviceCalibration
from app.schemas.sensor import (
    SensorReadingCreate, SensorReadingOut,
    CalibrationCreate, CalibrationOut,
    CalibrationReportOut, DeviceOut,
)
from app.services import signal_processing as sp

router = APIRouter(prefix="/sensor", tags=["sensor"])


# ─── Device pairing ───────────────────────────────────────────────────────────

class DevicePairRequest(BaseModel):
    kind: str = "breath"
    sensor_model: str = "TGS1820"
    firmware_version: Optional[str] = None


class DevicePairResponse(BaseModel):
    device_id: str
    mqtt_topic: str
    mqtt_user: str
    mqtt_broker: str
    mqtt_port: int
    secret: str
    message: str


@router.post("/device/pair", response_model=DevicePairResponse, status_code=201)
async def pair_device(
    body: DevicePairRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Pair a new MetaBreath device with the user account.
    Returns MQTT credentials and topic for the ESP32 firmware to use.
    """
    import secrets as _secrets
    import os

    device = Device(
        user_id=user.id,
        kind=body.kind,
        sensor_model=body.sensor_model,
        firmware_version=body.firmware_version,
        active=True,
    )
    db.add(device)
    await db.flush()  # get device.id

    device_id_str = str(device.id)
    mqtt_topic = f"metabreath/{device_id_str}/reading"
    secret = _secrets.token_hex(16)

    device.mqtt_topic = mqtt_topic
    device.secret = secret

    await db.commit()
    await db.refresh(device)

    mqtt_broker = os.getenv("MQTT_BROKER_PUBLIC", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_user = os.getenv("MQTT_ESP32_USER", "esp32")

    return DevicePairResponse(
        device_id=device_id_str,
        mqtt_topic=mqtt_topic,
        mqtt_user=mqtt_user,
        mqtt_broker=mqtt_broker,
        mqtt_port=mqtt_port,
        secret=secret,
        message=(
            f"อุปกรณ์จับคู่สำเร็จ! ตั้งค่า ESP32 ด้วย device_id={device_id_str[:8]}... "
            f"แล้ว publish ไปที่ topic: {mqtt_topic}"
        ),
    )


# ─── Device list ─────────────────────────────────────────────────────────────

@router.get("/devices", response_model=List[DeviceOut])
async def list_devices(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.exec(select(Device).where(Device.user_id == user.id))
    return result.all()


# ─── Ingest sensor reading ────────────────────────────────────────────────────

@router.post("/readings", response_model=SensorReadingOut, status_code=201)
async def ingest_reading(
    body: SensorReadingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify device belongs to user
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch latest calibration for this device
    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == body.device_id)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    calibration = cal_result.first()

    # Signal processing pipeline
    ambient = body.ambient_voc or 0.0
    breath = body.breath_voc or 0.0

    if calibration:
        breath_corrected = sp.baseline_subtract(breath, calibration.baseline_voc, calibration.gain_factor, calibration.offset)
    else:
        breath_corrected = breath - ambient

    breath_compensated = sp.env_compensate(breath_corrected, body.temp_c, body.humidity_pct)
    acetone_delta = sp.pressure_normalize(
        breath_compensated, body.pressure_mean, body.breath_duration
    )

    q_score = sp.quality_score(
        ambient_voc=body.ambient_voc,
        breath_voc=body.breath_voc,
        breath_duration=body.breath_duration,
        pressure_mean=body.pressure_mean,
        pressure_std=body.pressure_std,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
    )

    cal_age_days = 0.0
    if calibration:
        cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
    r_score = sp.reliability_score(q_score, calibration.drift_score if calibration else 0.0, cal_age_days)

    env_pen = sp.environment_penalty(body.temp_c, body.humidity_pct)

    confidence = r_score / 100.0
    classification = sp.classify_acetone(acetone_delta, confidence)

    reading = SensorReading(
        time=body.time,
        device_id=body.device_id,
        voc_ppb=body.voc_ppb,
        ketone_mmol=body.ketone_mmol,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
        raw=body.raw,
        ambient_voc=body.ambient_voc,
        breath_voc=body.breath_voc,
        acetone_delta=round(acetone_delta, 4),
        pressure_mean=body.pressure_mean,
        pressure_std=body.pressure_std,
        breath_duration=body.breath_duration,
        quality_score=round(q_score, 2),
        reliability_score=round(r_score, 2),
        environment_penalty=env_pen,
        metabolic_risk_index=classification["metabolic_risk_index"],
        confidence_score=round(confidence, 4),
        label=classification["label"],
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return reading


# ─── Reading history ──────────────────────────────────────────────────────────

@router.get("/readings", response_model=List[SensorReadingOut])
async def get_readings(
    device_id: UUID = Query(...),
    days: int = Query(default=7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    since = datetime.utcnow() - timedelta(days=days)
    result = await db.exec(
        select(SensorReading)
        .where(SensorReading.device_id == device_id, SensorReading.time >= since)
        .order_by(SensorReading.time)
    )
    return result.all()


# ─── Calibrate device ────────────────────────────────────────────────────────

@router.post("/device/{device_id}/calibrate", response_model=CalibrationOut, status_code=201)
async def calibrate_device(
    device_id: UUID,
    body: CalibrationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch history to compute drift
    cal_hist_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    history = cal_hist_result.all()
    hist_dicts = [{"baseline_voc": c.baseline_voc, "calibrated_at": c.calibrated_at} for c in history]
    # Add new point
    hist_dicts.append({"baseline_voc": body.baseline_voc, "calibrated_at": datetime.utcnow()})
    drift_info = sp.detect_drift(hist_dicts)

    calibration = DeviceCalibration(
        device_id=device_id,
        calibrated_at=datetime.utcnow(),
        baseline_voc=body.baseline_voc,
        baseline_temp=body.baseline_temp,
        baseline_humidity=body.baseline_humidity,
        baseline_pressure=body.baseline_pressure,
        drift_score=drift_info["drift_score"],
        method=body.method,
        reference_device=body.reference_device,
        notes=body.notes,
    )
    db.add(calibration)

    # Update device flags
    device.last_calibrated_at = calibration.calibrated_at
    device.needs_recalibration = drift_info["needs_recalibration"]

    await db.commit()
    await db.refresh(calibration)
    return calibration


# ─── Calibration history ─────────────────────────────────────────────────────

@router.get("/device/{device_id}/calibration", response_model=List[CalibrationOut])
async def get_calibration_history(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    return result.all()


# ─── Calibration report (LoD + drift + repeatability) ────────────────────────

@router.get("/device/{device_id}/calibration/report", response_model=CalibrationReportOut)
async def calibration_report(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cal_hist_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    history = cal_hist_result.all()

    if not history:
        raise HTTPException(status_code=404, detail="No calibration records found. Run calibration first.")

    baselines = [c.baseline_voc for c in history]
    hist_dicts = [{"baseline_voc": c.baseline_voc, "calibrated_at": c.calibrated_at} for c in history]
    drift_info = sp.detect_drift(hist_dicts)

    import statistics as _stats
    mean_baseline = _stats.mean(baselines)
    std_baseline = _stats.stdev(baselines) if len(baselines) > 1 else 0.0

    # LoD = 3σ / sensitivity_factor (TGS1820 approx sensitivity ~0.1)
    sensitivity_factor = 0.1
    lod_ppm = (3.0 * std_baseline) / sensitivity_factor if std_baseline > 0 else 0.01

    # Repeatability CV (coefficient of variation)
    cv_pct = (std_baseline / mean_baseline * 100) if mean_baseline > 0 else 0.0

    latest = history[-1]
    cross_sensitivity = (
        "TGS1820 cross-sensitivity: Ethanol ~30% relative to Acetone. "
        "Recommend fasting ≥2h before measurement to minimise interference."
    )

    return CalibrationReportOut(
        device_id=device_id,
        report_generated_at=datetime.utcnow(),
        lod_ppm=round(lod_ppm, 4),
        repeatability_cv_pct=round(cv_pct, 2),
        drift_slope_ppm_per_day=drift_info["drift_slope_ppm_per_day"],
        cross_sensitivity_note=cross_sensitivity,
        n_calibrations=len(history),
        latest_drift_score=latest.drift_score,
        needs_recalibration=device.needs_recalibration,
        reference_comparison={
            "method": latest.method,
            "reference_device": latest.reference_device,
        },
    )
