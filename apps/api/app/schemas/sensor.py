from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional


class SensorReadingCreate(BaseModel):
    time: datetime
    device_id: UUID

    # MetaBreath raw sensor values
    ambient_voc: Optional[float] = None
    breath_voc: Optional[float] = None
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None

    # Legacy fields
    voc_ppb: Optional[float] = None
    ketone_mmol: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    raw: Optional[dict] = None


class SensorReadingOut(BaseModel):
    time: datetime
    device_id: UUID

    # Raw sensor values
    ambient_voc: Optional[float]
    breath_voc: Optional[float]
    acetone_delta: Optional[float]
    pressure_mean: Optional[float]
    pressure_std: Optional[float]
    breath_duration: Optional[float]

    # Legacy
    voc_ppb: Optional[float]
    ketone_mmol: Optional[float]
    temp_c: Optional[float]
    humidity_pct: Optional[float]

    # Quality
    quality_score: Optional[float]
    reliability_score: Optional[float]
    environment_penalty: Optional[float]

    # Signal features
    slope: Optional[float]
    time_to_peak: Optional[float]
    recovery_rate: Optional[float]

    # Prediction
    metabolic_risk_index: Optional[int]
    confidence_score: Optional[float]
    label: Optional[str]

    class Config:
        from_attributes = True


class CalibrationCreate(BaseModel):
    baseline_voc: float
    baseline_temp: Optional[float] = None
    baseline_humidity: Optional[float] = None
    baseline_pressure: Optional[float] = None
    method: Optional[str] = "zero"   # zero|span|drift_check
    reference_device: Optional[str] = None
    notes: Optional[str] = None


class CalibrationOut(BaseModel):
    id: UUID
    device_id: UUID
    calibrated_at: datetime
    baseline_voc: float
    baseline_temp: Optional[float]
    baseline_humidity: Optional[float]
    baseline_pressure: Optional[float]
    gain_factor: float
    offset: float
    drift_score: float
    method: Optional[str]
    reference_device: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


class CalibrationReportOut(BaseModel):
    device_id: UUID
    report_generated_at: datetime
    lod_ppm: float
    repeatability_cv_pct: float
    drift_slope_ppm_per_day: float
    cross_sensitivity_note: str
    n_calibrations: int
    latest_drift_score: float
    needs_recalibration: bool
    reference_comparison: Optional[dict] = None


class DeviceOut(BaseModel):
    id: UUID
    kind: str
    mqtt_topic: Optional[str]
    active: bool
    created_at: datetime
    needs_recalibration: bool
    last_calibrated_at: Optional[datetime]
    firmware_version: Optional[str]
    sensor_model: Optional[str]

    class Config:
        from_attributes = True
