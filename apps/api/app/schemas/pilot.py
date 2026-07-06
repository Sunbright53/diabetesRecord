from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional


class PilotSessionCreate(BaseModel):
    cohort: str                           # "5day_20p" | "14day_10p"
    day_number: int
    timepoint: str                        # "fasting" | "post_meal_60" | "post_meal_120"

    # Demographics (day 1 only)
    bmi: Optional[float] = None
    waist_cm: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[str] = None

    # Daily context
    fasting_hours: Optional[float] = None
    food_type: Optional[str] = None       # "low_carb|high_carb|keto|mixed"
    activity_min: Optional[int] = None
    sleep_hours: Optional[float] = None

    # Gold-standard reference
    homa_ir: Optional[float] = None
    blood_glucose: Optional[float] = None
    blood_ketone_mmol: Optional[float] = None

    # Optional sensor link
    sensor_reading_time: Optional[datetime] = None
    sensor_device_id: Optional[UUID] = None
    notes: Optional[str] = None


class PilotSessionOut(BaseModel):
    id: UUID
    user_id: UUID
    cohort: str
    day_number: int
    timepoint: str
    recorded_at: datetime
    bmi: Optional[float]
    waist_cm: Optional[float]
    age: Optional[int]
    sex: Optional[str]
    fasting_hours: Optional[float]
    food_type: Optional[str]
    activity_min: Optional[int]
    sleep_hours: Optional[float]
    homa_ir: Optional[float]
    blood_glucose: Optional[float]
    blood_ketone_mmol: Optional[float]
    sensor_reading_time: Optional[datetime]
    sensor_device_id: Optional[UUID]
    notes: Optional[str]

    class Config:
        from_attributes = True


class CorrelationOut(BaseModel):
    n: int
    pearson_r: Optional[float]
    p_value: Optional[float]
    interpretation: str
    adjusted_r: Optional[float]      # adjusted for confounders
    confounders_removed: list[str]
