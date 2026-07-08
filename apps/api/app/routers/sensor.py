from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from uuid import UUID
import os

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
from app.services.device_session import (
    resolve_reading_user,
    get_active_session,
    claim_device as claim_session,
    release_device as release_session,
    SESSION_TTL,
)
from app.models.health import DeviceSession

from app.core.security import create_access_token

router = APIRouter(prefix="/sensor", tags=["sensor"])


# ─── BLE Provisioning token ───────────────────────────────────────────────────

class ProvisionTokenOut(BaseModel):
    token: str
    expires_in: int  # seconds
    api_base: str


@router.post("/provision/token", response_model=ProvisionTokenOut)
async def get_provision_token(
    user: User = Depends(get_current_user),
):
    """
    Generate a short-lived (10 min) token for ESP32 BLE provisioning.
    Web app calls this then sends the token to ESP32 via BLE.
    ESP32 uses it to call POST /sensor/device/pair without the user having to type anything.
    """
    import os
    token = create_access_token(user.id, expires_minutes=10)
    api_base = os.getenv("API_BASE_URL", "https://metabreath.duckdns.org/api")
    return ProvisionTokenOut(token=token, expires_in=600, api_base=api_base)


# ─── Device pairing ───────────────────────────────────────────────────────────

class DevicePairRequest(BaseModel):
    kind: str = "breath"
    sensor_model: str = "TGS1820"
    firmware_version: Optional[str] = None


class DevicePairResponse(BaseModel):
    device_id: str
    mqtt_topic: str
    mqtt_user: str
    mqtt_pass: str
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

    mqtt_broker = os.getenv("MQTT_BROKER_PUBLIC", "metabreath.duckdns.org")
    mqtt_port = int(os.getenv("MQTT_PORT_PUBLIC", "1883"))
    mqtt_user = os.getenv("MQTT_ESP32_USER", "esp32")
    mqtt_pass = os.getenv("MQTT_ESP32_PASS", "")

    return DevicePairResponse(
        device_id=device_id_str,
        mqtt_topic=mqtt_topic,
        mqtt_user=mqtt_user,
        mqtt_pass=mqtt_pass,
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


# ─── Shared device pool (session-based multi-user access) ────────────────────

class SharedDeviceOut(BaseModel):
    id: str
    kind: str
    sensor_model: Optional[str]
    active: bool
    needs_recalibration: bool
    last_seen_at: Optional[datetime]
    # Active claim, if any
    claimed_by_username: Optional[str] = None
    claimed_by_me: bool = False
    session_expires_at: Optional[datetime] = None


class ClaimResponse(BaseModel):
    device_id: str
    session_id: str
    expires_at: datetime
    displaced_username: Optional[str] = None  # user we kicked, if any


@router.get("/devices/pool", response_model=List[SharedDeviceOut])
async def list_shared_devices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All is_shared=True devices, with their current active claimer (if any)."""
    devices_result = await db.exec(
        select(Device).where(Device.is_shared == True, Device.active == True)  # noqa: E712
    )
    devices = list(devices_result.all())
    out: List[SharedDeviceOut] = []
    for d in devices:
        session = await get_active_session(d.id, db)
        claimer_username: Optional[str] = None
        if session:
            claimer_result = await db.exec(select(User).where(User.id == session.user_id))
            claimer = claimer_result.first()
            claimer_username = claimer.username if claimer else None

        # Last-seen from newest reading (small O(1) query per device)
        last_read_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == d.id)
            .order_by(SensorReading.time.desc())
        )
        last_read = last_read_result.first()

        out.append(SharedDeviceOut(
            id=str(d.id),
            kind=d.kind,
            sensor_model=d.sensor_model,
            active=d.active,
            needs_recalibration=d.needs_recalibration,
            last_seen_at=last_read.time if last_read else None,
            claimed_by_username=claimer_username,
            claimed_by_me=bool(session and session.user_id == user.id),
            session_expires_at=session.expires_at if session else None,
        ))
    return out


@router.post("/device/{device_id}/claim", response_model=ClaimResponse)
async def claim_shared_device(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim a shared device for the caller. Silently ends any prior session.

    All readings arriving while the session is active belong to the caller.
    """
    device_result = await db.exec(select(Device).where(Device.id == device_id))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_shared and device.user_id != user.id:
        raise HTTPException(status_code=403, detail="Device is not shared")

    # Look up who's being displaced (for UX feedback)
    prior = await get_active_session(device_id, db)
    displaced_username: Optional[str] = None
    if prior and prior.user_id != user.id:
        prior_user_result = await db.exec(select(User).where(User.id == prior.user_id))
        prior_user = prior_user_result.first()
        displaced_username = prior_user.username if prior_user else None

    session = await claim_session(device_id, user.id, db)
    return ClaimResponse(
        device_id=str(device_id),
        session_id=str(session.id),
        expires_at=session.expires_at,
        displaced_username=displaced_username,
    )


@router.post("/device/{device_id}/release", status_code=204)
async def release_shared_device(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End the caller's active session on this device. No-op if none."""
    await release_session(device_id, user.id, db)
    return None


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

    # Firmware pipeline: delta = (sensor_voltage - baseline_voltage) * 1000  →  mV
    sensor_voltage    = body.sensor_voltage
    baseline_voltage  = body.baseline_voltage
    pressure_kpa      = body.pressure_kpa

    if calibration and calibration.baseline_voc:
        effective_baseline = calibration.baseline_voc  # server-calibrated overrides on-chip
    else:
        effective_baseline = baseline_voltage

    if body.acetone_delta_mv is not None:
        acetone_delta_mv = body.acetone_delta_mv
    elif sensor_voltage is not None and effective_baseline is not None:
        acetone_delta_mv = (sensor_voltage - effective_baseline) * 1000.0
    else:
        acetone_delta_mv = 0.0

    q_score = sp.quality_score(
        sensor_voltage=sensor_voltage,
        baseline_voltage=effective_baseline,
        pressure_kpa=pressure_kpa,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
    )

    cal_age_days = 0.0
    if calibration:
        cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
    r_score = sp.reliability_score(q_score, calibration.drift_score if calibration else 0.0, cal_age_days)

    env_pen = sp.environment_penalty(body.temp_c, body.humidity_pct)

    confidence = r_score / 100.0
    classification = sp.classify_acetone(acetone_delta_mv, confidence)

    # Reuse legacy columns: ambient_voc = baseline_voltage (V),
    #                       breath_voc  = sensor_voltage (V),
    #                       acetone_delta stored in mV,
    #                       pressure_mean = pressure_kpa (kPa)
    # Attribute to current shared-session claimer if any (else device owner).
    reading_user_id = await resolve_reading_user(device, db)

    reading = SensorReading(
        time=body.time,
        device_id=body.device_id,
        user_id=reading_user_id,
        voc_ppb=body.voc_ppb,
        ketone_mmol=body.ketone_mmol,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
        raw=body.raw,
        ambient_voc=baseline_voltage,
        breath_voc=sensor_voltage,
        acetone_delta=round(acetone_delta_mv, 4),
        pressure_mean=pressure_kpa,
        pressure_std=None,
        breath_duration=None,
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


# ─── Firmware generator (Arduino .ino) ───────────────────────────────────────

FIRMWARE_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "metabreath_firmware.ino.tmpl"


class FirmwareConfigRequest(BaseModel):
    wifi_ssid: str = Field(..., min_length=1, max_length=32)
    wifi_password: str = Field(..., max_length=63)


def _escape_c_string(s: str) -> str:
    """Escape a string so it's safe to embed inside a C double-quoted literal."""
    return (
        s.replace("\\", "\\\\")
         .replace('"', '\\"')
         .replace("\n", "\\n")
         .replace("\r", "\\r")
         .replace("\t", "\\t")
    )


@router.post("/device/{device_id}/firmware", response_class=PlainTextResponse)
async def generate_configured_firmware(
    device_id: UUID,
    body: FirmwareConfigRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a device-specific Arduino .ino file with WiFi + MQTT credentials
    pre-filled. User downloads and flashes via Arduino IDE.
    """
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not FIRMWARE_TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Firmware template missing on server")

    template = FIRMWARE_TEMPLATE_PATH.read_text(encoding="utf-8")

    substitutions = {
        "{{WIFI_SSID}}":     _escape_c_string(body.wifi_ssid),
        "{{WIFI_PASSWORD}}": _escape_c_string(body.wifi_password),
        "{{DEVICE_ID}}":     str(device_id),
        "{{MQTT_BROKER}}":   os.getenv("MQTT_BROKER_PUBLIC", "metabreath.duckdns.org"),
        "{{MQTT_PORT}}":     os.getenv("MQTT_PORT_PUBLIC", "1883"),
        "{{MQTT_USER}}":     os.getenv("MQTT_ESP32_USER", "esp32"),
        "{{MQTT_PASS}}":     os.getenv("MQTT_ESP32_PASS", ""),
        "{{GENERATED_AT}}":  datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
    for marker, value in substitutions.items():
        template = template.replace(marker, value)

    filename = f"metabreath_{str(device_id)[:8]}.ino"
    return PlainTextResponse(
        content=template,
        media_type="text/x-arduino",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
