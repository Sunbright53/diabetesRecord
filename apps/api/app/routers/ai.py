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
from app.models.health import Device, SensorReading
from app.services import ml_inference, llm_guardrail

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


class ChatRequest(BaseModel):
    message: str
    device_id: Optional[UUID] = None


class ChatResponse(BaseModel):
    reply: str
    refusal: bool
    disclaimer_appended: bool


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

    # LLM call — stub for NSC demo; replace with actual Anthropic API call
    # In production: call anthropic.Anthropic().messages.create(...)
    raw_reply = (
        f"ขอบคุณสำหรับคำถาม: '{body.message}'\n\n"
        "ตอนนี้ระบบ AI Coach กำลังอยู่ในขั้นตอน demo — "
        "กรุณาเชื่อมต่อ Anthropic API key ใน settings เพื่อใช้งาน AI Coach แบบเต็มรูปแบบ"
    )

    safe_reply = llm_guardrail.sanitise_response(raw_reply, lang="th")

    return ChatResponse(
        reply=safe_reply,
        refusal=False,
        disclaimer_appended=True,
    )
