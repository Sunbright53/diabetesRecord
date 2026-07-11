import os
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import Device, DeviceCalibration, SensorReading
from app.services import ml_inference, llm_guardrail, flexibility_engine

router = APIRouter(prefix="/ai", tags=["ai"])


class PredictRequest(BaseModel):
    device_id: UUID
    acetone_delta: Optional[float] = None
    quality_score: Optional[float] = None
    reliability_score: Optional[float] = None
    breath_duration: Optional[float] = None
    slope: Optional[float] = None
    time_to_peak: Optional[float] = None
    recovery_rate: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None


class PredictResponse(BaseModel):
    label: Optional[str]
    metabolic_risk_index: Optional[int]
    confidence_score: float
    model_used: str
    recalibration_needed: bool
    acetone_delta: Optional[float]


class TrendResponse(BaseModel):
    device_id: UUID
    trend_direction: str
    slope_ppm_per_day: Optional[float]
    predicted_points: List[dict]
    confidence: float
    n_readings_used: int


class LstmPredictRequest(BaseModel):
    device_id: UUID
    # Optional: caller can supply the sequence explicitly (else last-5 from DB)
    sequence: Optional[List[dict]] = None


class LstmPredictResponse(BaseModel):
    label: Optional[str]
    metabolic_risk_index: Optional[int]
    confidence_score: float
    model_used: str
    recalibration_needed: bool
    sequence_length: int
    fallback_reason: Optional[str] = None


class DriftResponse(BaseModel):
    device_id: UUID
    drift_detected: bool
    severity: str
    confidence: float
    recommendation: str
    drift_pct: Optional[float]
    baseline_voc: Optional[float] = None
    latest_voc: Optional[float] = None
    n_calibrations_used: int


class ChatRequest(BaseModel):
    message: str
    device_id: Optional[UUID] = None


class ChatResponse(BaseModel):
    reply: str
    refusal: bool
    disclaimer_appended: bool


class FlexibilityRequest(BaseModel):
    device_id: UUID
    context_tag: Optional[str] = None   # fasting | post_meal | post_exercise | evening
    fasting_hours: Optional[float] = None
    days: int = 14


class FlexibilityBreakdown(BaseModel):
    amplitude: float
    return_speed: float
    appropriateness: float


class FlexibilityResponse(BaseModel):
    score: int
    zone: str
    breakdown: FlexibilityBreakdown
    trend: str
    n_sessions: int
    message_th: str
    context_tag: Optional[str] = None


# ─── POST /ai/predict ─────────────────────────────────────────────────────────

@router.post("/predict", response_model=PredictResponse)
async def predict(
    body: PredictRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    features = body.model_dump(exclude={"device_id"})
    result = ml_inference.predict_risk(features)

    return PredictResponse(
        label=result["label"],
        metabolic_risk_index=result.get("metabolic_risk_index"),
        confidence_score=result["confidence_score"],
        model_used=result["model_used"],
        recalibration_needed=result.get("recalibration_needed", False),
        acetone_delta=body.acetone_delta,
    )


# ─── GET /ai/trend ────────────────────────────────────────────────────────────

@router.get("/trend", response_model=TrendResponse)
async def get_trend(
    device_id: UUID = Query(...),
    days: int = Query(default=7, ge=3, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    since = datetime.utcnow() - timedelta(days=days)
    readings_result = await db.exec(
        select(SensorReading)
        .where(SensorReading.device_id == device_id, SensorReading.time >= since)
        .order_by(SensorReading.time)
    )
    readings = readings_result.all()

    readings_dicts = [
        {"time": r.time, "acetone_delta": r.acetone_delta}
        for r in readings
        if r.acetone_delta is not None
    ]

    trend = ml_inference.predict_trend(readings_dicts, horizon_days=days)

    return TrendResponse(
        device_id=device_id,
        trend_direction=trend["trend_direction"],
        slope_ppm_per_day=trend["slope_ppm_per_day"],
        predicted_points=trend["predicted_points"],
        confidence=trend["confidence"],
        n_readings_used=len(readings_dicts),
    )


# ─── POST /ai/chat ────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    should_refuse, reason = llm_guardrail.is_refusal_needed(body.message)

    if should_refuse:
        return ChatResponse(
            reply=llm_guardrail.build_refusal_response(lang="th"),
            refusal=True,
            disclaimer_appended=True,
        )

    # Build context for LLM
    sensor_data = {}
    if body.device_id:
        readings_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == body.device_id)
            .order_by(SensorReading.time.desc())
        )
        latest = readings_result.first()
        if latest:
            sensor_data = {
                "latest_reading_time": latest.time.isoformat() if latest.time else None,
                "acetone_delta": latest.acetone_delta,
                "label": latest.label,
                "confidence_score": latest.confidence_score,
                "quality_score": latest.quality_score,
            }

    user_context = {
        "display_name": getattr(user, "display_name", None),
        "goal_type": getattr(user, "goal_type", None),
    }

    system_prompt = llm_guardrail.build_system_prompt(user_context, sensor_data)

    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
    if not api_key:
        raw_reply = "ขอโทษค่ะ — AI Coach ยังไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่ภายหลัง"
    else:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": body.message}],
            )
            raw_reply = message.content[0].text
        except Exception:
            raw_reply = "ขอโทษค่ะ — เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่ภายหลัง"

    safe_reply = llm_guardrail.sanitise_response(raw_reply, lang="th")

    return ChatResponse(
        reply=safe_reply,
        refusal=False,
        disclaimer_appended=True,
    )


# ─── POST /ai/predict/lstm ────────────────────────────────────────────────────

@router.post("/predict/lstm", response_model=LstmPredictResponse)
async def predict_lstm(
    body: LstmPredictRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Predict risk from a sequence of readings using LSTM temporal model."""
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    if body.sequence:
        sequence = body.sequence
    else:
        readings_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == body.device_id)
            .order_by(SensorReading.time.desc())
            .limit(5)
        )
        readings = list(readings_result.all())[::-1]  # oldest → newest
        sequence = [
            {
                "acetone_delta":     r.acetone_delta,
                "quality_score":     r.quality_score,
                "reliability_score": r.reliability_score,
                "ketosis_index":     None,   # not stored — LSTM default to 0
                "metabolic_score":   None,
                "pressure_mean":     r.pressure_mean,
                "temperature":       r.temp_c,
                "humidity":          r.humidity_pct,
            }
            for r in readings
        ]

    result = ml_inference.predict_risk_lstm(sequence)
    return LstmPredictResponse(
        label=result.get("label"),
        metabolic_risk_index=result.get("metabolic_risk_index"),
        confidence_score=result.get("confidence_score", 0.0),
        model_used=result.get("model_used", "unknown"),
        recalibration_needed=result.get("recalibration_needed", False),
        sequence_length=result.get("sequence_length", len(sequence)),
        fallback_reason=result.get("reason"),
    )


# ─── GET /ai/drift ────────────────────────────────────────────────────────────

@router.get("/drift", response_model=DriftResponse)
async def check_drift(
    device_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check sensor drift from calibration history."""
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    calibrations = list(cal_result.all())

    history = [
        {"ambient_voc": c.baseline_voc, "time": c.calibrated_at}
        for c in calibrations
    ]

    result = ml_inference.check_drift(history)
    return DriftResponse(
        device_id=device_id,
        drift_detected=result["drift_detected"],
        severity=result["severity"],
        confidence=result["confidence"],
        recommendation=result["recommendation"],
        drift_pct=result.get("drift_pct"),
        baseline_voc=result.get("baseline_voc"),
        latest_voc=result.get("latest_voc"),
        n_calibrations_used=len(calibrations),
    )


# ─── POST /ai/flexibility ─────────────────────────────────────────────────────

@router.post("/flexibility", response_model=FlexibilityResponse)
async def get_flexibility(
    body: FlexibilityRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute Metabolic Flexibility Score (0-100) from recent breath sessions."""
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    since = datetime.utcnow() - timedelta(days=body.days)
    readings_result = await db.exec(
        select(SensorReading)
        .where(SensorReading.device_id == body.device_id, SensorReading.time >= since)
        .order_by(SensorReading.time)
    )
    readings = readings_result.all()

    # Group individual sensor readings into breath sessions.
    # A new session starts when there is a >5-minute gap between readings.
    SESSION_GAP_SECS = 300
    sessions = []
    current_group: list = []

    for r in readings:
        if r.acetone_delta is None:
            continue
        if current_group and (r.time - current_group[-1].time).total_seconds() > SESSION_GAP_SECS:
            # Flush current group as one session (take the peak reading)
            peak_r = max(current_group, key=lambda x: x.acetone_delta or 0)
            sessions.append({
                "peak_ppm": peak_r.acetone_delta,
                "mean_ppm": sum(x.acetone_delta for x in current_group) / len(current_group),
                "context_tag": None,
            })
            current_group = []
        current_group.append(r)

    if current_group:
        peak_r = max(current_group, key=lambda x: x.acetone_delta or 0)
        sessions.append({
            "peak_ppm": peak_r.acetone_delta,
            "mean_ppm": sum(x.acetone_delta for x in current_group) / len(current_group),
            "context_tag": None,
        })

    latest_ppm = sessions[-1]["peak_ppm"] if sessions else None
    result = flexibility_engine.compute_flexibility(
        sessions,
        latest_ppm=latest_ppm,
        context_tag=body.context_tag,
    )

    return FlexibilityResponse(
        score=result["score"],
        zone=result["zone"],
        breakdown=FlexibilityBreakdown(**result["breakdown"]),
        trend=result["trend"],
        n_sessions=result["n_sessions"],
        message_th=result["message_th"],
        context_tag=body.context_tag,
    )
