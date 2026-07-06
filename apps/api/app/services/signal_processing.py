"""
MetaBreath signal processing pipeline.

Implements sensor compensation, feature extraction, quality scoring,
and drift detection for TGS1820 VOC sensor readings.
"""
from __future__ import annotations

import math
import statistics
from typing import Optional


# TGS1820 temperature-sensitivity coefficients (from datasheet)
_TEMP_REF = 20.0       # °C reference temperature
_HUMIDITY_REF = 65.0   # %RH reference humidity
_PRESSURE_REF = 1013.25  # hPa reference pressure


def baseline_subtract(raw_voc: float, baseline_voc: float, gain: float = 1.0, offset: float = 0.0) -> float:
    """Apply calibration baseline correction: corrected = (raw − baseline) * gain + offset."""
    return (raw_voc - baseline_voc) * gain + offset


def env_compensate(voc: float, temp_c: Optional[float], humidity_pct: Optional[float]) -> float:
    """
    Correct VOC reading for ambient temperature and humidity.

    TGS1820 sensitivity drops ~1.5% per °C above reference and
    ~0.8% per %RH above reference (manufacturer approximation).
    """
    if temp_c is not None:
        delta_t = temp_c - _TEMP_REF
        voc = voc / (1.0 + 0.015 * delta_t)

    if humidity_pct is not None:
        delta_h = humidity_pct - _HUMIDITY_REF
        voc = voc / (1.0 + 0.008 * delta_h)

    return max(voc, 0.0)


def pressure_normalize(voc: float, pressure_mean: Optional[float], breath_duration: Optional[float]) -> float:
    """
    Normalize VOC for breath pressure and duration.

    Higher pressure / longer breath = more analyte delivered → divide out.
    Returns normalised concentration estimate (ppm equivalent).
    """
    if pressure_mean and pressure_mean > 0:
        voc = voc * (_PRESSURE_REF / pressure_mean)

    # Duration normalisation: model assumes 3-s standard breath
    if breath_duration and breath_duration > 0:
        voc = voc * (3.0 / breath_duration)

    return max(voc, 0.0)


def compute_features(sequence: list[float]) -> dict:
    """
    Extract temporal signal features from a sensor response sequence.

    sequence: list of VOC readings during a single breath measurement (time-ordered).
    Returns slope, time_to_peak (index), recovery_rate.
    """
    if not sequence or len(sequence) < 2:
        return {"slope": None, "time_to_peak": None, "recovery_rate": None}

    peak_idx = sequence.index(max(sequence))
    n = len(sequence)

    # Slope: linear regression over full sequence (rise phase)
    xs = list(range(n))
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(sequence)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, sequence))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    slope = numerator / denominator if denominator else 0.0

    # Recovery rate: (peak − final) / (n − peak_idx) sample-steps
    tail_len = n - peak_idx
    if tail_len > 1:
        recovery_rate = (sequence[peak_idx] - sequence[-1]) / tail_len
    else:
        recovery_rate = 0.0

    return {
        "slope": round(slope, 6),
        "time_to_peak": peak_idx,
        "recovery_rate": round(recovery_rate, 6),
    }


def quality_score(
    ambient_voc: Optional[float],
    breath_voc: Optional[float],
    breath_duration: Optional[float],
    pressure_mean: Optional[float],
    pressure_std: Optional[float],
    temp_c: Optional[float],
    humidity_pct: Optional[float],
) -> float:
    """
    Compute 0–100 quality score for a single reading.

    Deductions:
    - Missing breath_voc or ambient_voc: -30 each
    - Breath too short (<1.5 s) or too long (>8 s): -20
    - High pressure variance (CV > 30%): -15
    - Extreme temperature (<10°C or >40°C): -10
    - Extreme humidity (<20% or >95%): -10
    """
    score = 100.0

    if breath_voc is None:
        score -= 30
    if ambient_voc is None:
        score -= 30

    if breath_duration is not None:
        if breath_duration < 1.5 or breath_duration > 8.0:
            score -= 20

    if pressure_mean and pressure_std and pressure_mean > 0:
        cv = pressure_std / pressure_mean
        if cv > 0.30:
            score -= 15

    if temp_c is not None:
        if temp_c < 10 or temp_c > 40:
            score -= 10

    if humidity_pct is not None:
        if humidity_pct < 20 or humidity_pct > 95:
            score -= 10

    return max(0.0, min(100.0, score))


def reliability_score(quality: float, drift_score: float, calibration_age_days: float) -> float:
    """
    Combine quality, sensor drift, and calibration age into 0–100 reliability.

    drift_score: 0 (new) → 1 (severe drift) from DeviceCalibration.drift_score
    calibration_age_days: days since last calibration (>30 days → penalty)
    """
    base = quality

    # Drift penalty: up to -30 points
    base -= drift_score * 30

    # Stale calibration penalty
    if calibration_age_days > 30:
        excess = min(calibration_age_days - 30, 60)
        base -= (excess / 60) * 20

    return max(0.0, min(100.0, base))


def environment_penalty(temp_c: Optional[float], humidity_pct: Optional[float]) -> float:
    """
    Return 0–50 penalty score reflecting how far environment is from ideal.

    Used for environment_penalty column in sensor_readings.
    """
    penalty = 0.0

    if temp_c is not None:
        delta = abs(temp_c - _TEMP_REF)
        penalty += min(delta * 1.0, 25)

    if humidity_pct is not None:
        delta = abs(humidity_pct - _HUMIDITY_REF)
        penalty += min(delta * 0.5, 25)

    return round(penalty, 2)


def classify_acetone(acetone_ppm: float, confidence: float = 1.0) -> dict:
    """
    Map calibrated acetone_delta to metabolic label + risk index.

    Boundaries from MetaBreath demo dataset (NSC 2026):
    < 30 ppm   → low      (0) — not in ketosis
    30–74 ppm  → moderate (1) — mild ketosis / fat burning
    ≥ 75 ppm   → high     (2) — strong ketosis
    unreliable     → quality/confidence too low
    """
    if confidence < 0.6:
        return {"label": "unreliable", "metabolic_risk_index": None}

    if acetone_ppm is None or acetone_ppm < 0:
        return {"label": "unreliable", "metabolic_risk_index": None}
    elif acetone_ppm < 30.0:
        return {"label": "low", "metabolic_risk_index": 0}
    elif acetone_ppm < 75.0:
        return {"label": "moderate", "metabolic_risk_index": 1}
    else:
        return {"label": "high", "metabolic_risk_index": 2}


def detect_drift(calibration_history: list[dict]) -> dict:
    """
    Analyse calibration history to detect sensor drift.

    calibration_history: list of dicts with keys baseline_voc, calibrated_at (datetime).
    Returns drift_slope (ppm/day), drift_score (0–1), and whether recalibration is needed.
    """
    if len(calibration_history) < 2:
        return {"drift_slope_ppm_per_day": 0.0, "drift_score": 0.0, "needs_recalibration": False}

    # Sort by time
    sorted_cal = sorted(calibration_history, key=lambda c: c["calibrated_at"])
    first = sorted_cal[0]
    last = sorted_cal[-1]

    baseline_delta = last["baseline_voc"] - first["baseline_voc"]
    time_delta_days = (last["calibrated_at"] - first["calibrated_at"]).total_seconds() / 86400

    if time_delta_days <= 0:
        return {"drift_slope_ppm_per_day": 0.0, "drift_score": 0.0, "needs_recalibration": False}

    slope = baseline_delta / time_delta_days  # ppm/day

    # Normalise: >0.5 ppm/day drift is considered severe (score → 1.0)
    drift_score = min(abs(slope) / 0.5, 1.0)

    return {
        "drift_slope_ppm_per_day": round(slope, 4),
        "drift_score": round(drift_score, 4),
        "needs_recalibration": drift_score > 0.6,
    }
