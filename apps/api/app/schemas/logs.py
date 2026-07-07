from pydantic import BaseModel
from datetime import datetime, date
from uuid import UUID
from typing import Optional

class KetoneLogCreate(BaseModel):
    # For blood: supply value_mmol. For urine: supply urine_category (or urine_mg_dl);
    # value_mmol is derived from the band automatically when omitted.
    value_mmol: Optional[float] = None
    source: str = "manual"
    note: Optional[str] = None

    ketone_type: str = "blood"            # blood | urine
    urine_category: Optional[str] = None  # negative|trace|small|moderate|large
    urine_mg_dl: Optional[float] = None
    # Link this ground-truth reading to a breath measurement for agreement analysis
    paired_reading_time: Optional[datetime] = None
    paired_device_id: Optional[UUID] = None

class KetoneLogOut(BaseModel):
    id: UUID
    ts: datetime
    value_mmol: float
    source: str
    note: Optional[str]
    ketone_type: str
    urine_category: Optional[str]
    urine_mg_dl: Optional[float]
    paired_reading_time: Optional[datetime]
    paired_device_id: Optional[UUID]

class WeightLogCreate(BaseModel):
    kg: float

class WeightLogOut(BaseModel):
    id: UUID
    ts: datetime
    kg: float

class MealLogCreate(BaseModel):
    name: str
    kcal: Optional[float] = None
    carbs_g: Optional[float] = None

class MealLogOut(BaseModel):
    id: UUID
    ts: datetime
    name: str
    kcal: Optional[float]
    carbs_g: Optional[float]

class ActivityLogCreate(BaseModel):
    kind: str
    duration_min: int
    kcal: Optional[float] = None

class ActivityLogOut(BaseModel):
    id: UUID
    ts: datetime
    kind: str
    duration_min: int
    kcal: Optional[float]

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    height_cm:    Optional[float] = None
    weight_kg:    Optional[float] = None
    dob:          Optional[date] = None
    sex:          Optional[str] = None
    goal_type:    Optional[str] = None
    onboarded_at: Optional[str] = None
