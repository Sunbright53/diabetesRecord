from pydantic import BaseModel
from datetime import datetime, date
from uuid import UUID
from typing import Optional

class KetoneLogCreate(BaseModel):
    value_mmol: float
    source: str = "manual"
    note: Optional[str] = None

class KetoneLogOut(BaseModel):
    id: UUID
    ts: datetime
    value_mmol: float
    source: str
    note: Optional[str]

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
